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
}

export interface MatchedRule {
  rule: CopyRule;
  destination: string; // resolved absolute path
}

// Copy operation types
export interface CopyRequest {
  files: CopyFileRequest[];
}

export interface CopyFileRequest {
  sourcePath: string;
  destinationPath: string;
}

export interface CopyProgress {
  id: string;
  status: 'pending' | 'copying' | 'completed' | 'error';
  totalFiles: number;
  copiedFiles: number;
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
