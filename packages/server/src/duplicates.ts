import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { DuplicateGroup, FileHash } from '@usb-ingest/shared';

export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function getFileHash(filePath: string): Promise<FileHash | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const stats = await stat(filePath);
    const hash = await calculateFileHash(filePath);

    return {
      path: filePath,
      hash,
      size: stats.size,
      modifiedAt: stats.mtime,
    };
  } catch (error) {
    console.error(`[duplicates] Error hashing file ${filePath}:`, error);
    return null;
  }
}

export async function findDuplicates(
  filePaths: string[]
): Promise<DuplicateGroup[]> {
  const fileHashes: FileHash[] = [];

  // Calculate hashes for all files
  for (const path of filePaths) {
    const hash = await getFileHash(path);
    if (hash) {
      fileHashes.push(hash);
    }
  }

  // Group by hash
  const groups = new Map<string, FileHash[]>();
  for (const file of fileHashes) {
    const existing = groups.get(file.hash) || [];
    existing.push(file);
    groups.set(file.hash, existing);
  }

  // Filter to only groups with duplicates and create DuplicateGroup objects
  const duplicateGroups: DuplicateGroup[] = [];
  for (const [hash, files] of groups.entries()) {
    if (files.length > 1) {
      duplicateGroups.push({
        hash,
        files,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
      });
    }
  }

  return duplicateGroups;
}

export async function isDuplicate(
  sourcePath: string,
  destinationPath: string
): Promise<boolean> {
  if (!existsSync(destinationPath)) {
    return false;
  }

  try {
    const sourceHash = await calculateFileHash(sourcePath);
    const destHash = await calculateFileHash(destinationPath);
    return sourceHash === destHash;
  } catch {
    return false;
  }
}
