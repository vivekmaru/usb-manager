import { useState } from 'react';
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
} from 'lucide-react';
import {
  getTree,
  getUsbInfo,
  getLocalDirs,
  browsePath,
  executeCopy,
} from './lib/api';
import { cn, formatBytes } from './lib/utils';
import type { CopyProgress, FileEntry } from '@usb-manager/shared';

export default function App() {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [destination, setDestination] = useState<string | null>(null);
  const [currentBrowsePath, setCurrentBrowsePath] = useState<string | null>(
    null
  );
  const [copyProgress, setCopyProgress] = useState<CopyProgress | null>(null);

  const usbQuery = useQuery({
    queryKey: ['usb'],
    queryFn: getUsbInfo,
  });

  const treeQuery = useQuery({
    queryKey: ['tree'],
    queryFn: getTree,
  });

  const localDirsQuery = useQuery({
    queryKey: ['local-dirs'],
    queryFn: getLocalDirs,
  });

  const browseQuery = useQuery({
    queryKey: ['browse', currentBrowsePath],
    queryFn: () => browsePath(currentBrowsePath!),
    enabled: currentBrowsePath !== null,
  });

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
        // If folder, also deselect all children
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
        // If folder, also select all children
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
    };

    try {
      for await (const progress of executeCopy(request)) {
        setCopyProgress(progress);
      }
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  const isLoading = usbQuery.isLoading || treeQuery.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5" />
          <span className="font-medium">USB Manager</span>
          <span className="text-sm text-gray-500">
            {usbQuery.data?.label}
          </span>
        </div>
        <button
          onClick={() => treeQuery.refetch()}
          className="flex items-center gap-2 rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {/* Copy Progress */}
      {copyProgress && (
        <div className="border-b bg-white px-6 py-3">
          <div className="flex items-center justify-between text-sm">
            <span>
              {copyProgress.status === 'completed'
                ? 'Copy complete'
                : copyProgress.status === 'error'
                  ? 'Copy failed'
                  : `Copying ${copyProgress.copiedFiles}/${copyProgress.totalFiles}...`}
            </span>
            {copyProgress.status === 'completed' && (
              <button
                onClick={() => setCopyProgress(null)}
                className="text-blue-600 hover:underline"
              >
                Dismiss
              </button>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
            <div
              className={cn(
                'h-full transition-all',
                copyProgress.status === 'error'
                  ? 'bg-red-500'
                  : copyProgress.status === 'completed'
                    ? 'bg-green-500'
                    : 'bg-blue-500'
              )}
              style={{
                width: `${(copyProgress.copiedFiles / copyProgress.totalFiles) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - USB Drive */}
        <div className="flex w-1/2 flex-col border-r">
          <div className="border-b bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
            USB Drive
          </div>
          <div className="flex-1 overflow-auto p-2">
            {treeQuery.data?.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expandedFolders}
                selected={selectedPaths}
                onToggleExpand={toggleFolder}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </div>

        {/* Right panel - Destination */}
        <div className="flex w-1/2 flex-col">
          <div className="border-b bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
            Destination
          </div>
          <div className="flex-1 overflow-auto p-4">
            {/* Quick access directories */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase text-gray-400">
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
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-gray-100'
                    )}
                  >
                    <Folder className="h-4 w-4 text-gray-400" />
                    <span className="flex-1">{dir.name}</span>
                    {destination === dir.path && (
                      <Check className="h-4 w-4 text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Browse for more */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase text-gray-400">
                Browse
              </p>
              <button
                onClick={() => setCurrentBrowsePath('~')}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
              >
                <Home className="h-4 w-4 text-gray-400" />
                <span>Browse folders...</span>
              </button>

              {currentBrowsePath && browseQuery.data && (
                <div className="mt-2 rounded-lg border bg-white p-2">
                  <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
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
                            ? 'bg-blue-50 text-blue-700'
                            : 'hover:bg-gray-50'
                        )}
                      >
                        <Folder className="h-4 w-4 text-gray-400" />
                        {dir.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected destination */}
            {destination && (
              <div className="mt-6 rounded-lg border bg-green-50 p-4">
                <p className="text-xs font-medium uppercase text-green-600">
                  Copy to
                </p>
                <p className="mt-1 truncate font-medium text-green-800">
                  {destination.replace(/^\/[^/]+\/[^/]+/, '~')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer - Action bar */}
      <footer className="flex items-center justify-between border-t bg-white px-6 py-4">
        <div className="text-sm text-gray-600">
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
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Copy className="h-4 w-4" />
          Copy
          {selectedFiles.length > 0 && destination && (
            <ArrowRight className="h-4 w-4" />
          )}
        </button>
      </footer>
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
  const hasChildren = entry.isDirectory && entry.children && entry.children.length > 0;

  // Check if all children are selected (for partial selection indicator)
  const allChildrenSelected = entry.isDirectory && entry.children
    ? entry.children.every((c) => selected.has(c.path))
    : false;
  const someChildrenSelected = entry.isDirectory && entry.children
    ? entry.children.some((c) => selected.has(c.path))
    : false;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 rounded py-1 pr-2 hover:bg-gray-100',
          isSelected && 'bg-blue-50'
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {/* Expand/collapse button */}
        {entry.isDirectory ? (
          <button
            onClick={() => onToggleExpand(entry.path)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-200"
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
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
              ? 'border-blue-500 bg-blue-500'
              : someChildrenSelected && !allChildrenSelected
                ? 'border-blue-300 bg-blue-100'
                : 'border-gray-300'
          )}
        >
          {isSelected && <Check className="h-3 w-3 text-white" />}
          {!isSelected && someChildrenSelected && !allChildrenSelected && (
            <div className="h-2 w-2 rounded-sm bg-blue-400" />
          )}
        </button>

        {/* Icon */}
        {entry.isDirectory ? (
          isExpanded ? (
            <FolderOpen className="ml-2 h-4 w-4 text-blue-500" />
          ) : (
            <Folder className="ml-2 h-4 w-4 text-blue-500" />
          )
        ) : (
          <File className="ml-2 h-4 w-4 text-gray-400" />
        )}

        {/* Name */}
        <span className="ml-2 flex-1 truncate text-sm">{entry.name}</span>

        {/* Size (files only) */}
        {!entry.isDirectory && (
          <span className="text-xs text-gray-400">
            {formatBytes(entry.size)}
          </span>
        )}
      </div>

      {/* Children */}
      {entry.isDirectory && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
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
