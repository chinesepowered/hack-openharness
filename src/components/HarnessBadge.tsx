import { HARNESS_META, type HarnessKey } from '@/lib/shared/harness-meta';

export function HarnessBadge({ harness, size = 28, className = '' }: { harness: HarnessKey; size?: number; className?: string }) {
  const m = HARNESS_META[harness];
  return (
    <span
      title={m.label}
      className={`inline-grid shrink-0 place-items-center rounded-[28%] font-mono font-bold leading-none ${className}`}
      style={{
        width: size, height: size, fontSize: Math.max(9, size * 0.36), color: m.color,
        background: `color-mix(in oklab, ${m.color} 15%, #0d0f14)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${m.color} 42%, transparent)`,
      }}
    >
      {m.monogram}
    </span>
  );
}

export function HarnessName({ harness, className = '' }: { harness: HarnessKey; className?: string }) {
  return <span className={className}>{HARNESS_META[harness].label}</span>;
}
