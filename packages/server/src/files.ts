import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type {
  CopyProgress,
  CopyRequest,
  FileEntry,
  FileWithMatch,
} from '@usb-ingest/shared';
import { isExcluded, loadRules, matchFile } from './rules.js';

export async function scanDirectory(
  dirPath: string,
  basePath: string = dirPath,
  exclusions?: string[]
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  // Load exclusions from config if not provided
  const excludePatterns = exclusions ?? loadRules().exclusions ?? [];

  try {
    const items = await readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(dirPath, item.name);
      const relativePath = relative(basePath, fullPath);

      // Check exclusion patterns
      if (isExcluded(relativePath, item.name, excludePatterns)) {
        continue;
      }

      // Also skip common system items not in exclusion list
      if (item.name === '$RECYCLE.BIN') continue;

      try {
        const stats = await stat(fullPath);

        const entry: FileEntry = {
          name: item.name,
          path: fullPath,
          relativePath,
          isDirectory: item.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtime,
        };

        if (item.isDirectory()) {
          entry.children = await scanDirectory(fullPath, basePath, excludePatterns);
        }

        entries.push(entry);
      } catch {
        // Skip files we can't access
        continue;
      }
    }
  } catch {
    // Return empty if directory not accessible
  }

  return entries.sort((a, b) => {
    // Directories first, then alphabetically
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function flattenFiles(entries: FileEntry[]): FileEntry[] {
  const files: FileEntry[] = [];

  for (const entry of entries) {
    if (entry.isDirectory && entry.children) {
      files.push(...flattenFiles(entry.children));
    } else if (!entry.isDirectory) {
      files.push(entry);
    }
  }

  return files;
}

export function applyRulesToFiles(entries: FileEntry[]): FileWithMatch[] {
  const config = loadRules();
  const files = flattenFiles(entries);

  return files.map((file) => ({
    ...file,
    matchedRule: matchFile(file.relativePath, config.rules),
  }));
}

export async function copyFile(
  sourcePath: string,
  destPath: string
): Promise<void> {
  // Ensure destination directory exists
  const destDir = dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const readStream = createReadStream(sourcePath);
  const writeStream = createWriteStream(destPath);

  await pipeline(readStream, writeStream);
}

function getUniqueDestPath(destPath: string): string {
  // Generate a unique path by adding a suffix like "_1", "_2", etc.
  const ext = extname(destPath);
  const base = basename(destPath, ext);
  const dir = dirname(destPath);
  let counter = 1;
  let newPath = destPath;

  while (existsSync(newPath)) {
    newPath = join(dir, `${base}_${counter}${ext}`);
    counter++;
  }

  return newPath;
}

export async function* executeCopy(
  request: CopyRequest
): AsyncGenerator<CopyProgress> {
  const id = crypto.randomUUID();
  const totalFiles = request.files.length;
  const onDuplicate = request.onDuplicate ?? 'skip';
  let totalBytes = 0;

  // Calculate total bytes
  for (const file of request.files) {
    try {
      const stats = await stat(file.sourcePath);
      totalBytes += stats.size;
    } catch {
      // Skip files that don't exist
    }
  }

  const progress: CopyProgress = {
    id,
    status: 'pending',
    totalFiles,
    copiedFiles: 0,
    skippedFiles: 0,
    totalBytes,
    copiedBytes: 0,
    currentFile: null,
    error: null,
  };

  yield { ...progress, status: 'copying' };

  for (const file of request.files) {
    progress.currentFile = file.sourcePath;
    yield { ...progress };

    try {
      let destPath = file.destinationPath;
      const destExists = existsSync(destPath);

      if (destExists) {
        switch (onDuplicate) {
          case 'skip':
            // Skip this file
            const sourceStats = await stat(file.sourcePath);
            progress.copiedBytes += sourceStats.size;
            progress.skippedFiles += 1;
            yield { ...progress };
            continue;

          case 'rename':
            // Generate unique filename
            destPath = getUniqueDestPath(destPath);
            break;

          case 'overwrite':
            // Just proceed with copy, will overwrite
            break;
        }
      }

      await copyFile(file.sourcePath, destPath);

      const stats = await stat(file.sourcePath);
      progress.copiedBytes += stats.size;
      progress.copiedFiles += 1;

      yield { ...progress };
    } catch (error) {
      progress.status = 'error';
      progress.error =
        error instanceof Error ? error.message : 'Unknown error';
      yield { ...progress };
      return;
    }
  }

  progress.status = 'completed';
  progress.currentFile = null;
  yield { ...progress };
}
