// Structured logs as JSON lines on stdout/stderr (readable in GitHub Actions logs).

type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, fields: Readonly<Record<string, unknown>>): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  const stream = level === 'info' ? process.stdout : process.stderr;
  stream.write(`${line}\n`);
}

export const log = {
  info: (message: string, fields: Readonly<Record<string, unknown>> = {}): void => write('info', message, fields),
  warn: (message: string, fields: Readonly<Record<string, unknown>> = {}): void => write('warn', message, fields),
  error: (message: string, fields: Readonly<Record<string, unknown>> = {}): void => write('error', message, fields),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
