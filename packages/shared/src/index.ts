// USB Drive types
export interface UsbDrive {
  device: string;
  mountPath: string;
  label: string | null;
  size: number;
  used: number;
  filesystem: string;
}

// File system types
export interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
  children?: FileEntry[];
}

export interface FileWithMatch extends FileEntry {
  matchedRule: MatchedRule | null;
}

// Rule types
export interface CopyRule {
  match: string; // glob pattern
  destination: string; // destination path
  enabled?: boolean;
}

export interface RulesConfig {
  rules: CopyRule[];
  defaults: {
    unmatchedDestination: string | null;
  };
  exclusions?: string[]; // glob patterns to always ignore (e.g., '.DS_Store', '**/__MACOSX/**')
}

export interface MatchedRule {
  rule: CopyRule;
  destination: string; // resolved absolute path
}

// Copy operation types
export type DuplicateAction = 'skip' | 'overwrite' | 'rename';

export interface CopyRequest {
  files: CopyFileRequest[];
  onDuplicate?: DuplicateAction; // default: 'skip'
}

export interface CopyFileRequest {
  sourcePath: string;
  destinationPath: string;
}

export interface DuplicateInfo {
  sourcePath: string;
  destinationPath: string;
  sourceSize: number;
  destSize: number;
  sourceModified: Date;
  destModified: Date;
}

export interface CopyProgress {
  id: string;
  status: 'pending' | 'copying' | 'completed' | 'error';
  totalFiles: number;
  copiedFiles: number;
  skippedFiles: number; // duplicates that were skipped
  totalBytes: number;
  copiedBytes: number;
  currentFile: string | null;
  error: string | null;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

// WebSocket/SSE event types
export type CopyEvent =
  | { type: 'start'; progress: CopyProgress }
  | { type: 'progress'; progress: CopyProgress }
  | { type: 'file-complete'; file: string; progress: CopyProgress }
  | { type: 'complete'; progress: CopyProgress }
  | { type: 'error'; error: string; progress: CopyProgress };

// Local directory types
export interface LocalDirectory {
  name: string;
  path: string;
  isCommon: boolean; // true for ~/Photos, ~/Documents, etc.
}
