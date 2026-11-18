// Turns HarnessRouter stream events into the small, sanitized steps the browser may see.
// Pure logic (no key, no framework imports) so it is unit tested in tests/steps.test.ts.
import type { StreamEvent, OutputItem } from './harnessrouter';
import type { MessageStep, Step, ToolKind, ToolStep } from '../shared/types';

const MAX_STEPS = 600;
const MAX_TEXT = 24_000;

/** Remove sandbox paths and terminal escapes from anything a user will see. */
export function scrub(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\/workspace\/repo\//g, '')
    .replace(/\/workspace\/repo\b/g, '.')
    .replace(/\/workspace\//g, '')
    .replace(/\/workspace\b/g, '.')
    .replace(/\/(?:home|root)\/[A-Za-z0-9._-]+\/\.harness\/[^\s'"]*/g, '…')
    .replace(/(?:^|(?<=[\s'"(]))\.?\.harness\/[^\s'")]*/g, '…');
}

export function classifyTool(name: string): ToolKind {
  const n = name.toLowerCase();
  if (/todo|plan/.test(n)) return 'plan';
  if (/bash|shell|exec|command|terminal|run/.test(n)) return 'run';
  if (/patch|edit|replace|str_replace|multiedit/.test(n)) return 'edit';
  if (/write|create/.test(n)) return 'write';
  if (/read|view|cat|open/.test(n)) return 'read';
  if (/grep|glob|search|find|list|ls\b|^ls$/.test(n)) return 'search';
  if (/fetch|web|browse|http/.test(n)) return 'web';
  return 'tool';
}

const LABELS: Record<ToolKind, string> = { run: 'Run', edit: 'Edit', write: 'Write', read: 'Read', search: 'Search', plan: 'Plan', web: 'Web', tool: 'Tool' };

function firstString(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length) return (v as string[]).join(' ');
  }
  return '';
}

function oneLine(s: string, max = 180): string {
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines[0] || '';
  const more = lines.length > 1 ? ' …' : '';
  const t = first.length > max ? `${first.slice(0, max - 1)}…` : first + more;
  return t;
}

/** "git clone … && npm test" for a run, a path for file tools, a pattern for search. */
export function summarizeArgs(name: string, rawArgs: string | undefined): string {
  const kind = classifyTool(name);
  let args: Record<string, unknown> = {};
  try { const p = JSON.parse(rawArgs || '{}'); if (p && typeof p === 'object') args = p as Record<string, unknown>; } catch { return oneLine(scrub(String(rawArgs || ''))); }
  if (kind === 'run') {
    let cmd = firstString(args, ['command', 'cmd', 'script', 'input']);
    // Codex style: ["bash", "-lc", "<cmd>"]
    const m = /^(?:bash|sh|zsh)\s+-l?c\s+([\s\S]+)$/.exec(cmd);
    if (m) cmd = m[1].replace(/^['"]|['"]$/g, '');
    cmd = scrub(cmd).replace(/^cd\s+(?:\.\/)?repo\s*&&\s*/, '').replace(/^cd\s+\.\s*&&\s*/, '');
    return oneLine(cmd);
  }
  if (kind === 'edit' && typeof args.input === 'string' && args.input.includes('*** ')) {
    // apply_patch: list the files it touches
    const files = [...args.input.matchAll(/\*\*\* (?:Update|Add|Delete) File: (.+)/g)].map((x) => scrub(x[1].trim()));
    if (files.length) return oneLine(files.join(', '));
  }
  if (kind === 'plan') {
    const todos = (args.todos || args.plan || args.items) as unknown;
    if (Array.isArray(todos)) return `${todos.length} item${todos.length === 1 ? '' : 's'}`;
  }
  if (kind === 'search') {
    const pat = firstString(args, ['pattern', 'query', 'glob', 'regex']);
    const where = firstString(args, ['path', 'dir_path', 'directory', 'include']);
    return oneLine(scrub([pat, where && `in ${where}`].filter(Boolean).join(' ')));
  }
  const path = firstString(args, ['file_path', 'path', 'filePath', 'absolute_path', 'target_file', 'file', 'filename', 'url', 'description']);
  if (path) return oneLine(scrub(path));
  const any = Object.values(args).find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return any ? oneLine(scrub(any)) : '';
}

/** The tail of a command's output, for the activity feed. */
export function previewOutput(out: string | undefined): string | undefined {
  if (!out) return undefined;
  let s = scrub(out).replace(/<persisted-output>[\s\S]*?<\/persisted-output>/g, '(long output)');
  s = s.replace(/\r/g, '');
  const lines = s.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const tail = lines.slice(-6).join('\n');
  const capped = tail.length > 420 ? `…${tail.slice(-420)}` : tail;
  return capped || undefined;
}

function itemText(item: OutputItem): string {
  return (item.content || []).filter((c) => c.type === 'output_text').map((c) => c.text || '').join('');
}

export type StepUpdate = { step: Step } | { delta: { key: string; delta: string } };

export class StepBuilder {
  readonly steps: Step[];
  private readonly byItem = new Map<string, number>();
  private readonly byCall = new Map<string, number>();
  private n = 0;
  private readonly t0: number;
  private readonly now: () => number;

  constructor(t0: number, existing: Step[] = [], now: () => number = Date.now) {
    this.t0 = t0;
    this.steps = existing;
    this.n = existing.length;
    this.now = now;
  }

  private at() { return Math.max(0, this.now() - this.t0); }

  private add(step: Step, itemId?: string, callId?: string): Step | null {
    if (this.steps.length >= MAX_STEPS) return null;
    this.steps.push(step);
    const idx = this.steps.length - 1;
    if (itemId) this.byItem.set(itemId, idx);
    if (callId) this.byCall.set(callId, idx);
    return step;
  }

  private messageFor(itemId: string | undefined): MessageStep | null {
    if (itemId && this.byItem.has(itemId)) {
      const s = this.steps[this.byItem.get(itemId)!];
      return s.kind === 'message' ? s : null;
    }
    const step = this.add({ kind: 'message', key: `m${++this.n}`, text: '', done: false, at: this.at() }, itemId);
    return step && step.kind === 'message' ? step : null;
  }

  apply(ev: StreamEvent): StepUpdate | null {
    const item = ev.item;
    switch (ev.type) {
      case 'response.output_item.added': {
        if (item?.type === 'message') {
          const s = this.messageFor(item.id);
          return s ? { step: s } : null;
        }
        if (item?.type === 'function_call') {
          const name = String(item.name || 'tool');
          const tool = classifyTool(name);
          const step: ToolStep = { kind: 'tool', key: `t${++this.n}`, tool, name: LABELS[tool], detail: summarizeArgs(name, item.arguments), done: false, at: this.at() };
          const s = this.add(step, item.id, item.call_id);
          return s ? { step: s } : null;
        }
        if (item?.type === 'function_call_output') return this.toolOutput(item);
        return null;
      }
      case 'response.output_text.delta': {
        if (typeof ev.delta !== 'string' || !ev.delta) return null;
        const s = this.messageFor(ev.item_id);
        if (!s) return null;
        if (s.text.length < MAX_TEXT) s.text += ev.delta;
        return { delta: { key: s.key, delta: ev.delta } };
      }
      case 'response.output_text.done': {
        const s = this.messageFor(ev.item_id);
        if (!s || typeof ev.text !== 'string') return null;
        s.text = scrub(ev.text).slice(0, MAX_TEXT);
        return { step: s };
      }
      case 'response.output_item.done': {
        if (item?.type === 'message') {
          const s = this.messageFor(item.id);
          if (!s) return null;
          const t = itemText(item);
          if (t) s.text = scrub(t).slice(0, MAX_TEXT);
          s.done = true;
          return { step: s };
        }
        if (item?.type === 'function_call') {
          let idx = item.id ? this.byItem.get(item.id) : undefined;
          if (idx === undefined && item.call_id) idx = this.byCall.get(item.call_id);
          if (idx === undefined) {
            const name = String(item.name || 'tool');
            const tool = classifyTool(name);
            const s = this.add({ kind: 'tool', key: `t${++this.n}`, tool, name: LABELS[tool], detail: summarizeArgs(name, item.arguments), done: false, at: this.at() }, item.id, item.call_id);
            return s ? { step: s } : null;
          }
          const s = this.steps[idx] as ToolStep;
          s.detail = summarizeArgs(String(item.name || ''), item.arguments) || s.detail;
          if (item.call_id) this.byCall.set(item.call_id, idx);
          return { step: s };
        }
        if (item?.type === 'function_call_output') return this.toolOutput(item);
        return null;
      }
      default:
        return null;
    }
  }

  private toolOutput(item: OutputItem): StepUpdate | null {
    const idx = item.call_id ? this.byCall.get(item.call_id) : undefined;
    if (idx === undefined) return null;
    const s = this.steps[idx] as ToolStep;
    s.done = true;
    if (s.tool === 'run' || s.tool === 'search') s.output = previewOutput(item.output);
    return { step: s };
  }

  /** At the end of a turn nothing is still "running". */
  finish() {
    for (const s of this.steps) s.done = true;
  }
}
