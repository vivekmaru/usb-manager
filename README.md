# USB Manager

A cross-platform (Linux/macOS) application that detects USB drives and provides a web interface to copy files to local destinations.

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
pnpm --filter @usb-manager/watcher start
```

### Development Mode

```bash
# Terminal 1: Start server with a test folder
USB_MOUNT_PATH=/path/to/test/folder pnpm --filter @usb-manager/server dev

# Terminal 2: Start frontend dev server
pnpm --filter @usb-manager/web dev

# Open http://localhost:5173
```

## Configuration

Copy rules are stored in `~/.config/usb-manager/rules.yaml`:

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

### Experimental Features

USB Manager includes experimental features behind feature flags. Enable them in your config file:

```yaml
features:
  copyHistory: false          # Track all copy operations with stats
  smartOrganization: false    # Auto-organize by date (e.g., 2025/01/23/)
  contentDuplicates: false    # Hash-based duplicate detection
  scheduledActions: false     # Auto-delete/eject after copy
```

**Available Experimental Features:**

1. **Copy History** - Track all copy operations with timestamps, file counts, and statistics. Access via `/api/history`
2. **Smart Organization** - Auto-organize files using patterns like `{year}/{month}/{day}/{name}` (configurable)
3. **Content-Based Duplicates** - SHA-256 hash comparison to detect identical files even with different names
4. **Scheduled Actions** - Auto-delete from USB after copy, auto-eject drive, scheduled cleanup

See `IDEAS.md` for full documentation and future feature plans.

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
