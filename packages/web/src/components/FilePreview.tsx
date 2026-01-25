import { useEffect, useState } from 'react';
import { X, ExternalLink, Download, FileText, FileAudio } from 'lucide-react';
import { formatBytes } from '../lib/utils';
import type { FileEntry } from '@usb-ingest/shared';

interface FilePreviewProps {
  file: FileEntry;
  onClose: () => void;
}

export function FilePreview({ file, onClose }: FilePreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Construct preview URL
  // Note: in production, api path is relative. In dev, we might need to point to server.
  // But standard vite proxy setup usually proxies /api to backend.
  const previewUrl = `/api/preview?path=${encodeURIComponent(file.path)}`;

  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic'].includes(ext);
  const isVideo = ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext);
  const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
  const isPdf = ext === 'pdf';
  const isText = ['txt', 'md', 'json', 'yml', 'yaml', 'xml', 'csv', 'log', 'js', 'ts', 'jsx', 'tsx', 'css', 'html'].includes(ext);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 md:p-8">
      <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">{file.name}</h3>
            <span className="text-sm text-muted-foreground">{formatBytes(file.size)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={() => window.open(previewUrl, '_blank')}
              className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-muted/20 p-4 flex items-center justify-center relative">
          {loading && !error && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
             </div>
          )}

          {error ? (
            <div className="text-center text-muted-foreground">
              <p className="mb-2">Failed to load preview</p>
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : (
            <>
              {isImage && (
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="max-h-full max-w-full object-contain"
                  onLoad={() => setLoading(false)}
                  onError={() => { setLoading(false); setError('Failed to load image'); }}
                />
              )}

              {isVideo && (
                <video
                  src={previewUrl}
                  controls
                  className="max-h-full max-w-full"
                  onLoadedData={() => setLoading(false)}
                  onError={() => { setLoading(false); setError('Failed to load video'); }}
                />
              )}

              {isAudio && (
                <div className="w-full max-w-md p-8 bg-card rounded-lg border shadow-sm flex flex-col items-center gap-4">
                    <FileAudio className="h-16 w-16 text-primary" />
                    <audio
                      src={previewUrl}
                      controls
                      className="w-full"
                      onLoadedData={() => setLoading(false)}
                      onError={() => { setLoading(false); setError('Failed to load audio'); }}
                    />
                </div>
              )}

              {isPdf && (
                <iframe
                    src={previewUrl}
                    className="w-full h-full rounded bg-white"
                    onLoad={() => setLoading(false)}
                />
              )}

              {isText && (
                  <TextPreview url={previewUrl} onLoad={() => setLoading(false)} onError={(e) => { setLoading(false); setError(e); }} />
              )}

              {!isImage && !isVideo && !isAudio && !isPdf && !isText && (
                <div className="text-center text-muted-foreground">
                  <FileText className="mx-auto mb-4 h-16 w-16 opacity-50" />
                  <p>Preview not available for this file type</p>
                  <button onClick={handleDownload} className="mt-4 text-primary hover:underline">
                      Download to view
                  </button>
                   {(() => { if (loading) setLoading(false); return null; })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TextPreview({ url, onLoad, onError }: { url: string, onLoad: () => void, onError: (msg: string) => void }) {
    const [content, setContent] = useState<string>('');

    useEffect(() => {
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error('Failed to load');
                return res.text();
            })
            .then(text => {
                // Truncate if too long
                if (text.length > 50000) {
                    setContent(text.slice(0, 50000) + '\n... (truncated)');
                } else {
                    setContent(text);
                }
                onLoad();
            })
            .catch(err => onError(err.message));
    }, [url, onLoad, onError]);

    if (!content) return null;

    return (
        <pre className="w-full h-full overflow-auto p-4 bg-white dark:bg-zinc-900 rounded text-sm font-mono whitespace-pre-wrap">
            {content}
        </pre>
    );
}
