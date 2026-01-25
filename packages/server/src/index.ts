import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import type {
  ApiResponse,
  CopyRequest,
  FileEntry,
  FileWithMatch,
  LocalDirectory,
  RulesConfig,
  UsbDrive,
  CopyHistoryEntry,
  DuplicateGroup,
} from '@usb-ingest/shared';
import {
  applyRulesToFiles,
  executeCopy,
  flattenFiles,
  scanDirectory,
} from './files.js';
import { loadRules, saveRules } from './rules.js';
import {
  loadHistory,
  getHistoryStats,
  clearHistory,
  deleteHistoryEntry,
} from './history.js';
import { findDuplicates } from './duplicates.js';

const USB_MOUNT_PATH = process.env.USB_MOUNT_PATH ?? '/media';
const PORT = Number(process.env.PORT) || 3847;

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
});

// Serve static frontend files in production
const webDistPath = join(import.meta.dirname, '../../web/dist');
if (existsSync(webDistPath)) {
  await fastify.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
  });
}

// Get USB drive info
fastify.get('/api/usb', async (): Promise<ApiResponse<UsbDrive>> => {
  try {
    if (!existsSync(USB_MOUNT_PATH)) {
      return {
        success: false,
        error: { message: 'USB drive not found', code: 'USB_NOT_FOUND' },
      };
    }

    const label = USB_MOUNT_PATH.split('/').pop() ?? 'USB Drive';

    // Note: Getting actual disk space requires platform-specific calls
    // For now, we return basic info
    return {
      success: true,
      data: {
        device: USB_MOUNT_PATH,
        mountPath: USB_MOUNT_PATH,
        label,
        size: 0,
        used: 0,
        filesystem: 'unknown',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'USB_ERROR',
      },
    };
  }
});

// Preview file content
fastify.get<{ Querystring: { path: string } }>(
  '/api/preview',
  async (request, reply) => {
    const { path } = request.query;

    if (!path) {
      return reply.code(400).send({ error: 'Path required' });
    }

    // Security check: ensure path is within USB mount path
    const resolvedPath = resolve(path);
    const resolvedMountPath = resolve(USB_MOUNT_PATH);

    if (!resolvedPath.startsWith(resolvedMountPath)) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    if (!existsSync(resolvedPath)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const ext = resolvedPath.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';

    // Simple mime type detection
    if (['jpg', 'jpeg'].includes(ext!)) contentType = 'image/jpeg';
    else if (['png'].includes(ext!)) contentType = 'image/png';
    else if (['gif'].includes(ext!)) contentType = 'image/gif';
    else if (['webp'].includes(ext!)) contentType = 'image/webp';
    else if (['svg'].includes(ext!)) contentType = 'image/svg+xml';
    else if (['pdf'].includes(ext!)) contentType = 'application/pdf';
    else if (['txt', 'log', 'md', 'json', 'yml', 'yaml', 'xml', 'csv'].includes(ext!)) contentType = 'text/plain';
    else if (['mp4', 'm4v'].includes(ext!)) contentType = 'video/mp4';
    else if (['webm'].includes(ext!)) contentType = 'video/webm';
    else if (['mp3'].includes(ext!)) contentType = 'audio/mpeg';
    else if (['wav'].includes(ext!)) contentType = 'audio/wav';

    reply.type(contentType);
    return reply.send(createReadStream(resolvedPath));
  }
);

// List files on USB with rule matches
fastify.get('/api/files', async (): Promise<ApiResponse<FileWithMatch[]>> => {
  try {
    const entries = await scanDirectory(USB_MOUNT_PATH);
    const filesWithMatches = applyRulesToFiles(entries);

    return {
      success: true,
      data: filesWithMatches,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'SCAN_ERROR',
      },
    };
  }
});

// Get current rules
fastify.get('/api/rules', async (): Promise<ApiResponse<RulesConfig>> => {
  try {
    const rules = loadRules();
    return {
      success: true,
      data: rules,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'RULES_ERROR',
      },
    };
  }
});

// Update rules
fastify.put<{ Body: RulesConfig }>(
  '/api/rules',
  async (request): Promise<ApiResponse<RulesConfig>> => {
    try {
      saveRules(request.body);
      return {
        success: true,
        data: request.body,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'RULES_SAVE_ERROR',
        },
      };
    }
  }
);

// Execute copy operation (SSE stream)
fastify.post<{ Body: CopyRequest }>(
  '/api/copy',
  async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    try {
      // Get USB info for history tracking
      const label = USB_MOUNT_PATH.split('/').pop() ?? 'USB Drive';

      for await (const progress of executeCopy(
        request.body,
        USB_MOUNT_PATH,
        label,
        USB_MOUNT_PATH
      )) {
        const event = `data: ${JSON.stringify(progress)}\n\n`;
        reply.raw.write(event);
      }
    } catch (error) {
      const errorEvent = `data: ${JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })}\n\n`;
      reply.raw.write(errorEvent);
    }

    reply.raw.end();
  }
);

