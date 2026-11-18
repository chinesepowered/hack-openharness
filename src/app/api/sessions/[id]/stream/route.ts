import { getSession } from '@/lib/server/db';
import { fail, requireUser } from '@/lib/server/http';
import { recoverOnce, subscribe } from '@/lib/server/runner';
import { publicSession } from '@/lib/server/views';
import type { LiveEvent } from '@/lib/shared/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live progress as Server-Sent Events: a snapshot, then steps/deltas/turn updates.
 * Closing this connection only unsubscribes; the task keeps running on the server.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  recoverOnce();
  const a = requireUser(req);
  if ('response' in a) return a.response;
  const { id } = await ctx.params;
  const s = getSession(id);
  if (!s || s.userId !== a.user.id) return fail(404, 'Session not found.');

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (e: LiveEvent | { type: 'ping' }) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { closed = true; }
      };
      send({ type: 'snapshot', session: publicSession(s) });
      const unsub = subscribe(s.id, send);
      const ping = setInterval(() => send({ type: 'ping' }), 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', cleanup);
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
