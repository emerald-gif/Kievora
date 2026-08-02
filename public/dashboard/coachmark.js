// ═══════════════════════════════════════════════════════════════════════════
// COACHMARK — small reusable "feature hint" bubble.
//
//   Points at any element on the page, explains what it does, and remembers
//   (per device, via localStorage) that it's been dismissed — so it teaches
//   a feature once and never nags a returning user.
//
//   USAGE — one line, anywhere, once this script is included on the page:
//
//     Coachmark.show('unique-id', targetEl, { text: 'What this does.' });
//
//   That's the whole API. To add a new hint somewhere else in the dashboard:
//     1. Include this script on the page (if not already):
//          <script src="/dashboard/coachmark.js"></script>
//     2. Call Coachmark.show(...) once you have a reference to the element
//        you want to explain (e.g. after it renders).
//   No new markup, no per-page CSS, no setup beyond that call.
//
//   Dismiss behavior: tap the × , tap anywhere outside the bubble, or wait
//   ~7s — any of these mark it seen so it won't show again on this device.
//   Coachmark.reset() clears every "seen" flag — handy while testing.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const SEEN_KEY = 'kie_coachmarks_seen';
  const AUTO_HIDE_MS = 7000;

  function getSeen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function markSeen(id) {
    const seen = getSeen();
    if (seen.indexOf(id) === -1) {
      seen.push(id);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {}
    }
  }

  let stylesReady = false;
  function injectStyles() {
    if (stylesReady) return;
    stylesReady = true;
    const style = document.createElement('style');
    style.textContent = `
      .cm-bubble {
        position: fixed; z-index: 9999; max-width: 220px;
        background: #111827; color: #fff; border-radius: 14px;
        padding: 12px 30px 12px 14px; font-size: 13px; line-height: 1.45;
        box-shadow: 0 14px 30px rgba(17,24,39,.32), 0 2px 8px rgba(17,24,39,.18);
        opacity: 0; transform: translateY(4px) scale(.96);
        transition: opacity .2s ease, transform .2s ease;
        pointer-events: none; font-family: inherit;
      }
      .cm-bubble.cm-in { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .cm-bubble::after {
        content: ''; position: absolute; width: 11px; height: 11px;
        background: #111827; transform: rotate(45deg); border-radius: 2px;
        left: var(--cm-arrow-x, 20px);
      }
      .cm-bubble[data-pos="below"]::after { top: -4px; }
      .cm-bubble[data-pos="above"]::after { bottom: -4px; }
      .cm-close {
        position: absolute; top: 7px; right: 7px; width: 18px; height: 18px;
        display: flex; align-items: center; justify-content: center;
        color: rgba(255,255,255,.5); cursor: pointer; border-radius: 50%;
        font-size: 15px; line-height: 1; background: none; border: none; padding: 0;
      }
      .cm-close:hover { color: #fff; background: rgba(255,255,255,.14); }
      .cm-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #a855f7;
        display: inline-block; margin-right: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  function show(id, targetEl, opts) {
    opts = opts || {};
    if (!id || !targetEl || !targetEl.getBoundingClientRect) return;
    if (getSeen().indexOf(id) !== -1) return;

    injectStyles();

    const bubble = document.createElement('div');
    bubble.className = 'cm-bubble';
    bubble.innerHTML =
      '<button class="cm-close" aria-label="Dismiss">&times;</button>' +
      '<div><span class="cm-dot"></span>' + (opts.text || '') + '</div>';
    document.body.appendChild(bubble);

    function place() {
      if (!document.body.contains(targetEl)) { close(); return; }
      const r = targetEl.getBoundingClientRect();
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      const vw = window.innerWidth, vh = window.innerHeight;
      const gap = 10;

      let pos = 'below', top = r.bottom + gap;
      if (top + bh > vh - 12) { pos = 'above'; top = r.top - bh - gap; }
      top = Math.max(12, top);

      let left = r.right - bw;
      left = Math.max(12, Math.min(left, vw - bw - 12));

      const arrowX = Math.max(14, Math.min(r.left + r.width / 2 - left - 5.5, bw - 26));

      bubble.style.top = top + 'px';
      bubble.style.left = left + 'px';
      bubble.dataset.pos = pos;
      bubble.style.setProperty('--cm-arrow-x', arrowX + 'px');
    }

    place();
    requestAnimationFrame(function () { bubble.classList.add('cm-in'); });

    let closed = false;
    let autoTimer;
    function close() {
      if (closed) return;
      closed = true;
      markSeen(id);
      bubble.classList.remove('cm-in');
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('click', onOutside, true);
      clearTimeout(autoTimer);
      setTimeout(function () { bubble.remove(); }, 200);
    }

    function onOutside(e) {
      if (!bubble.contains(e.target)) close();
    }

    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    // Deferred so the same tick that triggered show() (e.g. a render pass)
    // can't itself be read as the "outside" click that instantly closes it.
    setTimeout(function () { document.addEventListener('click', onOutside, true); }, 50);
    bubble.querySelector('.cm-close').addEventListener('click', close);

    autoTimer = setTimeout(close, opts.autoHideMs || AUTO_HIDE_MS);
  }

  window.Coachmark = {
    show: show,
    reset: function () { try { localStorage.removeItem(SEEN_KEY); } catch (e) {} }
  };
})();
