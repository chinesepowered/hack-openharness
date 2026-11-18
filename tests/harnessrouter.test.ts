import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HarnessRouter, HRError, answerText, parseSSE, safeRelPath, taskBody } from '../src/lib/server/harnessrouter.ts';

const enc = new TextEncoder();
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); } });
}
const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

test('parseSSE joins frames split across chunks, CRLF, and skips junk and [DONE]', async () => {
  const a = frame({ type: 'response.created', response: { id: 'r1' } });
  const chunks = [a.slice(0, 10), a.slice(10).replace('\n\n', '\r\n\r\n'), 'data: not json\n\n', 'data: [DONE]\n\n', frame({ type: 'x' })];
  const got: string[] = [];
  for await (const ev of parseSSE(streamOf(chunks))) got.push(ev.type);
  assert.deepEqual(got, ['response.created', 'x']);
});

test('answerText takes the LAST message item only', () => {
  const r = { id: 'r', object: 'response', status: 'completed', output: [
    { type: 'message', content: [{ type: 'output_text', text: 'progress note' }] },
    { type: 'function_call', name: 'bash' },
    { type: 'message', content: [{ type: 'output_text', text: 'final ' }, { type: 'output_text', text: 'answer' }] },
  ] };
  assert.equal(answerText(r), 'final answer');
});

test('taskBody always sends user + harness_id; follow-ups send both ids; model override passes through', () => {
  const first = taskBody({ harnessId: 'chrn_1', input: 'hi', user: 'u_1', model: 'qwen3.8-max' }, 'stream');
  assert.deepEqual(first, { input: 'hi', user: 'u_1', metadata: { harness_id: 'chrn_1' }, model: 'qwen3.8-max', stream: true });
  const fu = taskBody({ harnessId: 'chrn_1', input: 'more', user: 'u_1', previousResponseId: 'resp_1', sessionId: 'hsess1' }, 'stream');
  assert.equal(fu.previous_response_id, 'resp_1');
  assert.deepEqual(fu.metadata, { harness_id: 'chrn_1', session_id: 'hsess1' });
});

test('runStreamed sends key + idempotency key, persists ids at created, returns the terminal response', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(streamOf([
      frame({ type: 'response.created', response: { id: 'resp_9', status: 'in_progress', output: [], metadata: { session_id: 'hsess9' } } }),
      frame({ type: 'response.output_text.delta', delta: 'Hel', item_id: 'msg_1' }),
      frame({ type: 'response.completed', response: { id: 'resp_9', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello' }] }], metadata: { session_id: 'hsess9' } } }),
    ]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;
  const hr = new HarnessRouter({ apiKey: 'sk-hr-test', fetch: fakeFetch });
  let ids: unknown = null;
  const types: string[] = [];
  const r = await hr.runStreamed({ harnessId: 'chrn_1', input: 'x', user: 'u_1', idempotencyKey: 'idem-1' }, { onIds: (x) => { ids = x; }, onEvent: (e) => types.push(e.type) });
  assert.equal(r.status, 'completed');
  assert.deepEqual(ids, { responseId: 'resp_9', sessionId: 'hsess9' });
  assert.deepEqual(types, ['response.created', 'response.output_text.delta', 'response.completed']);
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(calls[0].url, 'https://api.harnessrouter.ai/v1/responses');
  assert.equal(h.Authorization, 'Bearer sk-hr-test');
  assert.equal(h['Idempotency-Key'], 'idem-1');
  assert.equal(h['UHP-Version'], '2026-09-28');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(JSON.parse(String(calls[0].init.body)).user, 'u_1');
});

test('a stream that ends early is recovered by polling, never by resending', async () => {
  let posts = 0;
  let polls = 0;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    if (init.method === 'POST') {
      posts++;
      return new Response(streamOf([frame({ type: 'response.created', response: { id: 'resp_2', status: 'in_progress', output: [], metadata: { session_id: 'hs2' } } })]), { status: 200 });
    }
    polls++;
    const status = polls < 2 ? 'in_progress' : 'completed';
    return new Response(JSON.stringify({ id: 'resp_2', object: 'response', status, output: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  const hr = new HarnessRouter({ apiKey: 'k', fetch: fakeFetch, sleep: async () => {} });
  const r = await hr.runStreamed({ harnessId: 'chrn_1', input: 'x', user: 'u' });
  assert.equal(r.status, 'completed');
  assert.equal(posts, 1);
  assert.equal(polls, 2);
});

test('errors carry the envelope code; only 429/5xx are retryable', async () => {
  const fakeFetch = (async () => new Response(JSON.stringify({ error: { code: 'model_not_available', message: 'nope', param: 'default_model' } }), { status: 422 })) as unknown as typeof fetch;
  const hr = new HarnessRouter({ apiKey: 'k', fetch: fakeFetch });
  await assert.rejects(hr.getResponse('resp_x'), (e: unknown) => e instanceof HRError && e.code === 'model_not_available' && !e.retryable);
});

test('safeRelPath refuses escapes', () => {
  assert.equal(safeRelPath('changes.patch'), 'changes.patch');
  assert.equal(safeRelPath('a/b.md'), 'a/b.md');
  for (const bad of ['../x', '/etc/passwd', 'a/../b', 'a\\b', '', 'a//b', '%2e%2e/x']) assert.equal(safeRelPath(bad), null, bad);
});
