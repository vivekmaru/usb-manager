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

function getDefaultConfigPath(): string {
  // config/rules.yaml relative to packages/server/dist (compiled output)
  return join(import.meta.dirname, '../../../config/rules.yaml');
}

function loadDefaultConfig(): RulesConfig {
  const defaultPath = getDefaultConfigPath();
  if (existsSync(defaultPath)) {
    try {
      const content = readFileSync(defaultPath, 'utf-8');
      const parsed = parse(content);
      return ConfigSchema.parse(parsed);
    } catch (error) {
      console.error('[rules] Error loading default config:', error);
    }
  }
  // Fallback if config/rules.yaml doesn't exist
  return {
    rules: [],
    defaults: { unmatchedDestination: null },
  };
}

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
    // Create default config from config/rules.yaml
    const defaultConfig = loadDefaultConfig();
    const configDir = dirname(configPath);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, stringify(defaultConfig), 'utf-8');
    console.log(`[rules] Created default config at ${configPath}`);
    return defaultConfig;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parse(content);
    const validated = ConfigSchema.parse(parsed);
    return validated;
  } catch (error) {
    console.error('[rules] Error loading config, using defaults:', error);
    return loadDefaultConfig();
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
