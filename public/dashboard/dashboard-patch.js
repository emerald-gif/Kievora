// ═══════════════════════════════════════════════════════════════════════════
// PATCH LAYER  —  runs after the main script
//   1. Analysis cache  (localStorage, keyed by file fingerprint / text hash)
//   2. Template picker on Edit  (intercepts openBuilder for saved resumes)
//
// FIX NOTES:
//   Bug 1 — Cache miss on button click:
//     The main script binds analyzeBtn.onclick = runAnalysis (the original fn)
//     directly, so the patch's window.runAnalysis override was never called.
//     Fix: re-bind analyzeBtn.onclick after DOMContentLoaded so it points to
//     the patched version. Also intercept renderAnalysis BEFORE the button
//     bind re-assignment so cache writes work properly.
//
//   Bug 2 — Template picker doesn't stick:
//     _origOpenBuilder → fillForm() sets selTpl = r.templateType, overwriting
//     the user's pick. Then pickTpl(chosen) corrects selTpl but the step-3
//     label was never populated in the main script at all (only patch wrote it).
//     Fix: call pickTpl(chosen) after _origOpenBuilder, AND always populate
//     selTplLabel when builder opens for any resume (via _syncBuilderTplLabel).
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  /* ── helpers ─────────────────────────────────────────────────────────── */
  function g(id) { return document.getElementById(id); }

  // ─────────────────────────────────────────────────────────────────────────
  // 1.  ANALYSIS RESULT CACHE  (uid-scoped to prevent cross-account leakage)
  // ─────────────────────────────────────────────────────────────────────────
  // CACHE_PREFIX is a function so it picks up the uid after auth resolves
  function CACHE_PREFIX() {
    const uid = window._currentUid || 'anon';
    return `rma_cache_${uid}_`;
  }
  const CACHE_LIMIT  = 25;

  // Fingerprint a File object — name + size + lastModified is stable and fast
  function fileKey(file) {
    return `f_${file.name}_${file.size}_${file.lastModified}`;
  }

  // Cheap djb2-ish hash of the paste text
  function textKey(t) {
    let h = 5381;
    const len = Math.min(t.length, 3000);
    for (let i = 0; i < len; i++) { h = (((h << 5) + h) ^ t.charCodeAt(i)) >>> 0; }
    return `t_${t.length}_${h}`;
  }

  function cacheRead(key) {
    try { const v = localStorage.getItem(CACHE_PREFIX() + key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  }

  function cacheWrite(key, data) {
    try {
      // Evict oldest entries if at limit
      const prefix = CACHE_PREFIX();
      const stored = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      if (stored.length >= CACHE_LIMIT) localStorage.removeItem(stored[0]);
      localStorage.setItem(prefix + key, JSON.stringify(data));
    } catch { /* quota exceeded — skip silently */ }
  }

  // Track the currently staged upload file from outside the main closure
  let _stagedFile = null;
  let _pendingKey = null;   // set before origRunAnalysis so renderAnalysis wrapper can write cache

  // Intercept handleUploadFile / clearUploadFile to grab the file reference
  const _origHandle = window.handleUploadFile;
  window.handleUploadFile = function(file) {
    _stagedFile = file;
    return _origHandle(file);
  };

  const _origClear = window.clearUploadFile;
  window.clearUploadFile = function() {
    _stagedFile = null;
    return _origClear();
  };

  // Intercept renderAnalysis to capture the result for writing to cache
  const _origRender = window.renderAnalysis;
  window.renderAnalysis = function(r) {
    _origRender(r);
    if (_pendingKey && r) {
      cacheWrite(_pendingKey, r);
      _pendingKey = null;
    }
  };

  // Patched runAnalysis — serve from cache when possible, else call original
  async function _patchedRunAnalysis() {
    // Determine what cache key applies right now
    let key = null;
    const pw = g('pasteAreaWrap');
    if (pw && pw.classList.contains('show')) {
      const t = (g('pasteText')?.value || '').trim();
      if (t.length >= 30) key = textKey(t);
    } else if (_stagedFile) {
      key = fileKey(_stagedFile);
    }

    if (key) {
      const cached = cacheRead(key);
      if (cached) {
        // Cache hit — instant, no API call, no tokens wasted
        // Also sync the module-level analysisResult so Edit/AskKIE buttons work correctly
        if (typeof window._setAnalysisResult === 'function') window._setAnalysisResult(cached);
        window.renderAnalysis(cached);
        window.showView('analysis');
        return;
      }
      // Cache miss — mark key so renderAnalysis wrapper writes it after the call
      _pendingKey = key;
    }

    await window._origRunAnalysis();
  }

  // Expose original under a stable name so _patchedRunAnalysis can always reach it
  window._origRunAnalysis = window.runAnalysis;
  window.runAnalysis = _patchedRunAnalysis;

  // *** FIX: Re-bind the button so it calls the patched version, not the
  //     original that was captured at bind-time in the main script. ***
  const analyzeBtn = g('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.onclick = _patchedRunAnalysis;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2.  TEMPLATE PICKER MODAL ON "EDIT"
  //     Shows all templates before opening the builder for an existing resume.
  //     The user's saved details are loaded normally; only the template changes.
  // ─────────────────────────────────────────────────────────────────────────

  /* ── Build the bottom drawer DOM once ──────────────────────────────────── */
  const _drwEl = document.createElement('div');
  _drwEl.id = 'etDrwSheet';
  _drwEl.style.cssText = [
    'position:fixed','left:0','right:0','bottom:0',
    'z-index:9999','background:#fff',
    'border-radius:22px 22px 0 0',
    'box-shadow:0 -4px 40px rgba(124,58,237,.18)',
    'transform:translateY(100%)',
    'transition:transform .35s cubic-bezier(.4,0,.2,1)',
    'max-height:88vh','display:flex','flex-direction:column',
  ].join(';');
  _drwEl.innerHTML = `
    <div style="width:36px;height:4px;background:#e0d7f5;border-radius:2px;margin:12px auto 0;flex-shrink:0"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px 10px;flex-shrink:0">
      <div>
        <div style="font-size:17px;font-weight:900;color:#0f0e17;letter-spacing:-.3px">Choose a Template</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">Your resume details stay intact — just the design changes.</div>
      </div>
      <button id="_etClose" style="width:34px;height:34px;background:#f3f0ff;border:none;border-radius:10px;color:#7c3aed;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:12px;font-family:inherit;line-height:1">✕</button>
    </div>
    <div id="_etGrid" style="overflow-y:auto;padding:4px 16px 12px;flex:1;min-height:0;display:grid;grid-template-columns:repeat(2,1fr);gap:10px;align-content:start"></div>
    <div style="padding:12px 16px;padding-bottom:max(16px,env(safe-area-inset-bottom,16px));background:#fff;border-top:1px solid #f0eeff;display:flex;gap:10px;flex-shrink:0">
      <button id="_etCancel" style="flex:1;background:#f3f0ff;color:#7c3aed;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Cancel</button>
      <button id="_etConfirm" style="flex:2;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 4px 16px rgba(124,58,237,.3)">Use Template →</button>
    </div>`;
  document.body.appendChild(_drwEl);

  const _drwOverlay = document.createElement('div');
  _drwOverlay.id = 'etDrwOverlay';
  _drwOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:none;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)';
  document.body.appendChild(_drwOverlay);

  /* ── State ────────────────────────────────────────────────────────────── */
  let _etSelected = 'classic';
  let _etResolve  = null;

  /* ── Scale thumbs inside the drawer ──────────────────────────────────── */
  function _etScaleThumbs() {
    document.querySelectorAll('#_etGrid .tcard-thumb').forEach(thumb => {
      const scaler = thumb.querySelector('.tpl-scaler');
      if (!scaler) return;
      const cardW = thumb.offsetWidth || 160;
      const scale = cardW / 600;
      scaler.style.transform = 'scale(' + scale + ')';
      // Full template preview, not a cropped peek — size the thumb to the
      // scaler's actual rendered content height (scrollHeight reads the
      // natural, un-transformed box height since CSS transform:scale never
      // changes layout size) rather than hardcoding a fixed crop height.
      const naturalH = scaler.scrollHeight || 720;
      thumb.style.height = Math.round(scale * naturalH) + 'px';
    });
  }

  /* ── Sample data for previews ─────────────────────────────────────────── */
  const _etSample = {
    fullName:'Alex Johnson', jobTitle:'Product Manager',
    email:'alex@mail.com', phone:'+234 801 234 5678', location:'Lagos, NG',
    summary:'Experienced professional with 5+ years building impactful products and leading cross-functional teams.',
    workExperience:[
      {position:'Senior Product Manager',company:'TechCorp Nigeria',startDate:'Jan 2021',endDate:'Present',description:'Led cross-functional teams to deliver 3 major product launches.'},
      {position:'Product Manager',company:'StartHub Ltd',startDate:'Mar 2018',endDate:'Dec 2020',description:'Managed roadmap and stakeholder communications.'},
    ],
    education:[{degree:'B.Sc',field:'Computer Science',school:'University of Lagos',graduationDate:'2018'}],
    skills:['Strategy','Leadership','Design','Analytics','Agile','SQL'],
  };

  /* ── Render the template grid with real previews ─────────────────────── */
  function _etRender(currentTpl) {
    const TPLS = window.TPLS_REF || [];
    const bph  = window._buildPrevHTML;
    _etSelected = currentTpl || 'classic';
    const grid = g('_etGrid');
    if (!grid) return;
    grid.innerHTML = TPLS.map(t => {
      const locked = typeof isTemplateUnlocked === 'function' ? !isTemplateUnlocked(t.id) : false;
      return `
      <div class="tcard${_etSelected === t.id ? ' sel' : ''}${locked ? ' tcard-locked' : ''}" id="_et_${t.id}" onclick="window._etPick('${t.id}')">
        <div class="tcard-thumb">
          <div class="tpl-scaler">${bph ? bph(_etSample, t.id, t.bg, 'rf-sans') : ''}</div>
          ${locked ? '<div class="premium-lock-corner">👑 Premium</div>' : ''}
          <button class="tcard-use" onclick="event.stopPropagation();window._etPick('${t.id}');${locked ? '' : "g('_etConfirm').click()"}">${locked ? 'Unlock →' : 'Use Template →'}</button>
        </div>
        <div class="tcard-foot">
          <span class="tcard-name">${t.name}</span>
          <span class="tcard-tag">${t.tag}</span>
        </div>
      </div>`;
    }).join('');
    requestAnimationFrame(_etScaleThumbs);
  }

  /* ── Pick handler ─────────────────────────────────────────────────────── */
  window._etPick = function(id) {
    if (typeof isTemplateUnlocked === 'function' && !isTemplateUnlocked(id)) {
      if (typeof lockTapped === 'function') lockTapped('templates');
      return; // never select a locked template here either
    }
    document.querySelectorAll('#_etGrid .tcard').forEach(c => c.classList.remove('sel'));
    const next = g('_et_' + id);
    if (next) next.classList.add('sel');
    _etSelected = id;
  };

  /* ── Open / close ─────────────────────────────────────────────────────── */
  function _etOpen(currentTpl) {
    return new Promise(resolve => {
      _etResolve = resolve;
      _etRender(currentTpl);
      _drwOverlay.style.display = 'block';
      requestAnimationFrame(() => { _drwEl.style.transform = 'translateY(0)'; });
      document.body.style.overflow = 'hidden';
    });
  }

  function _etClose(chosen) {
    _drwEl.style.transform = 'translateY(100%)';
    _drwOverlay.style.display = 'none';
    document.body.style.overflow = '';
    if (_etResolve) { _etResolve(chosen ?? null); _etResolve = null; }
  }

  g('_etClose').onclick   = () => _etClose(null);
  g('_etCancel').onclick  = () => _etClose(null);
  g('_etConfirm').onclick = () => _etClose(_etSelected);

  // Close on overlay click
  _drwOverlay.addEventListener('click', () => _etClose(null));

  /* ── Helper: write selTplLabel from the current selTpl var ────────────── */
  // The main script never sets selTplLabel text, so we do it here whenever
  // the builder opens — whether via template picker or direct edit.
  function _syncBuilderTplLabel(tplId) {
    const lbl = g('selTplLabel');
    if (!lbl) return;
    const t = (window.TPLS_REF || []).find(x => x.id === tplId);
    if (t) lbl.textContent = t.name;
  }

  /* ── Keep bRNameFinal in sync when builder opens ─────────────────────── */
  function _syncFinalName() {
    const n = g('bRName'), f = g('bRNameFinal');
    if (n && f) f.value = n.value;
  }

  /* ── Override openBuilder ─────────────────────────────────────────────── */
  const _origOpenBuilder = window.openBuilder;

  window.openBuilder = async function(id, isDraft) {
    // Go straight to builder — no template picker
    await _origOpenBuilder(id, isDraft);
    const activeTpl = (typeof window._getSelTpl === 'function' ? window._getSelTpl() : null) || 'classic';
    _syncBuilderTplLabel(activeTpl);
    _syncFinalName();
  };

  /* ── Override useAnalyzedResume — show template picker first ──────────── */
  const _origUseAnalyzedResume = window.useAnalyzedResume;

  window.useAnalyzedResume = async function() {
    // Determine the template that is currently active (default: classic)
    const currentTpl = (typeof window._getSelTpl === 'function' ? window._getSelTpl() : null) || 'classic';

    // Show the picker and wait for the user's choice
    const chosen = await _etOpen(currentTpl);

    // User cancelled (pressed ✕ or Cancel) — do nothing
    if (!chosen) return;

    // Populate the builder with the analysed resume data (original function)
    _origUseAnalyzedResume();

    // Apply the template the user picked
    if (typeof window.pickTpl === 'function') window.pickTpl(chosen);
    _syncBuilderTplLabel(chosen);
    _syncFinalName();
  };

});
