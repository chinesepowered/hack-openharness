import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StepBuilder, classifyTool, previewOutput, scrub, summarizeArgs } from '../src/lib/server/steps.ts';

test('scrub removes sandbox paths and ANSI codes', () => {
  assert.equal(scrub('\x1b[32mok\x1b[0m /workspace/repo/src/a.ts and /workspace/out/x'), 'ok src/a.ts and out/x');
  assert.equal(scrub('saved to: /workspace/.harness/home/.qwen/tmp/abc.txt'), 'saved to: …');
});

test('classifyTool maps each harness vocabulary', () => {
  assert.equal(classifyTool('Bash'), 'run');
  assert.equal(classifyTool('run_shell_command'), 'run');
  assert.equal(classifyTool('exec_command'), 'run');
  assert.equal(classifyTool('apply_patch'), 'edit');
  assert.equal(classifyTool('Edit'), 'edit');
  assert.equal(classifyTool('write_file'), 'write');
  assert.equal(classifyTool('read_file'), 'read');
  assert.equal(classifyTool('Grep'), 'search');
  assert.equal(classifyTool('TodoWrite'), 'plan');
});

test('summarizeArgs shows the command, the path, or the patched files', () => {
  assert.equal(summarizeArgs('Bash', JSON.stringify({ command: 'cd /workspace/repo && npm test', description: 'x' })), 'npm test');
  assert.equal(summarizeArgs('shell', JSON.stringify({ command: ['bash', '-lc', 'git status'] })), 'git status');
  assert.equal(summarizeArgs('Edit', JSON.stringify({ file_path: '/workspace/repo/src/index.ts' })), 'src/index.ts');
  assert.equal(summarizeArgs('apply_patch', JSON.stringify({ input: '*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: test/b.ts\n' })), 'src/a.ts, test/b.ts');
  assert.equal(summarizeArgs('Grep', JSON.stringify({ pattern: 'once', path: 'src' })), 'once in src');
});

test('previewOutput keeps the tail', () => {
  const out = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
  assert.equal(previewOutput(out), 'line 14\nline 15\nline 16\nline 17\nline 18\nline 19');
});

test('StepBuilder turns a stream into tool + message steps', () => {
  let t = 1000;
  const b = new StepBuilder(1000, [], () => t);
  b.apply({ type: 'response.output_item.added', item: { type: 'message', id: 'msg_1' } });
  b.apply({ type: 'response.output_text.delta', item_id: 'msg_1', delta: 'Cloning ' });
  const d = b.apply({ type: 'response.output_text.delta', item_id: 'msg_1', delta: 'the repo' });
  assert.deepEqual(d, { delta: { key: 'm1', delta: 'the repo' } });
  t = 3000;
  b.apply({ type: 'response.output_item.added', item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'Bash', arguments: '' } });
  b.apply({ type: 'response.output_item.done', item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'Bash', arguments: JSON.stringify({ command: 'npm test' }) } });
  b.apply({ type: 'response.output_item.done', item: { type: 'function_call_output', call_id: 'call_1', output: '19 passing' } });
  assert.equal(b.steps.length, 2);
  assert.deepEqual(b.steps[0], { kind: 'message', key: 'm1', text: 'Cloning the repo', done: false, at: 0 });
  assert.deepEqual(b.steps[1], { kind: 'tool', key: 't2', tool: 'run', name: 'Run', detail: 'npm test', done: true, at: 2000, output: '19 passing' });
  b.finish();
  assert.ok(b.steps.every((s) => s.done));
});

test('StepBuilder ignores unknown events', () => {
  const b = new StepBuilder(0);
  assert.equal(b.apply({ type: 'response.something_new' }), null);
  assert.equal(b.steps.length, 0);
});
