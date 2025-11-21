# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Policy

**README.md is a living document.** Update it whenever you:
- Add new features or change existing behavior
- Modify the architecture or add new packages
- Change commands, configuration, or environment variables
- Add new dependencies or requirements

Keep README.md concise and user-focused (quick start, features, config). Keep CLAUDE.md developer-focused (architecture details, key files, internal APIs).

## Project Overview

USB Manager is a cross-platform (Linux/macOS) application that:
- Detects USB drive connections via filesystem watching
- Copies USB contents to local folders using rule-based pattern matching
- Provides a web interface for previewing matched files and confirming copies

## Architecture

pnpm monorepo with 4 packages:

```
packages/
├── shared/     # TypeScript types (UsbDrive, FileEntry, CopyRule, etc.)
├── watcher/    # USB detection daemon (chokidar + drivelist)
├── server/     # Fastify backend (file scanning, rule engine, copy operations)
└── web/        # React frontend (Vite + TanStack Query + Tailwind)
```

**Flow:** Watcher detects USB mount → spawns server with mount path → opens browser → user previews and confirms copy

## Development Commands

```bash
pnpm install      # Install all dependencies
pnpm build        # Build all packages
pnpm dev          # Start all packages in dev mode (parallel)
pnpm type-check   # TypeScript check across all packages
```

**Package-specific:**
```bash
pnpm --filter @usb-manager/server dev    # Server only (port 3847)
pnpm --filter @usb-manager/web dev       # Frontend only (port 5173, proxies to 3847)
pnpm --filter @usb-manager/watcher dev   # Start USB watcher
```

## Configuration

Rules are stored in `~/.config/usb-manager/rules.yaml`:

```yaml
rules:
  - match: "DCIM/**/*.{jpg,jpeg,png}"    # glob pattern
    destination: "~/Photos/Camera"
    enabled: true
defaults:
  unmatchedDestination: null             # null = skip unmatched files
```

See `config/rules.example.yaml` for full example.

## Key Files

- `packages/server/src/index.ts` - Fastify server with all API endpoints
- `packages/server/src/rules.ts` - Rule engine (picomatch globs, YAML parsing)
- `packages/server/src/files.ts` - File scanning and copy operations
- `packages/watcher/src/index.ts` - USB mount detection
- `packages/web/src/App.tsx` - Main UI component (two-panel layout)
- `packages/web/src/lib/api.ts` - API client functions

## API Endpoints

- `GET /api/usb` - USB drive info
- `GET /api/tree` - Folder tree with hierarchy
- `GET /api/files` - Flat file list with rule matches
- `GET /api/rules` - Current copy rules
- `PUT /api/rules` - Update copy rules
- `GET /api/local-dirs` - Common local directories
- `GET /api/browse?path=...` - Browse local directory
- `POST /api/copy` - Execute copy (SSE stream)

## Environment Variables

- `USB_MOUNT_PATH` - Path to mounted USB drive (set by watcher)
- `PORT` - Server port (default: 3847)
