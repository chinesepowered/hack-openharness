// License: Apache-2.0 — adapted from HarnessRouter's templates/node/harnessrouter.ts
// (https://github.com/HarnessRouter/plugins, skills/harnessrouter 0.3.0-dev.2).
/**
 * HarnessRouter Cloud client for OpenHarness. SERVER-ONLY: it is constructed with the API key in
 * src/lib/server/hr.ts (which imports 'server-only'); browser code never imports this module.
 *
 * Covers: streamed tasks (SSE parse), background polling for recovery, cancel, harness model
 * lists, session spend, file listing/fetching and uploads. Contract: UHP-Version 2026-09-28.
 * The key is only ever sent to https://api.harnessrouter.ai and redirects are refused.
 */
import { randomUUID } from 'node:crypto';

export const API_BASE = 'https://api.harnessrouter.ai';
export const UHP_VERSION = '2026-09-28';
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'incomplete', 'failed', 'cancelled']);
export const TERMINAL_EVENTS: ReadonlySet<string> = new Set(['response.completed', 'response.incomplete', 'response.failed']);

// ── shapes ──────────────────────────────────────────────────────────────────────────────────────
export interface Annotation {
  type: string; container_id: string; file_id: string; filename: string; download_url: string;
  start_index?: number; end_index?: number;
}
export interface ContentPart { type: string; text?: string; annotations?: Annotation[] }
export interface OutputItem {
  id?: string; type: string; status?: string; role?: string; content?: ContentPart[];
  name?: string; arguments?: string; call_id?: string; output?: string;
}
export interface HRResponse {
  id: string; object: string; status: string; created_at?: number; error?: unknown;
  incomplete_details?: { reason?: string } | null; previous_response_id?: string | null;
  model?: string; served_model?: string | null; output: OutputItem[];
  usage?: Record<string, number> | null; metadata?: { session_id?: string; [k: string]: unknown };
}
export interface StreamEvent {
  type: string; sequence_number?: number; response?: HRResponse; delta?: string; text?: string;
  item?: OutputItem; item_id?: string; output_index?: number; annotation?: Annotation; [k: string]: unknown;
}
export interface SessionFile {
  object: string; id: string; file_id: string; container_id: string; filename: string; path: string;
  bytes: number; media_type: string; download_url: string;
}
export interface HarnessModel { id: string; label?: string; available: boolean; default?: boolean }
export interface SessionInfo {
  session_id: string; status: string; spend_usd?: string | number; elapsed?: number; model?: string;
  backend?: string; last_response_id?: string;
}

export class HRError extends Error {
  readonly status: number;
  readonly code: string;
  readonly param: string | null;
  readonly retryAfterSeconds: number | null;
  constructor(status: number, body: unknown, retryAfter: string | null) {
    const env = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const e = (env.error && typeof env.error === 'object' ? env.error : {}) as Record<string, unknown>;
    const message = String(e.message ?? (typeof env.detail === 'string' ? env.detail : '') ?? '') || `HTTP ${status}`;
    super(message);
    this.name = 'HRError';
    this.status = status;
    this.code = String(e.code ?? (status === 404 ? 'not_found' : 'unknown'));
    this.param = e.param == null ? null : String(e.param);
    const ra = retryAfter == null ? NaN : Number(retryAfter);
    this.retryAfterSeconds = Number.isFinite(ra) ? ra : null;
  }
  /** Only these are worth a retry (a POST /v1/responses only with the same Idempotency-Key). */
  get retryable(): boolean { return [429, 502, 503, 504].includes(this.status); }
}

// ── SSE: frames split on a blank line, data: lines joined, JSON parsed; [DONE] and junk skipped ─
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const take = function* (frame: string): Generator<StreamEvent> {
    const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data.trim() || data.trim() === '[DONE]') return;
    try {
      const ev = JSON.parse(data) as StreamEvent;
      if (ev && typeof ev.type === 'string') yield ev;
    } catch { /* not JSON: skip */ }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        yield* take(frame);
      }
    }
    buf += decoder.decode();
    if (buf.trim()) yield* take(buf);
  } finally {
    reader.releaseLock();
  }
}

