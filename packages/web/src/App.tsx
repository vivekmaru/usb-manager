import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  HardDrive,
  Folder,
  FolderOpen,
  File,
  Check,
  ChevronRight,
  ChevronDown,
  Copy,
  RefreshCw,
  Home,
  ArrowRight,
  Settings as SettingsIcon,
  Sparkles,
  FileStack,
  X,
  Unplug,
  Search,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileArchive,
} from 'lucide-react';
import {
  getTree,
  getUsbInfo,
  getLocalDirs,
  browsePath,
  executeCopy,
  getFiles,
  ejectUsb,
} from './lib/api';
import { cn, formatBytes } from './lib/utils';
import { ThemeToggle } from './components/ThemeToggle';
import { Settings } from './pages/Settings';
import type { CopyProgress, DuplicateAction, FileEntry, FileWithMatch } from '@usb-ingest/shared';

type Page = 'main' | 'settings';
type ViewMode = 'auto' | 'manual';

// Get file icon based on extension
function getFileIcon(fileName: string) {
  const ext = fileName.toLowerCase().split('.').pop() || '';

  // Image files
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'heic', 'heif', 'raw', 'cr2', 'nef'].includes(ext)) {
    return FileImage;
  }

  // Video files
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext)) {
    return FileVideo;
  }

  // Audio files
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'aiff'].includes(ext)) {
    return FileAudio;
  }

  // Document files
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages'].includes(ext)) {
    return FileText;
  }

  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml', 'sh', 'bash', 'go', 'rs', 'php', 'rb', 'swift', 'kt'].includes(ext)) {
    return FileCode;
  }

  // Spreadsheet files
  if (['xls', 'xlsx', 'csv', 'numbers', 'ods'].includes(ext)) {
    return FileSpreadsheet;
  }

  // Archive files
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg', 'iso'].includes(ext)) {
    return FileArchive;
  }

  // Default file icon
  return File;
}

