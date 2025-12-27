import { exec } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { ScheduledActionsConfig } from '@usb-manager/shared';

const execAsync = promisify(exec);

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
    console.log(`[scheduled-actions] Deleted: ${filePath}`);
  } catch (error) {
    console.error(`[scheduled-actions] Failed to delete ${filePath}:`, error);
    throw error;
  }
}

export async function deleteFiles(filePaths: string[]): Promise<{
  deleted: string[];
  failed: string[];
}> {
  const deleted: string[] = [];
  const failed: string[] = [];

  for (const path of filePaths) {
    try {
      await deleteFile(path);
      deleted.push(path);
    } catch {
      failed.push(path);
    }
  }

  return { deleted, failed };
}

export async function ejectUsb(mountPath: string): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      await execAsync(`diskutil unmount "${mountPath}"`);
    } else if (platform === 'linux') {
      await execAsync(`umount "${mountPath}"`);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
    console.log(`[scheduled-actions] Ejected USB at ${mountPath}`);
  } catch (error) {
    console.error(`[scheduled-actions] Failed to eject USB:`, error);
    throw error;
  }
}

export async function executeScheduledActions(
  config: ScheduledActionsConfig,
  copiedFiles: string[],
  mountPath?: string
): Promise<{
  deletedFiles?: string[];
  ejected?: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let deletedFiles: string[] | undefined;
  let ejected: boolean | undefined;

  // Auto-delete from USB after copy
  if (config.autoDeleteAfterCopy && copiedFiles.length > 0) {
    try {
      const result = await deleteFiles(copiedFiles);
      deletedFiles = result.deleted;
      if (result.failed.length > 0) {
        errors.push(`Failed to delete ${result.failed.length} files`);
      }
    } catch (error) {
      errors.push(`Auto-delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Auto-eject after copy
  if (config.autoEjectAfterCopy && mountPath) {
    try {
      await ejectUsb(mountPath);
      ejected = true;
    } catch (error) {
      errors.push(`Auto-eject failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    deletedFiles,
    ejected,
    errors,
  };
}
