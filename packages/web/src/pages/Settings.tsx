import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Folder,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { getRules, updateRules, getLocalDirs, testPattern } from '../lib/api';
import { cn } from '../lib/utils';
import { ThemeToggle } from '../components/ThemeToggle';
import type { CopyRule, RulesConfig, Features } from '@usb-ingest/shared';

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  const queryClient = useQueryClient();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newRule, setNewRule] = useState<CopyRule | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newExclusion, setNewExclusion] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rulesQuery = useQuery({
    queryKey: ['rules'],
    queryFn: getRules,
  });

  const updateMutation = useMutation({
    mutationFn: updateRules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });

  const rules = rulesQuery.data?.rules ?? [];
  const exclusions = rulesQuery.data?.exclusions ?? [];
  const features = rulesQuery.data?.features || {};

  const handleToggleFeature = (feature: keyof Features) => {
    if (!rulesQuery.data) return;
    const currentFeatures = rulesQuery.data.features || {};
    updateMutation.mutate({
      ...rulesQuery.data,
      features: {
        ...currentFeatures,
        [feature]: !currentFeatures[feature],
      },
    });
  };

  const handleToggleEnabled = (index: number) => {
    if (!rulesQuery.data) return;
    const rule = rules[index];
    if (!rule) return;
    const newRules = [...rules];
    newRules[index] = { ...rule, enabled: !rule.enabled };
    updateMutation.mutate({ ...rulesQuery.data, rules: newRules });
  };

  const handleDeleteRule = (index: number) => {
    if (!rulesQuery.data) return;
    const newRules = rules.filter((_, i) => i !== index);
    updateMutation.mutate({ ...rulesQuery.data, rules: newRules });
  };

  const handleSaveRule = (index: number, rule: CopyRule) => {
    if (!rulesQuery.data) return;
    const newRules = [...rules];
    newRules[index] = rule;
    updateMutation.mutate({ ...rulesQuery.data, rules: newRules });
    setEditingIndex(null);
  };

  const handleAddRule = (rule: CopyRule) => {
    if (!rulesQuery.data) return;
    updateMutation.mutate({ ...rulesQuery.data, rules: [...rules, rule] });
    setNewRule(null);
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex && rulesQuery.data) {
      const newRules = [...rules];
      const [removed] = newRules.splice(dragIndex, 1);
      if (removed) {
        newRules.splice(dragOverIndex, 0, removed);
        updateMutation.mutate({ ...rulesQuery.data, rules: newRules });
      }
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Exclusion handlers
  const handleAddExclusion = () => {
    if (!rulesQuery.data || !newExclusion.trim()) return;
    const updated = [...exclusions, newExclusion.trim()];
    updateMutation.mutate({ ...rulesQuery.data, exclusions: updated });
    setNewExclusion('');
  };

  const handleRemoveExclusion = (index: number) => {
    if (!rulesQuery.data) return;
    const updated = exclusions.filter((_, i) => i !== index);
    updateMutation.mutate({ ...rulesQuery.data, exclusions: updated });
  };

  // Export rules as YAML
  const handleExport = () => {
    if (!rulesQuery.data) return;
    const yaml = generateYaml(rulesQuery.data);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rules.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import rules from YAML
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseYaml(content);
        if (parsed && rulesQuery.data) {
          updateMutation.mutate(parsed);
        }
      } catch (err) {
        console.error('Failed to parse YAML:', err);
        alert('Failed to parse YAML file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
        <ThemeToggle />
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl">
          {/* Rules Section */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Copy Rules</h2>
                <p className="text-sm text-muted-foreground">
                  Define patterns to automatically match files to destinations
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Import/Export */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".yaml,.yml"
                  onChange={handleImport}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm hover:bg-accent"
                  title="Import YAML"
                >
                  <Upload className="h-4 w-4" />
                </button>
                <button
                  onClick={handleExport}
                  disabled={rules.length === 0}
                  className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                  title="Export YAML"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setNewRule({ match: '', destination: '', enabled: true })}
                  disabled={newRule !== null}
                  className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Add Rule
                </button>
              </div>
            </div>

            {/* Rules List */}
            <div className="space-y-2">
              {rules.map((rule, index) => (
                <div
                  key={index}
                  draggable={editingIndex !== index}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    dragOverIndex === index && dragIndex !== index && 'border-t-2 border-primary'
                  )}
                >
                  {editingIndex === index ? (
                    <RuleEditor
                      rule={rule}
                      onSave={(r) => handleSaveRule(index, r)}
                      onCancel={() => setEditingIndex(null)}
                    />
                  ) : (
                    <RuleItemDisplay
                      rule={rule}
                      index={index}
                      isDragging={dragIndex === index}
                      onEdit={() => setEditingIndex(index)}
                      onDelete={() => handleDeleteRule(index)}
                      onToggleEnabled={() => handleToggleEnabled(index)}
                    />
                  )}
                </div>
              ))}

              {/* New Rule Form */}
              {newRule && (
                <RuleEditor
                  rule={newRule}
                  onSave={handleAddRule}
                  onCancel={() => setNewRule(null)}
                  isNew
                />
              )}

              {rules.length === 0 && !newRule && (
                <div className="rounded-lg border border-dashed bg-muted/50 p-8 text-center">
                  <p className="text-muted-foreground">No rules configured</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add a rule to automatically match files to destinations
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Features Section */}
          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-lg font-medium">Features</h2>
              <p className="text-sm text-muted-foreground">
                Enable additional functionality
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Integrity Verification</h3>
                    <p className="text-sm text-muted-foreground">
                      Verify file hashes after copy to ensure data integrity
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFeature('verifyIntegrity')}
                  className={cn(
                    'flex h-6 w-11 items-center rounded-full p-1 transition-colors',
                    features.verifyIntegrity ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full bg-white transition-transform',
                      features.verifyIntegrity ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Exclusions Section */}
          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-lg font-medium">Exclusions</h2>
              <p className="text-sm text-muted-foreground">
                Files and folders matching these patterns will always be ignored
              </p>
            </div>

            {/* Add exclusion input */}
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={newExclusion}
                onChange={(e) => setNewExclusion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddExclusion()}
                placeholder="e.g., .DS_Store or **/__MACOSX/**"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={handleAddExclusion}
                disabled={!newExclusion.trim()}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>

            {/* Exclusions list */}
            <div className="flex flex-wrap gap-2">
              {exclusions.map((pattern, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-sm"
                >
                  <code className="text-muted-foreground">{pattern}</code>
                  <button
                    onClick={() => handleRemoveExclusion(index)}
                    className="ml-1 rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {exclusions.length === 0 && (
                <p className="text-sm text-muted-foreground">No exclusions configured</p>
              )}
            </div>
          </section>

          {/* Pattern Syntax Info */}
          <section className="mt-8 rounded-lg border bg-card p-4">
            <h3 className="font-medium">Pattern Syntax</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Rules use glob patterns to match files (evaluated top to bottom):
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li><code className="rounded bg-muted px-1">*</code> - matches any characters in filename</li>
              <li><code className="rounded bg-muted px-1">**</code> - matches any path depth</li>
              <li><code className="rounded bg-muted px-1">{'*.{jpg,png}'}</code> - matches multiple extensions</li>
              <li><code className="rounded bg-muted px-1">DCIM/**/*.jpg</code> - matches JPGs in DCIM folder</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function RuleItemDisplay({
  rule,
  index,
  isDragging,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  rule: CopyRule;
  index: number;
  isDragging: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border bg-card p-4',
        isDragging && 'opacity-50'
      )}
    >
      <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground opacity-50 group-hover:opacity-100" />

      {/* Priority badge */}
      <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
        {index + 1}
      </span>

      {/* Enable toggle */}
      <button
        onClick={onToggleEnabled}
        className={cn(
          'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
          rule.enabled ? 'bg-primary' : 'bg-muted'
        )}
      >
        <div
          className={cn(
            'h-4 w-4 rounded-full bg-white transition-transform',
            rule.enabled ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </button>

      {/* Rule info */}
      <div
        className={cn('flex-1 cursor-pointer', !rule.enabled && 'opacity-50')}
        onClick={onEdit}
      >
        <p className="font-mono text-sm">{rule.match}</p>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <Folder className="h-3 w-3" />
          {rule.destination}
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="rounded p-1.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function RuleEditor({
  rule,
  onSave,
  onCancel,
  isNew = false,
}: {
  rule: CopyRule;
  onSave: (rule: CopyRule) => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  const [match, setMatch] = useState(rule.match);
  const [destination, setDestination] = useState(rule.destination);
  const [showDestPicker, setShowDestPicker] = useState(false);

  // Live preview - debounced pattern test
  const [debouncedMatch, setDebouncedMatch] = useState(match);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMatch(match), 300);
    return () => clearTimeout(timer);
  }, [match]);

  const previewQuery = useQuery({
    queryKey: ['test-pattern', debouncedMatch],
    queryFn: () => testPattern(debouncedMatch),
    enabled: debouncedMatch.length >= 2,
  });

  const handleSave = () => {
    if (!match.trim() || !destination.trim()) return;
    onSave({ match: match.trim(), destination: destination.trim(), enabled: true });
  };

  return (
    <div className="rounded-lg border-2 border-primary/50 bg-card p-4">
      <div className="space-y-4">
        {/* Pattern */}
        <div>
          <label className="mb-1 block text-sm font-medium">Pattern</label>
          <input
            type="text"
            value={match}
            onChange={(e) => setMatch(e.target.value)}
            placeholder="e.g., **/*.pdf or DCIM/**/*.jpg"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          {/* Live Preview */}
          {debouncedMatch.length >= 2 && (
            <div className="mt-2 rounded-md bg-muted/50 p-2 text-sm">
              {previewQuery.isLoading ? (
                <span className="text-muted-foreground">Testing pattern...</span>
              ) : previewQuery.data ? (
                <div>
                  <span className={cn(
                    'font-medium',
                    previewQuery.data.count > 0 ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {previewQuery.data.count} file{previewQuery.data.count !== 1 ? 's' : ''} match
                  </span>
                  {previewQuery.data.samples.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {previewQuery.data.samples.map((s, i) => (
                        <p key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          {s}
                        </p>
                      ))}
                      {previewQuery.data.count > 5 && (
                        <p className="text-xs text-muted-foreground">
                          ...and {previewQuery.data.count - 5} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">No USB drive connected</span>
              )}
            </div>
          )}
        </div>

        {/* Destination */}
        <div>
          <label className="mb-1 block text-sm font-medium">Destination</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g., ~/Documents/USB-Import"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => setShowDestPicker(!showDestPicker)}
              className="flex items-center gap-1 rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              <Folder className="h-4 w-4" />
              {showDestPicker ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>

          {showDestPicker && (
            <DestinationPicker
              onSelect={(path) => {
                setDestination(path);
                setShowDestPicker(false);
              }}
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-accent"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!match.trim() || !destination.trim()}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DestinationPicker({ onSelect }: { onSelect: (path: string) => void }) {
  const localDirsQuery = useQuery({
    queryKey: ['local-dirs'],
    queryFn: getLocalDirs,
  });

  return (
    <div className="mt-2 rounded-md border bg-background p-2">
      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
        Quick Access
      </p>
      <div className="space-y-1">
        {localDirsQuery.data?.map((dir) => (
          <button
            key={dir.path}
            onClick={() => onSelect(dir.path.replace(/^\/Users\/[^/]+/, '~'))}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Folder className="h-4 w-4 text-muted-foreground" />
            {dir.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// Simple YAML generator
function generateYaml(config: RulesConfig): string {
  let yaml = '# USB Manager Rules Configuration\n\nrules:\n';
  for (const rule of config.rules) {
    yaml += `  - match: "${rule.match}"\n`;
    yaml += `    destination: "${rule.destination}"\n`;
    yaml += `    enabled: ${rule.enabled ?? true}\n`;
  }
  yaml += '\ndefaults:\n';
  yaml += `  unmatchedDestination: ${config.defaults.unmatchedDestination ?? 'null'}\n`;
  if (config.exclusions && config.exclusions.length > 0) {
    yaml += '\nexclusions:\n';
    for (const pattern of config.exclusions) {
      yaml += `  - "${pattern}"\n`;
    }
  }
  return yaml;
}

// Simple YAML parser
function parseYaml(content: string): RulesConfig | null {
  try {
    const lines = content.split('\n');
    const rules: CopyRule[] = [];
    const exclusions: string[] = [];
    let currentRule: Partial<CopyRule> = {};
    let section: 'rules' | 'defaults' | 'exclusions' | null = null;
    let unmatchedDestination: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') continue;

      if (trimmed === 'rules:') {
        section = 'rules';
        continue;
      }
      if (trimmed === 'defaults:') {
        if (currentRule.match) {
          rules.push(currentRule as CopyRule);
          currentRule = {};
        }
        section = 'defaults';
        continue;
      }
      if (trimmed === 'exclusions:') {
        section = 'exclusions';
        continue;
      }

      if (section === 'rules') {
        if (trimmed.startsWith('- match:')) {
          if (currentRule.match) {
            rules.push(currentRule as CopyRule);
          }
          currentRule = { match: extractValue(trimmed.replace('- match:', '')) };
        } else if (trimmed.startsWith('destination:')) {
          currentRule.destination = extractValue(trimmed.replace('destination:', ''));
        } else if (trimmed.startsWith('enabled:')) {
          currentRule.enabled = trimmed.includes('true');
        }
      } else if (section === 'defaults') {
        if (trimmed.startsWith('unmatchedDestination:')) {
          const val = extractValue(trimmed.replace('unmatchedDestination:', ''));
          unmatchedDestination = val === 'null' ? null : val;
        }
      } else if (section === 'exclusions') {
        if (trimmed.startsWith('-')) {
          exclusions.push(extractValue(trimmed.slice(1)));
        }
      }
    }

    if (currentRule.match) {
      rules.push(currentRule as CopyRule);
    }

    return { rules, defaults: { unmatchedDestination }, exclusions };
  } catch {
    return null;
  }
}

function extractValue(str: string): string {
  return str.trim().replace(/^["']|["']$/g, '');
}
