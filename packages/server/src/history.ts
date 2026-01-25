import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CopyHistoryEntry } from '@usb-ingest/shared';

function getHistoryPath(): string {
  const configDir = join(homedir(), '.config', 'usb-manager');
  return join(configDir, 'history.json');
}

export function loadHistory(): CopyHistoryEntry[] {
  const historyPath = getHistoryPath();

  if (!existsSync(historyPath)) {
    return [];
  }

  try {
    const content = readFileSync(historyPath, 'utf-8');
    const entries = JSON.parse(content, (key, value) => {
      // Revive Date objects
      if (key === 'timestamp' || key === 'modifiedAt') {
        return new Date(value);
      }
      return value;
    });
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    console.error('[history] Error loading history:', error);
    return [];
  }
}

export function saveHistory(entries: CopyHistoryEntry[]): void {
  const historyPath = getHistoryPath();
  const configDir = join(homedir(), '.config', 'usb-manager');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  try {
    writeFileSync(historyPath, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (error) {
    console.error('[history] Error saving history:', error);
  }
}

export function addHistoryEntry(entry: CopyHistoryEntry): void {
  const entries = loadHistory();
  entries.unshift(entry); // Add to beginning (most recent first)

  // Keep only last 1000 entries
  if (entries.length > 1000) {
    entries.splice(1000);
  }

  saveHistory(entries);
}

export function getHistoryStats() {
  const entries = loadHistory();

  const totalCopies = entries.length;
  const totalFiles = entries.reduce((sum, e) => sum + e.copiedFiles, 0);
  const totalBytes = entries.reduce((sum, e) => sum + e.copiedBytes, 0);
  const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
  const successfulCopies = entries.filter(e => e.status === 'completed').length;
  const failedCopies = entries.filter(e => e.status === 'error').length;

  return {
    totalCopies,
    totalFiles,
    totalBytes,
    totalDuration,
    successfulCopies,
    failedCopies,
    averageDuration: totalCopies > 0 ? totalDuration / totalCopies : 0,
  };
}

export function clearHistory(): void {
  saveHistory([]);
}

export function deleteHistoryEntry(id: string): boolean {
  const entries = loadHistory();
  const index = entries.findIndex(e => e.id === id);

  if (index === -1) {
    return false;
  }

  entries.splice(index, 1);
  saveHistory(entries);
  return true;
}
