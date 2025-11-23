# USB Manager - Future Feature Ideas

This document tracks potential features for future development. Features marked as **[Experimental]** are currently behind feature flags and can be enabled in the config file.

## Experimental Features (Behind Feature Flags)

These features are implemented but disabled by default. Enable them in `~/.config/usb-manager/rules.yaml`:

### 1. Copy History & Activity Log **[Experimental]**
**Status:** Implemented, disabled by default
**Enable:** `features.copyHistory: true`

- Tracks all copy operations with timestamps, statistics, and file-level details
- Shows transfer statistics (files copied, data transferred, duration)
- Stores last 1000 copy operations
- Useful for debugging and tracking what's been backed up
- API endpoints:
  - `GET /api/history` - Get all history entries
  - `GET /api/history/stats` - Get statistics
  - `DELETE /api/history` - Clear all history
  - `DELETE /api/history/:id` - Delete specific entry

**Future Enhancements:**
- "Skip already copied" option using history to avoid re-copying files
- Export history to CSV/JSON
- History search and filtering
- Visual analytics dashboard

### 3. Smart Auto-Organization **[Experimental]**
**Status:** Implemented, disabled by default
**Enable:** `features.smartOrganization: true`

- Auto-organize files by date: `~/Photos/2025/01/23/IMG_001.jpg`
- Customizable naming patterns: `{year}/{month}/{day}/{name}`
- Available variables: `{year}`, `{month}`, `{day}`, `{name}`, `{ext}`, `{type}`
- Organizes based on file modification time
- File type detection (image, video, audio, document)

**Future Enhancements:**
- EXIF metadata parsing for photos (camera model, GPS location, original date)
- Event detection and auto-grouping
- More sophisticated pattern templates
- Custom metadata variables

### 4. Content-Based Duplicate Detection **[Experimental]**
**Status:** Implemented, disabled by default
**Enable:** `features.contentDuplicates: true`

- SHA-256 hash-based comparison instead of filename matching
- Detects identical files even with different names
- API endpoint: `GET /api/duplicates` - Find duplicates in current USB files
- Hash stored in copy history when both features enabled

**Future Enhancements:**
- Visual side-by-side comparison UI for duplicates
- Automatically keep best quality version
- Duplicate management dashboard
- Integration with existing local file library

### 8. Scheduled Actions **[Experimental]**
**Status:** Implemented, disabled by default
**Enable:** `features.scheduledActions: true`

- Auto-delete files from USB after verified copy
- Auto-eject USB when copy completes
- Configuration options:
  - `scheduledActions.autoDeleteAfterCopy: true`
  - `scheduledActions.autoEjectAfterCopy: true`
  - `scheduledActions.cleanupOldFiles: true`
  - `scheduledActions.cleanupDays: 30`

**Future Enhancements:**
- Scheduled cleanup of old USB backups
- Conditional actions based on file type or size
- Pre-action confirmation prompts
- Action history and undo capability

---

## Future Features (Not Yet Implemented)

### 2. File Preview & Quick Look
**Priority:** High
**Complexity:** Medium

Enable users to preview files before copying:
- Image/video thumbnails in file list
- Quick preview modal (spacebar/click)
- EXIF data viewer for photos (camera, settings, GPS)
- Video playback with seeking
- Document preview for PDFs

**Benefits:**
- Verify correct files before copying
- Faster workflow for photo/video management
- Avoid copying unwanted files

**Implementation Notes:**
- Use browser native preview APIs where possible
- Consider server-side thumbnail generation for large images
- Lazy-load previews for performance

---

### 5. Desktop Notifications
**Priority:** Medium
**Complexity:** Low

System-level notifications for better UX:
- Alert when USB drive detected
- Notify on copy completion with summary
- Background mode with system tray icon
- Sound alerts (optional)

**Benefits:**
- Work on other tasks while copying
- Don't need to watch browser window
- Quick status checks via system tray

**Implementation Notes:**
- Use Electron or Tauri for native notifications
- Web Notifications API for browser version
- Configurable notification preferences

---

### 6. Integrity Verification
**Priority:** High
**Complexity:** Medium

Ensure data integrity during copy operations:
- SHA-256 hash verification after copy
- Automatic retry on corrupted transfers
- Verification report in copy summary
- Option to verify existing files

