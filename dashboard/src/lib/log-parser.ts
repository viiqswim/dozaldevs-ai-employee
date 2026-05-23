export interface ParsedLogEntry {
  raw: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  component: string;
  message: string;
  isSignal: boolean;
}

export const MAX_DISPLAY_CHARS = 500;

const COMPONENT_SHORT_MAP: Record<string, string> = {
  'opencode-harness': 'harness',
  'opencode-server': 'server',
  'session-manager': 'session-mgr',
  'postgrest-client': 'postgrest',
};

const SIGNAL_SERVICES_RE = /service=(llm|session\.prompt|session\.processor|bash-tool)/;

function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function mapLevel(level: unknown): 'info' | 'warn' | 'error' {
  if (level === 40) return 'warn';
  if (level === 50) return 'error';
  return 'info';
}

export function parseLine(raw: string): ParsedLogEntry {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      raw,
      timestamp: '',
      level: 'info',
      component: 'unknown',
      message: raw,
      isSignal: true,
    };
  }

  const timestamp = typeof parsed['time'] === 'string' ? formatTimestamp(parsed['time']) : '';
  const level = mapLevel(parsed['level']);
  const originalComponent = typeof parsed['component'] === 'string' ? parsed['component'] : '';
  const component = originalComponent
    ? (COMPONENT_SHORT_MAP[originalComponent] ?? originalComponent)
    : 'unknown';
  const message = typeof parsed['msg'] === 'string' ? parsed['msg'] : '';

  const isSignal =
    originalComponent === 'opencode-harness' ||
    originalComponent === 'session-manager' ||
    originalComponent === 'postgrest-client' ||
    (parsed['level'] as number) >= 40 ||
    (originalComponent === 'opencode-server' && SIGNAL_SERVICES_RE.test(message));

  return { raw, timestamp, level, component, message, isSignal };
}

export function parseLines(rawLines: string[]): ParsedLogEntry[] {
  return rawLines.map(parseLine);
}

export function truncateMessage(msg: string, max?: number): { text: string; truncated: boolean } {
  const limit = max ?? MAX_DISPLAY_CHARS;
  if (msg.length <= limit) {
    return { text: msg, truncated: false };
  }
  return { text: msg.slice(0, limit), truncated: true };
}
