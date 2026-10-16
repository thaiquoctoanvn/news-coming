// Minimal logger interface so shared pipeline code runs on Node (worker) and Deno (Edge Functions).

export interface Logger {
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

/** JSON lines on the console; used by Edge Functions. */
export const consoleLogger: Logger = {
  info: (message, fields = {}) => console.log(JSON.stringify({ level: 'info', message, ...fields })),
  warn: (message, fields = {}) => console.warn(JSON.stringify({ level: 'warn', message, ...fields })),
};
