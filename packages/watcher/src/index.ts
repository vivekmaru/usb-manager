#!/usr/bin/env node

import { watch } from 'chokidar';
import drivelist from 'drivelist';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
import open from 'open';

const SERVER_PORT = 3847;
const POLL_INTERVAL = 2000;

interface MountedDrive {
  device: string;
  mountPath: string;
  label: string;
}

let serverProcess: ChildProcess | null = null;
let currentDrives = new Map<string, MountedDrive>();

function getWatchPaths(): string[] {
  const user = process.env.USER ?? process.env.USERNAME ?? '';
  const paths: string[] = [];

  if (platform() === 'linux') {
    // Common Linux mount points for USB drives
    paths.push(`/media/${user}`);
    paths.push(`/run/media/${user}`);
    paths.push('/mnt');
  } else if (platform() === 'darwin') {
    // macOS mounts USB drives in /Volumes
    paths.push('/Volumes');
  }

  return paths.filter((p) => existsSync(p));
}

async function getRemovableDrives(): Promise<MountedDrive[]> {
  const drives = await drivelist.list();
  const removable: MountedDrive[] = [];

  for (const drive of drives) {
    // Skip system drives
    if (drive.isSystem) continue;
    if (!drive.isRemovable && !drive.isUSB) continue;

    for (const mount of drive.mountpoints) {
      if (mount.path) {
        removable.push({
          device: drive.device,
          mountPath: mount.path,
          label: mount.label ?? drive.description ?? 'USB Drive',
        });
      }
    }
  }

  return removable;
}

async function startServer(mountPath: string): Promise<void> {
  if (serverProcess) {
    console.log('[watcher] Server already running');
    return;
  }

  const serverPath = join(import.meta.dirname, '../../server/dist/index.js');

  if (!existsSync(serverPath)) {
    console.error('[watcher] Server not built. Run pnpm build first.');
    return;
  }

  console.log(`[watcher] Starting server for ${mountPath}`);

  serverProcess = spawn('node', [serverPath], {
    env: {
      ...process.env,
      USB_MOUNT_PATH: mountPath,
      PORT: String(SERVER_PORT),
    },
    stdio: 'inherit',
  });

  serverProcess.on('exit', (code) => {
    console.log(`[watcher] Server exited with code ${code}`);
    serverProcess = null;
  });

  // Wait a moment for server to start, then open browser
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await open(`http://localhost:${SERVER_PORT}`);
}

function stopServer(): void {
  if (serverProcess) {
    console.log('[watcher] Stopping server');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

async function checkForDrives(): Promise<void> {
  const drives = await getRemovableDrives();
  const newDrives = new Map(drives.map((d) => [d.mountPath, d]));

  // Check for newly mounted drives
  for (const [path, drive] of newDrives) {
    if (!currentDrives.has(path)) {
      console.log(`[watcher] USB mounted: ${drive.label} at ${path}`);
      await startServer(path);
    }
  }

  // Check for unmounted drives
  for (const [path, drive] of currentDrives) {
    if (!newDrives.has(path)) {
      console.log(`[watcher] USB unmounted: ${drive.label} from ${path}`);
      stopServer();
    }
  }

  currentDrives = newDrives;
}

async function main(): Promise<void> {
  console.log('[watcher] USB Manager Watcher starting...');
  console.log(`[watcher] Platform: ${platform()}`);

  const watchPaths = getWatchPaths();
  console.log(`[watcher] Watching: ${watchPaths.join(', ')}`);

  // Initial check
  await checkForDrives();

  // Watch for filesystem changes
  const watcher = watch(watchPaths, {
    depth: 0,
    ignoreInitial: true,
    persistent: true,
  });

  watcher.on('addDir', async () => {
    // Small delay to let the drive fully mount
    await new Promise((resolve) => setTimeout(resolve, 500));
    await checkForDrives();
  });

  watcher.on('unlinkDir', async () => {
    await checkForDrives();
  });

  // Also poll periodically as a fallback
  setInterval(checkForDrives, POLL_INTERVAL);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n[watcher] Shutting down...');
    stopServer();
    watcher.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopServer();
    watcher.close();
    process.exit(0);
  });

  console.log('[watcher] Ready. Waiting for USB drives...');
}

main().catch(console.error);