export default function App() {
  const [page, setPage] = useState<Page>('main');
  const [viewMode, setViewMode] = useState<ViewMode>('auto');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [destination, setDestination] = useState<string | null>(null);
  const [currentBrowsePath, setCurrentBrowsePath] = useState<string | null>(
    null
  );
  const [copyProgress, setCopyProgress] = useState<CopyProgress | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('skip');
  const [isEjecting, setIsEjecting] = useState(false);
  const [ejectMessage, setEjectMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoSelectedPaths, setAutoSelectedPaths] = useState<Set<string>>(new Set());

  const usbQuery = useQuery({
    queryKey: ['usb'],
    queryFn: getUsbInfo,
    enabled: page === 'main',
  });

  const treeQuery = useQuery({
    queryKey: ['tree'],
    queryFn: getTree,
    enabled: page === 'main',
  });

  // Files with rule matches for auto-copy
  const filesQuery = useQuery({
    queryKey: ['files'],
    queryFn: getFiles,
    enabled: page === 'main',
  });

  const localDirsQuery = useQuery({
    queryKey: ['local-dirs'],
    queryFn: getLocalDirs,
    enabled: page === 'main',
  });

  const browseQuery = useQuery({
    queryKey: ['browse', currentBrowsePath],
    queryFn: () => browsePath(currentBrowsePath!),
    enabled: page === 'main' && currentBrowsePath !== null,
  });

  // Group matched files by destination
  const matchedByDestination = useMemo(() => {
    if (!filesQuery.data) return new Map<string, FileWithMatch[]>();
    const groups = new Map<string, FileWithMatch[]>();
    for (const file of filesQuery.data) {
      if (file.matchedRule) {
        const dest = file.matchedRule.destination;
        if (!groups.has(dest)) groups.set(dest, []);
        groups.get(dest)!.push(file);
      }
    }
    return groups;
  }, [filesQuery.data]);

  const totalMatchedFiles = useMemo(() => {
    let count = 0;
    for (const files of matchedByDestination.values()) {
      count += files.length;
    }
    return count;
  }, [matchedByDestination]);

  // Auto-select all matched files by default
  useEffect(() => {
    if (filesQuery.data && viewMode === 'auto') {
      const paths = new Set<string>();
      for (const file of filesQuery.data) {
        if (file.matchedRule) {
          paths.add(file.path);
        }
      }
      setAutoSelectedPaths(paths);
    }
  }, [filesQuery.data, viewMode]);

  // Count selected files in auto mode
  const selectedAutoFiles = useMemo(() => {
    const selected: FileWithMatch[] = [];
    for (const file of filesQuery.data || []) {
      if (file.matchedRule && autoSelectedPaths.has(file.path)) {
        selected.push(file);
      }
    }
    return selected;
  }, [filesQuery.data, autoSelectedPaths]);

  const selectedAutoFilesCount = selectedAutoFiles.length;
  const selectedAutoFilesSize = useMemo(() => {
    return selectedAutoFiles.reduce((sum, f) => sum + f.size, 0);
  }, [selectedAutoFiles]);

  // Filter tree based on search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim() || !treeQuery.data) return treeQuery.data;

    const query = searchQuery.toLowerCase();

    const filterEntry = (entry: FileEntry): FileEntry | null => {
      const nameMatches = entry.name.toLowerCase().includes(query);

      if (entry.isDirectory && entry.children) {
        const filteredChildren = entry.children
          .map(filterEntry)
          .filter((e: FileEntry | null): e is FileEntry => e !== null);

        // Include directory if it matches or has matching children
        if (nameMatches || filteredChildren.length > 0) {
          return {
            ...entry,
            children: filteredChildren,
          };
        }
      } else if (nameMatches) {
        return entry;
      }

      return null;
    };

    return treeQuery.data
      .map(filterEntry)
      .filter((e: FileEntry | null): e is FileEntry => e !== null);
  }, [treeQuery.data, searchQuery]);

  if (page === 'settings') {
    return <Settings onBack={() => setPage('main')} />;
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleSelect = (entry: FileEntry) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) {
        next.delete(entry.path);
        if (entry.isDirectory && entry.children) {
          const removeChildren = (children: FileEntry[]) => {
            for (const child of children) {
              next.delete(child.path);
              if (child.children) removeChildren(child.children);
            }
          };
          removeChildren(entry.children);
        }
      } else {
        next.add(entry.path);
        if (entry.isDirectory && entry.children) {
          const addChildren = (children: FileEntry[]) => {
            for (const child of children) {
              next.add(child.path);
              if (child.children) addChildren(child.children);
            }
          };
          addChildren(entry.children);
        }
      }
      return next;
    });
  };

  const getSelectedFiles = (): FileEntry[] => {
    const files: FileEntry[] = [];
    const collectFiles = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (selectedPaths.has(entry.path) && !entry.isDirectory) {
          files.push(entry);
        }
        if (entry.children) {
          collectFiles(entry.children);
        }
      }
    };
    if (treeQuery.data) collectFiles(treeQuery.data);
    return files;
  };

  const selectedFiles = getSelectedFiles();
  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const handleCopy = async () => {
    if (!destination || selectedFiles.length === 0) return;

    const request = {
      files: selectedFiles.map((f) => ({
        sourcePath: f.path,
        destinationPath: `${destination}/${f.name}`,
      })),
      onDuplicate: duplicateAction,
    };

    try {
      for await (const progress of executeCopy(request)) {
        setCopyProgress(progress);
      }
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  // Auto-copy selected matched files to their destinations
  const handleAutoCopy = async () => {
    const files: { sourcePath: string; destinationPath: string }[] = [];
    for (const file of selectedAutoFiles) {
      if (file.matchedRule) {
        files.push({
          sourcePath: file.path,
          destinationPath: `${file.matchedRule.destination}/${file.name}`,
        });
      }
    }
    if (files.length === 0) return;

    try {
      for await (const progress of executeCopy({ files, onDuplicate: duplicateAction })) {
        setCopyProgress(progress);
      }
    } catch (error) {
      console.error('Auto-copy failed:', error);
    }
  };

  const toggleAutoFileSelection = (filePath: string) => {
    setAutoSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const selectAllAutoFiles = () => {
    const paths = new Set<string>();
    for (const file of filesQuery.data || []) {
      if (file.matchedRule) {
        paths.add(file.path);
      }
    }
    setAutoSelectedPaths(paths);
  };

  const deselectAllAutoFiles = () => {
    setAutoSelectedPaths(new Set());
  };

  const handleEject = async () => {
    setIsEjecting(true);
    setEjectMessage(null);
    try {
      await ejectUsb();
      setEjectMessage('USB safely ejected. You can now remove the drive.');
    } catch (error) {
      setEjectMessage(
        `Failed to eject: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsEjecting(false);
    }
  };

  const isLoading = usbQuery.isLoading || treeQuery.isLoading || filesQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5" />
          <span className="font-medium">USB Manager</span>
          <span className="text-sm text-muted-foreground">
            {usbQuery.data?.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-md border">
            <button
              onClick={() => setViewMode('auto')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm',
                viewMode === 'auto' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              )}
            >
              <Sparkles className="h-4 w-4" />
              Auto
            </button>
            <button
              onClick={() => setViewMode('manual')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm',
                viewMode === 'manual' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              )}
            >
              <FileStack className="h-4 w-4" />
              Manual
            </button>
          </div>
          <button
            onClick={() => {
              treeQuery.refetch();
              filesQuery.refetch();
            }}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setPage('settings')}
            className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
            title="Settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Copy Progress */}
      {copyProgress && (
        <div className="border-b bg-card px-6 py-3">
          <div className="flex items-center justify-between text-sm">
            <span>
              {copyProgress.status === 'completed'
                ? `Copy complete${copyProgress.skippedFiles > 0 ? ` (${copyProgress.skippedFiles} skipped)` : ''}`
                : copyProgress.status === 'error'
                  ? 'Copy failed'
                  : `Copying ${copyProgress.copiedFiles}/${copyProgress.totalFiles}...${copyProgress.skippedFiles > 0 ? ` (${copyProgress.skippedFiles} skipped)` : ''}`}
            </span>
            {copyProgress.status === 'completed' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleEject}
                  disabled={isEjecting}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-primary hover:underline disabled:opacity-50"
                >
                  <Unplug className="h-4 w-4" />
                  {isEjecting ? 'Ejecting...' : 'Eject USB'}
                </button>
                <button
                  onClick={() => setCopyProgress(null)}
                  className="text-primary hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-all',
                copyProgress.status === 'error'
                  ? 'bg-destructive'
                  : copyProgress.status === 'completed'
                    ? 'bg-primary'
                    : 'bg-primary'
              )}
              style={{
                width: `${((copyProgress.copiedFiles + copyProgress.skippedFiles) / copyProgress.totalFiles) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Eject Message */}
      {ejectMessage && (
        <div className="border-b bg-card px-6 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className={ejectMessage.includes('Failed') ? 'text-destructive' : 'text-primary'}>
              {ejectMessage}
            </span>
            <button
              onClick={() => setEjectMessage(null)}
              className="text-muted-foreground hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main content - Auto or Manual mode */}
      {viewMode === 'auto' && totalMatchedFiles > 0 ? (
        /* Auto-match confirmation panel */
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-6">
            <div className="mx-auto max-w-2xl">
              {/* Summary header */}
              <div className="mb-6 rounded-lg border border-primary/30 bg-primary/10 p-6 text-center">
                <Sparkles className="mx-auto mb-3 h-10 w-10 text-primary" />
                <h2 className="text-xl font-semibold">
                  {selectedAutoFilesCount} of {totalMatchedFiles} files selected
                </h2>
                <p className="mt-1 text-muted-foreground">
                  {formatBytes(selectedAutoFilesSize)} • {matchedByDestination.size} destination{matchedByDestination.size !== 1 ? 's' : ''}
                </p>
                {selectedAutoFilesCount !== totalMatchedFiles && (
                  <div className="mt-3 flex justify-center gap-2">
                    <button
                      onClick={selectAllAutoFiles}
                      className="text-sm text-primary hover:underline"
                    >
                      Select all
                    </button>
                    {selectedAutoFilesCount > 0 && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <button
                          onClick={deselectAllAutoFiles}
                          className="text-sm text-primary hover:underline"
                        >
                          Deselect all
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Grouped by destination */}
              <div className="space-y-4">
                {Array.from(matchedByDestination.entries()).map(([dest, files]) => (
                  <div key={dest} className="rounded-lg border bg-card">
                    <div className="flex items-center gap-3 border-b px-4 py-3">
                      <Folder className="h-5 w-5 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium">{dest.replace(/^\/Users\/[^/]+/, '~')}</p>
                        <p className="text-sm text-muted-foreground">
                          {files.length} file{files.length !== 1 ? 's' : ''} • {formatBytes(files.reduce((a, f) => a + f.size, 0))}
                        </p>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-auto p-2">
                      {files.slice(0, 10).map((f) => {
                        const IconComponent = getFileIcon(f.name);
                        const isSelected = autoSelectedPaths.has(f.path);
                        return (
                          <div
                            key={f.path}
                            className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-accent rounded cursor-pointer"
                            onClick={() => toggleAutoFileSelection(f.path)}
                          >
                            <button
                              className={cn(
                                'flex h-4 w-4 items-center justify-center rounded border flex-shrink-0',
                                isSelected
                                  ? 'border-primary bg-primary'
                                  : 'border-muted-foreground/30'
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                            </button>
                            <IconComponent className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="flex-1 truncate">{f.name}</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">{formatBytes(f.size)}</span>
                          </div>
                        );
                      })}
                      {files.length > 10 && (
                        <p className="px-2 py-1 text-sm text-muted-foreground">
                          ...and {files.length - 10} more
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Duplicate handling */}
              <div className="mt-6 flex items-center justify-center gap-2 text-sm">
                <span className="text-muted-foreground">If file exists:</span>
                <select
                  value={duplicateAction}
                  onChange={(e) => setDuplicateAction(e.target.value as DuplicateAction)}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                >
                  <option value="skip">Skip</option>
                  <option value="overwrite">Overwrite</option>
                  <option value="rename">Rename (add suffix)</option>
                </select>
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => setViewMode('manual')}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                  Review Manually
                </button>
                <button
                  onClick={handleAutoCopy}
                  disabled={copyProgress?.status === 'copying' || selectedAutoFilesCount === 0}
                  className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  {selectedAutoFilesCount === totalMatchedFiles
                    ? 'Copy All'
                    : `Copy ${selectedAutoFilesCount} Selected`}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : viewMode === 'auto' && totalMatchedFiles === 0 ? (
        /* No matches - prompt to switch to manual or configure rules */
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <FileStack className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-medium">No files match your rules</h2>
            <p className="mt-1 text-muted-foreground">
              Configure rules in Settings or switch to Manual mode
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage('settings')}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-accent"
              >
                <SettingsIcon className="h-4 w-4" />
                Settings
              </button>
              <button
                onClick={() => setViewMode('manual')}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <FileStack className="h-4 w-4" />
                Manual Mode
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Manual two-panel layout */
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel - USB Drive */}
          <div className="flex w-1/2 flex-col border-r">
            <div className="border-b bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">
              USB Drive
            </div>
            {/* Search bar */}
            <div className="border-b bg-card px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border bg-background py-1.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {filteredTree?.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
                  <Search className="mb-2 h-8 w-8" />
                  <p>No files match your search</p>
                </div>
              ) : (
                filteredTree?.map((entry) => (
                  <TreeNode
                    key={entry.path}
                    entry={entry}
                    depth={0}
                    expanded={expandedFolders}
                    selected={selectedPaths}
                    onToggleExpand={toggleFolder}
                    onToggleSelect={toggleSelect}
                  />
                ))
              )}
            </div>
          </div>

        {/* Right panel - Destination */}
        <div className="flex w-1/2 flex-col">
          <div className="border-b bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">
            Destination
          </div>
          <div className="flex-1 overflow-auto p-4">
            {/* Quick access directories */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                Quick Access
              </p>
              <div className="space-y-1">
                {localDirsQuery.data?.map((dir) => (
                  <button
                    key={dir.path}
                    onClick={() => setDestination(dir.path)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      destination === dir.path
                        ? 'bg-primary/20 text-primary-foreground'
                        : 'hover:bg-accent'
                    )}
                  >
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1">{dir.name}</span>
                    {destination === dir.path && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Browse for more */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                Browse
              </p>
              <button
                onClick={() => setCurrentBrowsePath('~')}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <Home className="h-4 w-4 text-muted-foreground" />
                <span>Browse folders...</span>
              </button>

              {currentBrowsePath && browseQuery.data && (
                <div className="mt-2 rounded-lg border bg-card p-2">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{currentBrowsePath}</span>
                  </div>
                  <div className="max-h-48 space-y-1 overflow-auto">
                    {browseQuery.data.map((dir) => (
                      <button
                        key={dir.path}
                        onClick={() => setDestination(dir.path)}
                        onDoubleClick={() => setCurrentBrowsePath(dir.path)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                          destination === dir.path
                            ? 'bg-primary/20 text-primary-foreground'
                            : 'hover:bg-accent'
                        )}
                      >
                        <Folder className="h-4 w-4 text-muted-foreground" />
                        {dir.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected destination */}
            {destination && (
              <div className="mt-6 rounded-lg border border-primary/30 bg-primary/10 p-4">
                <p className="text-xs font-medium uppercase text-primary">
                  Copy to
                </p>
                <p className="mt-1 truncate font-medium">
                  {destination.replace(/^\/[^/]+\/[^/]+/, '~')}
                </p>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* Footer - Action bar (only in manual mode) */}
      {viewMode === 'manual' && (
        <footer className="flex items-center justify-between border-t bg-card px-6 py-4">
        <div className="text-sm text-muted-foreground">
          {selectedFiles.length > 0 ? (
            <>
              {selectedFiles.length} files selected ({formatBytes(totalSize)})
            </>
          ) : (
            'Select files from the USB drive'
          )}
        </div>
        <button
          onClick={handleCopy}
          disabled={
            !destination ||
            selectedFiles.length === 0 ||
            copyProgress?.status === 'copying'
          }
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Copy className="h-4 w-4" />
          Copy
          {selectedFiles.length > 0 && destination && (
            <ArrowRight className="h-4 w-4" />
          )}
        </button>
        </footer>
      )}
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  expanded,
  selected,
  onToggleExpand,
  onToggleSelect,
}: {
  entry: FileEntry;
  depth: number;
  expanded: Set<string>;
  selected: Set<string>;
  onToggleExpand: (path: string) => void;
  onToggleSelect: (entry: FileEntry) => void;
}) {
  const isExpanded = expanded.has(entry.path);
  const isSelected = selected.has(entry.path);
  const hasChildren =
    entry.isDirectory && entry.children && entry.children.length > 0;

  const allChildrenSelected =
    entry.isDirectory && entry.children
      ? entry.children.every((c: FileEntry) => selected.has(c.path))
      : false;
  const someChildrenSelected =
    entry.isDirectory && entry.children
      ? entry.children.some((c: FileEntry) => selected.has(c.path))
      : false;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded py-1 pr-2 hover:bg-accent',
          isSelected && 'bg-primary/20'
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {/* Expand/collapse button */}
        {entry.isDirectory ? (
          <button
            onClick={() => onToggleExpand(entry.path)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            ) : (
              <span className="w-4" />
            )}
          </button>
        ) : (
          <span className="w-6" />
        )}

        {/* Checkbox */}
        <button
          onClick={() => onToggleSelect(entry)}
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded border',
            isSelected
              ? 'border-primary bg-primary'
              : someChildrenSelected && !allChildrenSelected
                ? 'border-primary/50 bg-primary/30'
                : 'border-muted-foreground/30'
          )}
        >
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
          {!isSelected && someChildrenSelected && !allChildrenSelected && (
            <div className="h-2 w-2 rounded-sm bg-primary" />
          )}
        </button>

        {/* Icon */}
        {entry.isDirectory ? (
          isExpanded ? (
            <FolderOpen className="ml-2 h-4 w-4 text-primary" />
          ) : (
            <Folder className="ml-2 h-4 w-4 text-primary" />
          )
        ) : (
          (() => {
            const IconComponent = getFileIcon(entry.name);
            return <IconComponent className="ml-2 h-4 w-4 text-muted-foreground" />;
          })()
        )}

        {/* Name */}
        <span className="ml-2 flex-1 truncate text-sm">{entry.name}</span>

        {/* Size (files only) */}
        {!entry.isDirectory && (
          <span className="text-xs text-muted-foreground">
            {formatBytes(entry.size)}
          </span>
        )}
      </div>

      {/* Children */}
      {entry.isDirectory && isExpanded && entry.children && (
        <div>
          {entry.children.map((child: FileEntry) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              selected={selected}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
