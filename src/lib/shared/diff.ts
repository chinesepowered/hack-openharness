// Minimal unified-diff parser for the diff viewer (git diff output).

export interface DiffLine { type: 'add' | 'del' | 'ctx' | 'meta'; text: string; oldNo?: number; newNo?: number }
export interface DiffHunk { header: string; lines: DiffLine[] }
export interface DiffFile {
  path: string;
  oldPath?: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'binary';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export function parseDiff(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      file = { path: m ? m[2] : line.slice(11), oldPath: m ? m[1] : undefined, status: 'modified', additions: 0, deletions: 0, hunks: [] };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;
    if (!hunk) {
      if (line.startsWith('new file mode')) file.status = 'added';
      else if (line.startsWith('deleted file mode')) file.status = 'deleted';
      else if (line.startsWith('rename from ')) { file.status = 'renamed'; file.oldPath = line.slice(12); }
      else if (line.startsWith('rename to ')) file.path = line.slice(10);
      else if (line.startsWith('Binary files')) file.status = 'binary';
      else if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) file.path = line.slice(4).replace(/^b\//, '');
    }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (h) {
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
      oldNo = Number(h[1]);
      newNo = Number(h[2]);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('+')) { hunk.lines.push({ type: 'add', text: line.slice(1), newNo: newNo++ }); file.additions++; }
    else if (line.startsWith('-')) { hunk.lines.push({ type: 'del', text: line.slice(1), oldNo: oldNo++ }); file.deletions++; }
    else if (line.startsWith(' ')) hunk.lines.push({ type: 'ctx', text: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
    else if (line.startsWith('\\')) hunk.lines.push({ type: 'meta', text: line });
  }
  return files;
}

export function diffStats(files: DiffFile[]) {
  return files.reduce((a, f) => ({ files: a.files + 1, additions: a.additions + f.additions, deletions: a.deletions + f.deletions }), { files: 0, additions: 0, deletions: 0 });
}
