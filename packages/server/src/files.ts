import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type {
  CopyProgress,
  CopyRequest,
  FileEntry,
  FileWithMatch,
} from '@usb-manager/shared';
import { loadRules, matchFile } from './rules.js';

export async function scanDirectory(
  dirPath: string,
  basePath: string = dirPath
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  try {
    const items = await readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      // Skip hidden files and system directories
      if (item.name.startsWith('.')) continue;
      if (item.name === 'System Volume Information') continue;
      if (item.name === '$RECYCLE.BIN') continue;

      const fullPath = join(dirPath, item.name);
      const relativePath = relative(basePath, fullPath);

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
          entry.children = await scanDirectory(fullPath, basePath);
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

export async function* executeCopy(
  request: CopyRequest
): AsyncGenerator<CopyProgress> {
  const id = crypto.randomUUID();
  const totalFiles = request.files.length;
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
      await copyFile(file.sourcePath, file.destinationPath);

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
