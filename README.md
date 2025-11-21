# USB Manager

A cross-platform (Linux/macOS) application that detects USB drives and provides a web interface to copy files to local destinations.

## Features

- **USB Detection**: Automatically detects when USB drives are mounted
- **Two-Panel Interface**: Browse USB contents (left) and select destination (right)
- **Folder Tree View**: Navigate USB drive with expandable folder hierarchy
- **Multi-Select**: Click to select files/folders for batch copying
- **Rule-Based Matching**: Configure glob patterns to auto-suggest destinations
- **Real-Time Progress**: SSE-powered copy progress with file-by-file updates

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
```

See `config/rules.example.yaml` for more examples.

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
