import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffStats, parseDiff } from '../src/lib/shared/diff.ts';

const PATCH = `diff --git a/src/index.ts b/src/index.ts
index 1111111..2222222 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -10,3 +10,5 @@ export default function mitt() {
   on(type, handler) {
-    old();
+    added();
+    alsoAdded();
   },
diff --git a/test/once_test.ts b/test/once_test.ts
new file mode 100644
--- /dev/null
+++ b/test/once_test.ts
@@ -0,0 +1,2 @@
+import mitt from '..';
+test('once');
`;

test('parseDiff reads files, statuses, hunks and line numbers', () => {
  const files = parseDiff(PATCH);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, 'src/index.ts');
  assert.equal(files[0].status, 'modified');
  assert.equal(files[0].additions, 2);
  assert.equal(files[0].deletions, 1);
  const lines = files[0].hunks[0].lines;
  assert.deepEqual(lines[0], { type: 'ctx', text: '  on(type, handler) {', oldNo: 10, newNo: 10 });
  assert.deepEqual(lines[1], { type: 'del', text: '    old();', oldNo: 11 });
  assert.deepEqual(lines[2], { type: 'add', text: '    added();', newNo: 11 });
  assert.equal(files[1].status, 'added');
  assert.equal(files[1].path, 'test/once_test.ts');
  assert.deepEqual(diffStats(files), { files: 2, additions: 4, deletions: 1 });
});

test('parseDiff of an empty patch is empty', () => {
  assert.deepEqual(parseDiff(''), []);
});
