'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import { GitHubMark } from './icons';

export function SignInButtons({ githubOAuth, signedIn, size = 'lg' }: { githubOAuth: boolean; signedIn: boolean; size?: 'lg' | 'sm' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pad = size === 'lg' ? 'px-5 py-3 text-[15px]' : 'px-3.5 py-2 text-sm';

  if (signedIn) {
    return (
      <a href="/app" className={`inline-flex items-center gap-2 rounded-xl bg-white font-medium text-black transition hover:bg-white/90 ${pad}`}>
        Open OpenHarness <ArrowUp className="size-4 rotate-45" />
      </a>
    );
  }

  async function demo() {
    setBusy(true);
    try {
      const r = await fetch('/api/auth/demo', { method: 'POST' });
      if (r.ok) router.push('/app');
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {githubOAuth ? (
        <a href="/api/auth/github" className={`inline-flex items-center gap-2.5 rounded-xl bg-white font-medium text-black transition hover:bg-white/90 ${pad}`}>
          <GitHubMark className="size-[18px]" /> Sign in with GitHub
        </a>
      ) : (
        <span
          title="GitHub sign-in turns on when the server has a GitHub OAuth app (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)."
          className={`inline-flex cursor-not-allowed items-center gap-2.5 rounded-xl border border-line2 bg-panel font-medium text-mute ${pad}`}
        >
          <GitHubMark className="size-[18px]" /> Sign in with GitHub
        </span>
      )}
      <button
        onClick={demo}
        disabled={busy}
        className={`inline-flex items-center gap-2 rounded-xl font-medium transition disabled:opacity-70 ${pad} ${githubOAuth ? 'border border-line2 bg-panel text-text hover:bg-raised' : 'bg-white text-black hover:bg-white/90'}`}
      >
        {busy && <LoaderCircle className="size-4 animate-spin" />} Try the demo
      </button>
    </div>
  );
}