**Benefits:**
- Critical for irreplaceable data (photos/videos)
- Peace of mind for important backups
- Early detection of USB drive issues

**Implementation Notes:**
- Hash verification already implemented for duplicate detection
- Reuse existing hash infrastructure
- Add verification progress reporting
- Store verification results in history

---

### 7. Multi-USB Support
**Priority:** Medium
**Complexity:** High

Handle multiple USB drives simultaneously:
- Detect and list all connected USB drives
- Tabbed interface or drive selector
- Independent rule sets per drive or device
- Parallel copy operations

**Benefits:**
- Common scenario with multiple card readers
- Professional photographers with multiple cameras
- Batch processing of multiple drives

**Implementation Notes:**
- Refactor to support multiple mount paths
- Update watcher to detect multiple drives
- UI redesign for multi-drive management
- Consider device-specific profiles

---

## Nice-to-Have Enhancements

### Rule Templates
**Priority:** Low
**Complexity:** Low

Pre-configured rules for common scenarios:
- GoPro (DCIM structure with videos)
- iPhone/Android (DCIM + screenshots)
- Canon/Nikon/Sony camera profiles
- Drone footage (DJI, etc.)
- Audio recorder patterns

**Implementation:**
- JSON template library
- One-click rule import
- Community-contributed templates

---

### Bandwidth Throttling
**Priority:** Low
**Complexity:** Low

Limit copy speed to prevent system slowdown:
- Configurable max transfer rate
- Schedule-based throttling (slower during work hours)
- Automatic throttling when CPU/disk usage high

**Implementation:**
- Stream-based rate limiting
- Adaptive throttling based on system load

---

### Cloud Integration
**Priority:** Low
**Complexity:** High

Copy directly to cloud storage:
- Google Drive
- Dropbox
- iCloud
- AWS S3
- Custom WebDAV servers

**Implementation:**
- OAuth integration for cloud providers
- Progress tracking for uploads
- Conflict resolution
- Offline queue with retry

---

### Conditional Rules
**Priority:** Medium
**Complexity:** Medium

Advanced rule matching:
- Filter by file size (`> 10MB`)
- Date ranges (files newer than X days)
- EXIF data (camera model, ISO, focal length)
- File count limits (only first 100 files)
- Exclusion rules (not matching pattern)

**Implementation:**
- Extend rule schema with conditions
- Expression parser for complex rules
- UI for rule builder

---

### Batch Renaming
**Priority:** Low
**Complexity:** Medium

Apply naming patterns during copy:
- Sequential numbering
- Date/time stamps
- Metadata-based naming
- Find & replace patterns
- Preview before apply

**Implementation:**
- Pattern syntax similar to smart organization
- Dry-run mode for safety
- Undo capability

---

### Statistics Dashboard
**Priority:** Low
**Complexity:** Medium

Visual analytics on copy operations:
- Charts for copy history over time
- File type distribution
- Most used rules
- Storage usage by destination
- Transfer speed trends

**Implementation:**
- Charting library (recharts, Chart.js)
- History data aggregation
- Export to PDF/CSV

---

## Contributing Ideas

Have a feature idea? Here's how to suggest it:

1. Check if it's already listed above
2. Open an issue on GitHub with:
   - Clear description of the feature
   - Use case / why it's valuable
   - Proposed implementation (optional)
3. Add the `enhancement` label

**Feature Request Template:**
```markdown
## Feature Name

**Problem:** What problem does this solve?

**Solution:** How would this feature work?

**Alternatives:** What alternatives exist?

**Priority:** How important is this? (Critical/High/Medium/Low)
```

---

## Feature Flag Development Guidelines

When developing new experimental features:

1. **Always use feature flags** - Add to `features` section in config
2. **Default to disabled** - Let users opt-in
3. **Document thoroughly** - Update this file and README
4. **Gradual rollout** - Experimental → Beta → Stable
5. **Backward compatible** - Don't break existing configs
6. **Performance aware** - Don't slow down core functionality
7. **Fail gracefully** - Errors shouldn't break non-experimental features

**Feature Lifecycle:**
1. **Experimental** (disabled by default, may have bugs)
2. **Beta** (more stable, still disabled by default)
3. **Stable** (enabled by default, well-tested)
4. **Core** (always on, feature flag removed)
