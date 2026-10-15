// HTTP clients for the free AI providers (Groq: OpenAI-compatible; Gemini API: generateContent).
// Shared by the worker (Node) and Edge Functions (Deno): fetch only, no runtime-specific APIs.

export type AiRole = 'extract' | 'translate';
export type ProviderKind = 'groq' | 'gemini';

export interface AiProvider {
  readonly id: string;
  readonly role: AiRole;
  readonly provider: ProviderKind;
  readonly model: string;
  readonly priority: number;
  readonly dailyRequestLimit: number;
  readonly dailyTokenLimit: number | null;
  readonly rpmLimit: number;
  readonly tpmLimit: number | null;
  readonly requestOptions: Readonly<Record<string, unknown>>;
}

export interface ApiKeys {
  readonly groq?: string | undefined;
  readonly gemini?: string | undefined;
}

export interface ChatRequest {
  readonly system: string;
  readonly user: string;
  readonly maxOutputTokens: number;
}

export interface ChatResponse {
  readonly text: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 90_000;
const TEMPERATURE = 0.2;

/** The provider refused because of a rate or quota limit (HTTP 429). */
export class RateLimitedError extends Error {}

export function hasKey(provider: AiProvider, keys: ApiKeys): boolean {
  return Boolean(provider.provider === 'groq' ? keys.groq : keys.gemini);
}

export async function callProvider(
  provider: AiProvider,
  request: ChatRequest,
  keys: ApiKeys,
  fetchImpl: FetchLike = fetch,
): Promise<ChatResponse> {
  return provider.provider === 'groq'
    ? callGroq(provider, request, keys.groq ?? '', fetchImpl)
    : callGemini(provider, request, keys.gemini ?? '', fetchImpl);
}

async function callGroq(provider: AiProvider, request: ChatRequest, key: string, fetchImpl: FetchLike): Promise<ChatResponse> {
  const body = {
    model: provider.model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    temperature: TEMPERATURE,
    max_completion_tokens: request.maxOutputTokens,
    response_format: { type: 'json_object' },
    ...provider.requestOptions,
  };
  const json = await postJson(fetchImpl, 'https://api.groq.com/openai/v1/chat/completions', body, {
    Authorization: `Bearer ${key}`,
  });
  const data = json as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  };
}

async function callGemini(provider: AiProvider, request: ChatRequest, key: string, fetchImpl: FetchLike): Promise<ChatResponse> {
  const options = provider.requestOptions as { inlineSystem?: boolean; generationConfig?: Record<string, unknown> };
  // Gemma models reject systemInstruction, so the system prompt is sent as part of the user turn.
  const userText = options.inlineSystem ? `${request.system}\n\n${request.user}` : request.user;
  const body = {
    ...(options.inlineSystem ? {} : { systemInstruction: { parts: [{ text: request.system }] } }),
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: TEMPERATURE, maxOutputTokens: request.maxOutputTokens, ...options.generationConfig },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`;
  const json = await postJson(fetchImpl, url, body, { 'x-goog-api-key': key });
  const data = json as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(''),
    tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (response.status === 429) throw new RateLimitedError(`429 from ${new URL(url).host}: ${text.slice(0, 200)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
