import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import picomatch from 'picomatch';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import type { CopyRule, MatchedRule, RulesConfig } from '@usb-manager/shared';

const RuleSchema = z.object({
  match: z.string(),
  destination: z.string(),
  enabled: z.boolean().optional().default(true),
});

const ConfigSchema = z.object({
  rules: z.array(RuleSchema),
  defaults: z.object({
    unmatchedDestination: z.string().nullable(),
  }),
});

const DEFAULT_CONFIG: RulesConfig = {
  rules: [
    {
      match: 'DCIM/**/*.{jpg,jpeg,png,heic,raw,cr2,nef,arw}',
      destination: '~/Photos/Camera',
      enabled: true,
    },
    {
      match: '**/*.{mp4,mov,avi,mkv}',
      destination: '~/Videos/USB-Import',
      enabled: true,
    },
    {
      match: '**/*.pdf',
      destination: '~/Documents/USB-Import',
      enabled: true,
    },
  ],
  defaults: {
    unmatchedDestination: null,
  },
};

function getConfigPath(): string {
  const configDir = join(homedir(), '.config', 'usb-manager');
  return join(configDir, 'rules.yaml');
}

function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return resolve(path);
}

export function loadRules(): RulesConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    // Create default config
    const configDir = dirname(configPath);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, stringify(DEFAULT_CONFIG), 'utf-8');
    console.log(`[rules] Created default config at ${configPath}`);
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parse(content);
    const validated = ConfigSchema.parse(parsed);
    return validated;
  } catch (error) {
    console.error('[rules] Error loading config, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

export function saveRules(config: RulesConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, stringify(config), 'utf-8');
}

export function matchFile(
  relativePath: string,
  rules: CopyRule[]
): MatchedRule | null {
  for (const rule of rules) {
    if (!rule.enabled) continue;

    const isMatch = picomatch(rule.match, {
      nocase: true,
      dot: false,
    });

    if (isMatch(relativePath)) {
      return {
        rule,
        destination: expandPath(rule.destination),
      };
    }
  }

  return null;
}

export function getDestinationPath(
  relativePath: string,
  destinationDir: string
): string {
  // Keep the filename but put it in the destination directory
  const fileName = relativePath.split('/').pop() ?? relativePath;
  return join(destinationDir, fileName);
}