/** The answer: the output_text of the LAST message item. */
export function answerText(r: HRResponse): string {
  const msgs = (r.output || []).filter((i) => i.type === 'message');
  const last = msgs[msgs.length - 1];
  return (last?.content || []).filter((c) => c.type === 'output_text').map((c) => c.text || '').join('');
}

/** Files the task made or changed, as annotations (filename = path relative to the working dir). */
export function producedFiles(r: HRResponse): Annotation[] {
  const out: Annotation[] = [];
  for (const item of r.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) for (const a of c.annotations || []) if (a.type === 'container_file_citation') out.push(a);
  }
  return out;
}

// ── the client ──────────────────────────────────────────────────────────────────────────────────
export interface TaskInput {
  harnessId: string;
  /** a string, or a message list with input_text / input_file parts */
  input: unknown;
  /** follow-ups only: both come from the stored session record */
  previousResponseId?: string;
  sessionId?: string;
  idempotencyKey?: string;
  /** the product's own id for the signed-in person, on every task and follow-up */
  user: string;
  /** per-task override of the harness's default model */
  model?: string;
  maxStep?: number; timeoutSeconds?: number; maxCostUsd?: number;
}
export interface StreamHooks {
  /** called once, at response.created: persist both ids before anything else */
  onIds?: (ids: { responseId: string; sessionId: string }) => void | Promise<void>;
  onEvent?: (ev: StreamEvent) => void;
}
export interface ClientOptions {
  apiKey: string; baseUrl?: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>;
}

export function taskBody(t: TaskInput, mode: 'stream' | 'background' | 'block'): Record<string, unknown> {
  const metadata: Record<string, string> = { harness_id: t.harnessId };
  if (t.sessionId) metadata.session_id = t.sessionId;
  const body: Record<string, unknown> = { input: t.input, user: t.user, metadata };
  if (t.previousResponseId) body.previous_response_id = t.previousResponseId;
  if (t.model) body.model = t.model;
  if (t.maxStep) body.max_step = t.maxStep;
  if (t.timeoutSeconds) body.timeout_seconds = t.timeoutSeconds;
  if (t.maxCostUsd) body.max_cost_usd = t.maxCostUsd;
  if (mode === 'stream') body.stream = true;
  if (mode === 'background') body.background = true;
  return body;
}