// Test pattern against current USB files
fastify.get<{ Querystring: { pattern: string } }>(
  '/api/test-pattern',
  async (request): Promise<ApiResponse<{ count: number; samples: string[] }>> => {
    try {
      const { pattern } = request.query;
      if (!pattern) {
        return {
          success: false,
          error: { message: 'Pattern required', code: 'PATTERN_REQUIRED' },
        };
      }

      const entries = await scanDirectory(USB_MOUNT_PATH);
      const files = flattenFiles(entries);
      const picomatch = (await import('picomatch')).default;
      const isMatch = picomatch(pattern, { nocase: true, dot: false });

      const matched = files.filter((f) => isMatch(f.relativePath));
      const samples = matched.slice(0, 5).map((f) => f.relativePath);

      return {
        success: true,
        data: { count: matched.length, samples },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'TEST_ERROR',
        },
      };
    }
  }
);

// Get folder tree (preserves hierarchy)
fastify.get('/api/tree', async (): Promise<ApiResponse<FileEntry[]>> => {
  try {
    const entries = await scanDirectory(USB_MOUNT_PATH);
    return {
      success: true,
      data: entries,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'SCAN_ERROR',
      },
    };
  }
});

// Get local directories for destination selection
fastify.get(
  '/api/local-dirs',
  async (): Promise<ApiResponse<LocalDirectory[]>> => {
    try {
      const home = homedir();
      const commonDirs = ['Documents', 'Downloads', 'Pictures', 'Music', 'Videos'];
      const dirs: LocalDirectory[] = [];

      // Add common directories
      for (const dir of commonDirs) {
        const path = join(home, dir);
        if (existsSync(path)) {
          dirs.push({ name: dir, path, isCommon: true });
        }
      }

      // Add rule destinations
      const rules = loadRules();
      for (const rule of rules.rules) {
        const dest = rule.destination.startsWith('~/')
          ? join(home, rule.destination.slice(2))
          : rule.destination;
        if (!dirs.some((d) => d.path === dest)) {
          const name = dest.split('/').pop() ?? dest;
          dirs.push({ name, path: dest, isCommon: false });
        }
      }

      return {
        success: true,
        data: dirs,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'LOCAL_DIRS_ERROR',
        },
      };
    }
  }
);

// Browse local directory
fastify.get<{ Querystring: { path: string } }>(
  '/api/browse',
  async (request): Promise<ApiResponse<LocalDirectory[]>> => {
    try {
      const dirPath = request.query.path || homedir();
      const entries = await readdir(dirPath, { withFileTypes: true });
      const dirs: LocalDirectory[] = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          path: join(dirPath, e.name),
          isCommon: false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        success: true,
        data: dirs,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'BROWSE_ERROR',
        },
      };
    }
  }
);

// Eject USB drive
fastify.post('/api/eject', async (): Promise<ApiResponse<{ success: boolean }>> => {
  try {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    // Try to unmount the USB drive
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      // macOS
      command = `diskutil unmount "${USB_MOUNT_PATH}"`;
    } else if (platform === 'linux') {
      // Linux
      command = `umount "${USB_MOUNT_PATH}"`;
    } else {
      return {
        success: false,
        error: { message: 'Unsupported platform for eject', code: 'UNSUPPORTED_PLATFORM' },
      };
    }

    await execAsync(command);

    return {
      success: true,
      data: { success: true },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to eject USB',
        code: 'EJECT_ERROR',
      },
    };
  }
});

// Get copy history
fastify.get(
  '/api/history',
  async (): Promise<ApiResponse<CopyHistoryEntry[]>> => {
    try {
      const history = loadHistory();
      return {
        success: true,
        data: history,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'HISTORY_ERROR',
        },
      };
    }
  }
);

// Get history statistics
fastify.get('/api/history/stats', async (): Promise<ApiResponse<any>> => {
  try {
    const stats = getHistoryStats();
    return {
      success: true,
      data: stats,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'HISTORY_STATS_ERROR',
      },
    };
  }
});

// Clear history
fastify.delete(
  '/api/history',
  async (): Promise<ApiResponse<{ success: boolean }>> => {
    try {
      clearHistory();
      return {
        success: true,
        data: { success: true },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'HISTORY_CLEAR_ERROR',
        },
      };
    }
  }
);

// Delete history entry
fastify.delete<{ Params: { id: string } }>(
  '/api/history/:id',
  async (request): Promise<ApiResponse<{ success: boolean }>> => {
    try {
      const deleted = deleteHistoryEntry(request.params.id);
      if (!deleted) {
        return {
          success: false,
          error: {
            message: 'History entry not found',
            code: 'HISTORY_NOT_FOUND',
          },
        };
      }
      return {
        success: true,
        data: { success: true },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'HISTORY_DELETE_ERROR',
        },
      };
    }
  }
);

// Find duplicates in current USB files
fastify.get(
  '/api/duplicates',
  async (): Promise<ApiResponse<DuplicateGroup[]>> => {
    try {
      const entries = await scanDirectory(USB_MOUNT_PATH);
      const files = flattenFiles(entries);
      const filePaths = files.map((f) => f.path);
      const duplicates = await findDuplicates(filePaths);

      return {
        success: true,
        data: duplicates,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'DUPLICATES_ERROR',
        },
      };
    }
  }
);

// Health check
fastify.get('/api/health', async () => ({
  status: 'ok',
  usbPath: USB_MOUNT_PATH,
}));

// Start server
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[server] USB Ingest server running on http://localhost:${PORT}`);
  console.log(`[server] USB mount path: ${USB_MOUNT_PATH}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
