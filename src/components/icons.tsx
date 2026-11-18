export function GitHubMark({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** OpenHarness mark: one hub routing to many agents. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="ohg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a99dff" />
          <stop offset="0.5" stopColor="#6f8bff" />
          <stop offset="1" stopColor="#38d0ff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#11131a" stroke="url(#ohg)" strokeWidth="1.5" />
      <g stroke="url(#ohg)" strokeWidth="2" strokeLinecap="round">
        <path d="M16 16 L8.5 9" /><path d="M16 16 L23.5 9" /><path d="M16 16 L8.5 23" /><path d="M16 16 L23.5 23" />
      </g>
      <circle cx="16" cy="16" r="3.6" fill="url(#ohg)" />
      <g fill="#11131a" stroke="url(#ohg)" strokeWidth="1.6">
        <circle cx="8" cy="8.5" r="2.4" /><circle cx="24" cy="8.5" r="2.4" /><circle cx="8" cy="23.5" r="2.4" /><circle cx="24" cy="23.5" r="2.4" />
      </g>
    </svg>
  );
}

export function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.6 }}>Open<span className="brand-text">Harness</span></span>
    </span>
  );
}