export class HarnessRouter {
  readonly baseUrl: string;
  private readonly key: string;
  private readonly http: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ClientOptions) {
    if (!opts.apiKey) throw new Error('HarnessRouter API key missing');
    this.key = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? API_BASE).replace(/\/+$/, '');
    this.http = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, 'UHP-Version': UHP_VERSION, Accept: 'application/json', ...extra };
  }

  private async raw(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Response> {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await this.http(this.baseUrl + path, {
      method,
      headers: this.headers(body === undefined || isForm ? extra : { 'Content-Type': 'application/json', ...extra }),
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      redirect: 'manual',
    });
    if (!res.ok) {
      let parsed: unknown = null;
      try { parsed = await res.json(); } catch { /* not JSON */ }
      throw new HRError(res.status, parsed, res.headers.get('retry-after'));
    }
    return res;
  }

  async request<T>(method: string, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
    return (await (await this.raw(method, path, body, extra)).json()) as T;
  }

  // catalog
  async harnessModels(harnessId: string): Promise<{ default: string; models: HarnessModel[] }> {
    const r = await this.request<{ default: string; models: HarnessModel[] }>('GET', `/v1/harnesses/${encodeURIComponent(harnessId)}/models`);
    return { default: r.default, models: r.models || [] };
  }

  /**
   * Start (or continue) a task and read its stream to the end. Resolves with the terminal response.
   * If the stream ends without a terminal event it polls GET /v1/responses/{id} instead of sending
   * the task again. Never tie this to the browser request.
   */
  async runStreamed(t: TaskInput, hooks: StreamHooks = {}): Promise<HRResponse> {
    const res = await this.raw('POST', '/v1/responses', taskBody(t, 'stream'), {
      Accept: 'text/event-stream', 'Idempotency-Key': t.idempotencyKey || randomUUID(),
    });
    if (!res.body) throw new HRError(502, null, null);
    let responseId = '';
    let sessionId = '';
    let terminal: HRResponse | null = null;
    try {
      for await (const ev of parseSSE(res.body)) {
        const r = ev.response;
        if (r?.id && !responseId) responseId = r.id;
        const sid = r?.metadata?.session_id;
        if (sid && !sessionId) {
          sessionId = sid;
          await hooks.onIds?.({ responseId, sessionId });
        }
        try { hooks.onEvent?.(ev); } catch { /* a broken listener never stops the task */ }
        if (TERMINAL_EVENTS.has(ev.type) && r) terminal = r;
      }
    } catch (err) {
      if (!responseId) throw err;
    }
    if (terminal) return terminal;
    if (!responseId) throw new HRError(502, { error: { code: 'stream_ended', message: 'The stream ended before the task started.' } }, null);
    return this.waitForResponse(responseId);
  }

  getResponse(id: string) { return this.request<HRResponse>('GET', `/v1/responses/${encodeURIComponent(id)}`); }

  /** Poll until completed, incomplete, failed or cancelled: every 3 s, every 10 s after a minute. */
  async waitForResponse(id: string, opts: { timeoutMs?: number } = {}): Promise<HRResponse> {
    const start = Date.now();
    const limit = opts.timeoutMs ?? 2 * 60 * 60 * 1000 + 60_000;
    for (;;) {
      try {
        const r = await this.getResponse(id);
        if (TERMINAL_STATUSES.has(r.status)) return r;
      } catch (err) {
        if (!(err instanceof HRError) || !err.retryable) throw err;
      }
      if (Date.now() - start > limit) throw new HRError(504, { error: { code: 'poll_timeout', message: 'The task did not finish in time.' } }, null);
      await this.sleep(Date.now() - start > 60_000 ? 10_000 : 3_000);
    }
  }

  cancelResponse(id: string) { return this.request<HRResponse>('POST', `/v1/responses/${encodeURIComponent(id)}/cancel`, {}); }
  cancelSession(sessionId: string) { return this.request<{ status: string }>('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/cancel`, {}); }
  getSession(sessionId: string) { return this.request<SessionInfo>('GET', `/v1/sessions/${encodeURIComponent(sessionId)}`); }

  async listFiles(sessionId: string, opts: { changed?: boolean } = {}): Promise<SessionFile[]> {
    const q = opts.changed ? '?changed=true' : '';
    return (await this.request<{ files: SessionFile[] }>('GET', `/v1/sessions/${encodeURIComponent(sessionId)}/files${q}`)).files || [];
  }

  /** Bytes of one file. The URL is built here, so the key only ever goes to the API origin. */
  async fetchFile(sessionId: string, fileId: string, view: 'content' | 'pdf' = 'content'): Promise<{ bytes: Uint8Array; contentType: string }> {
    const res = await this.raw('GET', `/v1/containers/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}/${view}`, undefined, { Accept: '*/*' });
    return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'application/octet-stream' };
  }

  /** POST /v1/files (multipart): a file the next task finds in its working directory. */
  async uploadFile(filename: string, bytes: Uint8Array, contentType = 'application/octet-stream'): Promise<{ id: string; bytes: number; filename: string }> {
    const form = new FormData();
    form.append('purpose', 'user_data');
    form.append('file', new Blob([bytes as BlobPart], { type: contentType }), filename);
    return this.request('POST', '/v1/files', form);
  }
}

/** A relative path with no way to escape its folder, or null. */
export function safeRelPath(p: string): string | null {
  let s: string;
  try { s = decodeURIComponent(p); } catch { return null; }
  if (!s || s.includes('\\') || s.includes('\0') || s.startsWith('/')) return null;
  const parts = s.split('/');
  if (parts.some((x) => x === '..' || x === '.' || x === '')) return null;
  return parts.join('/');
}
