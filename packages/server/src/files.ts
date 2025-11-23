import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type {
  CopyProgress,
  CopyRequest,
  FileEntry,
  FileWithMatch,
  CopyHistoryEntry,
  CopyHistoryFile,
} from '@usb-manager/shared';
import { isExcluded, loadRules, matchFile } from './rules.js';
import { addHistoryEntry } from './history.js';
import { calculateFileHash, isDuplicate } from './duplicates.js';
import { getOrganizedPath } from './organization.js';
import { executeScheduledActions } from './scheduled-actions.js';

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
  request: CopyRequest,
  usbDevice?: string,
  usbLabel?: string | null,
  mountPath?: string
): AsyncGenerator<CopyProgress> {
  const id = crypto.randomUUID();
  const totalFiles = request.files.length;
  const onDuplicate = request.onDuplicate ?? 'skip';
  const config = loadRules();
  const features = config.features || {};
  const startTime = Date.now();
  let totalBytes = 0;

  // Track history if feature is enabled
  const historyFiles: CopyHistoryFile[] = [];

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
      const sourceStats = await stat(file.sourcePath);

      // Apply smart organization if enabled
      if (features.smartOrganization && config.smartOrganization) {
        const baseDestination = dirname(destPath);
        destPath = await getOrganizedPath(
          file.sourcePath,
          baseDestination,
          config.smartOrganization
        );
      }

      const destExists = existsSync(destPath);
      let isContentDuplicate = false;
      let fileHash: string | undefined;

      // Check for content-based duplicates if feature is enabled
      if (features.contentDuplicates && destExists) {
        isContentDuplicate = await isDuplicate(file.sourcePath, destPath);
        if (isContentDuplicate && onDuplicate === 'skip') {
          progress.copiedBytes += sourceStats.size;
          progress.skippedFiles += 1;

          if (features.copyHistory) {
            fileHash = await calculateFileHash(file.sourcePath);
            historyFiles.push({
              sourcePath: file.sourcePath,
              destinationPath: destPath,
              size: sourceStats.size,
              status: 'skipped',
              hash: fileHash,
            });
          }

          yield { ...progress };
          continue;
        }
      }

      if (destExists && !isContentDuplicate) {
        switch (onDuplicate) {
          case 'skip':
            progress.copiedBytes += sourceStats.size;
            progress.skippedFiles += 1;

            if (features.copyHistory) {
              historyFiles.push({
                sourcePath: file.sourcePath,
                destinationPath: destPath,
                size: sourceStats.size,
                status: 'skipped',
              });
            }

            yield { ...progress };
            continue;

          case 'rename':
            destPath = getUniqueDestPath(destPath);
            break;

          case 'overwrite':
            // Just proceed with copy, will overwrite
            break;
        }
      }

      await copyFile(file.sourcePath, destPath);

      // Calculate hash if copy history is enabled
      if (features.copyHistory && features.contentDuplicates) {
        fileHash = await calculateFileHash(file.sourcePath);
      }

      progress.copiedBytes += sourceStats.size;
      progress.copiedFiles += 1;

      if (features.copyHistory) {
        historyFiles.push({
          sourcePath: file.sourcePath,
          destinationPath: destPath,
          size: sourceStats.size,
          status: 'copied',
          hash: fileHash,
        });
      }

      yield { ...progress };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (features.copyHistory) {
        const sourceStats = await stat(file.sourcePath).catch(() => null);
        historyFiles.push({
          sourcePath: file.sourcePath,
          destinationPath: file.destinationPath,
          size: sourceStats?.size || 0,
          status: 'error',
          error: errorMessage,
        });
      }

      progress.status = 'error';
      progress.error = errorMessage;
      yield { ...progress };

      // Save history entry even on error
      if (features.copyHistory && usbDevice) {
        const duration = Date.now() - startTime;
        const historyEntry: CopyHistoryEntry = {
          id,
          timestamp: new Date(),
          usbDevice,
          usbLabel: usbLabel || null,
          totalFiles,
          copiedFiles: progress.copiedFiles,
          skippedFiles: progress.skippedFiles,
          totalBytes,
          copiedBytes: progress.copiedBytes,
          duration,
          status: 'error',
          error: errorMessage,
          files: historyFiles,
        };
        addHistoryEntry(historyEntry);
      }

      return;
    }
  }

  progress.status = 'completed';
  progress.currentFile = null;
  yield { ...progress };

  // Save history entry on success
  if (features.copyHistory && usbDevice) {
    const duration = Date.now() - startTime;
    const historyEntry: CopyHistoryEntry = {
      id,
      timestamp: new Date(),
      usbDevice,
      usbLabel: usbLabel || null,
      totalFiles,
      copiedFiles: progress.copiedFiles,
      skippedFiles: progress.skippedFiles,
      totalBytes,
      copiedBytes: progress.copiedBytes,
      duration,
      status: 'completed',
      files: historyFiles,
    };
    addHistoryEntry(historyEntry);
  }

  // Execute scheduled actions if enabled
  if (features.scheduledActions && config.scheduledActions) {
    try {
      const copiedSourcePaths = historyFiles
        .filter(f => f.status === 'copied')
        .map(f => f.sourcePath);

      const result = await executeScheduledActions(
        config.scheduledActions,
        copiedSourcePaths,
        mountPath
      );

      if (result.errors.length > 0) {
        console.warn('[copy] Scheduled actions had errors:', result.errors);
      }
    } catch (error) {
      console.error('[copy] Failed to execute scheduled actions:', error);
    }
  }
}
