'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileDiff } from 'lucide-react';
import { diffStats, parseDiff, type DiffFile } from '@/lib/shared/diff';

export function DiffStatsLabel({ patch }: { patch: string }) {
  const s = useMemo(() => diffStats(parseDiff(patch)), [patch]);
  return (
    <span className="font-mono text-[12px]">
      <span className="text-mute">{s.files} file{s.files === 1 ? '' : 's'}</span>{' '}
      <span className="text-ok">+{s.additions}</span> <span className="text-bad">−{s.deletions}</span>
    </span>
  );
}

function FileBlock({ f, defaultOpen }: { f: DiffFile; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const badge = f.status === 'added' ? 'text-ok' : f.status === 'deleted' ? 'text-bad' : 'text-mute';
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 bg-panel2 px-3 py-2 text-left font-mono text-[12px] hover:bg-raised">
        {open ? <ChevronDown className="size-3.5 text-dim" /> : <ChevronRight className="size-3.5 text-dim" />}
        <span className="min-w-0 flex-1 truncate">{f.oldPath && f.status === 'renamed' ? `${f.oldPath} → ${f.path}` : f.path}</span>
        <span className={`text-[11px] ${badge}`}>{f.status}</span>
        <span className="text-ok">+{f.additions}</span><span className="text-bad">−{f.deletions}</span>
      </button>
      {open && (
        <div className="overflow-x-auto bg-[#0a0c10]">
          <table className="w-full border-collapse font-mono text-[12px] leading-[1.55] [font-variant-ligatures:none]">
            <tbody>
              {f.hunks.map((h, hi) => (
                <FragmentRows key={hi} header={h.header} lines={h.lines} />
              ))}
            </tbody>
          </table>
          {f.status === 'binary' && <div className="px-3 py-2 text-xs text-dim">Binary file</div>}
        </div>
      )}
    </div>
  );
}

function FragmentRows({ header, lines }: { header: string; lines: DiffFile['hunks'][number]['lines'] }) {
  return (
    <>
      <tr><td colSpan={3} className="select-none bg-[#11162a] px-3 py-1 text-[11px] text-[#8fa2ff]">{header}</td></tr>
      {lines.map((l, i) => {
        const bg = l.type === 'add' ? 'bg-[#0f2a1c]' : l.type === 'del' ? 'bg-[#2c1418]' : '';
        const fg = l.type === 'add' ? 'text-[#b6f5cf]' : l.type === 'del' ? 'text-[#ffc3c9]' : l.type === 'meta' ? 'text-dim' : 'text-[#c9cfdb]';
        const sign = l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' ';
        return (
          <tr key={i} className={bg}>
            <td className="w-[1%] select-none whitespace-nowrap px-2 text-right text-[11px] text-dim/70">{l.oldNo ?? ''}</td>
            <td className="w-[1%] select-none whitespace-nowrap px-2 text-right text-[11px] text-dim/70">{l.newNo ?? ''}</td>
            <td className={`whitespace-pre pr-4 ${fg}`}><span className="mr-2 select-none opacity-60">{sign}</span>{l.text}</td>
          </tr>
        );
      })}
    </>
  );
}

export function DiffView({ patch }: { patch: string }) {
  const files = useMemo(() => parseDiff(patch), [patch]);
  if (!patch.trim() || files.length === 0) {
    return <div className="rounded-lg border border-line bg-panel2 px-3 py-3 text-xs text-dim">No file changes in this session.</div>;
  }
  const big = files.reduce((n, f) => n + f.additions + f.deletions, 0) > 900;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-mute"><FileDiff className="size-3.5" /> <DiffStatsLabel patch={patch} /></div>
      {files.map((f, i) => <FileBlock key={`${f.path}-${i}`} f={f} defaultOpen={!big || i < 2} />)}
    </div>
  );
}
