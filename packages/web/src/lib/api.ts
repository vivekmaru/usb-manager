import type {
  ApiResponse,
  CopyProgress,
  CopyRequest,
  FileEntry,
  FileWithMatch,
  LocalDirectory,
  RulesConfig,
  UsbDrive,
} from '@usb-manager/shared';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = (await response.json()) as ApiResponse<T>;

  if (!data.success) {
    throw new Error(data.error?.message ?? 'Unknown error');
  }

  return data.data as T;
}

export async function getUsbInfo(): Promise<UsbDrive> {
  return fetchApi<UsbDrive>('/usb');
}

export async function getFiles(): Promise<FileWithMatch[]> {
  return fetchApi<FileWithMatch[]>('/files');
}

export async function getTree(): Promise<FileEntry[]> {
  return fetchApi<FileEntry[]>('/tree');
}

export async function getLocalDirs(): Promise<LocalDirectory[]> {
  return fetchApi<LocalDirectory[]>('/local-dirs');
}

export async function browsePath(path: string): Promise<LocalDirectory[]> {
  return fetchApi<LocalDirectory[]>(`/browse?path=${encodeURIComponent(path)}`);
}

export async function testPattern(
  pattern: string
): Promise<{ count: number; samples: string[] }> {
  return fetchApi<{ count: number; samples: string[] }>(
    `/test-pattern?pattern=${encodeURIComponent(pattern)}`
  );
}

export async function getRules(): Promise<RulesConfig> {
  return fetchApi<RulesConfig>('/rules');
}

export async function updateRules(rules: RulesConfig): Promise<RulesConfig> {
  return fetchApi<RulesConfig>('/rules', {
    method: 'PUT',
    body: JSON.stringify(rules),
  });
}

export async function* executeCopy(
  request: CopyRequest
): AsyncGenerator<CopyProgress> {
  const response = await fetch(`${API_BASE}/copy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6)) as CopyProgress;
        yield data;
      }
    }
  }
}

export async function ejectUsb(): Promise<{ success: boolean }> {
  return fetchApi<{ success: boolean }>('/eject', {
    method: 'POST',
  });
}
