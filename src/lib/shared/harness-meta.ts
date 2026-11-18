// Browser-safe metadata about each agent harness OpenHarness offers. No HarnessRouter ids here.

export const HARNESS_KEYS = ['claude-code', 'codex', 'qwen', 'minimax', 'gemini', 'opencode', 'kimi', 'grok', 'aider', 'openhands'] as const;
export type HarnessKey = (typeof HARNESS_KEYS)[number];

export interface HarnessMeta {
  key: HarnessKey;
  label: string;
  maker: string;
  monogram: string;
  color: string;
  tagline: string;
  defaultModel: string;
}

export const HARNESS_META: Record<HarnessKey, HarnessMeta> = {
  'claude-code': { key: 'claude-code', label: 'Claude Code', maker: 'Anthropic', monogram: 'CC', color: '#D97757', tagline: 'Agentic coding in the terminal', defaultModel: 'claude-sonnet-5.5' },
  codex: { key: 'codex', label: 'Codex', maker: 'OpenAI', monogram: 'CX', color: '#10A37F', tagline: 'OpenAI’s coding agent', defaultModel: 'gpt-6.1-sol' },
  qwen: { key: 'qwen', label: 'Qwen Code', maker: 'Alibaba Qwen', monogram: 'QW', color: '#7C6CF6', tagline: 'Open-source agent, any model', defaultModel: 'qwen3.8-max' },
  minimax: { key: 'minimax', label: 'MiniMax Code', maker: 'MiniMax', monogram: 'MM', color: '#F43F5E', tagline: 'MiniMax’s coding agent', defaultModel: 'minimax-m3' },
  gemini: { key: 'gemini', label: 'Gemini CLI', maker: 'Google', monogram: 'GE', color: '#4C8DF6', tagline: 'Open-source terminal agent', defaultModel: 'gemini-3.8-flash' },
  opencode: { key: 'opencode', label: 'OpenCode', maker: 'Open source', monogram: 'OC', color: '#CBD5E1', tagline: 'Provider-agnostic coding agent', defaultModel: 'gpt-6.1-sol' },
  kimi: { key: 'kimi', label: 'Kimi Code', maker: 'Moonshot AI', monogram: 'KI', color: '#22D3EE', tagline: 'Moonshot’s coding CLI', defaultModel: 'kimi-k3' },
  grok: { key: 'grok', label: 'Grok Build', maker: 'xAI', monogram: 'GK', color: '#E879F9', tagline: 'xAI’s coding agent', defaultModel: 'grok-4.6' },
  aider: { key: 'aider', label: 'Aider', maker: 'Open source', monogram: 'AI', color: '#84CC16', tagline: 'AI pair programming', defaultModel: 'gpt-6.1-sol' },
  openhands: { key: 'openhands', label: 'OpenHands', maker: 'Open source', monogram: 'OH', color: '#FACC15', tagline: 'Open platform for dev agents', defaultModel: 'gpt-5.4' },
};

export function isHarnessKey(k: unknown): k is HarnessKey {
  return typeof k === 'string' && (HARNESS_KEYS as readonly string[]).includes(k);
}

/** A friendly provider name for a model id, for grouping model menus. */
export function modelProvider(id: string): string {
  const m = id.toLowerCase();
  if (m.startsWith('gpt') || m.startsWith('o3') || m.startsWith('o4')) return 'OpenAI';
  if (m.startsWith('claude')) return 'Anthropic';
  if (m.startsWith('gemini')) return 'Google';
  if (m.startsWith('grok')) return 'xAI';
  if (m.startsWith('qwen')) return 'Qwen';
  if (m.startsWith('kimi')) return 'Moonshot';
  if (m.startsWith('deepseek')) return 'DeepSeek';
  if (m.startsWith('glm')) return 'Zhipu';
  if (m.startsWith('minimax')) return 'MiniMax';
  if (m.startsWith('llama')) return 'Meta';
  if (m.startsWith('muse')) return 'Muse';
  if (m.startsWith('mistral')) return 'Mistral';
  if (m.startsWith('step')) return 'StepFun';
  if (m.startsWith('hunyuan')) return 'Tencent';
  if (m.startsWith('nemotron')) return 'NVIDIA';
  if (m.startsWith('ling')) return 'Ant Group';
  return 'Other';
}
