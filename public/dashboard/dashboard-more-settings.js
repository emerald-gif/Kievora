function openMsb() {
  document.getElementById('msb').classList.add('open');
  document.getElementById('msbOverlay').classList.add('open');
  document.getElementById('avBtn').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMsb() {
  document.getElementById('msb').classList.remove('open');
  document.getElementById('msbOverlay').classList.remove('open');
  document.getElementById('avBtn').classList.remove('open');
  document.body.style.overflow = '';
}
// Exposed on window because this file now runs as a module (module top-level
// function declarations aren't auto-global like classic scripts) and
// dashboard.html calls closeMsb() directly from an inline onclick attribute.
window.openMsb = openMsb;
window.closeMsb = closeMsb;

document.getElementById('avBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  document.getElementById('msb').classList.contains('open') ? closeMsb() : openMsb();
});
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeMsb(); });

// Profile is synced directly from the auth listener above.
// This is a lightweight fallback for edge cases where auth fires late.

// ── IMAGE LIGHTBOX ──────────────────────────────────────────────────────────
(function() {
  const overlay = document.createElement('div');
  overlay.className = 'kie-img-overlay';
  overlay.id = 'kieImgOverlay';
  overlay.innerHTML = `
    <button class="kie-img-overlay-close" onclick="closeKieImgOverlay()">×</button>
    <img id="kieImgOverlayImg" src="" alt="">`;
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeKieImgOverlay();
  });
  document.body.appendChild(overlay);

  window.openKieImgOverlay = function(src) {
    const ol  = document.getElementById('kieImgOverlay');
    const img = document.getElementById('kieImgOverlayImg');
    if (!ol || !img) return;
    img.src = src;
    ol.classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  window.closeKieImgOverlay = function() {
    const ol = document.getElementById('kieImgOverlay');
    if (ol) ol.classList.remove('open');
    document.body.style.overflow = '';
  };
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeKieImgOverlay();
  });
})();
