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
- Features auto/manual modes with search/filter, file type icons, and selective file selection
- Supports safe USB ejection after copy completion

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

Rules are stored in `~/.config/usb-manager/rules.yaml` (created from `config/rules.yaml` on first run):

```yaml
rules:
  - match: "DCIM/**/*.{jpg,jpeg,png}"    # glob pattern
    destination: "~/Photos/Camera"
    enabled: true
defaults:
  unmatchedDestination: null             # null = skip unmatched files
exclusions:                              # files to always ignore
  - ".DS_Store"
  - "Thumbs.db"
  - "**/__MACOSX/**"
```

See `config/rules.yaml` for full default configuration.

### Experimental Features

The app includes experimental features behind feature flags (disabled by default):

```yaml
features:
  copyHistory: false          # Track copy operations with stats
  smartOrganization: false    # Auto-organize by date/metadata
  contentDuplicates: false    # Hash-based duplicate detection
  scheduledActions: false     # Auto-delete/eject after copy
```

**Feature Modules:**
- `history.ts` - Stores copy operations in `~/.config/usb-manager/history.json` (max 1000 entries)
- `duplicates.ts` - SHA-256 hash calculation and comparison
- `organization.ts` - Pattern-based file organization with variables like `{year}`, `{month}`, `{day}`
- `scheduled-actions.ts` - Post-copy automation (delete source files, auto-eject USB)

See `IDEAS.md` for full feature documentation and future plans.

## Key Files

- `packages/server/src/index.ts` - Fastify server with all API endpoints (includes eject, history, duplicates)
- `packages/server/src/rules.ts` - Rule engine (picomatch globs, YAML parsing, exclusions, feature flags)
- `packages/server/src/files.ts` - File scanning, copy operations, feature integration
- `packages/server/src/history.ts` - Copy history tracking and storage (experimental)
- `packages/server/src/duplicates.ts` - SHA-256 hash-based duplicate detection (experimental)
- `packages/server/src/organization.ts` - Smart file organization by date/metadata (experimental)
- `packages/server/src/scheduled-actions.ts` - Auto-delete, auto-eject, cleanup (experimental)
- `packages/watcher/src/index.ts` - USB mount detection (requires native drivelist module)
- `packages/web/src/App.tsx` - Main UI (Auto/Manual modes, search/filter, file type icons, selective auto-copy)
- `packages/web/src/pages/Settings.tsx` - Settings UI (rules, exclusions, import/export)
- `packages/web/src/lib/api.ts` - API client functions (includes ejectUsb)

## API Endpoints

**Core Endpoints:**
- `GET /api/usb` - USB drive info
- `GET /api/tree` - Folder tree with hierarchy
- `GET /api/files` - Flat file list with rule matches
- `GET /api/rules` - Current copy rules
- `PUT /api/rules` - Update copy rules
- `GET /api/test-pattern?pattern=...` - Test glob pattern against current USB files
- `GET /api/local-dirs` - Common local directories
- `GET /api/browse?path=...` - Browse local directory
- `POST /api/copy` - Execute copy (SSE stream, supports `onDuplicate`: skip/overwrite/rename)
- `POST /api/eject` - Safely unmount USB drive (uses `umount` on Linux, `diskutil unmount` on macOS)

**Experimental Endpoints (require feature flags):**
- `GET /api/history` - Get all copy history entries (requires `features.copyHistory`)
- `GET /api/history/stats` - Get copy statistics (requires `features.copyHistory`)
- `DELETE /api/history` - Clear all history (requires `features.copyHistory`)
- `DELETE /api/history/:id` - Delete specific history entry (requires `features.copyHistory`)
- `GET /api/duplicates` - Find content-based duplicates on USB (requires `features.contentDuplicates`)

## UI Features

**Auto Mode:**
- Files matching rules are automatically selected with checkboxes
- Users can uncheck specific files before copying (selective auto-copy)
- "Select all" / "Deselect all" buttons for bulk operations
- Files grouped by destination folder
- Copy button shows count of selected files

**Manual Mode:**
- Two-panel layout: USB drive (left) and destination selector (right)
- Search/filter input filters file tree in real-time by name or extension
- File type icons provide visual distinction:
  - Images: jpg, png, gif, heic, raw, etc.
  - Videos: mp4, mov, avi, mkv, etc.
  - Audio: mp3, wav, flac, etc.
  - Documents: pdf, doc, txt, etc.
  - Code: js, ts, py, java, etc.
  - Spreadsheets: xls, xlsx, csv, etc.
  - Archives: zip, rar, 7z, etc.

**After Copy:**
- "Eject USB" button appears when copy completes
- Success/error messages with dismiss functionality

## Environment Variables

- `USB_MOUNT_PATH` - Path to mounted USB drive (set by watcher)
- `PORT` - Server port (default: 3847)

## Native Module Notes

The `drivelist` package (used by watcher) requires native bindings. If you get binding errors:

```bash
cd node_modules/.pnpm/drivelist@*/node_modules/drivelist
npm run rebuild
```

This compiles the native addon for your Node version and platform.
