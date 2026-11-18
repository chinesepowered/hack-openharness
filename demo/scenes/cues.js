// Timed reveals: elements with data-cue="name" get .on at cues[name] seconds (from the URL hash,
// computed from the narration's word timings), else at their data-at attribute.
(function () {
  let cues = {};
  try { cues = JSON.parse(decodeURIComponent(location.hash.slice(1) || '{}')); } catch (e) { cues = {}; }
  window.__cues = cues;
  const t0 = performance.now();
  document.querySelectorAll('[data-cue]').forEach((el) => {
    const name = el.getAttribute('data-cue');
    const at = cues[name] ?? Number(el.getAttribute('data-at') || 0);
    setTimeout(() => el.classList.add('on'), Math.max(0, at * 1000));
  });
  // Optional per-scene hooks: window.onCue = { name: fn }
  setTimeout(() => {
    const hooks = window.onCue || {};
    Object.keys(hooks).forEach((k) => { const at = cues[k] ?? hooks[k].at ?? 0; setTimeout(hooks[k].fn || hooks[k], Math.max(0, at * 1000)); });
  }, 0);
  window.__elapsed = () => (performance.now() - t0) / 1000;
})();
