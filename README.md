# USB Ingest

A cross-platform (Linux/macOS) application that automatically ingests files from USB drives with rule-based pattern matching and a web interface for previewing and confirming transfers.

## Features

- **USB Detection**: Automatically detects when USB drives are mounted
- **Auto-Copy Mode**: Files matching rules are shown with one-click confirmation
  - Files grouped by destination for easy review
  - **Selective Auto-Copy**: Uncheck specific files before confirming
  - Switch to Manual mode for fine-grained control
- **Two-Panel Interface**: Browse USB contents (left) and select destination (right)
- **Folder Tree View**: Navigate USB drive with expandable folder hierarchy
- **Search & Filter**: Quickly find files by name or extension in the file tree
- **File Type Icons**: Visual distinction for images, videos, documents, code, and more
- **Multi-Select**: Click to select files/folders for batch copying
- **Rule-Based Matching**: Configure glob patterns to auto-suggest destinations
- **Settings UI**: Add, edit, delete copy rules directly in the app
  - Live preview showing matched files count for each pattern
  - Drag-and-drop to reorder rule priority
  - Import/export rules as YAML
  - Exclusion patterns to ignore system files (.DS_Store, Thumbs.db, etc.)
- **Duplicate Detection**: Skip, overwrite, or rename files that already exist
- **Safe Eject**: Safely unmount USB drive after copy completes
- **Real-Time Progress**: SSE-powered copy progress with file-by-file updates
- **Dark Mode**: Supabase-inspired theme with light/dark toggle

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start the watcher (production mode - auto-launches on USB insert)
pnpm --filter @usb-ingest/watcher start
```

### Development Mode

```bash
# Terminal 1: Start server with a test folder
USB_MOUNT_PATH=/path/to/test/folder pnpm --filter @usb-ingest/server dev

# Terminal 2: Start frontend dev server
pnpm --filter @usb-ingest/web dev

# Open http://localhost:5173
```

## Configuration

Copy rules are stored in `~/.config/usb-ingest/rules.yaml`:

```yaml
rules:
  - match: "DCIM/**/*.{jpg,jpeg,png,heic}"
    destination: "~/Photos/Camera"
    enabled: true
  - match: "**/*.pdf"
    destination: "~/Documents/USB-Import"
    enabled: true
defaults:
  unmatchedDestination: null  # null = skip unmatched files
exclusions:
  - ".DS_Store"
  - "Thumbs.db"
  - "**/__MACOSX/**"
```

See `config/rules.yaml` for more examples.

## Architecture

```
packages/
├── shared/     # TypeScript types
├── watcher/    # USB detection daemon (chokidar + drivelist)
├── server/     # Fastify API server
└── web/        # React frontend (Vite + Tailwind)
```

**Flow**: Watcher detects USB → spawns server → opens browser → user selects files → copies to destination

## Requirements

- Node.js 22+
- pnpm 10+
- Linux or macOS

## License

ISC
