import { ArrowRight, Columns3, Layers, Wallet } from 'lucide-react';
import { Logo } from '@/components/icons';
import { HarnessBadge } from '@/components/HarnessBadge';
import { SignInButtons } from '@/components/SignIn';
import { currentUser, githubOAuthConfigured } from '@/lib/server/auth';
import { configuredHarnessKeys } from '@/lib/server/harnesses';
import { catalog } from '@/lib/server/catalog';
import { HARNESS_META, type HarnessKey } from '@/lib/shared/harness-meta';

export const dynamic = 'force-dynamic';

const MATRIX: Array<{ h: HarnessKey; models: string[] }> = [
  { h: 'claude-code', models: ['claude-opus-5.5', 'claude-sonnet-5.5'] },
  { h: 'codex', models: ['gpt-6-luna', 'gpt-6.1-sol'] },
  { h: 'qwen', models: ['qwen3.8-max', 'claude-opus-5.5'] },
  { h: 'minimax', models: ['minimax-m3', 'deepseek-v4-pro'] },
  { h: 'opencode', models: ['glm-5.3', 'gemini-4-argon'] },
];

export default async function Landing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [user, sp, cat] = await Promise.all([currentUser(), searchParams, catalog().catch(() => [])]);
  const oauth = githubOAuthConfigured();
  const keys = configuredHarnessKeys();
  // Live numbers from HarnessRouter: distinct models, and harness × model pairs we can run.
  const distinct = new Set(cat.flatMap((h) => h.models)).size;
  const pairs = cat.reduce((a, h) => a + h.models.length, 0);
  const countOf = (k: HarnessKey) => cat.find((h) => h.key === k)?.models.length ?? 0;

  return (
    <div className="relative overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#6f5cff]/20 blur-[120px]" />

      <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo size={30} />
        <div className="flex items-center gap-6 text-sm text-mute">
          <a href="#how" className="hidden hover:text-text sm:block">How it works</a>
          <a href="#harnesses" className="hidden hover:text-text sm:block">Harnesses</a>
          <SignInButtons githubOAuth={oauth} signedIn={Boolean(user)} size="sm" />
        </div>
      </nav>

      <main className="relative mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-14 pb-20 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="rise">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line2 bg-panel/80 px-3 py-1.5 text-xs text-mute">
              <span className="size-1.5 rounded-full bg-ok" /> Powered by HarnessRouter · {keys.length} harnesses{distinct ? ` · ${distinct} models` : ''}
            </div>
            <h1 className="text-[44px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[62px]">
              Every coding agent.<br /><span className="brand-text">One platform.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-mute">
              Claude Code, Codex, Qwen Code, MiniMax, Gemini CLI, OpenCode and more, with any model each one supports, on your GitHub repos.
              Pick the right <em className="text-text not-italic">harness</em> and <em className="text-text not-italic">model</em> for each task, pay only for what it uses, and review every change in one place.
            </p>
            <div className="mt-9">
              <SignInButtons githubOAuth={oauth} signedIn={Boolean(user)} />
              {sp.signin === 'failed' && <p className="mt-3 text-sm text-bad">GitHub sign-in did not complete. Try again.</p>}
              {!oauth && !user && <p className="mt-3 text-xs text-dim">This server runs in demo mode: public repositories, no GitHub sign-in needed.</p>}
            </div>
          </div>

          <div className="rise rounded-2xl border border-line bg-panel/90 p-5 shadow-[0_30px_120px_-30px_rgba(111,92,255,0.45)] backdrop-blur [animation-delay:120ms]">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-dim">harness × model</span>
              {pairs > 0 && <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-mute">= {pairs} agent combos</span>}
            </div>
            <div className="space-y-2.5">
              {MATRIX.map(({ h, models }) => (
                <div key={h} className="flex items-center gap-3 rounded-xl border border-line bg-panel2 px-3 py-2.5">
                  <HarnessBadge harness={h} size={30} />
                  <span className="w-[108px] shrink-0 text-sm font-medium">{HARNESS_META[h].label}</span>
                  <span className="text-dim">×</span>
                  <div className="flex min-w-0 flex-nowrap gap-1.5">
                    {models.map((m) => (
                      <span key={m} className="whitespace-nowrap rounded-md border border-line2 bg-raised px-2 py-0.5 font-mono text-[11px] text-mute">{m}</span>
                    ))}
                    {countOf(h) > models.length && <span className="whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[11px] text-dim">+{countOf(h) - models.length}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-20 md:grid-cols-3">
          {[
            { icon: Layers, title: 'Every agent, one place', body: `${keys.length} harnesses and ${distinct || 'dozens of'} models behind one login and one review flow. No CLIs to install, no provider keys to juggle, no lock-in.` },
            { icon: Wallet, title: 'Pay for what each task needs', body: 'Every task shows its metered cost. Send routine work to fast, cheap agents and hard problems to premium ones: in our demo the same task cost $0.03 or $0.90.' },
            { icon: Columns3, title: 'Compare, then decide', body: 'Run one task on up to four agents side by side and keep the patch you like best. Monthly budgets keep team spend on track.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-line bg-panel/70 p-6">
              <Icon className="mb-4 size-5 text-brand" />
              <h3 className="mb-2 font-medium">{title}</h3>
              <p className="text-sm leading-relaxed text-mute">{body}</p>
            </div>
          ))}
        </section>

        <section id="how" className="pb-20">
          <h2 className="mb-6 text-xl font-semibold tracking-tight">How it works</h2>
          <div className="grid gap-3 md:grid-cols-4">
            {['Sign in and pick a repository', 'Choose a harness and a model', 'Describe the task', 'Review the diff and follow up'].map((t, i) => (
              <div key={t} className="flex items-center gap-3 rounded-xl border border-line bg-panel/60 px-4 py-3.5 text-sm">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-raised font-mono text-xs text-brand">{i + 1}</span>
                {t}
                {i < 3 && <ArrowRight className="ml-auto hidden size-4 text-dim md:block" />}
              </div>
            ))}
          </div>
        </section>

        <section id="harnesses" className="pb-24">
          <h2 className="mb-6 text-xl font-semibold tracking-tight">Harnesses</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {keys.map((k) => (
              <div key={k} className="flex items-center gap-3 rounded-xl border border-line bg-panel/60 p-3">
                <HarnessBadge harness={k} size={34} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{HARNESS_META[k].label}</div>
                  <div className="truncate text-xs text-dim">{HARNESS_META[k].maker}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative border-t border-line py-8 text-center text-xs text-dim">
        OpenHarness, built on HarnessRouter for the HarnessRouter hackathon.
      </footer>
    </div>
  );
}
