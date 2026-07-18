    import { initializeApp }      from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
    import { getAuth, onAuthStateChanged, signOut }
      from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
    import { getFirestore, doc, getDoc, addDoc, collection, serverTimestamp, getDocs, query, where, orderBy, limit }
      from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

    // ── PASTE YOUR FIREBASE CONFIG ───────────────────────────────────────────
    const firebaseConfig = {
  apiKey: "AIzaSyA2s328tgIlxFnnvob5GK7G7C-QevPxnRs",
  authDomain: "kievora.firebaseapp.com",
  projectId: "kievora",
  storageBucket: "kievora.firebasestorage.app",
  messagingSenderId: "548806738102",
  appId: "1:548806738102:web:bd84433ce38fbfb4e2e617",
  measurementId: "G-X6VG3MVQ96"
};
    // ─────────────────────────────────────────────────────────────────────────

    const fbApp = initializeApp(firebaseConfig);
    const auth  = getAuth(fbApp);
    const db    = getFirestore(fbApp, 'default');

    // ── Bridge for code written against the old firebase.auth() compat API ───
    // (this app uses the modular SDK — `auth` above is module-scoped, not a
    // global `firebase` namespace — so anything outside this <script type="module">
    // block needs to go through this instead of calling firebase.auth() directly)
    window.__kieAuth = auth;
    window.__kieGetIdToken = function() {
      return new Promise((res, rej) => {
        const u = auth.currentUser;
        if (u) { u.getIdToken().then(res).catch(rej); return; }
        const unsub = onAuthStateChanged(auth, usr => {
          unsub();
          if (usr) usr.getIdToken().then(res).catch(rej);
          else rej('no user');
        });
      });
    };

    // ── Admin analytics logger (fire-and-forget, never blocks UI) ────────────
    function logEvent(event, meta = {}) {
      try {
        addDoc(collection(db, 'analyticsEvents'), {
          event, feature: meta.feature || event,
          userId:    usr?.uid  || null,
          userName:  usr?.displayName || null,
          model:     meta.model || null,
          meta,
          timestamp: serverTimestamp(),
        }).catch(() => {});
      } catch {}
    }

    // ── STATE ────────────────────────────────────────────────────────────────
    let usr = null, tok = null;
    let resumes = [], selTpl = 'classic', editId = null, detId = null;
    let resumePhotoData = ''; // base64 data URL for profile photo
    let wList = [], eList = [], sList = [];
    let certList = [], projList = [], langList = []; // optional resume sections
    // ── Edit-in-place state: holds the _id of the entry currently loaded into
    // each section's form, or null when the form is in "add new" mode.
    let editingWId = null, editingEId = null, editingCrtId = null, editingPrjId = null, editingLngId = null;
    let kieHist = [];
    // In-memory image store — maps imageRef keys to {base64, mimeType, name}.
    // Not persisted to localStorage (images are too large). Follow-up questions
    // in the same session include the image; cross-session refs show as missing.
    const _kieImageStore = new Map();
    const _kieFileStore  = new Map(); // fileRef -> { base64, mimeType, name, ext } — uploaded PDFs/TXT for preview
    // active KIE mode. NOTE: 'default' is displayed to the user as the
    // "Quick Answer" pill (see dashboard.html mode-pills comment) — it is
    // NOT the old terse 'quick' mode, which still exists in KIE_MODES on the
    // backend but no longer has a visible pill. Don't rename this value to
    // 'quick' — resolveMode()'s casual-message downgrade and sendChip()'s
    // Web→Default revert (both in server/kie.js / below) key off 'default'.
    let kieMode  = 'default';
    let kieModel = 'spark';   // active KIE model (spark | core | nova) — ultra removed from frontend for now
    let kieResumeContext = ''; // text context for AI coaching
    // Text of a file uploaded in chat that KIE has NOT confirmed is a resume
    // yet (e.g. a biography, book excerpt, roadmap notes). Kept available so
    // the conversation can carry on referencing it naturally; only promoted
    // into kieResumeContext + the "Uploaded Resume" pill once the user
    // actually confirms it's their resume.
    let kieDocContext = '';
    let _kiePendingFileText = '';
    let _kiePendingFileName = '';
    let kieSelectedResume = null; // actual resume object for PDF generation + template changes
    let _stagedKieAttachment = null; // { type:'image'|'pdf'|'txt', file, dataUrl, mimeType, name, size }
    let builderStep = 1; // 1=Personal, 2=Work+Edu, 3=Skills

    // ─── Plan Gates — client mirror of server PLANS, hydrated on load ──────────
    // Single source of truth still lives in server.js. This is just what the
    // UI reads to decide what to show locked vs unlocked — every actual
    // enforcement happens server-side regardless of what this object says.
    let PLAN_KEY   = 'free';
    let PLAN_GATES = null; // shape: { models, tools, templates, uploadAnalyze, recruiterView, findJobsClick, coverLetterFromResume, atsExplanation, articleDownload, verifiedBadgeEligible, kieWebSearch, kieCreativeMode, ... }

    let _planGatesLoadedOnce = false;
    async function loadPlanGates() {
      try {
        const data = await api('GET', '/api/plan-config');
        const previousPlan = PLAN_KEY;
        PLAN_KEY   = data.plan || 'free';
        PLAN_GATES = data.gates || null;
        if (_planGatesLoadedOnce && previousPlan !== PLAN_KEY) {
          const labels = { free: 'Free', paid7: 'Pro', paid15: 'Premier' };
          toast(`You're now on ${labels[PLAN_KEY] || PLAN_KEY} 🎉`, 'ok');
        }
        _planGatesLoadedOnce = true;
      } catch (e) {
        console.error('loadPlanGates failed, defaulting to free gates:', e.message);
        PLAN_KEY   = 'free';
        PLAN_GATES = null;
      }
      applyPlanGatesToUI();
    }

    // ── Keep PLAN_GATES fresh without needing a full reload ────────────────────
    // Covers: user goes to /billing, upgrades, then hits back / switches tabs
    // back to the dashboard. Throttled so rapid tab-switching doesn't spam the
    // endpoint — only re-checks if at least 8s have passed since the last check.
    let _lastPlanCheck = Date.now();
    function maybeRefreshPlanGates() {
      if (!usr) return; // not logged in yet — onAuthStateChanged will load it
      if (Date.now() - _lastPlanCheck < 8000) return;
      _lastPlanCheck = Date.now();
      loadPlanGates();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') maybeRefreshPlanGates();
    });
    window.addEventListener('pageshow', (e) => {
      // e.persisted = true means this is a back/forward-cache restore (the page
      // never actually re-ran its scripts), which is exactly the "tapped back
      // from billing" case this is meant to catch.
      if (e.persisted) maybeRefreshPlanGates();
    });
    window.addEventListener('focus', maybeRefreshPlanGates);

    function isModelUnlocked(key) {
      if (!PLAN_GATES) return key === 'spark';
      return PLAN_GATES.models.includes(key);
    }
    // jobmatch & resignation don't have their own plan-config entry — server-side
    // they're gated under the 'aibuild' tool key, so the client check mirrors that.
    const TOOL_GATE_ALIAS = { jobmatch: 'aibuild', resignation: 'aibuild' };
    function isToolUnlocked(key) {
      if (!PLAN_GATES) return false;
      return PLAN_GATES.tools.includes(TOOL_GATE_ALIAS[key] || key);
    }
    function isModeUnlocked(mode) {
      if (mode === 'web')      return !!(PLAN_GATES && PLAN_GATES.kieWebSearch);
      if (mode === 'creative') return !!(PLAN_GATES && PLAN_GATES.kieCreativeMode);
      return true; // default, deep, quick are free for everyone
    }
    function isFeatureUnlocked(key) {
      if (!PLAN_GATES) return false;
      return !!PLAN_GATES[key];
    }
    function isTemplateUnlocked(tplId) {
      if (!PLAN_GATES || PLAN_GATES.templates === 'all') return true;
      const limit = typeof PLAN_GATES.templates === 'number' ? PLAN_GATES.templates : 5;
      const idx = TPLS.findIndex(t => t.id === tplId);
      return idx >= 0 && idx < limit;
    }

    // ─── Plan labels + which plan unlocks which AI Tool (for copy only — the
    // real enforcement lives server-side; this mirrors it just for instant,
    // no-network-wait messaging) ─────────────────────────────────────────────
    const PLAN_LABELS = { free: 'Free', paid7: 'Pro', paid15: 'Premier' };
    const PAID7_TOOLS = ['aibuild', 'careerhealth', 'roadmap', 'linkedin', 'messaging'];
    function minPlanForTool(toolKey) {
      const key = TOOL_GATE_ALIAS[toolKey] || toolKey;
      return PAID7_TOOLS.includes(key) ? 'paid7' : 'paid15';
    }

    // Static copy for every locked-feature drawer — title/icon/description never
    // need a network call, so the drawer opens instantly with zero lag.
    const PREMIUM_FEATURE_INFO = {
      uploadAnalyze:  { icon: '📊', title: 'Upload & Analyze', minPlan: 'paid7',
        desc: 'Upload any resume and get a full ATS score, strengths, weaknesses, and exactly what to fix — plus our AI Image Analyzer for scanned or photographed resumes.' },
      recruiterView:  { icon: '🕵️', title: 'Recruiter View', minPlan: 'paid15',
        desc: "See your resume exactly the way a recruiter does on a 6-second skim — first impressions, red flags, and what makes them keep reading." },
      templates:      { icon: '🎨', title: 'All Templates', minPlan: 'paid7',
        desc: 'Unlock every resume template in the library, not just the first 5.' },
      coverLetter:    { icon: '✉️', title: 'Cover Letter from Resume', minPlan: 'paid7',
        desc: "Auto-generate a tailored cover letter straight from an existing or uploaded resume instead of writing one from scratch." },
      atsExplanation: { icon: '📈', title: 'Score Breakdown', minPlan: 'paid7',
        desc: "See exactly why you got your ATS score — not just the number, but what's working and what to fix." },
      articleDownload:{ icon: '⬇️', title: 'Article Downloads', minPlan: 'paid7',
        desc: 'Save any article from the Community Feed as a PDF to read or share offline.' },
      findJobs:       { icon: '💼', title: 'Job Applications', minPlan: 'paid7',
        desc: "Open and apply to every job we surface for you, not just preview the listing." },
      gmail:          { icon: '📧', title: 'Gmail AI', minPlan: 'paid15',
        desc: "KIE reads your inbox securely to auto-track applications, interviews, and recruiter emails — no more manually updating your pipeline." },
    };
    const TOOL_INFO = {
      aibuild:      { icon: '✍️',  title: 'AI Resume Builder',   desc: 'Build a complete resume from a single prompt — KIE writes it for you.' },
      careerhealth: { icon: '❤️‍🩹', title: 'Career Health Score', desc: 'A full check-up on your career — momentum, risk areas, and what to prioritize next.' },
      roadmap:      { icon: '🗺️',  title: 'Career Roadmap',      desc: 'A step-by-step plan to get from where you are to where you want to be.' },
      salary:       { icon: '💰',  title: 'Salary Intel',        desc: 'Know what your role actually pays before you negotiate.' },
      industry:     { icon: '📡',  title: 'Industry Intel',      desc: 'Stay ahead with trends and shifts in your industry.' },
      linkedin:     { icon: '🔗',  title: 'LinkedIn Optimizer',  desc: 'Turn your profile into something recruiters actually stop on.' },
      interview:    { icon: '🎤',  title: 'Mock Interview',      desc: 'Practice real interview questions and get honest feedback on your answers.' },
      branding:     { icon: '🌟',  title: 'Personal Branding',   desc: 'Build a personal brand that gets you noticed for the right reasons.' },
      messaging:    { icon: '💬',  title: 'Professional Messaging', desc: 'Write outreach, follow-ups, and cold messages that actually get replies.' },
      promotion:    { icon: '📊',  title: 'Promotion Readiness', desc: 'Build the case for your next promotion with a clear, data-backed argument.' },
      jobmatch:     { icon: '🎯',  title: 'Job Match',           desc: 'See exactly how well your resume matches a specific job description before you apply.' },
      resignation:  { icon: '📝',  title: 'Resignation Letter',  desc: 'Write a clean, professional resignation letter in the right tone, in seconds.' },
    };

    // ─── Premium Feature Drawer — opens instantly, no network wait ───────────
    function openPremiumDrawer(feature, toolKey) {
      let info, minPlan;
      if (feature === 'tool' && toolKey && TOOL_INFO[toolKey]) {
        info = TOOL_INFO[toolKey];
        minPlan = minPlanForTool(toolKey);
      } else if (PREMIUM_FEATURE_INFO[feature]) {
        info = PREMIUM_FEATURE_INFO[feature];
        minPlan = info.minPlan;
      } else {
        info = { icon: '🔒', title: 'Premium Feature', desc: 'This feature is part of a paid plan.' };
        minPlan = 'paid7';
      }

      const iconWrapEl = g('pfdIconWrap');
      const iconEl     = g('pfdIcon');
      if (feature === 'gmail') {
        // Gmail gets its real logo, not the generic emoji-in-a-purple-box
        // treatment every other locked feature uses — matches how the
        // Gmail icon is shown everywhere else in the app.
        if (iconWrapEl) iconWrapEl.classList.add('pfd-icon-wrap-plain');
        if (iconEl) iconEl.innerHTML = '<img src="/gmail.jpg" alt="Gmail" style="width:56px;height:56px;object-fit:contain" onerror="this.outerHTML=\'<svg width=&quot;48&quot; height=&quot;48&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot;><path d=&quot;M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z&quot; fill=&quot;#ea4335&quot; opacity=&quot;.2&quot;/><path d=&quot;M20 4H4L12 13l8-9z&quot; fill=&quot;#ea4335&quot;/></svg>\'">';
      } else {
        if (iconWrapEl) iconWrapEl.classList.remove('pfd-icon-wrap-plain');
        if (iconEl) iconEl.textContent = info.icon;
      }
      g('pfdTitle').textContent = info.title;
      g('pfdDesc').textContent  = info.desc;

      const ctaEl = g('pfdCta');
      const subEl = g('pfdSub');
      if (PLAN_KEY === 'paid7' && minPlan === 'paid15') {
        // They already have Pro — be explicit this needs the next tier up,
        // so they never feel like they "already paid for this and it's still locked".
        ctaEl.textContent = `Upgrade to ${PLAN_LABELS.paid15}`;
        subEl.textContent = `You're on ${PLAN_LABELS.paid7} — ${PLAN_LABELS.paid15} unlocks this`;
      } else {
        ctaEl.textContent = `Upgrade to ${PLAN_LABELS[minPlan]}`;
        subEl.textContent = '';
      }

      g('pfdOverlay').classList.add('open');
      g('pfdSheet').classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    window.openPremiumDrawer = openPremiumDrawer;

    window.closePremiumDrawer = function() {
      g('pfdOverlay').classList.remove('open');
      g('pfdSheet').classList.remove('open');
      document.body.style.overflow = '';
    };

    function showLockToast(msg) {
      const t = g('toast');
      if (!t) return;
      t.innerHTML = '<span class="toast-ico">🔒</span><span>' + esc(msg) + '</span>'
        + ' <a href="/billing">Upgrade →</a>';
      t.className = 'toast-lock';
      clearTimeout(window._tt);
      requestAnimationFrame(() => t.classList.add('show'));
      window._tt = setTimeout(() => t.classList.remove('show'), 5500);
    }

    // KIE model & mode pills already say everything that's locked right on the
    // badge itself — these just need a short, plan-aware nudge, not a full
    // drawer. Resolves instantly, no network call.
    function quickLockNudge(feature, model) {
      if (feature === 'kieModel') {
        const minPlan = (model === 'core') ? 'paid7' : 'paid15';
        if (PLAN_KEY === 'paid7' && minPlan === 'paid15') {
          showLockToast(`You're on ${PLAN_LABELS.paid7} — upgrade to ${PLAN_LABELS.paid15} to unlock KIE ${model[0].toUpperCase()+model.slice(1)}.`);
        } else {
          showLockToast(`Upgrade to ${PLAN_LABELS[minPlan]} to unlock KIE ${model[0].toUpperCase()+model.slice(1)}.`);
        }
        return;
      }
      if (feature === 'kieWebSearch') { showLockToast(`Web Search needs ${PLAN_LABELS.paid7} or ${PLAN_LABELS.paid15}.`); return; }
      if (feature === 'kieCreativeMode') { showLockToast(`Creative mode needs ${PLAN_LABELS.paid7} or ${PLAN_LABELS.paid15}.`); return; }
      showLockToast('Upgrade your plan to unlock this.');
    }

    // Single entry point every locked tap already calls — routes to the right
    // UI: a quick toast for the model/mode pills (which are already self-
    // explanatory), the full drawer for everything else.
    function lockTapped(feature, model) {
      if (feature === 'kieModel' || feature === 'kieWebSearch' || feature === 'kieCreativeMode') {
        quickLockNudge(feature, model);
      } else if (feature === 'tool') {
        openPremiumDrawer('tool', model);
      } else {
        openPremiumDrawer(feature);
      }
    }
    window.lockTapped = lockTapped; // bridge — needed by job card onclicks generated outside this module scope

    // Re-renders every plan-aware surface currently in the DOM. Called once
    // after loadPlanGates() resolves, and again any time the plan might have
    // changed (e.g. coming back from a successful checkout).
    // Gmail AI is a Premier-exclusive feature (see support.html). Premier
    // users tapping the nudge go straight to the connect flow; everyone else
    // gets the same paywall drawer every other locked feature uses.
    window.kieGmailNudgeTap = function() {
      if (PLAN_KEY === 'paid15') {
        if (typeof window.openSidebarSettings === 'function') window.openSidebarSettings();
        setTimeout(() => { if (typeof window.openGmailPanel === 'function') window.openGmailPanel(); }, 350);
      } else {
        lockTapped('gmail');
      }
    };
    function renderKieGmailNudgeGate() {
      const badge = g('kieGmailBadge');
      const cta   = g('kieGmailCta');
      if (!badge || !cta) return;
      if (PLAN_KEY === 'paid15') {
        badge.style.display = 'none';
        cta.textContent = 'Connect →';
      } else {
        badge.style.display = '';
        cta.textContent = 'Upgrade →';
      }
    }
    window.renderKieGmailNudgeGate = renderKieGmailNudgeGate;

    function applyPlanGatesToUI() {
      if (typeof renderModeLocks === 'function') renderModeLocks();
      if (typeof renderToolHubLocks === 'function') renderToolHubLocks();
      if (typeof renderCoverLetterSourceLocks === 'function') renderCoverLetterSourceLocks();
      if (typeof renderAtsExplanationLock === 'function') renderAtsExplanationLock();
      if (typeof renderRecruiterViewLock === 'function') renderRecruiterViewLock();
      if (typeof renderSidebarUpgradeBanner === 'function') renderSidebarUpgradeBanner();
      renderKieGmailNudgeGate();
      if (document.getElementById('kmdList')) renderModelList();
      if (document.querySelector('.tcard')) renderTpickScaled();
    }

    // Plan-aware banner at the top of the general sidebar. Free users get
    // pushed toward Pro, Pro users get pushed toward Premier specifically
    // (not a generic "upgrade" — they already paid once, the copy should
    // reflect that). Premier users see nothing here at all.
    function renderSidebarUpgradeBanner() {
      const el = g('msbUpgradeBanner');
      if (!el) return;
      if (PLAN_KEY === 'paid15') { el.innerHTML = ''; return; }
      const copy = PLAN_KEY === 'paid7'
        ? { icon: '👑', title: 'Upgrade to Premier', sub: 'Unlock Recruiter View, all 10 AI Tools & KIE Nova' }
        : { icon: '⚡', title: 'Upgrade to Pro or Premier', sub: 'Unlock templates, AI Tools, Recruiter View & more' };
      el.innerHTML = `<div class="msb-upgrade-banner" onclick="closeMsb();window.location.href='/billing'">
        <div class="msb-upgrade-banner-ico">${copy.icon}</div>
        <div>
          <div class="msb-upgrade-banner-title">${copy.title}</div>
          <div class="msb-upgrade-banner-sub">${copy.sub}</div>
        </div>
        <svg class="msb-upgrade-banner-arr" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </div>`;
    }

    // ─── localStorage keys — set to generic fallback, scoped to UID after auth ──
    // SECURITY: All keys MUST include uid so no two accounts ever share storage.
    let KIE_LS_KEY    = 'kievora_kie_history';   // overwritten once uid is known
    let KIE_IMG_LS_KEY = 'kievora_kie_images';    // overwritten once uid is known — persists attached images across reloads
    let KIE_DOC_LS_KEY = 'kievora_kie_docs';      // overwritten once uid is known — persists attached PDFs/TXT for preview across reloads
    // Stable conversation id for the background summary system (getConvSummary/
    // generateConvSummary in server/kie.js already read+write this, they just
    // never had a real id to key off — "New Chat" resets kieHist but there's
    // no separate per-thread id concept in the UI today, so this is one
    // stable id per user, matching how kieHist itself already behaves as a
    // single ongoing thread. Never overwritten once created, so summaries
    // accumulate against the same doc for as long as the account exists.
    let KIE_CONVID_LS_KEY = 'kievora_kie_convid'; // overwritten once uid is known
    let DRAFTS_LS_KEY = 'kievora_drafts';         // overwritten once uid is known
    let drafts = []; // local-only draft resumes
    let currentDraftId = null; // active draft id while in builder

    const TPLS = [
      { id:'classic',   name:'Classic',    tag:'Professional',  bg:'#1e3a8a' },
      { id:'modern',    name:'Modern',     tag:'Clean',         bg:'#0f766e' },
      { id:'bold',      name:'Bold',       tag:'Executive',     bg:'#7c2d12' },
      { id:'minimal',   name:'Minimal',    tag:'Simple',        bg:'#1e293b' },
      { id:'vivid',     name:'Vivid',      tag:'Standout',      bg:'#581c87' },
      { id:'elegant',   name:'Elegant',    tag:'Refined',       bg:'#44403c' },
      { id:'slate',     name:'Slate',      tag:'Dark & Sharp',  bg:'#0f172a' },
      { id:'coral',     name:'Coral',      tag:'Warm & Bold',   bg:'#c2410c' },
      { id:'split',     name:'Split',      tag:'Structured',    bg:'#4338ca' },
      { id:'ink',       name:'Ink',        tag:'Editorial',     bg:'#111827' },
      { id:'executive', name:'Executive',  tag:'With Photo',    bg:'#1e3a5f' },
      { id:'nova',      name:'Nova',       tag:'With Photo',    bg:'#312e81' },
      { id:'tribune',   name:'Tribune',    tag:'With Photo',    bg:'#1c1917' },
    ];
    window.TPLS_REF = TPLS; // expose globally for KIE functions

    // Templates that render d.photo on the resume preview
    const PHOTO_SUPPORTED_TPLS = new Set([
      'classic', 'modern', 'elegant', 'slate', 'split', 'executive', 'nova', 'tribune'
    ]);
    window.PHOTO_SUPPORTED_TPLS_REF = PHOTO_SUPPORTED_TPLS; // expose for KIE

    // ── QUIZ STATE ───────────────────────────────────────────────────────────
    let quizRec = { primary: null, secondary: null };

    function recommendTemplate(industry, experience, style) {
      const scores = { classic:0, modern:0, bold:0, minimal:0, vivid:0, elegant:0, slate:0, coral:0, split:0, ink:0, executive:0, nova:0, tribune:0 };
      if (industry==='tech')                           { scores.modern+=3; scores.minimal+=2; scores.slate+=2; scores.vivid+=1; }
      else if (industry==='finance'||industry==='law') { scores.classic+=3; scores.bold+=2; scores.elegant+=2; scores.split+=1; scores.executive+=2; scores.tribune+=1; }
      else if (industry==='creative')                  { scores.vivid+=3; scores.coral+=3; scores.ink+=2; scores.bold+=1; scores.nova+=2; scores.tribune+=1; }
      else if (industry==='healthcare')                { scores.classic+=2; scores.modern+=2; scores.minimal+=1; scores.split+=1; }
      else if (industry==='education')                 { scores.classic+=2; scores.minimal+=2; scores.elegant+=2; }
      else if (industry==='business')                  { scores.bold+=3; scores.split+=2; scores.classic+=1; }
      else                                             { scores.modern+=1; scores.classic+=1; scores.split+=1; }
      if (experience==='entry')                        { scores.classic+=2; scores.modern+=1; scores.coral+=1; }
      else if (experience==='mid')                     { scores.modern+=2; scores.split+=1; scores.classic+=1; }
      else if (experience==='senior')                  { scores.bold+=2; scores.slate+=2; scores.modern+=1; }
      else if (experience==='executive')               { scores.bold+=3; scores.elegant+=3; scores.ink+=2; scores.minimal+=1; scores.executive+=3; scores.tribune+=2; }
      if (style==='professional')                      { scores.classic+=3; scores.elegant+=2; scores.split+=1; }
      else if (style==='modern')                       { scores.modern+=3; scores.slate+=2; }
      else if (style==='minimal')                      { scores.minimal+=4; scores.ink+=2; }
      else if (style==='bold')                         { scores.bold+=3; scores.vivid+=1; scores.coral+=1; }
      else if (style==='creative')                     { scores.vivid+=4; scores.coral+=3; scores.ink+=2; scores.bold+=1; }
      const sorted = Object.entries(scores).sort((a,b)=>b[1]-a[1]);
      return { primary: sorted[0][0], secondary: sorted[1][0] };
    }

    // ── QUIZ MODAL ───────────────────────────────────────────────────────────
    window.openQuizModal = function() {
      // Reset to phase 1
      const backdrop = document.getElementById('quizModal');
      document.getElementById('qmPhase1').style.display = 'block';
      document.getElementById('qmPhaseLoading').style.display = 'none';
      document.getElementById('qmPhase2').style.display = 'none';
      // Clear previous selects
      ['qm-industry','qm-experience','qm-style'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      backdrop.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    };

    window.closeQuizModal = function() {
      document.getElementById('quizModal').style.display = 'none';
      document.body.style.overflow = '';
    };

    window.submitQuizModal = function() {
      const industry   = document.getElementById('qm-industry').value;
      const experience = document.getElementById('qm-experience').value;
      const style      = document.getElementById('qm-style').value;
      if (!industry || !experience || !style) { toast('Please answer all 3 questions 😊','err'); return; }

      // Show the "KIE is matching you" loading state for a couple seconds —
      // the actual match below is instant, this just gives it a beat so it
      // feels considered rather than a flat instant swap.
      document.getElementById('qmPhase1').style.display = 'none';
      document.getElementById('qmPhaseLoading').style.display = 'flex';

      setTimeout(() => {
        quizRec = recommendTemplate(industry, experience, style);
        // Populate result phase
        const t = TPLS.find(x => x.id === quizRec.primary) || TPLS[0];
        document.getElementById('qmResultName').textContent = t.name;
        document.getElementById('qmResultTag').textContent  = t.tag + ' · Best match for your profile';
        document.getElementById('qmResultId').value         = t.id;
        // Build preview
        const prevBox = document.getElementById('qmResultPrev');
        prevBox.innerHTML = buildPrevHTML(SAMPLE_DATA, t.id, t.bg, 'rf-sans');
        requestAnimationFrame(() => {
          const child = prevBox.firstElementChild;
          if (child) {
            const scale = prevBox.offsetWidth / 600;
            child.style.transform = 'scale(' + scale + ')';
            child.style.transformOrigin = 'top left';
            child.style.width = '600px';
            prevBox.style.height = Math.round(scale * 720) + 'px';
          }
        });
        // Switch phases
        document.getElementById('qmPhaseLoading').style.display = 'none';
        document.getElementById('qmPhase2').style.display = 'block';
        // Refresh badges on grid
        renderTpick(); scaleTplThumbs();
      }, 2200 + Math.random() * 700); // 2.2–2.9s, feels natural rather than a fixed timer
    };

    window.useQuizTpl = function() {
      const id = document.getElementById('qmResultId').value;
      window.closeQuizModal();
      useTpl(id);
    };

    window.runQuiz = function() {
      const industry  = g('q-industry') ? g('q-industry').value : '';
      const experience= g('q-experience') ? g('q-experience').value : '';
      const style     = g('q-style') ? g('q-style').value : '';
      if (!industry||!experience||!style) { toast('Please answer all 3 questions 😊','err'); return; }

      const btn = document.querySelector('.quiz-find-btn');
      const originalHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" style="animation:sping .8s linear infinite;vertical-align:middle;margin-right:6px"><path stroke-linecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> KIE is matching you...`;
      }
      setTimeout(() => {
        quizRec = recommendTemplate(industry, experience, style);
        showOverlay(quizRec.primary);
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
      }, 2200 + Math.random() * 700);
    };

    const SAMPLE_DATA = {
      fullName:'Alex Johnson', jobTitle:'Senior Professional',
      email:'alex@email.com', phone:'+1 555 000 0000', location:'New York, NY',
      summary:'Experienced professional with 8+ years driving impactful results across high-growth organizations. Proven ability to lead teams, streamline operations, and deliver measurable outcomes.',
      workExperience:[
        {position:'Senior Manager',company:'Acme Corp',startDate:'Jan 2021',endDate:'Present',description:'Led cross-functional teams to deliver $2M in cost savings and improved key metrics by 40%.'},
        {position:'Associate',company:'Previous Inc',startDate:'Jun 2018',endDate:'Dec 2020',description:'Contributed to revenue growth and process improvements across multiple departments.'}
      ],
      education:[{degree:'B.Sc',field:'Business Administration',school:'State University',graduationDate:'2018'}],
      skills:['Leadership','Strategy','Communication','Project Management','Problem Solving']
    };

    function showOverlay(tplId) {
      const t = TPLS.find(x=>x.id===tplId)||TPLS[0];
      const box = g('tplOvPrev');
      box.innerHTML = buildPrevHTML(SAMPLE_DATA, t.id, t.bg, 'rf-sans');
      requestAnimationFrame(()=>{
        const child = box.firstElementChild;
        if (child) {
          const scale = box.offsetWidth / 600;
          child.style.transform = 'scale('+scale+')';
          child.style.transformOrigin = 'top left';
          child.style.width = '600px';
          box.style.height = Math.round(scale*720)+'px';
        }
      });
      g('tplOvName').textContent = t.name;
      g('tplOvTag').textContent  = t.tag+' · Best match for your profile';
      g('tplOvId').value         = t.id;
      g('tplOverlay').style.display = 'flex';
      document.body.style.overflow  = 'hidden';
    }
    window.showOverlay = showOverlay;

    window.closeOverlay = function() {
      g('tplOverlay').style.display = 'none';
      document.body.style.overflow  = '';
    };

    window.useOverlayTpl = function() {
      const id = g('tplOvId').value;
      window.closeOverlay();
      useTpl(id);
    };

    window.browseFromOverlay = function() {
      window.closeOverlay();
      showView('tpick');
    };

    // ── AI CAREER COACH (Groq) ───────────────────────────────────────────────
    async function groqCoach(type, context) {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify({ type, context }),
      });
      if (!res.ok) throw new Error('Coach unavailable');
      return res.json();
    }

    // ── SUMMARY COACH ────────────────────────────────────────────────────────
    let summaryCoachActive = false;
    let summaryDebounce = null;

    // ── PHOTO UPLOAD ──────────────────────────────────────────────────────────
    function initPhotoUpload() {
      const input = document.getElementById('photoFileInput');
      if (!input) return;
      // Use onchange (not addEventListener) so re-calling never stacks duplicates
      input.onchange = function() {
        const file = this.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast('Please select an image file', 'err'); return; }
        if (file.size > 3 * 1024 * 1024) { toast('Image must be under 3MB', 'err'); return; }
        const reader = new FileReader();
        reader.onload = function(e) {
          resumePhotoData = e.target.result;
          updatePhotoPreview();
          autoSaveDraft();
        };
        reader.readAsDataURL(file);
      };
    }
    function updatePhotoPreview() {
      const ring = document.getElementById('photoPreviewEl');
      const icon = document.getElementById('photoAvatarIcon');
      const removeBtn = document.getElementById('photoBtnRemove');
      if (!ring) return;
      if (resumePhotoData) {
        // Show photo — hide icon, show img inside ring
        ring.innerHTML = `<img src="${resumePhotoData}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        if (removeBtn) removeBtn.style.display = 'inline-flex';
      } else {
        // Restore default icon + camera badge
        ring.innerHTML = `<span class="photo-avatar-icon" id="photoAvatarIcon">🪪</span><div class="photo-avatar-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></div>`;
        if (removeBtn) removeBtn.style.display = 'none';
      }
    }
    function triggerPhotoUpload() {
      if (!PHOTO_SUPPORTED_TPLS.has(selTpl)) {
        // Show the modal — fill in current template name
        const tplObj = TPLS.find(t => t.id === selTpl);
        const nameEl = document.getElementById('pumTplName');
        if (nameEl && tplObj) nameEl.textContent = tplObj.name;
        document.getElementById('photoUnsupportedModal').classList.add('open');
        document.body.style.overflow = 'hidden';
        return;
      }
      document.getElementById('photoFileInput').click();
    }
    function removePhoto() {
      resumePhotoData = '';
      document.getElementById('photoFileInput').value = '';
      updatePhotoPreview();
      autoSaveDraft();
    }

    function onTitleInput() {
      clearTimeout(summaryDebounce);
      const title = g('bTitle').value.trim();
      if (!title) { hideSummaryCoach(); return; }
      summaryDebounce = setTimeout(() => triggerSummaryCoach(title), 900);
    }

    async function triggerSummaryCoach(title) {
      if (summaryCoachActive) return;
      summaryCoachActive = true;
      showSummaryCoachLoading(title);
      try {
        const data = await groqCoach('summary', { title });
        if (data.templates && data.templates.length) renderSummaryCoach(data.title || title, data.templates);
        else hideSummaryCoach();
      } catch(e) { hideSummaryCoach(); }
      summaryCoachActive = false;
    }

    function showSummaryCoachLoading(title) {
      const panel = g('summCoachPanel');
      panel.style.display = 'block';
      panel.innerHTML = `
        <div class="coach-hdr">
          <span class="coach-spark">${sparkIcon()}</span>
          <div><div class="coach-title">Generating summaries for <strong>${esc(title)}</strong></div>
          <div class="coach-sub">Your AI coach is thinking…</div></div>
        </div>
        <div class="coach-loading"><span class="ai-spin" style="font-size:18px;color:var(--p)">✦</span><span style="font-size:13px;color:var(--sub);margin-left:8px">Crafting summary structures…</span></div>`;
    }

    function renderSummaryCoach(title, templates) {
      const panel = g('summCoachPanel');
      panel.innerHTML = `
        <div class="coach-hdr">
          <span class="coach-spark">${sparkIcon()}</span>
          <div>
            <div class="coach-title">Suggested summaries for <strong class="hl">${esc(title)}</strong></div>
            <div class="coach-sub">Click one to insert — then make it yours ✏️</div>
          </div>
          <button class="coach-regen" onclick="regenSummaryCoach()" title="Regenerate">↺</button>
        </div>
        <div class="coach-items" id="coachItems">
          ${templates.map((t,i) => `
            <div class="coach-item${i===0?' coach-item-sel':''}" onclick="pickSummary(${i})" id="citem-${i}">
              <div class="coach-item-icon${i===0?' coach-item-icon-sel':''}" id="cico-${i}">
                ${i===0 ? checkIcon() : plusIcon()}
              </div>
              <div class="coach-item-text">${formatTemplate(t)}</div>
            </div>`).join('')}
        </div>`;
      g('summCoachPanel').style.display = 'block';
    }

    window.pickSummary = function(idx) {
      // Update visual selection
      document.querySelectorAll('.coach-item').forEach((el, i) => {
        el.classList.toggle('coach-item-sel', i === idx);
        const ico = document.getElementById('cico-' + i);
        if (ico) { ico.innerHTML = i === idx ? checkIcon() : plusIcon(); ico.classList.toggle('coach-item-icon-sel', i === idx); }
      });
      // Get raw text and insert into textarea
      const items = document.querySelectorAll('.coach-item-text');
      if (items[idx]) {
        const raw = items[idx].getAttribute('data-raw') || items[idx].innerText;
        g('bSumm').value = raw;
        autoSaveDraft();
        // Flash the textarea
        g('bSumm').style.borderColor = 'var(--p)';
        setTimeout(() => g('bSumm').style.borderColor = '', 1200);
      }
    };

    window.regenSummaryCoach = async function() {
      const title = g('bTitle').value.trim();
      if (!title) return;
      summaryCoachActive = false;
      await triggerSummaryCoach(title);
    };

    function hideSummaryCoach() {
      const p = g('summCoachPanel'); if (p) p.style.display = 'none';
    }

    function formatTemplate(t) {
      // Bold the [placeholder] parts
      const html = esc(t).replace(/\[([^\]]+)\]/g, '<strong>[$1]</strong>');
      return `<span data-raw="${esc(t)}">${html}</span>`;
    }

    // ── WORK DESCRIPTION COACH ───────────────────────────────────────────────
    async function triggerWorkCoach() {
      const pos  = g('wPos').value.trim();
      const comp = g('wComp').value.trim();
      if (!pos) { toast('Add a position first','err'); return; }
      const btn = g('workCoachBtn');
      btn.innerHTML = '<span class="ai-spin">✦</span> Thinking…';
      btn.disabled = true;
      try {
        const data = await groqCoach('workdesc', { position: pos, company: comp });
        if (data.bullets) renderWorkBullets(data.bullets);
      } catch(e) { toast('Coach unavailable — try again','err'); }
      btn.innerHTML = sparkIcon() + ' Suggest bullet points';
      btn.disabled = false;
    }
    window.triggerWorkCoach = triggerWorkCoach;

    function renderWorkBullets(bullets) {
      const panel = g('workBulletsPanel');
      panel.style.display = 'block';
      panel.innerHTML = `
        <div class="coach-mini-hdr">${sparkIcon()} <span>Click a bullet to add to description</span></div>
        ${bullets.map(b => `
          <div class="bullet-item" onclick="insertBullet(this,'${esc(b).replace(/'/g,"\\'")}')">
            <span class="bullet-plus">+</span>
            <span>${formatTemplate(b)}</span>
          </div>`).join('')}`;
    }

    window.insertBullet = function(el, bullet) {
      const curr = g('wDs').value.trim();
      g('wDs').value = curr ? curr + '\n• ' + bullet : '• ' + bullet;
      el.classList.add('bullet-used');
      el.querySelector('.bullet-plus').textContent = '✓';
    };

    // ── SKILLS COACH ─────────────────────────────────────────────────────────
    async function triggerSkillsCoach() {
      const title = g('bTitle').value.trim();
      const btn   = g('aiSkillBtn');
      if (!title) { toast('Add your job title in Step 1 first','err'); return; }
      btn.innerHTML = '<span class="ai-spin">✦</span> Thinking…';
      btn.disabled = true;
      try {
        const data = await groqCoach('skills', { title });
        if (data.skills) renderSkillChips(data.skills);
        else toast('Could not load skills','err');
      } catch(e) { toast('Coach unavailable — try again','err'); }
      btn.innerHTML = sparkIcon() + ' Suggest Skills with AI';
      btn.disabled = false;
    }
    window.triggerSkillsCoach = triggerSkillsCoach;

    function renderSkillChips(skills) {
      const panel = g('skillChipsPanel');
      panel.style.display = 'block';
      panel.innerHTML = `
        <div class="coach-mini-hdr">${sparkIcon()} <span>Tap to add skills to your resume</span></div>
        <div class="skill-chips">
          ${skills.map(s => `<span class="skill-chip" onclick="addChipSkill(this,'${esc(s).replace(/'/g,"\\'")}')">+ ${esc(s)}</span>`).join('')}
        </div>`;
    }

    window.addChipSkill = function(el, skill) {
      if (!sList.includes(skill)) { sList.push(skill); renderS(); autoSaveDraft(); }
      el.classList.add('chip-used');
      el.textContent = '✓ ' + skill;
    };

    // ── OLD WRAPPERS (kept for compat) ───────────────────────────────────────
    window.aiAssistSummary  = () => triggerSummaryCoach(g('bTitle').value.trim() || 'Professional');
    window.aiSuggestSkills  = triggerSkillsCoach;

    function sparkIcon(){ return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path fill="#7c3aed" d="M12 2.5l1.4 4.1 4.1 1.4-4.1 1.4L12 13.5l-1.4-4.1L6.5 8l4.1-1.4L12 2.5zm5 9l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"/></svg>'; }
    function checkIcon(){ return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#2563eb"/><path stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M7 12.5l3.5 3.5 6.5-7"/></svg>'; }
    function plusIcon() { return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke="#cbd5e1" stroke-width="2"/><path stroke="#94a3b8" stroke-width="2" stroke-linecap="round" d="M12 8v8M8 12h8"/></svg>'; }

    // ── AUTH ────────────────────────────────────────────────────────────────
    onAuthStateChanged(auth, async u => {
      if (!u) { window.location.href = '/login'; return; }

      // ── SECURITY: Scope ALL localStorage keys to this user's UID ────────────
      // This prevents any data leakage between accounts on shared devices.
      const prevUid = localStorage.getItem('kievora_active_uid');
      const currentUid = u.uid;

      if (prevUid && prevUid !== currentUid) {
        // Different user logged in — wipe the previous user's local data immediately
        const keysToWipe = Object.keys(localStorage).filter(k =>
          k.startsWith('kievora_') || k.startsWith('rsmkr_') || k.startsWith('rma_cache_') || k.startsWith('kieHistory_')
        );
        keysToWipe.forEach(k => localStorage.removeItem(k));
      }

      // Now scope keys to THIS user's uid
      KIE_LS_KEY     = `kievora_kie_history_${currentUid}`;
      KIE_IMG_LS_KEY = `kievora_kie_images_${currentUid}`;
      KIE_DOC_LS_KEY = `kievora_kie_docs_${currentUid}`;
      KIE_CONVID_LS_KEY = `kievora_kie_convid_${currentUid}`;
      DRAFTS_LS_KEY  = `kievora_drafts_${currentUid}`;

      // Record which uid is active so we can detect account switches
      localStorage.setItem('kievora_active_uid', currentUid);
      // Expose uid globally so the analysis cache patch (second script) can scope its keys
      window._currentUid = currentUid;
      window._currentUser = u;
      window.dispatchEvent(new CustomEvent('kievora-uid-ready', { detail: { uid: currentUid } }));

      usr = u;
      tok = await u.getIdToken();
      const displayName = u.displayName || u.email.split('@')[0];

      const init = (u.displayName || u.email)[0].toUpperCase();
      // (avatar now rendered in sidebar only — see msbAv sync below)

      // Sync sidebar profile
      const msbName  = document.getElementById('msbName');
      const msbEmail = document.getElementById('msbEmail');
      const msbAv    = document.getElementById('msbAv');
      if (msbName)  msbName.textContent  = displayName;
      if (msbEmail) msbEmail.textContent = u.email;
      if (msbAv) {
        if (u.photoURL) { msbAv.style.backgroundImage = `url(${u.photoURL})`; msbAv.style.backgroundSize = 'cover'; msbAv.style.backgroundPosition = 'center'; msbAv.textContent = ''; }
        else { msbAv.textContent = init; }
      }

      // ── Ensure onboarding category is cached locally (sync across pages) ──
      // If localStorage doesn't have it yet (e.g. set on a different device),
      // pull it from Firestore so the jobs swiper / KIE greeting can use it.
      try {
        if (!getUserCategory()) {
          const snap = await getDoc(doc(db,'users',currentUid));
          if (snap.exists() && snap.data().category) {
            const existing = {};
            try { Object.assign(existing, JSON.parse(localStorage.getItem(getUserCatKey()))||{}); } catch {}
            existing.category = snap.data().category;
            existing.ts = Date.now();
            localStorage.setItem(getUserCatKey(), JSON.stringify(existing));
          }
        }
      } catch(e) {}

      await loadPlanGates();
      await loadResumes();
      showView('home');
      if(typeof ensureGmailFreshAndAlert==='function') ensureGmailFreshAndAlert().then(()=>{ if(typeof maybeShowGmailOnboarding==='function') maybeShowGmailOnboarding(); }).catch(()=>{});
    });

    // ── API ──────────────────────────────────────────────────────────────────
    async function api(m, p, b) {
      tok = await usr.getIdToken();
      const r = await fetch(p, {
        method: m,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: b ? JSON.stringify(b) : undefined,
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error ' + r.status); }
      return r.json();
    }

    async function loadResumes() {
      try { resumes = await api('GET', '/api/resumes'); }
      catch (e) { toast(e.message, 'err'); resumes = []; }
      loadDrafts();
    }

    // ── DRAFTS (localStorage) ────────────────────────────────────────────────
    function loadDrafts(){
      try { drafts = JSON.parse(localStorage.getItem(DRAFTS_LS_KEY)||'[]') || []; }
      catch { drafts = []; }
    }
    function saveDrafts(){
      try { localStorage.setItem(DRAFTS_LS_KEY, JSON.stringify(drafts)); } catch {}
    }
    function getMergedResumes(){
      // Drafts first, then API resumes; sort by updatedAt desc
      const all = [
        ...drafts.map(d => ({ ...d, _isDraft: true })),
        ...resumes,
      ];
      return all.sort((a,b)=>{
        const ta = a._isDraft ? a.updatedAt : (a.updatedAt && a.updatedAt._seconds ? a.updatedAt._seconds*1000 : new Date(a.updatedAt||0).getTime());
        const tb = b._isDraft ? b.updatedAt : (b.updatedAt && b.updatedAt._seconds ? b.updatedAt._seconds*1000 : new Date(b.updatedAt||0).getTime());
        return (tb||0) - (ta||0);
      });
    }
    function upsertDraft(payload){
      if (!currentDraftId) return;
      const idx = drafts.findIndex(d => d.id === currentDraftId);
      const entry = { id: currentDraftId, ...payload, updatedAt: Date.now() };
      if (idx >= 0) drafts[idx] = entry; else drafts.push(entry);
      saveDrafts();
    }
    function removeDraft(id){
      drafts = drafts.filter(d => d.id !== id);
      saveDrafts();
    }
    function getBuilderPayload(){
      return {
        resumeName:   g('bRName').value.trim() || 'Untitled',
        templateType: selTpl,
        primaryColor: (TPLS.find(t => t.id === selTpl) || TPLS[0]).bg,
        fontFamily:   'sans',
        resumeData: {
          fullName: g('bFull').value.trim(), jobTitle: g('bTitle').value.trim(),
          email: g('bEmail').value.trim(),   phone: g('bPhone').value.trim(),
          location: g('bLoc').value.trim(),  summary: g('bSumm').value.trim(),
          photo: resumePhotoData || '',
          workExperience: wList.map(({ _id, ...r }) => r),
          education:      eList.map(({ _id, ...e }) => e),
          skills:         [...sList],
          certifications: certList.map(({ _id, ...c }) => c),
          projects:       projList.map(({ _id, ...p }) => p),
          languages:      langList.map(({ _id, ...l }) => l),
        },
      };
    }
    function autoSaveDraft(){
      if (!currentDraftId) return;
      const p = getBuilderPayload();
      const d = p.resumeData;
      const hasAny = d.fullName || d.jobTitle || d.email || d.summary || d.workExperience.length || d.education.length || d.skills.length;
      if (!hasAny && !drafts.find(x=>x.id===currentDraftId)) return; // nothing yet
      upsertDraft(p);
    }

    // ── VIEW SWITCH ──────────────────────────────────────────────────────────

    // Views that have their OWN inner header — don't inject iNav for these
    const NO_INAV = new Set([
      'kie','hub',
      'aibuild','careerhealth','roadmap','salary','industry',
      'linkedin','interview','branding','messaging','promotion',
      'jobmatch','resignation'
    ]);

    // iNav config for views that DO use it
    const VIEW_NAV = {
      allresumes:   { title: 'My Resumes',       back: 'home'   },
      quiz:         { title: 'Find Template',     back: 'home'   },
      tpick:        { title: 'Choose Template',   back: 'home'   },
      success:      { title: 'Resume Saved',      back: 'home'   },
      detail:       { title: 'Resume',            back: 'home'   },
      upload:       { title: 'Upload & Analyze',  back: 'home'   },
      analysis:     { title: 'Resume Analysis',   back: 'upload' },
      builder:      { title: 'Resume Builder',    back: () => window.editId ? 'home' : 'tpick' },
      coverletter:  { title: 'Cover Letter',      back: 'home'   },
    };

    function showView(v) {
      // Redirect hub to KIE — all tools live inside KIE welcome screen
      if (v === 'hub') { openKie(); return; }

      const ctoolViews = ['aibuild','careerhealth','roadmap','salary','industry','linkedin','interview','branding','messaging','promotion','jobmatch','resignation'];

      // Plan gate: block navigation into a locked AI tool entirely — never let
      // the view render so there's nothing to "peek" at without the tool running.
      if (ctoolViews.includes(v) && !isToolUnlocked(v)) {
        lockTapped('tool', v);
        return;
      }

      document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
      g('v-' + v).classList.add('active');
      window.scrollTo(0, 0);
      document.body.classList.toggle('kie-mode', v === 'kie');
      document.body.classList.toggle('ctool-mode', ctoolViews.includes(v));
      // Close the tools overlay if it's open
      const overlay = document.getElementById('moreToolsOverlay');
      if (overlay && ctoolViews.includes(v)) { overlay.style.display = 'none'; document.body.style.overflow = ''; }

      // ── Header switching ─────────────────────────────────────────────────────
      const mainHdr = document.querySelector('.hdr');
      const iNav    = g('iNav');
      const iTitle  = g('iNavTitle');
      const iBack   = g('iNavBack');

      if (v === 'home') {
        // Full dashboard header
        if (mainHdr) mainHdr.style.display = '';
        if (iNav)    iNav.classList.remove('active');
        document.body.classList.remove('i-nav-on');

      } else if (NO_INAV.has(v)) {
        // View has its own inner header — just hide main hdr, leave iNav off
        // (CSS via .kie-mode / .ctool-mode already handles some; inline style covers rest)
        if (mainHdr) mainHdr.style.display = 'none';
        if (iNav)    iNav.classList.remove('active');
        document.body.classList.remove('i-nav-on');

      } else {
        // Show the minimal Instagram-style inner nav
        if (mainHdr) mainHdr.style.display = 'none';
        if (iNav)    iNav.classList.add('active');
        document.body.classList.add('i-nav-on');

        const meta = VIEW_NAV[v] || { title: '', back: 'home' };
        if (iTitle) iTitle.textContent = meta.title || '';

        if (iBack) {
          iBack.onclick = () => {
            const dest = typeof meta.back === 'function' ? meta.back() : (meta.back || 'home');
            showView(dest);
          };
        }
      }

      if (v === 'home')  { renderHome(); renderArticleSwiper(); setTimeout(function(){ if (typeof renderJobsSwiper === 'function') renderJobsSwiper(); }, 100); }
      if (v === 'tpick') renderTpickScaled();
      if (v === 'allresumes') renderAllResumes();
      if (v === 'quiz')  { /* just show it */ }

      // Plus FAB only belongs on KIE / AI tool screens — hide it everywhere else (including dashboard home)
      const kieViews = new Set(['kie','aibuild','careerhealth','roadmap','salary','industry','linkedin','interview','branding','messaging','promotion']);
      if (!kieViews.has(v)) {
        if (typeof window.showPlusFab === 'function') window.showPlusFab(false);
      }
    }

    // ── HOME ─────────────────────────────────────────────────────────────────

    /* Real ATS score — 0..100 based on actual resume completeness factors */
    function computeATSScore(d) {
      let score = 0;
      // Contact info (22 pts)
      if (d.fullName)  score += 7;
      if (d.email)     score += 7;
      if (d.phone)     score += 4;
      if (d.location)  score += 2;
      if (d.jobTitle)  score += 2;
      // Professional summary (18 pts) — length matters for ATS
      if (d.summary && d.summary.length > 20)  score += 5;
      if (d.summary && d.summary.length > 80)  score += 7;
      if (d.summary && d.summary.length > 180) score += 6;
      // Work experience (30 pts) — each entry + descriptions
      const we = d.workExperience || [];
      if (we.length >= 1) score += 10;
      if (we.length >= 2) score += 7;
      if (we.length >= 3) score += 5;
      const withDesc = we.filter(w => w.description && w.description.length > 30).length;
      if (withDesc >= 1) score += 8;
      // Education (15 pts)
      const ed = d.education || [];
      if (ed.length >= 1) score += 10;
      if (ed.length >= 2) score += 5;
      // Skills (15 pts) — keywords are critical for ATS
      const sk = d.skills || [];
      if (sk.length >= 3)  score += 5;
      if (sk.length >= 7)  score += 5;
      if (sk.length >= 12) score += 5;
      return Math.min(100, score);
    }

    /* ATS score color based on tier */
    function atsColor(score) {
      if (score >= 80) return '#059669';
      if (score >= 55) return '#d97706';
      return '#dc2626';
    }

    /* Human-readable ATS status label */
    function atsStatusLabel(score) {
      if (score >= 80) return '✓ ATS Ready';
      if (score >= 55) return '⚡ Needs Work';
      return '⚠ Incomplete';
    }

    function renderHome() {
      const merged = getMergedResumes();
      const totalCount = merged.length;
      g('rCount').textContent = totalCount;
      const grid = g('rGrid');
      const dotsCont = g('rswipDots');

      if (!merged.length) {
        grid.innerHTML = `<div style="min-width:calc(100vw - 48px);max-width:340px;background:#fff;border-radius:18px;border:1.5px dashed rgba(124,58,237,.22);padding:20px 24px;display:flex;align-items:center;gap:16px;box-shadow:0 2px 12px rgba(124,58,237,.05)">
          <div style="flex-shrink:0;width:52px;height:60px;background:linear-gradient(140deg,#ede9fe,#ddd6fe);border-radius:10px;display:flex;align-items:center;justify-content:center;border:1.5px solid rgba(124,58,237,.15);overflow:hidden">
            <svg viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="36" height="40">
              <rect x="2" y="2" width="36" height="44" rx="5" fill="#f5f3ff" stroke="#c4b5fd" stroke-width="1.5"/>
              <rect x="6" y="10" width="18" height="2.5" rx="1.25" fill="#a78bfa"/>
              <rect x="6" y="15" width="28" height="2" rx="1" fill="#ddd6fe"/>
              <rect x="6" y="19.5" width="24" height="2" rx="1" fill="#ddd6fe"/>
              <rect x="6" y="26" width="12" height="2" rx="1" fill="#c4b5fd"/>
              <rect x="6" y="30.5" width="28" height="1.8" rx="0.9" fill="#ede9fe"/>
              <rect x="6" y="34.5" width="20" height="1.8" rx="0.9" fill="#ede9fe"/>
              <circle cx="32" cy="36" r="7" fill="#7c3aed"/>
              <path d="M29 36h6M32 33v6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <div style="flex:1;min-width:0;text-align:left">
            <div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:3px">No resumes yet</div>
            <div style="font-size:11px;color:var(--sub);line-height:1.5;margin-bottom:10px">Build your first resume in minutes and get hired faster.</div>
            <button onclick="showView('tpick')" style="display:inline-flex;align-items:center;gap:5px;padding:8px 14px;background:var(--g);color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 3px 12px rgba(124,58,237,.28)">
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              Create Resume
            </button>
          </div>
        </div>`;
        if (dotsCont) dotsCont.innerHTML = '';
        return;
      }

      const recent = merged.slice(0, 2);
      // Store ATS data globally for the drawer
      window._atsResumeData = {};

      grid.innerHTML = recent.map(r => {
        const t = TPLS.find(x => x.id === r.templateType) || TPLS[0];
        const d = r.resumeData || {};
        const isDraft = !!r._isDraft;
        const editAction = isDraft ? `openBuilder('${r.id}', true)` : `openBuilder('${r.id}')`;
        const openAction = isDraft ? editAction : `openDetail('${r.id}')`;
        const delAction  = isDraft ? `deleteDraft('${r.id}')` : `confirmDel('${r.id}')`;

        const score = isDraft ? null : computeATSScore(d);
        const sc = score !== null ? atsColor(score) : '#94a3b8';

        if (!isDraft && score !== null) {
          window._atsResumeData[r.id] = { score, d, name: r.resumeName };
        }

        // Small ATS score badge (the "Status" shown in Image 2)
        const atsBadge = isDraft
          ? `<span class="draft-badge">Draft</span>`
          : `<span class="rlist-ats-pill" style="background:${sc}18;color:${sc};border:1.5px solid ${sc}40"
               onclick="event.stopPropagation();openATSDrawer('${r.id}')"
               title="ATS Score — tap for details">
               ${score} ATS
             </span>`;

        return `<div class="rlist-card" onclick="${openAction}">
          <div class="rlist-thumb" style="background:linear-gradient(140deg,#ede9fe 0%,#ddd6fe 100%);border:1.5px solid rgba(124,58,237,.15)">
            <svg viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg" width="38" height="46">
              <rect x="1" y="1" width="38" height="50" rx="5" fill="#f5f3ff" stroke="#c4b5fd" stroke-width="1.2"/>
              <rect x="4" y="7" width="14" height="3" rx="1.5" fill="#7c3aed" opacity=".8"/>
              <rect x="4" y="12" width="32" height="1.8" rx=".9" fill="#a78bfa" opacity=".5"/>
              <rect x="4" y="16" width="26" height="1.8" rx=".9" fill="#c4b5fd" opacity=".6"/>
              <line x1="4" y1="21" x2="36" y2="21" stroke="#e9d5ff" stroke-width=".8"/>
              <rect x="4" y="24" width="10" height="1.8" rx=".9" fill="#7c3aed" opacity=".5"/>
              <rect x="4" y="28" width="32" height="1.5" rx=".75" fill="#ddd6fe"/>
              <rect x="4" y="31.5" width="28" height="1.5" rx=".75" fill="#ede9fe"/>
              <rect x="4" y="35" width="30" height="1.5" rx=".75" fill="#ddd6fe"/>
              <rect x="4" y="40" width="10" height="1.8" rx=".9" fill="#7c3aed" opacity=".5"/>
              <rect x="4" y="44" width="22" height="1.5" rx=".75" fill="#ede9fe"/>
            </svg>
          </div>
          <div class="rlist-info">
            <div class="rlist-name">${esc(r.resumeName)}</div>
            <div class="rlist-date">Updated ${fmtDate(r.updatedAt)}</div>
            <div class="rlist-score" style="margin-top:5px">${atsBadge}</div>
          </div>
          <div class="rlist-actions">
            <button class="rlist-btn rlist-btn-edit" onclick="event.stopPropagation();${editAction}" title="Edit">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button class="rlist-btn rlist-btn-del" onclick="event.stopPropagation();${delAction}" title="Delete">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16"/></svg>
            </button>
          </div>
        </div>`;
      }).join('');

      // Swiper dots
      if (dotsCont) {
        dotsCont.innerHTML = recent.map((_, i) =>
          `<button class="rswiper-dot${i===0?' active':''}" data-rswidx="${i}"></button>`
        ).join('');
        dotsCont.querySelectorAll('[data-rswidx]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = +btn.dataset.rswidx;
            const cards = Array.from(grid.children);
            if (!cards[idx]) return;
            const w = cards[idx].offsetWidth + 14;
            grid.scrollTo({ left: idx * w, behavior: 'smooth' });
          });
        });
        grid.addEventListener('scroll', () => {
          const cards = Array.from(grid.children);
          if (!cards.length) return;
          const idx = Math.round(grid.scrollLeft / (grid.scrollWidth / cards.length));
          dotsCont.querySelectorAll('.rswiper-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
        }, { passive: true });
      }
    }

    // ── ATS INFO DRAWER ──────────────────────────────────────────────────────
    window.openATSDrawer = function(resumeId) {
      if (!isFeatureUnlocked('atsExplanation')) {
        lockTapped('atsExplanation');
        return;
      }
      const info = (window._atsResumeData || {})[resumeId];
      if (!info) return;
      const { score, d, name } = info;
      const sc = atsColor(score);
      const R2 = 32, circ2 = +(2 * Math.PI * R2).toFixed(2);
      const off2 = +(circ2 - (score / 100) * circ2).toFixed(2);

      // Build breakdown items
      function chk(ok, label, pts, tip) {
        return `<div class="ats-check-item">
          <div class="ats-check-ico ${ok ? 'ats-ico-ok' : (pts > 0 ? 'ats-ico-warn' : 'ats-ico-bad')}">${ok ? '✓' : '✕'}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px;color:${ok?'#166534':'#374151'}">${label}</div>
            ${tip ? `<div style="font-size:11px;color:var(--sub);margin-top:2px">${tip}</div>` : ''}
          </div>
          <div class="ats-check-pts" style="color:${ok?'#059669':'#dc2626'}">${ok?'+'+pts:'0'}</div>
        </div>`;
      }

      const we = d.workExperience || [];
      const ed = d.education || [];
      const sk = d.skills || [];
      const hasSummaryLong = d.summary && d.summary.length > 80;
      const hasWorkDesc = we.some(w => w.description && w.description.length > 30);

      const breakdown = [
        chk(!!d.fullName, 'Full Name', 7, !d.fullName ? 'Add your full name to the resume' : null),
        chk(!!d.email, 'Email Address', 7, !d.email ? 'Contact info is critical for ATS' : null),
        chk(!!d.phone, 'Phone Number', 4, !d.phone ? 'Many ATS systems require a phone number' : null),
        chk(!!d.location, 'Location / City', 2, !d.location ? 'Add your city or country' : null),
        chk(!!d.jobTitle, 'Job Title / Role', 2, !d.jobTitle ? 'Your target role helps ATS match you' : null),
        chk(!!d.summary && d.summary.length > 20, 'Professional Summary', 5, !d.summary ? 'A strong summary boosts your score significantly' : null),
        chk(hasSummaryLong, 'Detailed Summary (80+ chars)', 13, !hasSummaryLong ? 'Expand your summary — aim for 2-3 sentences' : null),
        chk(we.length >= 1, 'Work Experience Entry', 10, we.length === 0 ? 'Add at least one job role' : null),
        chk(we.length >= 2, '2+ Work Experiences', 7, we.length < 2 ? 'Multiple roles show depth' : null),
        chk(hasWorkDesc, 'Job Descriptions', 8, !hasWorkDesc ? 'Add bullet points describing your responsibilities' : null),
        chk(ed.length >= 1, 'Education', 10, ed.length === 0 ? 'Add your highest qualification' : null),
        chk(sk.length >= 3, '3+ Skills Listed', 5, sk.length < 3 ? 'Skills are scanned heavily by ATS' : null),
        chk(sk.length >= 7, '7+ Skills Listed', 5, sk.length < 7 ? 'More relevant skills = more keyword matches' : null),
        chk(sk.length >= 12, '12+ Skills Listed', 5, sk.length < 12 ? 'Aim for industry-specific technical skills' : null),
      ].join('');

      const statusTitle = score >= 80 ? 'Strong Resume' : score >= 55 ? 'Decent Start' : 'Needs Attention';
      const statusDesc = score >= 80
        ? `Your resume is well-structured and will pass most ATS filters. Focus on tailoring skills to each job posting for best results.`
        : score >= 55
        ? `Your resume has a good foundation but is missing some key elements that ATS systems look for. Fix the items below to improve your score.`
        : `Your resume is missing several critical sections. ATS systems may reject it before a human ever sees it. Work through the checklist below.`;

      // Find the first missing high-impact thing
      const topTip = !d.summary ? 'Add a professional summary — it alone can add 18+ points to your score.'
        : we.length === 0 ? 'Add work experience — ATS systems heavily weight this section.'
        : !hasWorkDesc ? 'Add job descriptions — explain what you did in each role.'
        : sk.length < 7 ? `Add more skills — you have ${sk.length}, aim for 7+.`
        : ed.length === 0 ? 'Add your education background.'
        : 'Expand your summary for even better ATS matching.';

      const drawer = g('atsDrawer');
      drawer.querySelector('.ats-drawer-inner').innerHTML = `
        <div class="ats-drawer-hdr">
          <div class="ats-drawer-title">📊 Your ATS Score</div>
          <button class="ats-drawer-close" onclick="closeATSDrawer()">✕</button>
        </div>

        <div class="ats-drawer-score-row">
          <div class="ats-drawer-ring">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="${R2}" stroke="#ede9fe" stroke-width="6" fill="none"/>
              <circle cx="40" cy="40" r="${R2}" stroke="${sc}" stroke-width="6" fill="none"
                stroke-dasharray="${circ2}" stroke-dashoffset="${circ2}"
                stroke-linecap="round" transform="rotate(-90 40 40)"
                id="atsDrawerArc"
                style="transition:stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)"/>
            </svg>
            <div class="ats-drawer-ring-inner">
              <div class="ats-drawer-score-big" style="color:${sc}">${score}</div>
              <div class="ats-drawer-score-sub">/ 100</div>
            </div>
          </div>
          <div class="ats-drawer-score-info">
            <div class="ats-drawer-score-title" style="color:${sc}">${statusTitle}</div>
            <div class="ats-drawer-score-desc">${statusDesc}</div>
          </div>
        </div>

        <div class="ats-what-box">
          <div class="ats-what-title">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="var(--p)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 8v4m0 4h.01"/></svg>
            What is ATS?
          </div>
          <div class="ats-what-text">
            <strong>ATS (Applicant Tracking System)</strong> is software used by companies to automatically filter resumes before a human ever reads them. About 75% of resumes are rejected by ATS before reaching a recruiter.<br><br>
            Your ATS score shows how well your <strong>"${esc(name)}"</strong> resume is structured to pass these filters. Higher score = better chance of being seen.
          </div>
        </div>

        <div class="ats-breakdown-title">Score Breakdown</div>
        ${breakdown}

        ${score < 100 ? `<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:12px;padding:12px 14px;margin-top:14px;font-size:12px;color:#92400e;line-height:1.55">
          <strong>💡 Quick Win:</strong> ${topTip}
        </div>` : ''}

        <button class="ats-drawer-cta" onclick="closeATSDrawer();openBuilder('${resumeId}')">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          Improve This Resume
        </button>
      `;

      g('atsDrawerBd').classList.add('open');
      drawer.classList.add('open');
      document.body.style.overflow = 'hidden';

      // Animate drawer ring
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const arc = g('atsDrawerArc');
        if (arc) arc.style.strokeDashoffset = off2;
      }));
    };

    window.closeATSDrawer = function() {
      g('atsDrawerBd').classList.remove('open');
      g('atsDrawer').classList.remove('open');
      document.body.style.overflow = '';
    };

    // ── ARTICLE SWIPER ───────────────────────────────────────────────────────
    function initArtSwiper() {
      const track   = g('artTrack');
      const dotsWrap = g('artDots');
      if (!track || !dotsWrap) return;

      const cards = Array.from(track.children);
      const total = cards.length;
      if (!total) return;

      // Prevent re-init from stacking listeners
      if (track._swiperReady) return;
      track._swiperReady = true;

      // ── Build dots ──────────────────────────────────────────────────────────
      dotsWrap.innerHTML = cards.map((_, i) =>
        `<button class="art-dot${i===0?' active':''}" data-idx="${i}"></button>`
      ).join('');

      const dots = Array.from(dotsWrap.querySelectorAll('.art-dot'));

      function setActive(idx) {
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      }

      // Dot click → scroll to that card
      dotsWrap.addEventListener('click', e => {
        const btn = e.target.closest('[data-idx]');
        if (!btn) return;
        const idx = +btn.dataset.idx;
        const _w1 = cards[idx] ? cards[idx].offsetWidth + 14 : 0;
        track.scrollTo({ left: idx * _w1, behavior: 'smooth' });
      });

      // ── IntersectionObserver — update dots as cards snap ───────────────────
      const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActive(cards.indexOf(entry.target));
          }
        });
      }, { root: track, threshold: 0.6 });

      cards.forEach(c => io.observe(c));

      // ── Auto-advance ────────────────────────────────────────────────────────
      let cur = 0;
      let autoTimer = null;

      function advance() {
        cur = (cur + 1) % total;
        const _w2 = cards[cur] ? cards[cur].offsetWidth + 14 : 0;
        track.scrollTo({ left: cur * _w2, behavior: 'smooth' });
      }

      function startAuto() { autoTimer = setInterval(advance, 4500); }
      function stopAuto()  { clearInterval(autoTimer); }

      startAuto();

      // Pause while user is touching/dragging
      track.addEventListener('touchstart', stopAuto, { passive: true });
      track.addEventListener('mousedown',  stopAuto);
      track.addEventListener('touchend',   () => setTimeout(startAuto, 1500), { passive: true });
      track.addEventListener('mouseup',    () => setTimeout(startAuto, 1500));

      // Sync cur when user scrolls manually
      track.addEventListener('scroll', () => {
        const idx = Math.round(track.scrollLeft / (track.scrollWidth / total));
        cur = Math.max(0, Math.min(total - 1, idx));
      }, { passive: true });
    }
    window.initArtSwiper = initArtSwiper;

    // ── ALL RESUMES VIEW ─────────────────────────────────────────────────────
    function renderAllResumes(){
      const merged = getMergedResumes();
      const grid = g('allGrid');
      if (!merged.length){
        grid.innerHTML = `<div class="empty-state">
          <div style="font-size:56px;margin-bottom:16px">📄</div>
          <h3>No resumes yet</h3>
          <p>Start building your professional resume</p>
          <button class="btn btn-pri" onclick="showView('tpick')" style="padding:12px 28px;font-size:15px">+ Create Resume</button>
        </div>`;
        return;
      }
      grid.innerHTML = merged.map(r => {
        const t = TPLS.find(x => x.id === r.templateType) || TPLS[0];
        const d = r.resumeData || {};
        const isDraft = !!r._isDraft;
        const editAction = isDraft ? `openBuilder('${r.id}', true)` : `openBuilder('${r.id}')`;
        const openAction = isDraft ? editAction : `openDetail('${r.id}')`;
        return `<div class="rcard" onclick="${openAction}">
          <div class="rcard-thumb" style="background:${t.bg}18">
            <div class="rcard-thumb-scaler">${buildPrevHTML(d, t.id, t.bg, 'rf-sans')}</div>
          </div>
          <div class="rcard-body">
            <div class="rcard-name">${esc(r.resumeName)}${isDraft?'<span class="draft-badge">Draft</span>':''}</div>
            <div class="rcard-role">${esc(d.jobTitle || 'No job title')}</div>
            <div class="rcard-date">Modified ${fmtDate(r.updatedAt)}</div>
          </div>
          <button class="rcard-more" onclick="event.stopPropagation();openResumeSheet('${r.id}',${isDraft})" title="More options">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
          </button>
        </div>`;
      }).join('') + `
        <div class="add-card" onclick="showView('tpick')">
          <div class="add-card-ico">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
          </div>
          <div class="add-card-text">
            <p>Create another resume</p>
            <span>Tailor a new version for your next application</span>
          </div>
        </div>`;
      requestAnimationFrame(scaleRcardThumbs);
    }
    function scaleRcardThumbs() { /* thumb scale is fixed via CSS now — kept as a no-op for any external callers */ }

    // ── Resume card action sheet (Edit / Download / Delete) ────────────────────
    // Replaces the old 3-button footer, which overflowed on narrow screens.
    function openResumeSheet(id, isDraft) {
      const merged = getMergedResumes();
      const r = merged.find(x => x.id === id);
      if (!r) return;
      const d = r.resumeData || {};
      let overlay = g('rsheetOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'rsheetOverlay';
        overlay.className = 'rsheet-overlay';
        overlay.innerHTML = `<div class="rsheet">
          <div class="rsheet-handle"></div>
          <div class="rsheet-hdr">
            <div style="min-width:0">
              <div class="rsheet-hdr-name" id="rsheetName"></div>
              <div class="rsheet-hdr-role" id="rsheetRole"></div>
            </div>
          </div>
          <div class="rsheet-item" id="rsheetEdit">
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Edit
          </div>
          <div class="rsheet-item" id="rsheetDl">
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Download
          </div>
          <div class="rsheet-item rsheet-danger" id="rsheetDel">
            <svg width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16"/></svg>
            Delete
          </div>
          <button class="rsheet-cancel" id="rsheetCancel">Cancel</button>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeResumeSheet(); });
        g('rsheetCancel').onclick = closeResumeSheet;
      }
      g('rsheetName').textContent = r.resumeName;
      g('rsheetRole').textContent = d.jobTitle || 'No job title';

      const editAction = isDraft ? () => openBuilder(id, true) : () => openBuilder(id);
      const dlBtn = g('rsheetDl');
      dlBtn.classList.toggle('rsheet-disabled', isDraft);
      g('rsheetEdit').onclick = () => { closeResumeSheet(); editAction(); };
      dlBtn.onclick = isDraft
        ? () => toast('Finish & save this draft to download', 'err')
        : () => { closeResumeSheet(); dlResume(id); };
      g('rsheetDel').onclick = () => { closeResumeSheet(); isDraft ? deleteDraft(id) : confirmDel(id); };

      overlay.classList.add('show');
    }
    function closeResumeSheet() { g('rsheetOverlay')?.classList.remove('show'); }
    window.openResumeSheet = openResumeSheet;
    window.closeResumeSheet = closeResumeSheet;
    window.renderAllResumes = renderAllResumes;
    window.deleteDraft = function(id){
      removeDraft(id);
      toast('Draft deleted');
      const cur = document.querySelector('.view.active');
      if (cur && cur.id === 'v-allresumes') renderAllResumes();
      else renderHome();
    }

    function renderMiniCard(d, c) {
      return `<div style="font-size:8px;padding:14px;width:100%;height:100%;overflow:hidden;background:#fff;line-height:1.5">
        <div style="border-bottom:2.5px solid ${c};padding-bottom:8px;margin-bottom:8px">
          <div style="font-size:11px;font-weight:800;color:${c};letter-spacing:-.2px">${esc(d.fullName || 'Your Name')}</div>
          <div style="color:#666;font-size:8px;margin-top:2px;font-weight:500">${esc(d.jobTitle || '')}</div>
        </div>
        ${(d.workExperience || []).slice(0, 2).map(w => `<div style="margin-bottom:6px"><div style="font-weight:700;color:#333;font-size:8px">${esc(w.position)}</div><div style="color:#999;font-size:7px">${esc(w.company)}</div></div>`).join('')}
        ${(d.skills || []).slice(0, 5).length ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${(d.skills || []).slice(0, 5).map(s => `<span style="background:${c}15;color:${c};padding:2px 6px;border-radius:99px;font-size:7px;font-weight:600">${esc(s)}</span>`).join('')}</div>` : ''}
      </div>`;
    }

    // ── TEMPLATE PICKER ──────────────────────────────────────────────────────
    function renderTpick() {
      const sample = {
        fullName:'Alex Johnson', jobTitle:'Product Manager',
        email:'alex@mail.com', phone:'+234 801 234 5678', location:'Lagos, NG',
        summary:'Experienced professional with 5+ years building impactful products and leading cross-functional teams to deliver measurable results.',
        workExperience:[
          {position:'Senior Product Manager',company:'TechCorp Nigeria',startDate:'Jan 2021',endDate:'Present',description:'Led cross-functional teams to deliver 3 major product launches, driving 40% user growth.'},
          {position:'Product Manager',company:'StartHub Ltd',startDate:'Mar 2018',endDate:'Dec 2020',description:'Managed roadmap and stakeholder communications for a B2B SaaS platform.'},
        ],
        education:[{degree:'B.Sc',field:'Computer Science',school:'University of Lagos',graduationDate:'2018'}],
        skills:['Strategy','Leadership','Design Thinking','Analytics','Agile','SQL'],
      };
      g('tgrid').innerHTML = TPLS.map(t => {
        const isPrimary   = quizRec.primary   === t.id;
        const isSecondary = quizRec.secondary === t.id;
        const locked = !isTemplateUnlocked(t.id);
        const badge = locked
          ? `<div class="premium-lock-corner">🔒 Premium</div>`
          : isPrimary
          ? `<div class="rec-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.4 4.1 4.1 1.4-4.1 1.4L12 13.5l-1.4-4.1L6.5 8l4.1-1.4L12 2.5z"/></svg>Recommended</div>`
          : isSecondary
          ? `<div class="rec-badge" style="background:#0f766e">Also Great</div>`
          : '';
        return `<div class="tcard${selTpl===t.id?' sel':''}${locked?' tcard-locked':''}" onclick="pickTpl('${t.id}')">
          <div class="tcard-thumb" id="tthumb-${t.id}">
            <div class="tpl-scaler">${buildPrevHTML(sample, t.id, t.bg, 'rf-sans')}</div>
            ${badge}
            <button class="tcard-use" onclick="event.stopPropagation();useTpl('${t.id}')">${locked ? 'Unlock →' : 'Use Template →'}</button>
          </div>
          <div class="tcard-foot">
            <span class="tcard-name">${t.name}</span>
            <span class="tcard-tag">${t.tag}</span>
          </div>
        </div>`;
      }).join('');
    }

    function scaleTplThumbs() {
      document.querySelectorAll('.tcard-thumb').forEach(thumb => {
        const scaler = thumb.querySelector('.tpl-scaler');
        if (!scaler) return;
        const cardW = thumb.offsetWidth || thumb.parentElement.offsetWidth || 320;
        const scale = cardW / 600;
        scaler.style.transform = 'scale(' + scale + ')';
        thumb.style.height = Math.round(scale * 720) + 'px';
      });
    }
    function renderTpickScaled() { renderTpick(); requestAnimationFrame(scaleTplThumbs); }

    window.pickTpl = id => {
      if (!isTemplateUnlocked(id)) { lockTapped('templates'); return; }
      selTpl = id;
      document.querySelectorAll('.tcard').forEach((c, i) => c.classList.toggle('sel', TPLS[i].id === id));
    };

    window.useTpl = id => {
      if (!isTemplateUnlocked(id)) { lockTapped('templates'); return; }
      selTpl = id;
      if (window._prebuiltResume) {
        // AI-generated resume — fill builder with the AI data, then clear
        openBuilder(null);
        setTimeout(() => {
          fillForm({ resumeData: window._prebuiltResume, resumeName: window._prebuiltResume.fullName + ' Resume' });
          window._prebuiltResume = null;
        }, 80);
      } else {
        openBuilder(null);
      }
    };

    // ── BUILDER ──────────────────────────────────────────────────────────────
    async function openBuilder(id, isDraft) {
      resetForm();
      currentDraftId = null;
      editId = null;
      if (id && isDraft) {
        // Editing an existing draft
        const d = drafts.find(x => x.id === id);
        if (d) { fillForm(d); currentDraftId = id; }
      } else if (id) {
        try { const r = await api('GET', '/api/resumes/' + id); fillForm(r); editId = id; }
        catch (e) { toast(e.message, 'err'); return; }
      } else {
        // Brand-new resume → create a draft id
        currentDraftId = 'draft_' + Date.now();
        // Prefill from Gmail Pipeline's "Tailor resume" hook, if the user arrived
        // here via that button. One-time use — cleared immediately after reading.
        try {
          const gpipeTarget = sessionStorage.getItem('gpipeResumeTarget');
          if (gpipeTarget) {
            const { company, role } = JSON.parse(gpipeTarget);
            if (role)    g('bTitle').value = role;
            if (company) g('bRName').value = `Resume — ${company}`;
            sessionStorage.removeItem('gpipeResumeTarget');
          }
        } catch(e) {}
      }
      builderStep = 1;
      renderStep();
      showView('builder');
      // Re-bind photo input every time builder opens (element freshly visible)
      initPhotoUpload();
      updatePhotoPreview();
    }

    function resetForm() {
      g('bRName').value = 'Untitled Resume';
      ['bFull','bTitle','bEmail','bPhone','bLoc','bSumm'].forEach(i => g(i).value = '');
      wList = []; eList = []; sList = [];
      editingWId = editingEId = editingCrtId = editingPrjId = editingLngId = null;
      certList = []; projList = []; langList = [];
      resumePhotoData = '';
      updatePhotoPreview();
      renderW(); renderE(); renderS(); renderCert(); renderProj(); renderLang();
      // Reset coach panels
      summaryCoachActive = false; clearTimeout(summaryDebounce);
      ['summCoachPanel','workBulletsPanel','skillChipsPanel'].forEach(id => { const p=g(id); if(p) p.style.display='none'; });
    }

    function fillForm(r) {
      const d = r.resumeData || {};
      g('bRName').value = r.resumeName  || '';
      g('bFull').value  = d.fullName    || '';
      g('bTitle').value = d.jobTitle    || '';
      g('bEmail').value = d.email       || '';      g('bPhone').value = d.phone       || '';
      g('bLoc').value   = d.location    || '';
      g('bSumm').value  = d.summary     || '';
      resumePhotoData   = d.photo       || '';
      updatePhotoPreview();
      // Support both templateType (saved resumes) and templateSuggestion (AI-generated)
      selTpl = r.templateType || d.templateSuggestion || 'classic';
      wList  = (d.workExperience || []).map((w, i) => ({ ...w, _id: i }));
      eList  = (d.education      || []).map((e, i) => ({ ...e, _id: i }));
      sList  = [...(d.skills     || [])];
      certList = (d.certifications || []).map((c, i) => ({ ...c, _id: i }));
      projList = (d.projects      || []).map((p, i) => ({ ...p, _id: i }));
      langList = (d.languages     || []).map((l, i) => ({ ...l, _id: i }));
      renderW(); renderE(); renderS(); renderCert(); renderProj(); renderLang();
    }

    function renderStep() {
      // Steps track
      const steps = [1, 2, 3];
      steps.forEach(s => {
        const el = g('stp' + s);
        el.className = 'stp ' + (s < builderStep ? 'stp-done' : s === builderStep ? 'stp-cur' : 'stp-idle');
      });
      g('stpL1').className = 'stp-line' + (builderStep > 1 ? ' done' : '');
      g('stpL2').className = 'stp-line' + (builderStep > 2 ? ' done' : '');
      // Show correct panel
      [1, 2, 3].forEach(s => {
        g('step' + s).classList.toggle('active', s === builderStep);
      });
      // Nav buttons
      g('btnPrev').style.display = builderStep === 1 ? 'none' : 'inline-flex';
      if (builderStep < 3) {
        g('btnNext').style.display = 'inline-flex';
        g('btnNext').textContent   = 'Next →';
        g('bSvBtn').style.display  = 'none';
      } else {
        g('btnNext').style.display = 'none';
        g('bSvBtn').style.display  = 'inline-flex';
      }
    }

    // ── Highlight a required field and shake it ────────────────────────────────
    function shakeField(el) {
      if (!el) return;
      el.style.borderColor = '#e11d48';
      el.style.boxShadow   = '0 0 0 3px rgba(225,29,72,.15)';
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ], { duration: 320, easing: 'ease-out' });
      // Reset border after 2 s
      setTimeout(() => {
        el.style.borderColor = '';
        el.style.boxShadow   = '';
      }, 2000);
    }

    window.nextStep = () => {
      // ── Step 1 → 2: require Full Name & Job Title ──────────────────────────
      if (builderStep === 1) {
        const fullEl  = g('bFull');
        const titleEl = g('bTitle');
        if (!fullEl.value.trim()) {
          toast('Please enter your full name to continue', 'err');
          shakeField(fullEl);
          return;
        }
        if (!titleEl.value.trim()) {
          toast('Please enter your job title to continue', 'err');
          shakeField(titleEl);
          return;
        }
      }
      // ── Step 2 → 3: require at least 1 work experience OR 1 education ──────
      if (builderStep === 2) {
        if (wList.length === 0 && eList.length === 0) {
          toast('Add at least one work experience or education entry', 'err');
          // Scroll to the work section
          const wPosEl = g('wPos');
          if (wPosEl) { wPosEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); wPosEl.focus(); }
          return;
        }
      }
      if (builderStep < 3) { builderStep++; renderStep(); window.scrollTo(0, 0); }
    };
    window.prevStep = () => { if (builderStep > 1) { builderStep--; renderStep(); window.scrollTo(0,0); } };

    // ── Shared helper: flips a section's "+ Add …" button into "✓ Save
    // changes" (and shows a Cancel link) while an existing entry is loaded
    // into that section's form for editing.
    function setFormEditUI(btnId, cancelId, editing, addLabel) {
      const btn = g(btnId), cancel = g(cancelId);
      if (btn) btn.textContent = editing ? '✓ Save Changes' : addLabel;
      if (btn) btn.classList.toggle('editing', editing);
      if (cancel) cancel.style.display = editing ? 'inline-block' : 'none';
    }

    // Work / Edu / Skills render
    function renderW() {
      g('wCont').innerHTML = wList.length === 0
        ? '<p style="font-size:12px;color:#a78bfa;font-style:italic">No work experience added yet.</p>'
        : wList.map(w => `<div class="ec${w._id===editingWId?' editing':''}" onclick="editW(${w._id})"><div class="ec-top"><div><div class="ec-name">${esc(w.position)} @ ${esc(w.company)}</div><div class="ec-sub">${esc(w.startDate)}–${esc(w.endDate || 'Present')}</div></div><button class="ec-rm" onclick="event.stopPropagation();rmW(${w._id})">✕</button></div>${w.description ? `<div style="font-size:11px;color:#64748b;margin-top:4px">${esc(w.description)}</div>` : ''}<div class="ec-edit-hint">Tap to edit</div></div>`).join('');
    }
    window.editW = id => {
      const w = wList.find(x => x._id === id); if (!w) return;
      g('wPos').value = w.position || ''; g('wComp').value = w.company || '';
      g('wSt').value = w.startDate || ''; g('wEn').value = w.endDate || ''; g('wDs').value = w.description || '';
      editingWId = id; renderW();
      setFormEditUI('bAddW', 'cancelW', true, '+ Add Work Experience');
      g('wPos').scrollIntoView({ behavior: 'smooth', block: 'center' }); g('wPos').focus();
    };
    window.cancelEditW = () => {
      editingWId = null;
      ['wPos','wComp','wSt','wEn','wDs'].forEach(id => g(id).value = '');
      renderW(); setFormEditUI('bAddW', 'cancelW', false, '+ Add Work Experience');
    };
    function renderE() {
      g('eCont').innerHTML = eList.length === 0
        ? '<p style="font-size:12px;color:#a78bfa;font-style:italic">No education added yet.</p>'
        : eList.map(e => `<div class="ec${e._id===editingEId?' editing':''}" onclick="editE(${e._id})"><div class="ec-top"><div><div class="ec-name">${esc(e.degree)} in ${esc(e.field)}</div><div class="ec-sub">${esc(e.school)} · ${esc(e.graduationDate)}</div></div><button class="ec-rm" onclick="event.stopPropagation();rmE(${e._id})">✕</button></div><div class="ec-edit-hint">Tap to edit</div></div>`).join('');
    }
    window.editE = id => {
      const e = eList.find(x => x._id === id); if (!e) return;
      g('eSchl').value = e.school || ''; g('eDeg').value = e.degree || '';
      g('eFld').value = e.field || ''; g('eGrd').value = e.graduationDate || '';
      editingEId = id; renderE();
      setFormEditUI('bAddE', 'cancelE', true, '+ Add Education');
      g('eSchl').scrollIntoView({ behavior: 'smooth', block: 'center' }); g('eSchl').focus();
    };
    window.cancelEditE = () => {
      editingEId = null;
      ['eSchl','eDeg','eFld','eGrd'].forEach(id => g(id).value = '');
      renderE(); setFormEditUI('bAddE', 'cancelE', false, '+ Add Education');
    };
    function renderS() {
      g('sCont').innerHTML = sList.length === 0
        ? '<p style="font-size:12px;color:#a78bfa;font-style:italic;margin-bottom:8px">No skills added yet.</p>'
        : `<div class="spills">${sList.map((s, i) => `<span class="spill">${esc(s)}<button onclick="rmS(${i})">✕</button></span>`).join('')}</div>`;
    }
    window.rmW = id => { wList = wList.filter(w => w._id !== id); if (editingWId === id) window.cancelEditW(); renderW(); autoSaveDraft(); };
    window.rmE = id => { eList = eList.filter(e => e._id !== id); if (editingEId === id) window.cancelEditE(); renderE(); autoSaveDraft(); };
    window.rmS = i  => { sList.splice(i, 1); renderS(); autoSaveDraft(); };
    window.rmCert = id => { certList = certList.filter(c => c._id !== id); if (editingCrtId === id) window.cancelEditCert(); renderCert(); autoSaveDraft(); };
    window.rmProj = id => { projList = projList.filter(p => p._id !== id); if (editingPrjId === id) window.cancelEditProj(); renderProj(); autoSaveDraft(); };
    window.rmLang = id => { langList = langList.filter(l => l._id !== id); if (editingLngId === id) window.cancelEditLang(); renderLang(); autoSaveDraft(); };

    function renderCert() {
      const el = g('certCont'); if (!el) return;
      el.innerHTML = certList.length === 0
        ? '<p style="font-size:12px;color:#a78bfa;font-style:italic">No certifications added yet.</p>'
        : certList.map(c => `<div class="ec${c._id===editingCrtId?' editing':''}" onclick="editCert(${c._id})"><div class="ec-top"><div><div class="ec-name">${esc(c.name)}</div><div class="ec-sub">${esc(c.issuer || '')}${c.date ? ' · ' + esc(c.date) : ''}</div></div><button class="ec-rm" onclick="event.stopPropagation();rmCert(${c._id})">✕</button></div><div class="ec-edit-hint">Tap to edit</div></div>`).join('');
    }
    window.editCert = id => {
      const c = certList.find(x => x._id === id); if (!c) return;
      g('crtName').value = c.name || ''; if (g('crtIssuer')) g('crtIssuer').value = c.issuer || ''; if (g('crtDate')) g('crtDate').value = c.date || '';
      editingCrtId = id; renderCert();
      setFormEditUI('bAddCrt', 'cancelCrt', true, '+ Add Certification');
      g('crtName').scrollIntoView({ behavior: 'smooth', block: 'center' }); g('crtName').focus();
    };
    window.cancelEditCert = () => {
      editingCrtId = null;
      ['crtName','crtIssuer','crtDate'].forEach(id => { const el = g(id); if (el) el.value = ''; });
      renderCert(); setFormEditUI('bAddCrt', 'cancelCrt', false, '+ Add Certification');
    };
    function renderProj() {
      const el = g('projCont'); if (!el) return;
      el.innerHTML = projList.length === 0
        ? '<p style="font-size:12px;color:#a78bfa;font-style:italic">No projects added yet.</p>'
        : projList.map(p => `<div class="ec${p._id===editingPrjId?' editing':''}" onclick="editProj(${p._id})"><div class="ec-top"><div><div class="ec-name">${esc(p.name)}</div>${p.url ? `<div class="ec-sub">${esc(p.url)}</div>` : ''}</div><button class="ec-rm" onclick="event.stopPropagation();rmProj(${p._id})">✕</button></div>${p.description ? `<div style="font-size:11px;color:#64748b;margin-top:4px">${esc(p.description)}</div>` : ''}<div class="ec-edit-hint">Tap to edit</div></div>`).join('');
    }
    window.editProj = id => {
      const p = projList.find(x => x._id === id); if (!p) return;
      g('prjName').value = p.name || ''; if (g('prjDesc')) g('prjDesc').value = p.description || ''; if (g('prjUrl')) g('prjUrl').value = p.url || '';
      editingPrjId = id; renderProj();
      setFormEditUI('bAddPrj', 'cancelPrj', true, '+ Add Project');
      g('prjName').scrollIntoView({ behavior: 'smooth', block: 'center' }); g('prjName').focus();
    };
    window.cancelEditProj = () => {
      editingPrjId = null;
      ['prjName','prjDesc','prjUrl'].forEach(id => { const el = g(id); if (el) el.value = ''; });
      renderProj(); setFormEditUI('bAddPrj', 'cancelPrj', false, '+ Add Project');
    };
    function renderLang() {
      const el = g('langCont'); if (!el) return;
      el.innerHTML = langList.length === 0
        ? '<p style="font-size:12px;color:#a78bfa;font-style:italic">No languages added yet.</p>'
        : langList.map(l => `<div class="ec${l._id===editingLngId?' editing':''}" onclick="editLang(${l._id})"><div class="ec-top"><div><div class="ec-name">${esc(l.language)}</div><div class="ec-sub">${esc(l.proficiency)}</div></div><button class="ec-rm" onclick="event.stopPropagation();rmLang(${l._id})">✕</button></div><div class="ec-edit-hint">Tap to edit</div></div>`).join('');
    }
    window.editLang = id => {
      const l = langList.find(x => x._id === id); if (!l) return;
      g('lngLang').value = l.language || ''; if (g('lngProf')) g('lngProf').value = l.proficiency || 'Fluent';
      editingLngId = id; renderLang();
      setFormEditUI('bAddLng', 'cancelLng', true, '+ Add Language');
      g('lngLang').scrollIntoView({ behavior: 'smooth', block: 'center' }); g('lngLang').focus();
    };
    window.cancelEditLang = () => {
      editingLngId = null;
      const el = g('lngLang'); if (el) el.value = '';
      renderLang(); setFormEditUI('bAddLng', 'cancelLng', false, '+ Add Language');
    };

    function addCert() {
      const n = g('crtName')?.value.trim(), s = g('crtIssuer')?.value.trim();
      if (!n) { toast('Certification name is required', 'err'); return; }
      const entry = { name: n, issuer: s || '', date: g('crtDate')?.value.trim() || '' };
      if (editingCrtId !== null) {
        const idx = certList.findIndex(c => c._id === editingCrtId);
        if (idx > -1) certList[idx] = { ...certList[idx], ...entry };
        toast('Certification updated', 'ok');
      } else {
        certList.push({ _id: Date.now(), ...entry });
      }
      editingCrtId = null;
      ['crtName','crtIssuer','crtDate'].forEach(id => { const el = g(id); if(el) el.value = ''; });
      setFormEditUI('bAddCrt', 'cancelCrt', false, '+ Add Certification');
      renderCert(); autoSaveDraft();
    }
    function addProj() {
      const n = g('prjName')?.value.trim();
      if (!n) { toast('Project name is required', 'err'); return; }
      const entry = { name: n, description: g('prjDesc')?.value.trim() || '', url: g('prjUrl')?.value.trim() || '' };
      if (editingPrjId !== null) {
        const idx = projList.findIndex(p => p._id === editingPrjId);
        if (idx > -1) projList[idx] = { ...projList[idx], ...entry };
        toast('Project updated', 'ok');
      } else {
        projList.push({ _id: Date.now(), ...entry });
      }
      editingPrjId = null;
      ['prjName','prjDesc','prjUrl'].forEach(id => { const el = g(id); if(el) el.value = ''; });
      setFormEditUI('bAddPrj', 'cancelPrj', false, '+ Add Project');
      renderProj(); autoSaveDraft();
    }
    function addLang() {
      const l = g('lngLang')?.value.trim();
      if (!l) { toast('Language is required', 'err'); return; }
      const entry = { language: l, proficiency: g('lngProf')?.value || 'Fluent' };
      if (editingLngId !== null) {
        const idx = langList.findIndex(x => x._id === editingLngId);
        if (idx > -1) langList[idx] = { ...langList[idx], ...entry };
        toast('Language updated', 'ok');
      } else {
        langList.push({ _id: Date.now(), ...entry });
      }
      editingLngId = null;
      const el = g('lngLang'); if(el) el.value = '';
      setFormEditUI('bAddLng', 'cancelLng', false, '+ Add Language');
      renderLang(); autoSaveDraft();
    }
    window.addCert = addCert; window.addProj = addProj; window.addLang = addLang;
    window.toggleOptSection = function(id) {
      const body = g(id + 'Body'); if (!body) return;
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open', !isOpen);
      const arrow = g(id + 'Arrow'); if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
    };

    function addW() {
      const p = g('wPos').value.trim(), c = g('wComp').value.trim();
      if (!p || !c) { toast('Position and company are required', 'err'); return; }
      const entry = { position: p, company: c, startDate: g('wSt').value.trim(), endDate: g('wEn').value.trim(), description: g('wDs').value.trim() };
      if (editingWId !== null) {
        const idx = wList.findIndex(w => w._id === editingWId);
        if (idx > -1) wList[idx] = { ...wList[idx], ...entry };
        toast('Work experience updated', 'ok');
      } else {
        wList.push({ _id: Date.now(), ...entry });
      }
      editingWId = null;
      ['wPos','wComp','wSt','wEn','wDs'].forEach(id => g(id).value = '');
      setFormEditUI('bAddW', 'cancelW', false, '+ Add Work Experience');
      renderW();
      autoSaveDraft();
    }
    function addE() {
      const s = g('eSchl').value.trim(), d = g('eDeg').value.trim();
      if (!s || !d) { toast('School and degree are required', 'err'); return; }
      const entry = { school: s, degree: d, field: g('eFld').value.trim(), graduationDate: g('eGrd').value.trim() };
      if (editingEId !== null) {
        const idx = eList.findIndex(e => e._id === editingEId);
        if (idx > -1) eList[idx] = { ...eList[idx], ...entry };
        toast('Education updated', 'ok');
      } else {
        eList.push({ _id: Date.now(), ...entry });
      }
      editingEId = null;
      ['eSchl','eDeg','eFld','eGrd'].forEach(id => g(id).value = '');
      setFormEditUI('bAddE', 'cancelE', false, '+ Add Education');
      renderE();
      autoSaveDraft();
    }
    function addS() {
      const v = g('sInp').value.trim(); if (!v) return;
      sList.push(v); g('sInp').value = ''; renderS();
      autoSaveDraft();
    }
    window.addW = addW; window.addE = addE; window.addS = addS;

    // Save
    async function saveResume() {
      // ── Validate before saving so the PDF is never empty ──────────────────
      const fullName = g('bFull').value.trim();
      const jobTitle = g('bTitle').value.trim();
      if (!fullName) {
        toast('Full name is required before saving', 'err');
        shakeField(g('bFull'));
        // Jump back to step 1 so the user can see what's missing
        builderStep = 1; renderStep(); window.scrollTo(0, 0);
        return;
      }
      if (!jobTitle) {
        toast('Job title is required before saving', 'err');
        shakeField(g('bTitle'));
        builderStep = 1; renderStep(); window.scrollTo(0, 0);
        return;
      }
      if (wList.length === 0 && eList.length === 0 && sList.length === 0) {
        toast('Add at least one work experience, education, or skill before saving', 'err');
        builderStep = 2; renderStep(); window.scrollTo(0, 0);
        return;
      }
      // ── Resume name should never be blank ─────────────────────────────────
      const rNameEl = g('bRName');
      if (!rNameEl.value.trim()) rNameEl.value = fullName + ' Resume';

      const btn = g('bSvBtn'); btn.disabled = true; btn.textContent = 'Saving…';
      const payload = getBuilderPayload();
      try {
        if (editId) {
          const u = await api('PUT', '/api/resumes/' + editId, payload);
          resumes = resumes.map(r => r.id === editId ? { id: editId, ...u } : r);
        } else {
          const c = await api('POST', '/api/resumes', payload);
          resumes.unshift(c); editId = c.id;
        }
        // Clear draft now that it's officially saved
        if (currentDraftId) { removeDraft(currentDraftId); currentDraftId = null; }
        g('sRName').textContent = payload.resumeName;
        toast('Resume saved! 🎉');
        // Populate ATS score on success screen
        try {
          const sScore = computeATSScore(payload.resumeData || {});
          const sSc = atsColor(sScore);
          const R = 36, circ = +(2 * Math.PI * R).toFixed(2);
          const off = +(circ - (sScore / 100) * circ).toFixed(2);
          const succRingWrap = document.getElementById('succAtsRing');
          if (succRingWrap) {
            succRingWrap.innerHTML = `
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="${R}" stroke="#ede9fe" stroke-width="6" fill="none"/>
                <circle cx="45" cy="45" r="${R}" stroke="${sSc}" stroke-width="6" fill="none"
                  stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
                  stroke-linecap="round" transform="rotate(-90 45 45)"
                  id="succAtsArc" data-offset="${off}"
                  style="transition:stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <div style="font-size:22px;font-weight:900;color:${sSc};line-height:1">${sScore}</div>
                <div style="font-size:9px;color:#94a3b8;font-weight:600;margin-top:2px">ATS SCORE</div>
              </div>`;
            const succStatusEl = document.getElementById('succAtsStatus');
            if (succStatusEl) {
              succStatusEl.textContent = sScore >= 80 ? '✓ Your resume will pass most ATS filters' : sScore >= 55 ? '⚡ A few tweaks could improve your score' : '⚠ Your resume needs more detail to pass ATS';
              succStatusEl.style.color = sSc;
            }
            // Store for drawer
            if (!window._atsResumeData) window._atsResumeData = {};
            const rId = editId || ('succ_' + Date.now());
            window._atsResumeData[rId] = { score: sScore, d: payload.resumeData || {}, name: payload.resumeName };
            document.getElementById('succAtsInfoBtn').dataset.rid = rId;
            // Animate
            requestAnimationFrame(() => requestAnimationFrame(() => {
              const arc = document.getElementById('succAtsArc');
              if (arc) arc.style.strokeDashoffset = arc.dataset.offset;
            }));
          }
        } catch(e) {}
        showView('success');
        btn.textContent = 'Saved ✓';
        setTimeout(() => { btn.textContent = 'Save Resume'; btn.disabled = false; }, 2000);
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false; btn.textContent = 'Save Resume';
      }
    }
    window.saveResume = saveResume;

    // ── TEMPLATE RENDERERS ───────────────────────────────────────────────────
    function buildPrevHTML(d, tpl, c, fc) {
      c = c || '#7c3aed';
      if (tpl === 'modern')    return tplModern(d, c, fc);
      if (tpl === 'bold')      return tplBold(d, c, fc);
      if (tpl === 'minimal')   return tplMinimal(d, c, fc);
      if (tpl === 'vivid')     return tplVivid(d, c, fc);
      if (tpl === 'elegant')   return tplElegant(d, c, fc);
      if (tpl === 'slate')     return tplSlate(d, c, fc);
      if (tpl === 'coral')     return tplCoral(d, c, fc);
      if (tpl === 'split')     return tplSplit(d, c, fc);
      if (tpl === 'ink')       return tplInk(d, c, fc);
      if (tpl === 'executive') return tplExecutive(d, c, fc);
      if (tpl === 'nova')      return tplNova(d, c, fc);
      if (tpl === 'tribune')   return tplTribune(d, c, fc);
      return tplClassic(d, c, fc);
    }

    function tplClassic(d,c,fc){return`<div class="${fc}" style="padding:32px;font-size:12px;line-height:1.55;background:#fff;min-height:700px">
      <div style="border-bottom:3px solid ${c};padding-bottom:12px;margin-bottom:16px;display:flex;align-items:flex-start;gap:16px">
        ${d.photo?`<img src="${d.photo}" alt="" style="width:68px;height:68px;border-radius:50%;object-fit:cover;border:2.5px solid ${c};flex-shrink:0">`:``}
        <div style="flex:1"><h1 style="font-size:24px;font-weight:800;color:${c};letter-spacing:-.3px">${esc(d.fullName||'Your Name')}</h1>
        <p style="font-size:13px;color:#555;margin-top:2px;font-weight:500">${esc(d.jobTitle||'')}</p>
        <p style="color:#888;font-size:10px;margin-top:5px">${[d.email,d.phone,d.location].filter(Boolean).map(esc).join('  ·  ')}</p></div>
      </div>
      ${d.summary?`<div style="margin-bottom:14px"><div style="font-size:9px;font-weight:800;color:${c};text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Professional Summary</div><p style="color:#444;font-size:11px">${esc(d.summary)}</p></div>`:''}
      ${(d.workExperience||[]).length?`<div style="margin-bottom:14px"><div style="font-size:9px;font-weight:800;color:${c};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Work Experience</div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><strong style="font-size:11px">${esc(w.position)}</strong><span style="color:#999;font-size:9px;white-space:nowrap;margin-left:8px">${esc(w.startDate)} – ${esc(w.endDate||'Present')}</span></div><div style="color:#6b7280;font-size:10px;margin-top:1px">${esc(w.company)}</div>${w.description?`<p style="color:#777;font-size:10px;margin-top:3px;line-height:1.4">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
      ${(d.education||[]).length?`<div style="margin-bottom:14px"><div style="font-size:9px;font-weight:800;color:${c};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Education</div>${(d.education||[]).map(e=>`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between"><strong style="font-size:11px">${esc(e.degree)} in ${esc(e.field)}</strong><span style="color:#999;font-size:9px">${esc(e.graduationDate)}</span></div><div style="color:#6b7280;font-size:10px">${esc(e.school)}</div></div>`).join('')}</div>`:''}
      ${(d.skills||[]).length?`<div><div style="font-size:9px;font-weight:800;color:${c};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Skills</div><div style="display:flex;flex-wrap:wrap;gap:5px">${(d.skills||[]).map(s=>`<span style="background:${c}18;color:${c};padding:2px 10px;border-radius:99px;font-size:10px;font-weight:600">${esc(s)}</span>`).join('')}</div></div>`:''}
    </div>`;}

    function tplModern(d,c,fc){return`<div class="${fc}" style="font-size:12px;display:grid;grid-template-columns:190px 1fr;background:#fff;min-height:700px">
      <div style="background:${c};color:#fff;padding:24px 16px">
        ${d.photo?`<img src="${d.photo}" alt="" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:12px;border:2px solid rgba(255,255,255,.5);display:block">`:` <div style="width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;margin-bottom:12px;border:2px solid rgba(255,255,255,.3)">${(d.fullName||'?')[0].toUpperCase()}</div>`}
        <h1 style="font-size:15px;font-weight:800;line-height:1.2;margin-bottom:3px">${esc(d.fullName||'Your Name')}</h1>
        <p style="opacity:.8;font-size:11px;font-weight:500">${esc(d.jobTitle||'')}</p>
        <div style="margin-top:16px;font-size:10px;opacity:.85;line-height:1.9">${d.email?`<p>✉ ${esc(d.email)}</p>`:''} ${d.phone?`<p>☎ ${esc(d.phone)}</p>`:''} ${d.location?`<p>⌖ ${esc(d.location)}</p>`:''}</div>
        ${(d.skills||[]).length?`<div style="margin-top:20px"><p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:.6;margin-bottom:8px">Skills</p>${(d.skills||[]).map(s=>`<div style="background:rgba(255,255,255,.15);border-radius:5px;padding:3px 9px;font-size:10px;margin-bottom:4px;border-left:3px solid rgba(255,255,255,.4)">${esc(s)}</div>`).join('')}</div>`:''}
      </div>
      <div style="padding:24px 22px;line-height:1.5">
        ${d.summary?`<div style="margin-bottom:16px"><p style="font-size:9px;font-weight:800;color:${c};text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">About Me</p><p style="color:#444;font-size:11px">${esc(d.summary)}</p></div>`:''}
        ${(d.workExperience||[]).length?`<div style="margin-bottom:14px"><p style="font-size:9px;font-weight:800;color:${c};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Experience</p>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong style="font-size:11px">${esc(w.position)}</strong><div style="color:#6b7280;font-size:10px">${esc(w.company)}</div></div><span style="color:#999;font-size:9px;white-space:nowrap;margin-left:8px">${esc(w.startDate)} – ${esc(w.endDate||'Present')}</span></div>${w.description?`<p style="color:#666;font-size:10px;margin-top:3px">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
        ${(d.education||[]).length?`<div><p style="font-size:9px;font-weight:800;color:${c};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Education</p>${(d.education||[]).map(e=>`<div style="margin-bottom:8px"><strong style="font-size:11px">${esc(e.degree)} in ${esc(e.field)}</strong><div style="color:#6b7280;font-size:10px">${esc(e.school)} · ${esc(e.graduationDate)}</div></div>`).join('')}</div>`:''}
      </div>
    </div>`;}

    function tplBold(d,c,fc){return`<div class="${fc}" style="font-size:12px;background:#fff;min-height:700px">
      <div style="background:${c};padding:28px 32px;color:#fff">
        <h1 style="font-size:30px;font-weight:900;text-transform:uppercase;letter-spacing:-1px">${esc(d.fullName||'YOUR NAME')}</h1>
        <p style="font-size:14px;opacity:.85;margin-top:3px;font-weight:600;letter-spacing:.5px">${esc(d.jobTitle||'')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:10px;font-size:10px;opacity:.8">${d.email?`<span>✉ ${esc(d.email)}</span>`:''} ${d.phone?`<span>☎ ${esc(d.phone)}</span>`:''} ${d.location?`<span>⌖ ${esc(d.location)}</span>`:''}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 180px">
        <div style="padding:24px 28px;border-right:2px solid #f8f7ff">
          ${d.summary?`<div style="margin-bottom:16px"><div style="font-size:9px;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${c};padding-bottom:4px;margin-bottom:8px">Profile</div><p style="color:#444;font-size:11px">${esc(d.summary)}</p></div>`:''}
          ${(d.workExperience||[]).length?`<div><div style="font-size:9px;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${c};padding-bottom:4px;margin-bottom:10px">Experience</div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><strong style="font-size:11px">${esc(w.position)}</strong><span style="color:#999;font-size:9px">${esc(w.startDate)} – ${esc(w.endDate||'Now')}</span></div><div style="color:#6b7280;font-size:10px">${esc(w.company)}</div>${w.description?`<p style="color:#555;font-size:10px;margin-top:3px">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
        </div>
        <div style="padding:24px 16px;background:#faf9ff">
          ${(d.skills||[]).length?`<div style="margin-bottom:16px"><div style="font-size:8px;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${c};padding-bottom:3px;margin-bottom:8px">Skills</div>${(d.skills||[]).map(s=>`<div style="margin-bottom:5px;font-size:10px;color:#374151;display:flex;align-items:center;gap:5px"><span style="width:5px;height:5px;border-radius:50%;background:${c};flex-shrink:0"></span>${esc(s)}</div>`).join('')}</div>`:''}
          ${(d.education||[]).length?`<div><div style="font-size:8px;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${c};padding-bottom:3px;margin-bottom:8px">Education</div>${(d.education||[]).map(e=>`<div style="margin-bottom:8px"><strong style="font-size:10px">${esc(e.degree)}</strong><div style="color:#7c3aed;font-size:9px">${esc(e.field)}</div><div style="color:#6b7280;font-size:9px">${esc(e.school)}</div><div style="color:#999;font-size:9px">${esc(e.graduationDate)}</div></div>`).join('')}</div>`:''}
        </div>
      </div>
    </div>`;}

    function tplMinimal(d,c,fc){return`<div class="${fc}" style="padding:40px 44px;font-size:12px;background:#fff;min-height:700px;line-height:1.6">
      <div style="margin-bottom:24px">
        <h1 style="font-size:28px;font-weight:300;color:#111;letter-spacing:-.5px">${esc(d.fullName||'Your Name')}</h1>
        <p style="font-size:13px;color:${c};font-weight:600;margin-top:2px">${esc(d.jobTitle||'')}</p>
        <p style="color:#aaa;font-size:10px;margin-top:6px;letter-spacing:.3px">${[d.email,d.phone,d.location].filter(Boolean).map(esc).join('   ·   ')}</p>
      </div>
      ${d.summary?`<div style="margin-bottom:20px;padding-top:16px;border-top:1px solid #f1f5f9"><p style="font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:6px">About</p><p style="color:#555;font-size:11px">${esc(d.summary)}</p></div>`:''}
      ${(d.workExperience||[]).length?`<div style="margin-bottom:20px;padding-top:16px;border-top:1px solid #f1f5f9"><p style="font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:10px">Experience</p>${(d.workExperience||[]).map(w=>`<div style="display:flex;gap:20px;margin-bottom:10px"><div style="color:#ccc;font-size:9px;white-space:nowrap;padding-top:2px;min-width:60px">${esc(w.startDate)}<br>– ${esc(w.endDate||'Now')}</div><div><strong style="font-size:11px;color:#111">${esc(w.position)}</strong><div style="color:#666;font-size:10px">${esc(w.company)}</div>${w.description?`<p style="color:#777;font-size:10px;margin-top:2px">${esc(w.description)}</p>`:''}</div></div>`).join('')}</div>`:''}
      ${(d.education||[]).length?`<div style="margin-bottom:20px;padding-top:16px;border-top:1px solid #f1f5f9"><p style="font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:10px">Education</p>${(d.education||[]).map(e=>`<div style="margin-bottom:8px"><strong style="font-size:11px;color:#111">${esc(e.degree)} in ${esc(e.field)}</strong><div style="color:#666;font-size:10px">${esc(e.school)} · ${esc(e.graduationDate)}</div></div>`).join('')}</div>`:''}
      ${(d.skills||[]).length?`<div style="padding-top:16px;border-top:1px solid #f1f5f9"><p style="font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:8px">Skills</p><div style="display:flex;flex-wrap:wrap;gap:6px">${(d.skills||[]).map(s=>`<span style="border:1.5px solid #e2e8f0;color:#374151;padding:3px 12px;border-radius:5px;font-size:10px">${esc(s)}</span>`).join('')}</div></div>`:''}
    </div>`;}

    function tplVivid(d,c,fc){return`<div class="${fc}" style="font-size:12px;background:#fff;min-height:700px">
      <div style="background:linear-gradient(135deg,${c},${c}bb);padding:30px 32px;color:#fff">
        <h1 style="font-size:28px;font-weight:900;letter-spacing:-.5px">${esc(d.fullName||'Your Name')}</h1>
        <p style="font-size:14px;opacity:.9;margin-top:3px;font-weight:600">${esc(d.jobTitle||'')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-size:10px;opacity:.85">${d.email?`<span>✉ ${esc(d.email)}</span>`:''} ${d.phone?`<span>☎ ${esc(d.phone)}</span>`:''} ${d.location?`<span>⌖ ${esc(d.location)}</span>`:''}</div>
      </div>
      <div style="padding:24px 32px">
        ${d.summary?`<div style="margin-bottom:16px;padding:14px 16px;background:${c}0d;border-left:4px solid ${c};border-radius:0 8px 8px 0"><p style="color:#444;font-size:11px;line-height:1.5">${esc(d.summary)}</p></div>`:''}
        ${(d.workExperience||[]).length?`<div style="margin-bottom:16px"><h3 style="font-size:13px;font-weight:800;color:${c};margin-bottom:10px">Work Experience</h3>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:10px;padding-left:12px;border-left:3px solid ${c}55"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong style="font-size:11px">${esc(w.position)}</strong><div style="color:#6b7280;font-size:10px">${esc(w.company)}</div></div><span style="color:#aaa;font-size:9px;white-space:nowrap;margin-left:8px">${esc(w.startDate)} – ${esc(w.endDate||'Present')}</span></div>${w.description?`<p style="color:#555;font-size:10px;margin-top:3px">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
        ${(d.education||[]).length?`<div style="margin-bottom:16px"><h3 style="font-size:13px;font-weight:800;color:${c};margin-bottom:10px">Education</h3>${(d.education||[]).map(e=>`<div style="margin-bottom:8px;padding-left:12px;border-left:3px solid ${c}55"><strong style="font-size:11px">${esc(e.degree)} in ${esc(e.field)}</strong><div style="color:#6b7280;font-size:10px">${esc(e.school)} · ${esc(e.graduationDate)}</div></div>`).join('')}</div>`:''}
        ${(d.skills||[]).length?`<div><h3 style="font-size:13px;font-weight:800;color:${c};margin-bottom:8px">Skills</h3><div style="display:flex;flex-wrap:wrap;gap:6px">${(d.skills||[]).map(s=>`<span style="background:${c};color:#fff;padding:3px 12px;border-radius:99px;font-size:10px;font-weight:600">${esc(s)}</span>`).join('')}</div></div>`:''}
      </div>
    </div>`;}


    // ── NEW TEMPLATES ────────────────────────────────────────────────────────

    // ELEGANT — centered serif-style header, thin rule dividers, warm neutrals
    function tplElegant(d,c,fc){return`<div class="${fc}" style="padding:36px 40px;font-size:12px;background:#fff;min-height:700px;font-family:Georgia,serif;line-height:1.6">
      <div style="text-align:center;padding-bottom:18px;border-bottom:1px solid #d6d3d1;margin-bottom:20px">
        ${d.photo?`<img src="${d.photo}" alt="" style="width:76px;height:76px;border-radius:50%;object-fit:cover;border:2.5px solid #d6d3d1;margin:0 auto 12px;display:block">`:``}
        <h1 style="font-size:26px;font-weight:700;color:#1c1917;letter-spacing:.5px;margin-bottom:4px">${esc(d.fullName||'Your Name')}</h1>
        <p style="font-size:12px;color:${c};font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">${esc(d.jobTitle||'')}</p>
        <p style="color:#a8a29e;font-size:9.5px;letter-spacing:.4px">${[d.email,d.phone,d.location].filter(Boolean).map(esc).join('  ·  ')}</p>
      </div>
      ${d.summary?`<div style="margin-bottom:18px;text-align:center"><p style="color:#57534e;font-size:11px;max-width:420px;margin:0 auto;font-style:italic;line-height:1.7">${esc(d.summary)}</p></div>`:''}
      ${(d.workExperience||[]).length?`<div style="margin-bottom:18px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div style="height:1px;flex:1;background:#e7e5e4"></div><span style="font-size:8.5px;font-weight:700;color:${c};letter-spacing:2px;text-transform:uppercase;font-family:'Inter',sans-serif">Experience</span><div style="height:1px;flex:1;background:#e7e5e4"></div></div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:baseline"><div><strong style="font-size:11.5px;color:#1c1917">${esc(w.position)}</strong><span style="color:#a8a29e;margin:0 6px">—</span><span style="font-size:10.5px;color:#78716c">${esc(w.company)}</span></div><span style="color:#a8a29e;font-size:9px;font-family:'Inter',sans-serif">${esc(w.startDate)} – ${esc(w.endDate||'Present')}</span></div>${w.description?`<p style="color:#6b7280;font-size:10px;margin-top:3px;font-style:italic">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
      ${(d.education||[]).length?`<div style="margin-bottom:18px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><div style="height:1px;flex:1;background:#e7e5e4"></div><span style="font-size:8.5px;font-weight:700;color:${c};letter-spacing:2px;text-transform:uppercase;font-family:'Inter',sans-serif">Education</span><div style="height:1px;flex:1;background:#e7e5e4"></div></div>${(d.education||[]).map(e=>`<div style="display:flex;justify-content:space-between;margin-bottom:8px"><div><strong style="font-size:11px;color:#1c1917">${esc(e.degree)} in ${esc(e.field)}</strong><div style="color:#78716c;font-size:10px">${esc(e.school)}</div></div><span style="color:#a8a29e;font-size:9px;font-family:'Inter',sans-serif">${esc(e.graduationDate)}</span></div>`).join('')}</div>`:''}
      ${(d.skills||[]).length?`<div><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="height:1px;flex:1;background:#e7e5e4"></div><span style="font-size:8.5px;font-weight:700;color:${c};letter-spacing:2px;text-transform:uppercase;font-family:'Inter',sans-serif">Skills</span><div style="height:1px;flex:1;background:#e7e5e4"></div></div><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:5px">${(d.skills||[]).map(s=>`<span style="font-size:9.5px;color:#57534e;border:1px solid #d6d3d1;padding:2px 11px;border-radius:2px;font-family:'Inter',sans-serif">${esc(s)}</span>`).join('')}</div></div>`:''}
    </div>`;}

    // SLATE — dark left panel with timeline experience, for senior/tech
    function tplSlate(d,c,fc){return`<div class="${fc}" style="font-size:12px;display:grid;grid-template-columns:200px 1fr;background:#fff;min-height:700px">
      <div style="background:#0f172a;color:#e2e8f0;padding:28px 18px;display:flex;flex-direction:column;gap:0">
        <div style="margin-bottom:20px">
          ${d.photo?`<img src="${d.photo}" alt="" style="width:52px;height:52px;border-radius:12px;object-fit:cover;margin-bottom:14px;border:2px solid ${c};display:block">`:` <div style="width:52px;height:52px;border-radius:12px;background:${c};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;margin-bottom:14px">${(d.fullName||'?')[0].toUpperCase()}</div>`}
          <h1 style="font-size:14px;font-weight:800;line-height:1.25;margin-bottom:4px;color:#f1f5f9">${esc(d.fullName||'Your Name')}</h1>
          <p style="font-size:10px;color:${c};font-weight:700;letter-spacing:.5px">${esc(d.jobTitle||'')}</p>
        </div>
        <div style="margin-bottom:18px;font-size:9.5px;line-height:2;color:#94a3b8">${d.email?`<div>✉ ${esc(d.email)}</div>`:''} ${d.phone?`<div>☎ ${esc(d.phone)}</div>`:''} ${d.location?`<div>⌖ ${esc(d.location)}</div>`:''}</div>
        ${(d.skills||[]).length?`<div><p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#475569;margin-bottom:9px">Skills</p><div style="display:flex;flex-direction:column;gap:4px">${(d.skills||[]).map(s=>`<div style="font-size:10px;color:#cbd5e1;padding:4px 10px;background:rgba(255,255,255,.06);border-radius:5px;border-left:3px solid ${c}">${esc(s)}</div>`).join('')}</div></div>`:''}
        ${(d.education||[]).length?`<div style="margin-top:18px"><p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#475569;margin-bottom:9px">Education</p>${(d.education||[]).map(e=>`<div style="margin-bottom:8px"><p style="font-size:10px;font-weight:700;color:#e2e8f0">${esc(e.degree)}</p><p style="font-size:9px;color:#94a3b8">${esc(e.field)}</p><p style="font-size:9px;color:#64748b">${esc(e.school)} · ${esc(e.graduationDate)}</p></div>`).join('')}</div>`:''}
      </div>
      <div style="padding:28px 24px;background:#fff">
        ${d.summary?`<div style="margin-bottom:18px;padding:12px 14px;background:#f8fafc;border-left:4px solid ${c};border-radius:0 6px 6px 0"><p style="font-size:11px;color:#334155;line-height:1.6">${esc(d.summary)}</p></div>`:''}
        ${(d.workExperience||[]).length?`<div><p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;margin-bottom:14px">Experience</p><div style="position:relative;padding-left:20px;border-left:2px solid #e2e8f0">${(d.workExperience||[]).map(w=>`<div style="position:relative;margin-bottom:14px"><div style="position:absolute;left:-25px;top:3px;width:8px;height:8px;border-radius:50%;background:${c};border:2px solid #fff;box-shadow:0 0 0 2px ${c}"></div><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong style="font-size:11.5px;color:#0f172a">${esc(w.position)}</strong><div style="font-size:10px;color:#64748b">${esc(w.company)}</div></div><span style="font-size:9px;color:#94a3b8;white-space:nowrap;margin-left:8px">${esc(w.startDate)} – ${esc(w.endDate||'Now')}</span></div>${w.description?`<p style="font-size:10px;color:#475569;margin-top:3px;line-height:1.5">${esc(w.description)}</p>`:''}</div>`).join('')}</div></div>`:''}
      </div>
    </div>`;}

    // CORAL — warm orange accent, card-based sections, energetic layout
    function tplCoral(d,c,fc){return`<div class="${fc}" style="font-size:12px;background:#fff;min-height:700px">
      <div style="background:linear-gradient(120deg,${c} 0%,#ea580c 60%,#fb923c 100%);padding:30px 32px;color:#fff;position:relative;overflow:hidden">
        <div style="position:absolute;right:-30px;top:-30px;width:120px;height:120px;background:rgba(255,255,255,.08);border-radius:50%"></div>
        <div style="position:absolute;right:40px;bottom:-40px;width:90px;height:90px;background:rgba(255,255,255,.06);border-radius:50%"></div>
        <div style="position:relative">
          <h1 style="font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:4px">${esc(d.fullName||'Your Name')}</h1>
          <p style="font-size:12px;opacity:.9;font-weight:600;letter-spacing:.5px;margin-bottom:10px">${esc(d.jobTitle||'')}</p>
          <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:9.5px;opacity:.85">${d.email?`<span style="background:rgba(255,255,255,.15);padding:2px 10px;border-radius:99px">✉ ${esc(d.email)}</span>`:''} ${d.phone?`<span style="background:rgba(255,255,255,.15);padding:2px 10px;border-radius:99px">☎ ${esc(d.phone)}</span>`:''} ${d.location?`<span style="background:rgba(255,255,255,.15);padding:2px 10px;border-radius:99px">⌖ ${esc(d.location)}</span>`:''}</div>
        </div>
      </div>
      <div style="padding:22px 28px">
        ${d.summary?`<div style="margin-bottom:16px;padding:12px 16px;background:#fff7ed;border-radius:10px;border:1px solid #fed7aa"><p style="font-size:11px;color:#431407;line-height:1.65">${esc(d.summary)}</p></div>`:''}
        ${(d.workExperience||[]).length?`<div style="margin-bottom:16px"><div style="font-size:9px;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;display:flex;align-items:center;gap:8px">Experience<div style="flex:1;height:2px;background:#fed7aa;border-radius:99px"></div></div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:10px;padding:10px 14px;border-radius:8px;border:1px solid #f3f4f6;background:#fafafa"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong style="font-size:11px;color:#1c1917">${esc(w.position)}</strong><div style="font-size:9.5px;color:${c};font-weight:600;margin-top:1px">${esc(w.company)}</div></div><span style="font-size:9px;color:#a8a29e;white-space:nowrap">${esc(w.startDate)} – ${esc(w.endDate||'Now')}</span></div>${w.description?`<p style="font-size:10px;color:#57534e;margin-top:5px;line-height:1.5">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          ${(d.education||[]).length?`<div><div style="font-size:9px;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Education</div>${(d.education||[]).map(e=>`<div style="margin-bottom:7px;padding:8px 12px;background:#fff7ed;border-radius:8px"><strong style="font-size:10px;color:#1c1917">${esc(e.degree)} in ${esc(e.field)}</strong><div style="font-size:9px;color:#78716c">${esc(e.school)} · ${esc(e.graduationDate)}</div></div>`).join('')}</div>`:''}
          ${(d.skills||[]).length?`<div><div style="font-size:9px;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Skills</div><div style="display:flex;flex-wrap:wrap;gap:5px">${(d.skills||[]).map(s=>`<span style="background:${c};color:#fff;padding:3px 10px;border-radius:99px;font-size:9.5px;font-weight:600">${esc(s)}</span>`).join('')}</div></div>`:''}
        </div>
      </div>
    </div>`;}

    // SPLIT — bold left accent column with initials block, structured right
    function tplSplit(d,c,fc){return`<div class="${fc}" style="font-size:12px;display:grid;grid-template-columns:170px 1fr;background:#fff;min-height:700px">
      <div style="background:${c};padding:28px 16px;display:flex;flex-direction:column;align-items:center;text-align:center">
        ${d.photo?`<img src="${d.photo}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:14px;border:2.5px solid rgba(255,255,255,.6);display:block">`:` <div style="width:64px;height:64px;border-radius:16px;background:rgba(255,255,255,.18);border:2.5px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:900;color:#fff;margin-bottom:14px">${(d.fullName||'?')[0].toUpperCase()}</div>`}
        <h1 style="font-size:13px;font-weight:800;color:#fff;line-height:1.3;margin-bottom:4px">${esc(d.fullName||'Your Name')}</h1>
        <p style="font-size:9.5px;color:rgba(255,255,255,.75);font-weight:600;margin-bottom:16px">${esc(d.jobTitle||'')}</p>
        <div style="width:100%;height:1px;background:rgba(255,255,255,.2);margin-bottom:14px"></div>
        <div style="width:100%;text-align:left;font-size:9.5px;color:rgba(255,255,255,.8);line-height:1.9">${d.email?`<div style="word-break:break-all">${esc(d.email)}</div>`:''} ${d.phone?`<div>${esc(d.phone)}</div>`:''} ${d.location?`<div>${esc(d.location)}</div>`:''}</div>
        ${(d.skills||[]).length?`<div style="margin-top:16px;width:100%"><p style="font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.5);margin-bottom:7px;text-align:left">Skills</p>${(d.skills||[]).map(s=>`<div style="background:rgba(255,255,255,.12);border-radius:5px;padding:3px 8px;font-size:9.5px;color:rgba(255,255,255,.9);margin-bottom:4px;text-align:left">${esc(s)}</div>`).join('')}</div>`:''}
      </div>
      <div style="padding:28px 24px">
        ${d.summary?`<div style="margin-bottom:16px"><div style="font-size:8px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:6px">About</div><p style="color:#334155;font-size:11px;line-height:1.65">${esc(d.summary)}</p></div>`:''}
        ${(d.workExperience||[]).length?`<div style="margin-bottom:14px"><div style="font-size:8px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px">Work Experience</div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #f1f5f9"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong style="font-size:11.5px;color:#0f172a">${esc(w.position)}</strong><div style="font-size:10px;color:${c};font-weight:600">${esc(w.company)}</div></div><span style="font-size:9px;color:#94a3b8;white-space:nowrap;margin-left:8px">${esc(w.startDate)} – ${esc(w.endDate||'Present')}</span></div>${w.description?`<p style="font-size:10px;color:#475569;margin-top:4px;line-height:1.5">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
        ${(d.education||[]).length?`<div><div style="font-size:8px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">Education</div>${(d.education||[]).map(e=>`<div style="margin-bottom:8px"><strong style="font-size:11px;color:#0f172a">${esc(e.degree)} in ${esc(e.field)}</strong><div style="font-size:10px;color:${c};font-weight:600">${esc(e.school)}</div><div style="font-size:9px;color:#94a3b8">${esc(e.graduationDate)}</div></div>`).join('')}</div>`:''}
      </div>
    </div>`;}

    // INK — high-contrast editorial; black header strip, stark typography
    function tplInk(d,c,fc){return`<div class="${fc}" style="font-size:12px;background:#fff;min-height:700px">
      <div style="background:#111827;padding:28px 32px">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px">
          <div>
            <h1 style="font-size:30px;font-weight:900;color:#fff;letter-spacing:-1.5px;line-height:1;margin-bottom:5px">${esc(d.fullName||'Your Name')}</h1>
            <p style="font-size:12px;font-weight:600;color:${c};letter-spacing:1px;text-transform:uppercase">${esc(d.jobTitle||'')}</p>
          </div>
          <div style="text-align:right;font-size:9.5px;color:#9ca3af;line-height:1.9">${d.email?`<div>${esc(d.email)}</div>`:''} ${d.phone?`<div>${esc(d.phone)}</div>`:''} ${d.location?`<div>${esc(d.location)}</div>`:''}</div>
        </div>
      </div>
      <div style="height:4px;background:linear-gradient(90deg,${c},${c}66,transparent)"></div>
      <div style="padding:24px 32px">
        ${d.summary?`<div style="margin-bottom:18px;padding-bottom:16px;border-bottom:1.5px solid #f1f5f9"><p style="font-size:11.5px;color:#374151;line-height:1.7">${esc(d.summary)}</p></div>`:''}
        ${(d.workExperience||[]).length?`<div style="margin-bottom:18px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span style="font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111827">Experience</span><div style="flex:1;height:2px;background:#111827"></div></div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:12px;display:grid;grid-template-columns:1fr auto;gap:8px"><div><div style="display:flex;align-items:center;gap:8px;margin-bottom:2px"><strong style="font-size:11.5px;color:#111827">${esc(w.position)}</strong><span style="font-size:9px;color:#fff;background:${c};padding:1px 8px;border-radius:3px;font-weight:700">${esc(w.company)}</span></div>${w.description?`<p style="font-size:10px;color:#6b7280;margin-top:3px;line-height:1.5">${esc(w.description)}</p>`:''}</div><div style="font-size:9px;color:#9ca3af;text-align:right;white-space:nowrap">${esc(w.startDate)}<br>– ${esc(w.endDate||'Now')}</div></div>`).join('')}</div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          ${(d.education||[]).length?`<div><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111827">Education</span><div style="flex:1;height:2px;background:#111827"></div></div>${(d.education||[]).map(e=>`<div style="margin-bottom:8px"><strong style="font-size:11px;color:#111827">${esc(e.degree)} in ${esc(e.field)}</strong><div style="font-size:9.5px;color:#6b7280">${esc(e.school)} · ${esc(e.graduationDate)}</div></div>`).join('')}</div>`:''}
          ${(d.skills||[]).length?`<div><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111827">Skills</span><div style="flex:1;height:2px;background:#111827"></div></div><div style="display:flex;flex-wrap:wrap;gap:5px">${(d.skills||[]).map(s=>`<span style="font-size:9.5px;font-weight:700;color:#111827;border:1.5px solid #111827;padding:2px 10px;border-radius:3px">${esc(s)}</span>`).join('')}</div></div>`:''}
        </div>
      </div>
    </div>`;}


    // EXECUTIVE — Alexander Smith style: big name left, photo top-right, two columns below
    // Photo-enabled ✅
    function tplExecutive(d,c,fc){
      const photo = d.photo ? `<img src="${d.photo}" alt="" style="width:100px;height:110px;object-fit:cover;border-radius:4px;border:2px solid #e5e7eb;display:block">` : '';
      return `<div class="${fc}" style="font-size:12px;background:#fff;min-height:700px;padding:0">
        <!-- Header -->
        <div style="padding:28px 32px 20px;border-bottom:2px solid #111;display:flex;justify-content:space-between;align-items:flex-start;gap:20px">
          <div style="flex:1">
            <div style="font-size:9px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#666;margin-bottom:6px">Curriculum Vitae</div>
            <h1 style="font-size:26px;font-weight:900;color:#111;letter-spacing:-0.5px;line-height:1.1;margin-bottom:4px;text-transform:uppercase">${esc(d.fullName||'Your Name')}</h1>
            <p style="font-size:11px;font-weight:700;color:${c};letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">${esc(d.jobTitle||'')}</p>
            <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:9.5px;color:#555">
              ${d.email?`<span>✉ ${esc(d.email)}</span>`:''}
              ${d.phone?`<span>☎ ${esc(d.phone)}</span>`:''}
              ${d.location?`<span>⌖ ${esc(d.location)}</span>`:''}
            </div>
          </div>
          ${photo ? `<div style="flex-shrink:0">${photo}</div>` : ''}
        </div>
        <!-- Body: 2-col -->
        <div style="display:grid;grid-template-columns:1fr 180px;gap:0;min-height:560px">
          <!-- Left: Summary + Experience -->
          <div style="padding:20px 24px 20px 32px;border-right:1px solid #e5e7eb">
            ${d.summary?`<div style="margin-bottom:16px"><div style="font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111;margin-bottom:6px;padding-bottom:4px;border-bottom:1.5px solid #111">Summary</div><p style="font-size:10.5px;color:#444;line-height:1.65">${esc(d.summary)}</p></div>`:''}
            ${(d.workExperience||[]).length?`<div style="margin-bottom:14px"><div style="font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111;margin-bottom:8px;padding-bottom:4px;border-bottom:1.5px solid #111">Work Experience</div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong style="font-size:11px;color:#111;text-transform:uppercase;letter-spacing:.3px">${esc(w.position)}</strong><div style="font-size:10px;color:${c};font-weight:600;margin-top:1px">${esc(w.company)}</div></div><span style="font-size:9px;color:#888;white-space:nowrap;margin-left:8px">${esc(w.startDate)} – ${esc(w.endDate||'Present')}</span></div>${w.description?`<p style="font-size:10px;color:#555;margin-top:3px;line-height:1.5">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
          </div>
          <!-- Right sidebar: skills + education -->
          <div style="padding:20px 20px 20px 16px;background:#f9fafb">
            ${(d.skills||[]).length?`<div style="margin-bottom:16px"><div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111;margin-bottom:8px;padding-bottom:4px;border-bottom:1.5px solid #111">Skills</div>${(d.skills||[]).map(s=>`<div style="font-size:10px;color:#374151;padding:3px 0;border-bottom:1px solid #e5e7eb">${esc(s)}</div>`).join('')}</div>`:``}
            ${(d.education||[]).length?`<div><div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111;margin-bottom:8px;padding-bottom:4px;border-bottom:1.5px solid #111">Education</div>${(d.education||[]).map(e=>`<div style="margin-bottom:8px"><strong style="font-size:10px;color:#111;display:block">${esc(e.degree)}</strong><div style="font-size:9.5px;color:#555">${esc(e.field)}</div><div style="font-size:9px;color:#7c3aed;font-weight:600">${esc(e.school)}</div><div style="font-size:9px;color:#888">${esc(e.graduationDate)}</div></div>`).join('')}</div>`:``}
          </div>
        </div>
      </div>`;
    }

    // NOVA — deep gradient left sidebar with large photo, bold right content
    // Photo-enabled ✅
    function tplNova(d,c,fc){
      return `<div class="${fc}" style="font-size:12px;display:grid;grid-template-columns:200px 1fr;background:#fff;min-height:700px">
        <!-- Sidebar -->
        <div style="background:linear-gradient(180deg,${c} 0%,${c}dd 100%);color:#fff;padding:0;display:flex;flex-direction:column">
          <!-- Photo block -->
          <div style="padding:24px 20px 16px;text-align:center">
            ${d.photo
              ? `<img src="${d.photo}" alt="" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.5);display:block;margin:0 auto 12px">`
              : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;margin:0 auto 12px">${(d.fullName||'?')[0].toUpperCase()}</div>`}
            <h1 style="font-size:14px;font-weight:800;line-height:1.25;margin-bottom:3px;color:#fff">${esc(d.fullName||'Your Name')}</h1>
            <p style="font-size:10px;font-weight:600;color:rgba(255,255,255,.75);letter-spacing:.5px">${esc(d.jobTitle||'')}</p>
          </div>
          <div style="height:1px;background:rgba(255,255,255,.15);margin:0 16px"></div>
          <!-- Contact -->
          <div style="padding:14px 20px;font-size:9.5px;color:rgba(255,255,255,.85);line-height:2">
            ${d.email?`<div style="word-break:break-all">✉ ${esc(d.email)}</div>`:''}
            ${d.phone?`<div>☎ ${esc(d.phone)}</div>`:''}
            ${d.location?`<div>⌖ ${esc(d.location)}</div>`:''}
          </div>
          <div style="height:1px;background:rgba(255,255,255,.15);margin:0 16px"></div>
          <!-- Skills -->
          ${(d.skills||[]).length?`<div style="padding:14px 20px"><p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.5);margin-bottom:8px">Skills</p><div style="display:flex;flex-direction:column;gap:5px">${(d.skills||[]).map(s=>`<div style="font-size:10px;color:rgba(255,255,255,.9);background:rgba(255,255,255,.12);border-radius:6px;padding:4px 10px;border-left:3px solid rgba(255,255,255,.4)">${esc(s)}</div>`).join('')}</div></div>`:''}
          <!-- Education -->
          ${(d.education||[]).length?`<div style="padding:10px 20px 20px"><p style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.5);margin-bottom:8px">Education</p>${(d.education||[]).map(e=>`<div style="margin-bottom:9px"><p style="font-size:10px;font-weight:700;color:#fff">${esc(e.degree)}</p><p style="font-size:9px;color:rgba(255,255,255,.7)">${esc(e.field)}</p><p style="font-size:9px;color:rgba(255,255,255,.5)">${esc(e.school)} · ${esc(e.graduationDate)}</p></div>`).join('')}</div>`:''}
        </div>
        <!-- Main content -->
        <div style="padding:28px 26px;background:#fff;line-height:1.55">
          ${d.summary?`<div style="margin-bottom:18px;padding:14px 16px;background:#f8f7ff;border-left:4px solid ${c};border-radius:0 8px 8px 0"><p style="font-size:11px;color:#374151;line-height:1.65;font-style:italic">${esc(d.summary)}</p></div>`:''}
          ${(d.workExperience||[]).length?`<div><div style="font-size:8.5px;font-weight:900;color:${c};text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;display:flex;align-items:center;gap:8px">Experience <div style="flex:1;height:1.5px;background:${c}33"></div></div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f1f5f9"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong style="font-size:11.5px;color:#111">${esc(w.position)}</strong><div style="font-size:10px;color:${c};font-weight:600;margin-top:1px">${esc(w.company)}</div></div><span style="font-size:9px;color:#94a3b8;white-space:nowrap;margin-left:8px">${esc(w.startDate)} – ${esc(w.endDate||'Present')}</span></div>${w.description?`<p style="font-size:10px;color:#475569;margin-top:4px;line-height:1.5">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
        </div>
      </div>`;
    }

    // TRIBUNE — newspaper-editorial: bold black name banner, photo right, structured 2-col body
    // Photo-enabled ✅
    function tplTribune(d,c,fc){
      return `<div class="${fc}" style="font-size:12px;background:#fff;min-height:700px">
        <!-- Masthead -->
        <div style="background:#111;padding:22px 28px;display:flex;justify-content:space-between;align-items:center;gap:20px">
          <div style="flex:1">
            <div style="font-size:7px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Professional Resume</div>
            <h1 style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;line-height:1;text-transform:uppercase">${esc(d.fullName||'Your Name')}</h1>
            <div style="width:40px;height:3px;background:${c};margin:8px 0"></div>
            <p style="font-size:11px;font-weight:700;color:${c};letter-spacing:1.5px;text-transform:uppercase">${esc(d.jobTitle||'')}</p>
          </div>
          ${d.photo?`<img src="${d.photo}" alt="" style="width:84px;height:90px;object-fit:cover;border-radius:4px;border:2px solid ${c};flex-shrink:0">`:''}
        </div>
        <!-- Contact strip -->
        <div style="background:${c};padding:7px 28px;display:flex;gap:20px;flex-wrap:wrap;font-size:9.5px;color:#fff;font-weight:600">
          ${d.email?`<span>✉ ${esc(d.email)}</span>`:''}
          ${d.phone?`<span>☎ ${esc(d.phone)}</span>`:''}
          ${d.location?`<span>⌖ ${esc(d.location)}</span>`:''}
        </div>
        <!-- Body: 2-col newspaper -->
        <div style="display:grid;grid-template-columns:1fr 175px;gap:0">
          <!-- Left col -->
          <div style="padding:20px 20px 20px 28px;border-right:1px solid #e5e7eb">
            ${d.summary?`<div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #e5e7eb"><p style="font-size:11px;color:#374151;line-height:1.7">${esc(d.summary)}</p></div>`:''}
            ${(d.workExperience||[]).length?`<div><div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:2.5px;color:#111;margin-bottom:10px;display:flex;align-items:center;gap:8px">Experience<div style="flex:1;height:2px;background:#111"></div></div>${(d.workExperience||[]).map(w=>`<div style="margin-bottom:11px;padding-bottom:11px;border-bottom:1px solid #f1f5f9"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><strong style="font-size:11px;color:#111">${esc(w.position)}</strong><div style="font-size:10px;font-weight:600;color:${c}">${esc(w.company)}</div></div><span style="font-size:9px;color:#9ca3af;white-space:nowrap;margin-left:8px">${esc(w.startDate)} – ${esc(w.endDate||'Now')}</span></div>${w.description?`<p style="font-size:10px;color:#6b7280;margin-top:3px;line-height:1.5">${esc(w.description)}</p>`:''}</div>`).join('')}</div>`:''}
          </div>
          <!-- Right col -->
          <div style="padding:20px 20px 20px 16px;background:#fafafa">
            ${(d.skills||[]).length?`<div style="margin-bottom:16px"><div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111;margin-bottom:8px;display:flex;align-items:center;gap:6px">Skills<div style="flex:1;height:1.5px;background:#111"></div></div><div style="display:flex;flex-direction:column;gap:4px">${(d.skills||[]).map(s=>`<div style="font-size:10px;color:#374151;padding:3px 8px;background:#fff;border-radius:5px;border-left:3px solid ${c};font-weight:500">${esc(s)}</div>`).join('')}</div></div>`:''}
            ${(d.education||[]).length?`<div><div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#111;margin-bottom:8px;display:flex;align-items:center;gap:6px">Education<div style="flex:1;height:1.5px;background:#111"></div></div>${(d.education||[]).map(e=>`<div style="margin-bottom:9px"><strong style="font-size:10px;color:#111;display:block">${esc(e.degree)}</strong><div style="font-size:9.5px;color:#555">${esc(e.field)}</div><div style="font-size:9px;color:${c};font-weight:600">${esc(e.school)}</div><div style="font-size:9px;color:#9ca3af">${esc(e.graduationDate)}</div></div>`).join('')}</div>`:''}
          </div>
        </div>
      </div>`;
    }

    // ── DETAIL ────────────────────────────────────────────────────────────────
    function openDetail(id) {
      detId = id;
      const r = getMergedResumes().find(x => x.id === id);
      if (!r) { toast('Resume not found — try refreshing', 'err'); return; }
      const t = TPLS.find(x => x.id === r.templateType) || TPLS[0];
      const d = r.resumeData || {};
      g('detName').textContent = r.resumeName;
      g('detMeta').innerHTML = `<span class="det-meta-chip">${t.name}</span><span class="det-meta-dot"></span><span class="det-meta-chip">${d.jobTitle || 'No title'}</span><span class="det-meta-dot"></span><span style="font-size:11px;color:var(--mute);font-weight:600">Modified ${fmtDate(r.updatedAt)}</span>`;
      

      // Populate ATS score on detail screen
      try {
        const ds = computeATSScore(d);
        const dc = atsColor(ds);
        const dR = 28, dCirc = +(2 * Math.PI * dR).toFixed(2);
        const dOff = +(dCirc - (ds / 100) * dCirc).toFixed(2);
        const dWrap = g('detAtsWrap');
        if (dWrap) {
          dWrap.style.display = 'flex';
          g('detAtsSvg').innerHTML = `
            <svg width="70" height="70" viewBox="0 0 70 70">
              <circle cx="35" cy="35" r="${dR}" stroke="#ede9fe" stroke-width="5" fill="none"/>
              <circle cx="35" cy="35" r="${dR}" stroke="${dc}" stroke-width="5" fill="none"
                stroke-dasharray="${dCirc}" stroke-dashoffset="${dCirc}"
                stroke-linecap="round" transform="rotate(-90 35 35)"
                id="detAtsArc" data-offset="${dOff}"
                style="transition:stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <span style="font-size:17px;font-weight:900;color:${dc};line-height:1">${ds}</span>
              <span style="font-size:8px;color:#94a3b8;font-weight:600;margin-top:1px">ATS</span>
            </div>`;
          const statusEl = g('detAtsStatus');
          if (statusEl) { statusEl.textContent = atsStatusLabel(ds); statusEl.style.color = dc; }
          // store for drawer
          if (!window._atsResumeData) window._atsResumeData = {};
          window._atsResumeData[id] = { score: ds, d, name: r.resumeName };
          const infoBtn = g('detAtsInfoBtn');
          if (infoBtn) infoBtn.dataset.rid = id;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const arc = g('detAtsArc');
            if (arc) arc.style.strokeDashoffset = arc.dataset.offset;
          }));
        }
      } catch(e) {}
      showView('detail');
      // Update inner nav title to the actual resume name (truncated)
      const iT = document.getElementById('iNavTitle');
      if (iT) iT.textContent = r.resumeName.length > 22 ? r.resumeName.slice(0,20)+'…' : r.resumeName;
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    function confirmDel(id) {
      g('delModal').classList.add('open');
      g('delConf').onclick = async () => {
        g('delModal').classList.remove('open');
        try {
          await api('DELETE', '/api/resumes/' + id);
          resumes = resumes.filter(r => r.id !== id);
          renderHome(); showView('home');
          toast('Resume deleted.');
        } catch (e) { toast(e.message, 'err'); }
      };
    }


    // ── DOWNLOAD — browser print-to-PDF (WYSIWYG, free-tier safe) ───────────
    // Shared by resume/cover-letter print functions: measures how tall a piece
    // of HTML naturally renders at standard Letter width, and returns a CSS
    // @page size string. If it's short enough to fit one page, returns a page
    // size that exactly matches the content — kills the blank space you'd
    // otherwise get below short content. If it's genuinely longer than one page
    // (e.g. someone with a lot of experience on their resume), returns 'auto'
    // so it paginates normally across full pages instead of squishing or
    // clipping content to force it onto one page.
    function _kvComputePageSize(html, marginIn) {
      marginIn = marginIn == null ? 0 : marginIn;
      const PAGE_WIDTH_IN  = 8.5;
      const PAGE_HEIGHT_IN = 11;
      const REF_WIDTH_PX   = Math.round(PAGE_WIDTH_IN * 96); // 816px
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:' + REF_WIDTH_PX + 'px';
      host.innerHTML = html;
      document.body.appendChild(host);
      const naturalHeightPx = host.scrollHeight || Math.round(PAGE_HEIGHT_IN * 96);
      document.body.removeChild(host);
      const naturalHeightIn    = naturalHeightPx / 96;
      const maxContentHeightIn = PAGE_HEIGHT_IN - marginIn * 2;
      if (naturalHeightIn <= maxContentHeightIn) {
        return PAGE_WIDTH_IN + 'in ' + (naturalHeightIn + marginIn * 2).toFixed(2) + 'in';
      }
      return 'auto'; // longer than one page — paginate normally, don't clip
    }

    // ── DOWNLOAD PROGRESS OVERLAY ────────────────────────────────────────────
    // One standard, full-page "preparing your download" screen — used by
    // every Download entry point (resume, cover letter, KIE tool reports) so
    // it looks and behaves the same everywhere, instead of just a quiet toast.
    // The ~600-700ms window before print() fires already existed (giving the
    // iframe time to lay out before printing) — this just makes that wait
    // visible with a real end-to-end progress bar instead of a blank screen.
    function _kieDownloadOverlay() {
      let el = document.getElementById('kieDlOverlay');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'kieDlOverlay';
      el.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;opacity:0;pointer-events:none;transition:opacity .25s ease';
      el.innerHTML = `
        <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#7c3aed,#a855f7);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(124,58,237,.3)">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        </div>
        <div id="kieDlOverlayLabel" style="font-size:15px;font-weight:800;color:#0f0e17;letter-spacing:-.2px">Preparing your download…</div>
        <div style="width:220px;height:6px;background:#f0eeff;border-radius:99px;overflow:hidden">
          <div id="kieDlOverlayBar" style="width:0%;height:100%;background:linear-gradient(90deg,#7c3aed,#a855f7);border-radius:99px"></div>
        </div>
      `;
      document.body.appendChild(el);
      return el;
    }
    function _kieShowDownloadOverlay(label) {
      const el  = _kieDownloadOverlay();
      const lbl = el.querySelector('#kieDlOverlayLabel');
      const bar = el.querySelector('#kieDlOverlayBar');
      if (lbl) lbl.textContent = label || 'Preparing your download…';
      // Reset instantly (no transition), then force a reflow so the fill-up
      // below actually animates from 0 instead of jump-cutting to the target.
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth;
      el.style.pointerEvents = 'auto';
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        bar.style.transition = 'width 1.1s cubic-bezier(.4,0,.2,1)';
        requestAnimationFrame(() => { bar.style.width = '92%'; });
      });
    }
    function _kieHideDownloadOverlay() {
      const el = document.getElementById('kieDlOverlay');
      if (!el) return;
      const bar = el.querySelector('#kieDlOverlayBar');
      // Snap the bar to a full, satisfying 100% right as we close it out —
      // "end to end" rather than fading away at 92%.
      if (bar) { bar.style.transition = 'width .2s ease'; bar.style.width = '100%'; }
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }, 180);
    }
    window._kieShowDownloadOverlay = _kieShowDownloadOverlay;
    window._kieHideDownloadOverlay = _kieHideDownloadOverlay;

    function dlResume(id) {
      const r = getMergedResumes().find(x => x.id === id);
      if (!r) return;
      const d      = { ...(r.resumeData || {}) };
      const tpl    = r.templateType || 'classic';
      const tplObj = TPLS.find(t => t.id === tpl) || TPLS[0];
      const html   = buildPrevHTML(d, tpl, tplObj.bg, 'rf-sans');
      const title  = (r.resumeName || 'Resume').replace(/[<>]/g, '');
      const pageSizeCSS = _kvComputePageSize(html);
      const fullDoc = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + title + '</title>'
        + '<link rel="preconnect" href="https://fonts.googleapis.com">'
        + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">'
        + '<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
        + 'html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0;width:100%}'
        + '.rf-sans{font-family:"Inter",system-ui,-apple-system,sans-serif}'
        + '.rf-serif{font-family:Georgia,"Times New Roman",serif}'
        + '.rf-mono{font-family:"Courier New",Courier,monospace}'
        + '@media print{@page{size:' + pageSizeCSS + ';margin:0}html,body{margin:0;padding:0;width:100%}}</style>'
        + '</head><body>' + html + '</body></html>';

      _kieShowDownloadOverlay('Preparing your resume PDF…');

      // PRIMARY: hidden iframe — bypasses Android popup blocker
      try {
        const ifrEl = document.createElement('iframe');
        ifrEl.style.cssText = 'position:fixed;width:0;height:0;border:0;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
        document.body.appendChild(ifrEl);
        const iDoc = ifrEl.contentDocument || ifrEl.contentWindow.document;
        iDoc.open(); iDoc.write(fullDoc); iDoc.close();
        setTimeout(function() {
          try { ifrEl.contentWindow.focus(); ifrEl.contentWindow.print(); } catch(pe) {}
          _kieHideDownloadOverlay();
          setTimeout(function() { try { document.body.removeChild(ifrEl); } catch(e) {} }, 60000);
        }, 600);
        toast('Print dialog opening — choose "Save as PDF"');
        return;
      } catch(e) { _kieHideDownloadOverlay(); /* fall through */ }

      // FALLBACK: blob URL new tab
      const blob = new Blob([fullDoc], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      const printWin = window.open(url, '_blank');
      if (!printWin) {
        _kieHideDownloadOverlay();
        const a = document.createElement('a');
        a.href = url; a.download = title + '.html';
        a.style.display = 'none'; document.body.appendChild(a);
        a.click(); document.body.removeChild(a);
        toast('Resume saved to Downloads — open it and print as PDF');
        return;
      }
      printWin.onload = function() { setTimeout(function() { printWin.focus(); printWin.print(); _kieHideDownloadOverlay(); }, 600); };
      toast('Choose "Save as PDF" in the print dialog');
    }



    // ── KIE ───────────────────────────────────────────────────────────────────
    function loadKieHistory() {
      try {
        const saved = localStorage.getItem(KIE_LS_KEY);
        kieHist = saved ? JSON.parse(saved) : [];
      } catch { kieHist = []; }
      loadKieImageStore();
      loadKieFileStore();
    }
    // Persist attached images (base64) so they survive reload/navigation instead
    // of only living in the in-memory _kieImageStore Map, which is wiped on
    // every page load. Only images actually referenced by the messages we keep
    // (last 40) are stored, to avoid unbounded localStorage growth.
    function loadKieImageStore() {
      try {
        const saved = localStorage.getItem(KIE_IMG_LS_KEY);
        const obj   = saved ? JSON.parse(saved) : {};
        _kieImageStore.clear();
        Object.keys(obj).forEach(k => _kieImageStore.set(k, obj[k]));
      } catch { /* corrupt or missing — start empty */ }
    }
    function saveKieImageStore() {
      try {
        // Only keep entries referenced by the messages we're about to persist
        const keep = new Set(kieHist.slice(-40).filter(m => m.imageRef).map(m => m.imageRef));
        const obj  = {};
        keep.forEach(k => { const v = _kieImageStore.get(k); if (v) obj[k] = v; });
        localStorage.setItem(KIE_IMG_LS_KEY, JSON.stringify(obj));
      } catch {
        // Likely quota exceeded (base64 images are heavy) — drop the oldest
        // images and try again with just the most recent one so at least the
        // latest attachment survives a reload.
        try {
          const refs = kieHist.slice(-40).filter(m => m.imageRef).map(m => m.imageRef);
          const lastRef = refs[refs.length - 1];
          const v = lastRef && _kieImageStore.get(lastRef);
          localStorage.setItem(KIE_IMG_LS_KEY, v ? JSON.stringify({ [lastRef]: v }) : '{}');
        } catch { /* give up silently — chat still works, just without image persistence */ }
      }
    }
    // Same pattern as the image store, for uploaded PDFs/TXT files — so the
    // "tap to preview" file card still works after a reload/navigate-away.
    function loadKieFileStore() {
      try {
        const saved = localStorage.getItem(KIE_DOC_LS_KEY);
        const obj   = saved ? JSON.parse(saved) : {};
        _kieFileStore.clear();
        Object.keys(obj).forEach(k => _kieFileStore.set(k, obj[k]));
      } catch { /* corrupt or missing — start empty */ }
    }
    function saveKieFileStore() {
      try {
        const keep = new Set(kieHist.slice(-40).filter(m => m.fileRef).map(m => m.fileRef));
        const obj  = {};
        keep.forEach(k => { const v = _kieFileStore.get(k); if (v) obj[k] = v; });
        localStorage.setItem(KIE_DOC_LS_KEY, JSON.stringify(obj));
      } catch {
        try {
          const refs = kieHist.slice(-40).filter(m => m.fileRef).map(m => m.fileRef);
          const lastRef = refs[refs.length - 1];
          const v = lastRef && _kieFileStore.get(lastRef);
          localStorage.setItem(KIE_DOC_LS_KEY, v ? JSON.stringify({ [lastRef]: v }) : '{}');
        } catch { /* give up silently */ }
      }
    }
    // Stable per-user conversation id, created once and reused forever after.
    // This is what lets getConvSummary/generateConvSummary (server/kie.js,
    // already fully wired to consume a summary once one exists) actually have
    // something to key off — previously convId was always null since nothing
    // ever set it, so the summary system existed but silently never ran.
    function _getKieConvId() {
      try {
        let id = localStorage.getItem(KIE_CONVID_LS_KEY);
        if (!id) {
          id = 'kc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
          localStorage.setItem(KIE_CONVID_LS_KEY, id);
        }
        return id;
      } catch { return null; } // storage unavailable — convId stays null, chat works exactly as before
    }

    // Fires the (cheap, already-built) background summarizer every few turns
    // so a running summary stays available for later requests, without
    // calling it on literally every message. Fully fire-and-forget: never
    // awaited by callers, any failure is swallowed silently, and it can never
    // delay or block a chat response — matches how /api/kie/summarize itself
    // already responds instantly and does the real work after replying.
    let _kieSummaryLastLen = 0;
    async function _maybeTriggerKieSummary() {
      try {
        if (kieHist.length < 6) return;
        if (kieHist.length - _kieSummaryLastLen < 6) return; // every ~3 exchanges, not every message
        const convId = _getKieConvId();
        if (!convId || !usr) return;
        _kieSummaryLastLen = kieHist.length;
        const t = await usr.getIdToken();
        fetch('/api/kie/summarize', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
          body:    JSON.stringify({ messages: kieHist.slice(-12).map(m => ({ role: m.role, content: m.content })), convId }),
        }).catch(() => {}); // deliberately not awaited beyond the token fetch — background only
      } catch { /* never let this affect the actual chat flow */ }
    }

    function saveKieHistory() {
      try {
        const data = JSON.stringify(kieHist.slice(-40));
        localStorage.setItem(KIE_LS_KEY, data);
        // Save to per-conversation key so sidebar history can restore it
        // Try both uid-scoped and guest fallback
        const tryUid = window._currentUid || 'guest';
        const activeId = localStorage.getItem('kievora_kie_active_' + tryUid)
                      || localStorage.getItem('kievora_kie_active_guest');
        if (activeId) {
          localStorage.setItem('kieHistory_' + activeId, data);
        }
      } catch {}
      saveKieImageStore();
      saveKieFileStore();
      _maybeTriggerKieSummary(); // fire-and-forget, never blocks or throws into this function
    }
    function restoreKieUI() {
      const msgs = g('kieMsgs');
      const welcome = g('kieWelcome');
      // Remove all messages except typing indicator
      Array.from(msgs.children).forEach(c => { if (!c.id || c.id !== 'kieTyp') c.remove(); });
      if (kieHist.length === 0) {
        msgs.style.display = 'none';
        if (welcome) welcome.style.display = 'flex';
      } else {
        msgs.style.display = 'flex';
        if (welcome) welcome.style.display = 'none';
        kieHist.forEach(m => {
          if (m.role !== 'user' && m.fileCard && m.fileCard.html) {
            appendKiePrintCard(m.fileCard.name, m.fileCard.html, m.content, true);
          } else if (m.role !== 'user' && m.templatePicker) {
            showKieTemplatePicker(m.content || '', false);
          } else if (m.role === 'user' && m.imageRef) {
            const imgData = _kieImageStore.get(m.imageRef);
            if (imgData) {
              const dataUrl = `data:${imgData.mimeType || 'image/jpeg'};base64,${imgData.base64}`;
              // Don't show the auto-generated placeholder text as a caption
              const caption = (m.content && m.content !== '[Image sent]') ? m.content : '';
              _appendKieImageMsg(dataUrl, caption);
            } else {
              // Image data aged out of storage — show a plain fallback so the
              // conversation flow still makes sense
              appendKMsg('user', (m.content && m.content !== '[Image sent]') ? m.content : '📷 Image (no longer available)', false);
            }
          } else if (m.role === 'user' && m.fileRef) {
            // Keep the file card (and its preview capability) alive across a
            // reload, same pattern as images. If the actual bytes aged out of
            // storage, the card still shows and preview falls back gracefully
            // to "Preview unavailable" inside openKieFilePreview.
            if (!_kieFileStore.has(m.fileRef)) {
              _kieFileStore.set(m.fileRef, { base64: '', mimeType: '', name: m.fileName || 'File', ext: m.fileExt || 'file' });
            }
            _appendKieFileMsg(m.fileRef, m.fileName || 'File', m.fileExt || 'file', m.content);
          } else {
            appendKMsg(m.role === 'user' ? 'user' : 'ai', m.content, false, null, m.sources || null, m.mode || null, m.images || null);
          }
        });
        scrollKie();
      }
    }

    let _kieReturnView = 'home';
    // ── BUILD RESUME CONTEXT FOR KIE COACHING ────────────────────────────────
    function buildResumeContext(r) {
      if (!r || !r.resumeData) return '';
      const d = r.resumeData;
      const lines = ['=== USER\'S CURRENT RESUME ==='];
      if (d.fullName)  lines.push(`Name: ${d.fullName}`);
      if (d.jobTitle)  lines.push(`Target Role: ${d.jobTitle}`);
      if (d.location)  lines.push(`Location: ${d.location}`);
      if (d.email)     lines.push(`Email: ${d.email}`);
      if (d.summary)   lines.push(`\nProfessional Summary:\n${d.summary}`);
      if (d.workExperience?.length) {
        lines.push('\nWork Experience:');
        d.workExperience.forEach(e => {
          lines.push(`- ${e.position||''} at ${e.company||''} (${e.startDate||''} – ${e.endDate||'Present'})`);
          if (e.description) lines.push(`  ${e.description}`);
        });
      }
      if (d.education?.length) {
        lines.push('\nEducation:');
        d.education.forEach(e => {
          lines.push(`- ${e.degree||''} in ${e.field||''} — ${e.school||''} (${e.graduationDate||''})`);
        });
      }
      if (d.skills?.length) lines.push(`\nSkills: ${d.skills.join(', ')}`);
      if (d.certifications?.length) {
        lines.push('\nCertifications:');
        d.certifications.forEach(c => lines.push(`- ${c.name}${c.issuer ? ' · ' + c.issuer : ''}${c.date ? ' · ' + c.date : ''}`));
      }
      if (d.projects?.length) {
        lines.push('\nProjects:');
        d.projects.forEach(p => { lines.push(`- ${p.name}${p.url ? ' ('+p.url+')' : ''}`); if(p.description) lines.push(`  ${p.description}`); });
      }
      if (d.languages?.length) lines.push(`\nLanguages: ${d.languages.map(l => l.language + ' (' + l.proficiency + ')').join(', ')}`);
      lines.push(`\nTemplate: ${r.templateType||'classic'}`);
      lines.push('=== END RESUME ===');
      return lines.join('\n');
    }

    // ── RESUME PICKER ─────────────────────────────────────────────────────────
    // Sets the visible name inside a pill using a dedicated shrinkable span,
    // so a long resume name ellipsis-truncates instead of pushing the ×
    // dismiss button out of view.
    function setKieRpillLabel(pill, text) {
      const label = document.createElement('span');
      label.className = 'kie-rpill-label';
      label.textContent = text;
      pill.appendChild(label);
    }

    // Empty state — no saved resume and nothing uploaded yet. The icon is
    // always visible now, so this is what someone sees the first time they
    // open the dropdown with nothing to coach on.
    function renderKieEmptyPicker(pillsEl) {
      const empty = document.createElement('div');
      empty.className = 'kie-rpill-empty';
      empty.id = 'kieRpillEmpty';
      empty.innerHTML =
        '<div class="kie-rpill-empty-msg">No resume yet</div>' +
        '<button type="button" class="kie-rpill-action" onclick="closeKieResumeDropdown();showView(\'tpick\')">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          'Create a resume' +
        '</button>' +
        '<button type="button" class="kie-rpill-action" onclick="closeKieResumeDropdown();openKieAttachSheet()">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>' +
          'Upload a resume' +
        '</button>';
      pillsEl.appendChild(empty);
    }

    function setupKiePicker() {
      const picker  = g('kieResumePicker');
      const pillsEl = g('kieResumePills');
      if (!picker || !pillsEl) return;

      pillsEl.innerHTML = '';
      closeKieResumeDropdown();

      if (!resumes || resumes.length === 0) {
        kieResumeContext = 'NO_RESUME_YET';
        renderKieEmptyPicker(pillsEl);
        updateKieTplIndicator();
        return;
      }

      resumes.forEach((r, i) => {
        const name = r.resumeName || r.resumeData?.fullName || `Resume ${i + 1}`;
        const pill = document.createElement('button');
        pill.className = 'kie-rpill';
        setKieRpillLabel(pill, name);
        pill.title = 'Tap to coach on this resume';
        pill.onclick = () => selectKieResume(i);
        // Restore active state if this resume was previously selected
        if (kieSelectedResume && kieSelectedResume.id === r.id) {
          pill.className = 'kie-rpill active';
          renderKieResumeDismiss(pill, i);
        }
        pillsEl.appendChild(pill);
      });

      // If no resume is selected, set unselected context; if one is selected keep its context
      if (!kieSelectedResume) {
        kieResumeContext = 'HAS_RESUMES_UNSELECTED';
      }
      updateKieTplIndicator();
    }

    // Icon-triggered dropdown for the picker above (icon replaces the old always-on bar)
    window.toggleKieResumeDropdown = function(e) {
      if (e) e.stopPropagation();
      const panel = g('kieResumePicker');
      const btn   = g('kieTemplateBtn');
      if (!panel) return;
      const opening = !panel.classList.contains('open');
      panel.classList.toggle('open', opening);
      if (btn) btn.classList.toggle('open', opening);
    };

    // Global (not just an internal helper) since the empty-state's "Create a
    // resume" / "Upload a resume" rows call this directly from inline onclick.
    window.closeKieResumeDropdown = function() {
      const panel = g('kieResumePicker');
      const btn   = g('kieTemplateBtn');
      if (panel) panel.classList.remove('open');
      if (btn) btn.classList.remove('open');
    };

    // Small dot on the template icon so it's clear at a glance whether KIE is
    // currently coaching on a resume, since that's no longer visible inline.
    function updateKieTplIndicator() {
      const dot = g('kieTplDot');
      if (!dot) return;
      const hasActive = !!kieSelectedResume || (!!kieResumeContext && kieResumeContext !== 'NO_RESUME_YET' && kieResumeContext !== 'HAS_RESUMES_UNSELECTED');
      dot.classList.toggle('on', hasActive);
    }

    // Close the dropdown on outside tap (same pattern as closeCtxMenu in dashboard-kie-sidebar.js)
    document.addEventListener('click', (e) => {
      const panel = g('kieResumePicker');
      if (panel && panel.classList.contains('open') && !e.target.closest('#kieTplWrap')) {
        closeKieResumeDropdown();
      }
    });

    // Renders a small × dismiss button inside an active pill
    function renderKieResumeDismiss(pill, index) {
      // Remove any existing dismiss
      const existing = pill.querySelector('.kie-rpill-dismiss');
      if (existing) existing.remove();
      const x = document.createElement('span');
      x.className = 'kie-rpill-dismiss';
      x.textContent = '×';
      x.title = 'Remove resume from KIE';
      x.onclick = (e) => {
        e.stopPropagation();
        dismissKieResume();
      };
      pill.appendChild(x);
    }

    // Removes the active resume from KIE context
    window.dismissKieResume = function() {
      kieSelectedResume = null;
      kieResumeContext  = resumes?.length ? 'HAS_RESUMES_UNSELECTED' : 'NO_RESUME_YET';
      kieDocContext     = '';
      _kiePendingFileText = '';
      _kiePendingFileName = '';
      document.querySelectorAll('.kie-rpill:not(.kie-rpill-uploaded)').forEach(p => {
        p.classList.remove('active');
        const x = p.querySelector('.kie-rpill-dismiss');
        if (x) x.remove();
      });
      const uploadedPill = document.querySelector('.kie-rpill-uploaded');
      if (uploadedPill) {
        uploadedPill.classList.remove('active');
        const x = uploadedPill.querySelector('.kie-rpill-dismiss');
        if (x) x.remove();
      }
      const attachBtn = g('kieAttachBtn');
      if (attachBtn) attachBtn.classList.remove('has-resume');
      updateKieTplIndicator();
    };

    window.selectKieResume = function(index) {
      const r = resumes[index];
      if (!r) return;

      // Don't re-trigger analysis if same resume already loaded
      if (kieSelectedResume && kieSelectedResume.id === r.id) return;

      // Clear active state from all pills and dismiss buttons
      document.querySelectorAll('.kie-rpill:not(.kie-rpill-uploaded)').forEach(p => {
        p.classList.remove('active');
        const x = p.querySelector('.kie-rpill-dismiss');
        if (x) x.remove();
      });
      const uploadedPill = g('kieResumePills')?.querySelector('.kie-rpill-uploaded');
      if (uploadedPill) uploadedPill.classList.remove('active');

      // Activate the selected pill and add dismiss button
      const pills = document.querySelectorAll('.kie-rpill:not(.kie-rpill-uploaded)');
      if (pills[index]) {
        pills[index].classList.add('active');
        renderKieResumeDismiss(pills[index], index);
      }

      kieSelectedResume  = r;
      kieResumeContext   = buildResumeContext(r);
      // ── Track profession for jobs swiper ──────────────────────────────────
      const _kieJobTitle = r.resumeData?.jobTitle;
      if (_kieJobTitle) setJobProfession(_kieJobTitle, 'kie');
      const btn = g('kieAttachBtn');
      if (btn) btn.classList.add('has-resume');
      updateKieTplIndicator();
      closeKieResumeDropdown();

      const name = r.resumeName || r.resumeData?.fullName || 'your resume';
      sendKieRecommendation(name);
    };

    // Silently consumes an /api/kie SSE stream and returns the full concatenated
    // reply text. For internal/background AI calls that don't need live typing UI
    // (resume patch generation, auto-greetings, confirmation scanning). The main
    // visible chat stream has its own separate live-rendering reader — this is
    // NOT a replacement for that, just the correct way to read the SAME kind of
    // stream when you only need the final text.
    //
    // BUG FIX: every one of these background calls used to do `await res.json()`
    // on this endpoint, but /api/kie always responds as text/event-stream, never
    // a single JSON object — that call was guaranteed to throw a SyntaxError
    // every single time, silently swallowed by a try/catch that fell back to a
    // generic hardcoded message. That's why resume-select intros, first-time
    // category greetings, resume-edit PDF regeneration, and confirmation
    // scanning never actually produced real AI output — they always failed and
    // fell back.
    async function _kieCallSilent(payload, signal) {
      const res = await fetch('/api/kie', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body:    JSON.stringify(payload),
        signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '', fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let chunk;
          try { chunk = JSON.parse(line.slice(6)); } catch { continue; }
          if (chunk.t === 'd') fullText += chunk.v;
          else if (chunk.t === 'err') throw new Error(chunk.v || 'KIE error');
        }
      }
      return fullText;
    }

    async function sendKieRecommendation(resumeName) {
      // If already generating, stop it first before loading the resume
      if (_kieGenerating) stopKieGeneration();

      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';
      if (g('kieMsgs'))   g('kieMsgs').style.display   = 'flex';
      g('kieTyp').style.display = 'flex';
      showKieStatus(kieMode);
      scrollKie();

      _kieGenerating = true;
      _kieStopTyping = false;
      _kieAbort = new AbortController();
      g('kieInp').disabled = true;
      setKieSendMode('stop');

      // If there's already a conversation going, KIE acknowledges it and ties the resume to that context
      const hasOngoingConv = kieHist.length > 0;
      const prompt = hasOngoingConv
        ? `The user has just tapped their resume "${resumeName}" while we're in the middle of a conversation. Acknowledge this naturally in 1-2 sentences — say something like "Oh nice, now I can see your resume" and connect it to what we've been talking about. Then give one specific observation from their actual resume that's relevant to our current conversation. End with one concrete action, introduced by a short bolded label + colon (vary it — "**Your move:**", "**Next step:**", "**Try this:**", etc.). Stay warm and direct — don't restart the conversation, just fold the resume in.`
        : `You just loaded "${resumeName}" to coach the user on. Give a warm 2-3 sentence intro: mention one thing that looks strong and one clear area to work on based on what you see. End with one specific action, introduced by a short bolded label + colon (vary it — "**Your move:**", "**Next step:**", "**Try this:**", etc.). Be personal and direct — no generic advice.`;

      // Include conversation history so the response is contextually relevant
      const messagesPayload = hasOngoingConv
        ? [...kieHist, { role: 'user', content: prompt }]
        : [{ role: 'user', content: prompt }];

      try {
        const reply = await _kieCallSilent(
          { messages: messagesPayload, mode: kieMode, model: kieModel, resumeContext: kieResumeContext },
          _kieAbort?.signal
        ) || `Got it — I'm looking at ${resumeName} now. What do you want to work on?`;
        logEvent('kie_chat', { model: kieModel, mode: kieMode });
        kieHist.push({ role: 'assistant', content: reply });
        saveKieHistory();
        g('kieTyp').style.display = 'none';
        hideKieStatus();
        appendKMsg('ai', reply, true);
        // appendKMsg typewriter restores button when done
      } catch (e) {
        if (e.name === 'AbortError') return;
        g('kieTyp').style.display = 'none';
        hideKieStatus();
        appendKMsg('ai', `Got it — I'm looking at ${resumeName} now. What do you want to work on?`, true);
        _kieGenerating = false;
        g('kieInp').disabled = false;
        setKieSendMode('send');
      }
      scrollKie();
    }

    // ── PDF TEXT RECONSTRUCTION ──────────────────────────────────────────────
    // pdf.js doesn't return text per-word — for some PDF font encodings it
    // returns one item per GLYPH. Blindly joining every item with a literal
    // space (the old behaviour) turns "Ayotomiwa" into "A y o t o m i w a".
    // Instead, only insert a space when the real gap between two items is
    // wide enough to be a genuine word break, and use vertical position to
    // detect line breaks rather than forcing a newline after every page.
    function pdfItemsToText(items) {
      let out = '';
      let prev = null;
      for (const it of items) {
        const str = it.str || '';
        if (!str) { prev = null; continue; } // empty items are pdf.js's own gap markers, not glyphs
        if (prev) {
          const sameLine = Math.abs(it.transform[5] - prev.transform[5]) < 2;
          if (!sameLine) {
            out += '\n';
          } else {
            const prevEndX     = prev.transform[4] + (prev.width || 0);
            const gap          = it.transform[4] - prevEndX;
            const charWidthAvg = (prev.width || 4) / Math.max(prev.str.length, 1);
            if (gap > charWidthAvg * 0.4) out += ' ';
          }
        }
        out += str;
        prev = it;
      }
      return out;
    }

    // ── PDF EXTRACTION (lazy-loads PDF.js) ───────────────────────────────────
    async function extractPdfText(file) {
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          s.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve();
          };
          s.onerror = () => reject(new Error('PDF reader failed to load'));
          document.head.appendChild(s);
        });
      }
      const buf  = await file.arrayBuffer();
      const pdf  = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let text   = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += pdfItemsToText(content.items) + '\n';
      }
      return text.trim();
    }

    // ── KIE ATTACH SHEET — replaces the old direct-to-native-picker button
    // with a custom options sheet (Take Photo / Choose Photo / Choose File),
    // each routing to its own hidden input so the OS opens straight into the
    // right picker instead of a generic "everything" file browser. Built the
    // same way as openModelDrawer()/openSourcesDrawer() for consistency.
    window.openKieAttachSheet = function() {
      let sheet = document.getElementById('kieAttachSheet');
      if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'kieAttachSheet';
        sheet.innerHTML = `
          <div class="kmd-backdrop" onclick="closeKieAttachSheet()"></div>
          <div class="kmd-sheet">
            <div class="kmd-handle"></div>
            <div class="kmd-hdr-inner">
              <div class="kmd-title">Add to chat</div>
            </div>
            <div class="kmd-list">
              <div class="kmd-item" onclick="triggerKieAttach('camera')">
                <div class="kas-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>
                <div class="kmd-item-body">
                  <div class="kmd-item-name">Take Photo</div>
                  <div class="kmd-item-tag">Snap a resume or document</div>
                </div>
              </div>
              <div class="kmd-item" onclick="triggerKieAttach('photo')">
                <div class="kas-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>
                <div class="kmd-item-body">
                  <div class="kmd-item-name">Choose Photo</div>
                  <div class="kmd-item-tag">From your library</div>
                </div>
              </div>
              <div class="kmd-item" onclick="triggerKieAttach('file')">
                <div class="kas-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></div>
                <div class="kmd-item-body">
                  <div class="kmd-item-name">Choose File</div>
                  <div class="kmd-item-tag">PDF or TXT resume</div>
                </div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(sheet);
        setTimeout(() => sheet.classList.add('open'), 10);
      } else {
        sheet.classList.add('open');
      }
    };

    window.closeKieAttachSheet = function() {
      const sheet = document.getElementById('kieAttachSheet');
      if (sheet) sheet.classList.remove('open');
    };

    window.triggerKieAttach = function(kind) {
      closeKieAttachSheet();
      const id = kind === 'camera' ? 'kieFileInputCamera' : kind === 'photo' ? 'kieFileInputPhoto' : 'kieFileInputDoc';
      const input = g(id);
      if (input) input.click();
    };

    // ── KIE FILE UPLOAD — STAGING (no auto-send) ─────────────────────────────
    window.handleKieFileUpload = async function(input) {
      const file = input.files?.[0];
      if (!file) return;
      input.value = '';

      const ext     = file.name.split('.').pop().toLowerCase();
      const isImage = file.type.startsWith('image/');

      if (!isImage && !['pdf','txt'].includes(ext)) {
        toast('Supported: images (JPG/PNG/WEBP), PDF, or TXT files', 'err');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { toast('File too large — max 10 MB', 'err'); return; }

      if (isImage) {
        const reader = new FileReader();
        reader.onload = function(e) {
          _stagedKieAttachment = {
            type: 'image', file,
            dataUrl:  e.target.result,
            mimeType: file.type || 'image/jpeg',
            name: file.name, size: file.size,
          };
          _showKieAttachStage('image', file.name, e.target.result);
        };
        reader.readAsDataURL(file);
      } else {
        _stagedKieAttachment = {
          type: ext, file,
          name: file.name, size: file.size,
        };
        _showKieAttachStage(ext, file.name, null);
        // Read the raw bytes too (separate from the later text-extraction pass)
        // so the "tap to preview" file card has something to render from.
        try {
          const previewDataUrl = await new Promise((resolve, reject) => {
            const reader2 = new FileReader();
            reader2.onload  = () => resolve(reader2.result);
            reader2.onerror = reject;
            reader2.readAsDataURL(file);
          });
          if (_stagedKieAttachment && _stagedKieAttachment.file === file) {
            _stagedKieAttachment.previewDataUrl = previewDataUrl;
          }
        } catch { /* preview just won't be available for this file — non-fatal */ }
      }
      setTimeout(() => g('kieInp').focus(), 80);
    };

    function _showKieAttachStage(type, name, dataUrl) {
      const stage   = g('kieAttachStage');
      const thumb   = g('kieAttachThumb');
      const ico     = g('kieAttachIco');
      const nameEl  = g('kieAttachName');
      const typeEl  = g('kieAttachType');
      if (!stage) return;
      nameEl.textContent = name;
      if (type === 'image') {
        thumb.src           = dataUrl;
        thumb.style.display = 'block';
        ico.style.display   = 'none';
        typeEl.textContent  = 'Image';
      } else {
        thumb.style.display = 'none';
        ico.style.display   = 'flex';
        typeEl.textContent  = type.toUpperCase();
      }
      stage.classList.add('visible');
    }

    window.clearKieAttachStage = function() {
      _stagedKieAttachment = null;
      const stage = g('kieAttachStage');
      if (stage) stage.classList.remove('visible');
      const thumb = g('kieAttachThumb');
      if (thumb) { thumb.src = ''; thumb.style.display = 'none'; }
    };

    // Applies a confirmed resume analysis: tags the "Uploaded Resume" pill,
    // sets kieResumeContext, and renders the ATS report message. Shared by
    // the normal upload path and the "yes, score it as my resume" promotion
    // path (kieConfirmPendingResume) so both end up in the exact same state.
    function _applyResumeAnalysisResult(analysis, resumeText, userPrompt) {
      if (analysis.jobTitle) setJobProfession(analysis.jobTitle, 'kie');
      kieResumeContext  = resumeText.slice(0, 5000);
      kieDocContext     = ''; // promoted — no longer "pending", it's the resume now
      _kiePendingFileText = '';
      _kiePendingFileName = '';
      kieSelectedResume = null;
      const btn = g('kieAttachBtn');
      if (btn) btn.classList.add('has-resume');

      // Activate uploaded pill
      const picker  = g('kieResumePicker');
      const pillsEl = g('kieResumePills');
      if (picker && pillsEl) {
        pillsEl.querySelector('#kieRpillEmpty')?.remove();
        document.querySelectorAll('.kie-rpill').forEach(p => {
          p.classList.remove('active');
          const x = p.querySelector('.kie-rpill-dismiss'); if (x) x.remove();
        });
        let uPill = pillsEl.querySelector('.kie-rpill-uploaded');
        if (!uPill) {
          uPill = document.createElement('button');
          uPill.className = 'kie-rpill kie-rpill-uploaded';
          setKieRpillLabel(uPill, '📎 Uploaded Resume');
          pillsEl.prepend(uPill);
        }
        uPill.classList.add('active');
        let xBtn = uPill.querySelector('.kie-rpill-dismiss');
        if (!xBtn) {
          xBtn = document.createElement('span');
          xBtn.className = 'kie-rpill-dismiss';
          xBtn.textContent = '×';
          xBtn.onclick = e => { e.stopPropagation(); dismissKieResume(); };
          uPill.appendChild(xBtn);
        }
        updateKieTplIndicator();
      }

      const grade = analysis.grade || '—';
      const score = analysis.atsScore ?? '—';
      const name  = analysis.fullName ? `**${analysis.fullName}**` : 'your resume';
      let msg;
      if (analysis.gateLocked) {
        msg = userPrompt
          ? `Got it — I've read your file. ${analysis.upgradeMessage || 'Upgrade to see your full ATS score and breakdown.'}\n\n`
          : `Alright, I've gone through ${name}. ${analysis.upgradeMessage || 'Upgrade to see your full ATS score and breakdown.'}\n\n`;
        msg += `In the meantime, tell me what you'd like help with and I'll work with you on it directly.`;
      } else {
        msg = userPrompt
          ? `Got it — I've read your file. Here's a quick take:\n\n`
          : `Alright, I've gone through ${name}. Here's my honest read:\n\n`;
        msg += `**ATS Score: ${score}/100 · Grade: ${grade}**\n\n`;
        if (analysis.strengths?.length)
          msg += `**What's working:**\n${analysis.strengths.map(s => `✓ ${s}`).join('\n')}\n\n`;
        if (analysis.weaknesses?.length)
          msg += `**What needs fixing:**\n${analysis.weaknesses.map(w => `⚠ ${w}`).join('\n')}\n\n`;
        if (userPrompt)
          msg += `You also said: "${userPrompt}" — `;
        msg += `**Want a real downloadable PDF?** Say "build me a resume" and I'll turn this into a full Kievora resume — pick from 13 templates and download it anytime. 📄\n\nOr tell me which area above to fix first.`;
      }

      appendKMsg('ai', msg, true);
      kieHist.push({ role: 'assistant', content: msg });
      saveKieHistory();
    }

    // Promotes a pending (not-yet-confirmed) uploaded file into a full resume
    // analysis — triggered by the "Yes, score it as my resume" button that
    // shows up when KIE reads a file it doesn't recognize as a resume but the
    // user then says otherwise.
    window.kieConfirmPendingResume = async function() {
      if (!_kiePendingFileText) return;
      const text = _kiePendingFileText;
      g('kieTyp').style.display = 'flex';
      _setKieStatusCustom(['Scoring it as a resume…']);
      scrollKie();
      try {
        try { tok = await usr.getIdToken(); } catch (_) { /* use existing */ }
        const res = await fetch('/api/analyze-resume', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body:    JSON.stringify({ resumeText: text, forceResume: true }),
        });
        const analysis = await res.json();
        g('kieTyp').style.display = 'none'; hideKieStatus();
        if (analysis.error) {
          const errMsg = `Trouble analysing that file. ${analysis.error}`;
          appendKMsg('ai', errMsg, true);
          kieHist.push({ role: 'assistant', content: errMsg });
          saveKieHistory();
          return;
        }
        _applyResumeAnalysisResult(analysis, text, '');
      } catch (err) {
        g('kieTyp').style.display = 'none'; hideKieStatus();
        const failMsg = 'Had a problem scoring that file — try again in a moment.';
        appendKMsg('ai', failMsg, true);
        kieHist.push({ role: 'assistant', content: failMsg });
        saveKieHistory();
      }
    };

    // ── PROCESS PDF/TXT ATTACHMENT (called from sendKie after staging) ────────
    async function _processKieFileAttachment(att, userPrompt) {
      if (_kieGenerating) stopKieGeneration();
      _kieGenerating = true;
      _kieStopTyping = false;
      _kieAbort = new AbortController();
      g('kieInp').disabled = true;
      setKieSendMode('stop');

      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';
      if (g('kieMsgs'))   g('kieMsgs').style.display    = 'flex';

      g('kieTyp').style.display = 'flex';
      _setKieStatusCustom(['Reading your file…', 'Extracting content…', 'Analysing…']);
      scrollKie();

      try {
        const resumeText = att.type === 'txt'
          ? await att.file.text()
          : await extractPdfText(att.file);

        if (resumeText.trim().length < 30) {
          g('kieTyp').style.display = 'none'; hideKieStatus();
          const shortMsg = "Couldn't extract text from that file — it might be a scanned image PDF. Try pasting your content directly into the chat. 🙏";
          appendKMsg('ai', shortMsg, true);
          // The user's file message was already pushed to kieHist by sendKie()
          // before this function ran — save now so it (and this reply) survive
          // a reload, instead of only living in memory until some later turn
          // happens to trigger a save.
          kieHist.push({ role: 'assistant', content: shortMsg });
          saveKieHistory();
          return;
        }

        // Refresh auth token before API call (Bug #3 fix — tokens expire after 1hr)
        try { tok = await usr.getIdToken(); } catch (_) { /* use existing */ }

        // forceResume is deliberately omitted here — this is a plain KIE chat
        // attachment, not the dedicated Upload & Analyze tool, so the server
        // honestly classifies what the file actually is first instead of
        // assuming every upload is a resume.
        const analysisRes = await fetch('/api/analyze-resume', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body:    JSON.stringify({ resumeText }),
          signal:  _kieAbort?.signal,
        });
        const analysis = await analysisRes.json();
        g('kieTyp').style.display = 'none'; hideKieStatus();
        logEvent('analyze_resume', { model: kieModel });

        if (analysis.error) {
          const errMsg = `Trouble analysing that file. ${analysis.error}`;
          appendKMsg('ai', errMsg, true);
          kieHist.push({ role: 'assistant', content: errMsg });
          saveKieHistory();
          return;
        }

        // Not a resume — keep the file's text on hand as background context
        // (so the conversation can keep referencing it) without tagging it
        // "Uploaded Resume" or forcing an ATS score onto content that was
        // never a resume in the first place. If the user confirms afterward
        // that it IS their resume, [CONFIRM_RESUME_CTA] promotes it.
        if (analysis.isResume === false) {
          _kiePendingFileText = resumeText;
          _kiePendingFileName = att.name || 'your file';
          kieDocContext = resumeText.slice(0, 5000);

          const docType = analysis.docType || 'document';
          const note    = analysis.docNote || `This looks like a ${docType}, not a resume.`;
          let msg = userPrompt
            ? `Got it — I've read your file. ${note}\n\n`
            : `Alright, I've gone through it. ${note}\n\n`;

          // Only dangle "score it as my resume" when there's a realistic
          // chance that's actually what the user meant — showing that button
          // under an obviously unrelated file (a legal contract, an invoice)
          // reads as the AI not having actually understood what it just read.
          if (analysis.couldBeResume) {
            msg += `Happy to talk it through, help with whatever you're actually after, or if I've got it wrong and this is meant to be your resume, just say so.\n\n[CONFIRM_RESUME_CTA]`;
          } else {
            msg += `Happy to talk it through or help with whatever you're actually after.`;
          }

          appendKMsg('ai', msg, true);
          kieHist.push({ role: 'assistant', content: msg });
          saveKieHistory();
          return;
        }

        _applyResumeAnalysisResult(analysis, resumeText, userPrompt);
      } catch (err) {
        if (err.name === 'AbortError') {
          // The user's file message is already in kieHist (pushed by sendKie()
          // before this ran) — save it even though the reply never came back,
          // so the attachment doesn't just vanish on reload.
          saveKieHistory();
          return;
        }
        g('kieTyp').style.display = 'none'; hideKieStatus();
        const failMsg = 'Had a problem reading that file. Make sure it\'s a proper PDF with selectable text, or paste your resume directly into the chat. 🙏';
        appendKMsg('ai', failMsg, true);
        kieHist.push({ role: 'assistant', content: failMsg });
        saveKieHistory();
      }
    }

    // Re-focusing the input after every KIE reply is nice on desktop (cursor
    // ready to type) but on touch devices it force-opens the on-screen
    // keyboard right after a reply finishes, covering half the screen while
    // the person is just trying to read. Only auto-focus on non-touch input,
    // and never while the live voice overlay is open.
    function _kieSafeFocusInput(inp) {
      if (!inp) return;
      const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const liveOpen = document.getElementById('kieLiveOverlay')?.classList.contains('open');
      if (isTouch || liveOpen) return;
      inp.focus();
    }

    function openKie() {
      loadKieHistory();
      _kieReturnView = document.querySelector('.view.active')?.id?.replace('v-','') || 'home';
      setupKiePicker();
      showView('kie');
      restoreKieUI();
      if(typeof ensureGmailFreshAndAlert==='function') ensureGmailFreshAndAlert().catch(()=>{});
    }
    function closeKie() { showView(_kieReturnView || 'home'); }

    // ── KIE CATEGORY GREETING ───────────────────────────────────────────────
    // The first time a user opens KIE (before they've uploaded/talked about
    // their resume), KIE proactively greets them based on the category they
    // picked during onboarding — so it feels like KIE already knows them.
    function getKieCatGreetKey() { return `kievora_kie_cat_greeted_${usr?.uid || 'anon'}`; }
    async function maybeSendKieCategoryGreeting() {
      if (kieHist.length > 0) return;                 // already chatting — don't interrupt
      if (localStorage.getItem(getKieCatGreetKey())) return; // already greeted once
      const cat = (typeof getUserCategory === 'function') ? getUserCategory() : null;
      if (!cat) return;                                // no onboarding category — nothing to personalise with

      localStorage.setItem(getKieCatGreetKey(), '1');

      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';
      if (g('kieMsgs'))    g('kieMsgs').style.display    = 'flex';
      g('kieTyp').style.display = 'flex';
      showKieStatus(kieMode);
      scrollKie();

      const prompt = `You're meeting this user for the very first time inside Kievora. During sign-up they told us their professional category is "${cat}". Greet them warmly like you already have a sense of who they are — reference their field naturally (e.g. "Since you're into ${cat}…"). In 2-3 sentences: (1) welcome them, (2) say something specific and useful about what you can help with in ${cat} (career moves, interview prep, resumes, salary, etc.), and (3) invite them to upload their resume or tell you what they're working on right now so you can get more specific. Keep it conversational, warm, and not generic — like a knowledgeable friend, not a corporate bot. End with a short inviting question.`;

      try {
        const reply = await _kieCallSilent(
          { messages: [{ role: 'user', content: prompt }], mode: kieMode, model: kieModel, resumeContext: kieResumeContext }
        ) || `Hey! Since you're into ${cat}, I can help with resumes, interview prep, salary negotiation and job hunting in that space. Want to upload your resume, or just tell me what you're working on?`;
        kieHist.push({ role: 'assistant', content: reply });
        saveKieHistory();
        g('kieTyp').style.display = 'none';
        hideKieStatus();
        appendKMsg('ai', reply, true);
      } catch (e) {
        g('kieTyp').style.display = 'none';
        hideKieStatus();
        appendKMsg('ai', `Hey! Since you're into ${cat}, I can help with resumes, interview prep, salary negotiation and job hunting in that space. Want to upload your resume, or just tell me what you're working on?`, true);
      }
      scrollKie();
    }

    // ── KIE MODE CONFIGS (client-side labels/status) ──────────────────────────
    const KIE_MODE_CFG = {
      default:  { status: ['Thinking…', 'Crafting your answer…', 'Almost there…'] },
      deep:     { status: ['Thinking deeply…', 'Analyzing all angles…', 'Building your strategy…', 'Reviewing the details…'] },
      // BUG FIX: this used to say "Searching the web…/Scanning…/Pulling latest
      // trends…" on a fixed timer even when no search was happening — pure
      // theater. Real search now drives its own status via SSE 'search' events
      // (see _kieShowRealSearch), which overrides this almost immediately when
      // a search actually fires. This fallback text only shows in the brief gap
      // before that, or if live search isn't configured — so it stays honest.
      web:      { status: ['Thinking it through…', 'Connecting the market context…', 'Almost there…'] },
      quick:    { status: ['Getting straight to it…', 'Finding the key point…'] },
      creative: { status: ['Thinking outside the box…', 'Cooking up something bold…', 'Breaking the rules…'] },
    };

    window.setKieMode = function(mode, el) {
      if (!isModeUnlocked(mode)) {
        lockTapped(mode === 'web' ? 'kieWebSearch' : 'kieCreativeMode');
        return; // stay on whatever mode was active — never switch into a locked one
      }
      kieMode = mode;
      document.querySelectorAll('.kie-mode-pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
    };

    // Adds a small "🔒 Premium" badge to the Recruiter View button when locked.
    // Tapping is already handled inside runRecruiterIntel() above.
    function renderRecruiterViewLock() {
      const btn = g('recruiterIntelBtn');
      if (!btn) return;
      const locked = !isFeatureUnlocked('recruiterView');
      btn.classList.toggle('rec-btn-locked', locked);
      let badge = btn.querySelector('.pill-lock-badge');
      if (locked && !badge) {
        badge = document.createElement('span');
        badge.className = 'pill-lock-badge';
        badge.textContent = '🔒';
        btn.appendChild(badge);
      } else if (!locked && badge) {
        badge.remove();
      }
    }

    // Adds a small "🔒 Premium" suffix to the ATS "What does this mean?" button
    // when the explanation itself is locked. Tapping is already handled inside
    // openATSDrawer() above — this is just the visual cue.
    function renderAtsExplanationLock() {
      const locked = !isFeatureUnlocked('atsExplanation');
      document.querySelectorAll('[onclick^="openATSDrawer("]').forEach(btn => {
        btn.classList.toggle('ats-info-locked', locked);
        let badge = btn.querySelector('.pill-lock-badge');
        if (locked && !badge) {
          badge = document.createElement('span');
          badge.className = 'pill-lock-badge';
          badge.textContent = '🔒';
          btn.appendChild(badge);
        } else if (!locked && badge) {
          badge.remove();
        }
      });
    }

    // Adds/removes the small lock badge on the Web Search & Creative pills and
    // dims them when not on a plan that unlocks them. Tapping a locked pill is
    // still handled by setKieMode() above — this is just the visual cue.
    function renderModeLocks() {
      const modesEl = g('kieModes');
      if (!modesEl) return;
      [['web','kieWebSearch'],['creative','kieCreativeMode']].forEach(([mode]) => {
        const pill = modesEl.querySelector(`.kie-mode-pill[data-mode="${mode}"]`);
        if (!pill) return;
        const locked = !isModeUnlocked(mode);
        pill.classList.toggle('mode-locked', locked);
        let badge = pill.querySelector('.pill-lock-badge');
        if (locked && !badge) {
          badge = document.createElement('span');
          badge.className = 'pill-lock-badge';
          badge.textContent = '🔒';
          pill.appendChild(badge);
        } else if (!locked && badge) {
          badge.remove();
        }
      });
    }

    // Adds/removes a small "🔒 Premium" badge in the corner of any AI Tools Hub
    // card the user's plan doesn't include — tapping is already blocked inside
    // showView() above, this is just the visual "you're missing this" cue.
    // Returns the right badge text for a locked tool: generic "Premium" for a
    // free user (any paid plan unlocks it), but specifically "Premier" for a
    // Pro user looking at a Premier-only tool — so they never feel like
    // something they already paid for is still locked.
    function lockBadgeLabel(toolKey) {
      const minPlan = minPlanForTool(toolKey);
      if (PLAN_KEY === 'paid7' && minPlan === 'paid15') return '🔒 Premier';
      return '🔒 Premium';
    }

    function renderToolHubLocks() {
      document.querySelectorAll('.hub-card').forEach(card => {
        const m = (card.getAttribute('onclick') || '').match(/showView\('(\w+)'\)/);
        const key = m && m[1];
        if (!key) return;
        const locked = !isToolUnlocked(key);
        card.classList.toggle('hub-card-locked', locked);
        let badge = card.querySelector('.premium-lock-corner');
        if (locked && !badge) {
          badge = document.createElement('div');
          badge.className = 'premium-lock-corner';
          badge.textContent = lockBadgeLabel(key);
          card.appendChild(badge);
        } else if (locked && badge) {
          badge.textContent = lockBadgeLabel(key); // keep text in sync if plan changed
        } else if (!locked && badge) {
          badge.remove();
        }
      });
      // Same treatment for the full-page "More Tools" overlay cards — different
      // markup (.mto-tile / openKieTool(...)) but the same lock logic applies.
      document.querySelectorAll('.mto-tile').forEach(card => {
        const m = (card.getAttribute('onclick') || '').match(/openKieTool\('(\w+)'\)/);
        const key = m && m[1];
        if (!key) return;
        const locked = !isToolUnlocked(key);
        card.classList.toggle('mto-tile-locked', locked);
        card.style.position = card.style.position || 'relative';
        let badge = card.querySelector('.premium-lock-corner');
        if (locked && !badge) {
          badge = document.createElement('div');
          badge.className = 'premium-lock-corner';
          badge.textContent = lockBadgeLabel(key);
          card.appendChild(badge);
        } else if (locked && badge) {
          badge.textContent = lockBadgeLabel(key);
        } else if (!locked && badge) {
          badge.remove();
        }
      });
    }

    // Adds/removes a "🔒 Premium" badge on the "existing resume" and "upload"
    // cover-letter source cards when the user's plan doesn't include
    // coverLetterFromResume. "From scratch" stays free and is never touched.
    function renderCoverLetterSourceLocks() {
      const locked = !isFeatureUnlocked('coverLetterFromResume');
      ['clSrcExisting','clSrcUpload'].forEach(id => {
        const card = g(id);
        if (!card) return;
        card.classList.toggle('cl-src-locked', locked);
        let badge = card.querySelector('.premium-lock-corner');
        if (locked && !badge) {
          badge = document.createElement('div');
          badge.className = 'premium-lock-corner';
          badge.innerHTML = '🔒 Premium';
          card.appendChild(badge);
        } else if (!locked && badge) {
          badge.remove();
        }
      });
    }

    // ── KIE MODEL SELECTOR ───────────────────────────────────────────────────
    // Ultra removed from the frontend selector for now — backend KIE_MODELS/
    // KIE_TIERS config for it is untouched, so it's a one-line add-back later.
    const KIE_MODEL_META = {
      spark: { label: 'KIE Spark',  tagline: 'Fast & Smart',              badge: 'Speed',    icon: '⚡', color: '#f59e0b' },
      core:  { label: 'KIE Core',   tagline: 'Balanced Intelligence',     badge: 'Smart',    icon: '🧠', color: '#3b82f6' },
      nova:  { label: 'KIE Nova',   tagline: 'Deep Career Intelligence',  badge: 'Powerful', icon: '🚀', color: '#8b5cf6' },
    };

    // ── Sources drawer — shows web search sources used in the last reply ────────
    window._openSourcesDrawer = function _openSourcesDrawer(sources) {
      let drawer = document.getElementById('kieSourcesDrawer');
      if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'kieSourcesDrawer';
        drawer.innerHTML = `
          <div class="kmd-backdrop" onclick="_closeSourcesDrawer()"></div>
          <div class="kmd-sheet">
            <div class="kmd-handle"></div>
            <div class="kmd-hdr-inner">
              <div class="kmd-title">Sources</div>
            </div>
            <div class="kmd-list" id="kieSourcesList"></div>
          </div>`;
        document.body.appendChild(drawer);
        setTimeout(() => drawer.classList.add('open'), 10);
      } else {
        drawer.classList.add('open');
      }
      const list = document.getElementById('kieSourcesList');
      if (!list) return;
      list.innerHTML = sources.map(s => {
        const domain = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return s.url; } })();
        const favicon = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
        const safe = (str) => str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        return `<a class="kmd-item kie-src-row" href="${safe(s.url)}" target="_blank" rel="noopener noreferrer">
          <img class="kie-src-fav" src="${favicon}" onerror="this.style.display='none'" width="20" height="20" loading="lazy">
          <div class="kmd-item-body">
            <div class="kmd-item-name">${safe(domain)}</div>
            <div class="kmd-item-tag">${safe(s.title)}</div>
          </div>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
        </a>`;
      }).join('');
    }
    function _closeSourcesDrawer() {
      const d = document.getElementById('kieSourcesDrawer');
      if (d) { d.classList.remove('open'); }
    }
    window._closeSourcesDrawer = _closeSourcesDrawer;

    window.openModelDrawer = function() {
      let drawer = document.getElementById('kieModelDrawer');
      if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'kieModelDrawer';
        drawer.innerHTML = `
          <div class="kmd-backdrop" onclick="closeModelDrawer()"></div>
          <div class="kmd-sheet">
            <div class="kmd-handle"></div>
            <div class="kmd-hdr-inner">
              <div class="kmd-title">AI Model</div>
              <div class="kmd-sub">Select the intelligence level for your session</div>
            </div>
            <div class="kmd-list" id="kmdList"></div>
            <div class="kmd-note">🔒 Your conversations are always private &amp; encrypted</div>
          </div>`;
        document.body.appendChild(drawer);
        setTimeout(() => drawer.classList.add('open'), 10);
      } else {
        drawer.classList.add('open');
      }
      renderModelList();
    };

    function renderModelList() {
      const list = document.getElementById('kmdList');
      if (!list) return;
      const modelDesc = {
        spark: 'Fast & smart. Best for everyday questions.',
        core:  'Balanced. Deep reasoning with structured guidance.',
        nova:  'Advanced. Best for strategy and detailed coaching.',
      };
      list.innerHTML = Object.entries(KIE_MODEL_META).map(([key, m]) => {
        const isActive = key === kieModel;
        const locked   = !isModelUnlocked(key);
        const rightIcon = isActive
          ? '<div class="kmd-active-dot"></div>'
          : locked
            ? '<span class="kmd-lock-badge">🔒 Premium</span>'
            : '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';
        return `<div class="kmd-item ${isActive?'active':''} ${locked?'locked':''}" onclick="selectKieModel('${key}')">
          <div class="kmd-item-body">
            <div class="kmd-item-name">${m.label}</div>
            <div class="kmd-item-tag">${modelDesc[key]||''}</div>
          </div>
          ${rightIcon}
        </div>`;
      }).join('');
    }

    window.selectKieModel = function(key) {
      if (!isModelUnlocked(key)) {
        lockTapped('kieModel', key);
        return; // stay on the currently active model — never switch into a locked one
      }
      kieModel = key;
      const badge = document.getElementById('kieModelBadge');
      if (badge) {
        const m = KIE_MODEL_META[key];
        badge.textContent = m.label;
        badge.style.background = '';
        badge.style.color = '#0f0e17';
        badge.style.border = '1px solid rgba(0,0,0,.12)';
        badge.style.padding = '3px 10px';
        badge.style.borderRadius = '99px';
        badge.style.fontWeight = '700';
        badge.style.fontSize = '11px';
        badge.style.display = 'inline-flex';
        badge.style.alignItems = 'center';
      }
      closeModelDrawer();
      // Update any visible model suggestion banners in the tools overlay
      if (typeof refreshModelSuggestionBanners === 'function') refreshModelSuggestionBanners();
    };

    window.closeModelDrawer = function() {
      const drawer = document.getElementById('kieModelDrawer');
      if (drawer) drawer.classList.remove('open');
    };

    let _statusTimer = null;

    // ── THINKING TRACE ────────────────────────────────────────────────────
    // Drives the collapsible "Thinking for Ns" panel: a live elapsed-time
    // header plus a step-by-step list that fills in as work happens (each
    // step appears once — never a repeating/looping fake list). On
    // completion the header freezes to "Thought for Ns" and the panel
    // auto-collapses, but stays tappable so the person can re-open it and
    // review the trace, same as Claude/ChatGPT's reasoning UI.
    let _thinkStartTs = null;
    let _thinkTickTimer = null;

    function _thinkStart() {
      clearInterval(_thinkTickTimer);
      _thinkStartTs = Date.now();
      const panel = g('kieThink');
      const body  = g('kieThinkBody');
      const title = g('kieThinkTitle');
      if (panel) panel.classList.remove('collapsed');
      if (body)  body.innerHTML = '';
      if (title) title.textContent = 'Thinking for 0s';
      _thinkTickTimer = setInterval(() => {
        if (!title || !_thinkStartTs) return;
        const secs = Math.max(0, Math.round((Date.now() - _thinkStartTs) / 1000));
        title.textContent = `Thinking for ${secs}s`;
      }, 1000);
    }

    function _thinkPushStep(text) {
      if (!text) return;
      const body = g('kieThinkBody');
      if (!body) return;
      const last = body.lastElementChild;
      if (last && last.textContent === text) return; // no consecutive dupes
      if (last) last.classList.remove('current');
      const row = document.createElement('div');
      row.className = 'kie-think-step current';
      row.textContent = text;
      body.appendChild(row);
    }

    function _thinkFinish() {
      clearInterval(_thinkTickTimer);
      const secs = _thinkStartTs ? Math.max(1, Math.round((Date.now() - _thinkStartTs) / 1000)) : 0;
      const title = g('kieThinkTitle');
      const panel = g('kieThink');
      const body  = g('kieThinkBody');
      if (title) title.textContent = `Thought for ${secs}s`;
      const cur = body?.querySelector('.kie-think-step.current');
      if (cur) cur.classList.remove('current');
      if (panel) panel.classList.add('collapsed');
      _thinkStartTs = null;
    }

    window.toggleKieThink = function() {
      const panel = g('kieThink');
      if (panel) panel.classList.toggle('collapsed');
    };

    function showKieStatus(mode) {
      const statuses = KIE_MODE_CFG[mode]?.status || ['Thinking…'];
      _thinkStart();
      let idx = 0;
      _thinkPushStep(statuses[idx]);
      clearInterval(_statusTimer);
      if (statuses.length > 1) {
        _statusTimer = setInterval(() => {
          idx++;
          if (idx >= statuses.length) { clearInterval(_statusTimer); return; }
          _thinkPushStep(statuses[idx]);
        }, 2400);
      }
    }
    function hideKieStatus() {
      clearInterval(_statusTimer);
      _statusTimer = null;
      _thinkFinish();
    }

    // ── REAL web-search status (driven by actual SSE events from the server,
    // not a fake timed rotation) — shows the rolling globe icon only while a
    // genuine Tavily search request is in flight.
    function _kieShowRealSearch(query) {
      clearInterval(_statusTimer);
      const q = (query || '').trim();
      _thinkPushStep(q ? `Searching the web for "${q.slice(0, 40)}${q.length > 40 ? '…' : ''}"` : 'Searching the web…');
    }
    function _kieEndRealSearch(count) {
      _thinkPushStep(count > 0
        ? `Found ${count} source${count === 1 ? '' : 's'} — writing your answer…`
        : "Couldn't find live results — answering from what I know…");
    }

    // Custom multi-step status (for PDF gen / file processing)
    function _setKieStatusCustom(steps) {
      clearInterval(_statusTimer);
      _thinkStart();
      let idx = 0;
      _thinkPushStep(steps[idx]);
      if (steps.length > 1) {
        _statusTimer = setInterval(() => {
          idx++;
          if (idx >= steps.length) { clearInterval(_statusTimer); return; }
          _thinkPushStep(steps[idx]);
        }, 2200);
      }
    }

    // BUG FIX: the staged "Analysing…" / "Adding experience…" / "Packaging…"
    // steps above were purely cosmetic — the actual work (a Groq/Spark call)
    // usually finishes in 1-3 seconds, so hideKieStatus() fired almost
    // immediately and cut the animation off after just the first step. It
    // never actually read as "the AI is doing real, careful work" the way it
    // was designed to. This enforces a real minimum floor: whatever the
    // resume build/update flow is timing itself against, the visible
    // thinking state won't disappear before at least this long has passed,
    // so the full sequence of steps actually gets seen.
    function _kieSleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    async function _kieEnforceMinThinkTime(startedAt, minMs = 11000) {
      const elapsed = Date.now() - startedAt;
      if (elapsed < minMs) await _kieSleep(minMs - elapsed);
    }

    // ── APPEND IMAGE IN USER BUBBLE ─────────────────────────────────────────
    function _appendKieImageMsg(dataUrl, caption) {
      const msgs = g('kieMsgs');
      msgs.style.display = 'flex';
      const welcome = g('kieWelcome');
      if (welcome) welcome.style.display = 'none';
      const t = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      const w = document.createElement('div');
      w.className = 'km km-user';
      w.innerHTML = `
        <div class="km-user-img-wrap" style="align-self:flex-end">
          <img class="km-user-img" src="${dataUrl}" alt="Attached image"
            onclick="openKieImgOverlay('${dataUrl.replace(/'/g,"\\'")}')">
          ${caption ? `<div class="km-bubble" style="margin-top:4px">${caption.replace(/</g,'&lt;')}</div>` : ''}
          <div class="km-meta" style="text-align:right">${t}</div>
        </div>`;
      msgs.insertBefore(w, g('kieTyp'));
      scrollKie();
    }

    // ── APPEND UPLOADED FILE CARD (PDF/TXT the user sent) ──────────────────────
    // Shows a tappable chip instead of raw "📎 filename" text — tapping it opens
    // a preview overlay (rendered PDF pages, or a "Preview unavailable" state
    // for anything that can't be rendered client-side).
    function _appendKieFileMsg(fileRef, name, ext, caption) {
      const msgs = g('kieMsgs');
      msgs.style.display = 'flex';
      const welcome = g('kieWelcome');
      if (welcome) welcome.style.display = 'none';
      const t = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      const w = document.createElement('div');
      w.className = 'km km-user';
      const label = (ext || 'file').toUpperCase();
      w.innerHTML = `
        <div class="km-file-card" style="cursor:pointer" onclick="openKieFilePreview('${fileRef}')">
          <div class="km-file-ico">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div class="km-file-info">
            <div class="km-file-name">${esc(name)}</div>
            <div class="km-file-meta">${esc(label)} · Tap to preview</div>
          </div>
        </div>
        ${caption ? `<div class="km-bubble" style="margin-top:6px">${caption.replace(/</g,'&lt;')}</div>` : ''}
        <div class="km-meta" style="text-align:right">${t}</div>`;
      msgs.insertBefore(w, g('kieTyp'));
      scrollKie();
    }

    // Lazily loads pdf.js if it isn't already on the page (shared with the
    // text-extraction path in extractPdfText, which usually loads it first).
    async function _ensurePdfJsLoaded() {
      if (window.pdfjsLib) return;
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve();
        };
        s.onerror = () => reject(new Error('PDF reader failed to load'));
        document.head.appendChild(s);
      });
    }

    function _base64ToUint8Array(base64) {
      const binStr = atob(base64);
      const bytes  = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      return bytes;
    }

    function _ensureKieFilePreviewOverlay() {
      let ol = document.getElementById('kieFilePreviewOverlay');
      if (ol) return ol;
      ol = document.createElement('div');
      ol.id = 'kieFilePreviewOverlay';
      ol.className = 'kie-file-overlay';
      ol.innerHTML = `
        <div class="kie-file-overlay-hdr">
          <button class="kie-file-overlay-close" onclick="closeKieFilePreview()">×</button>
          <div class="kie-file-overlay-title">
            <div id="kieFilePreviewName">File</div>
            <div id="kieFilePreviewSub">—</div>
          </div>
        </div>
        <div class="kie-file-overlay-body" id="kieFilePreviewBody"></div>`;
      ol.addEventListener('click', (e) => { if (e.target === ol) closeKieFilePreview(); });
      document.body.appendChild(ol);
      return ol;
    }

    window.closeKieFilePreview = function() {
      const ol = document.getElementById('kieFilePreviewOverlay');
      if (ol) ol.classList.remove('open');
      const bodyEl = document.getElementById('kieFilePreviewBody');
      if (bodyEl) bodyEl.onscroll = null;
      document.body.style.overflow = '';
    };

    window.openKieFilePreview = async function(fileRef) {
      const data = _kieFileStore.get(fileRef);
      const ol   = _ensureKieFilePreviewOverlay();
      const nameEl = document.getElementById('kieFilePreviewName');
      const subEl  = document.getElementById('kieFilePreviewSub');
      const bodyEl = document.getElementById('kieFilePreviewBody');

      ol.classList.add('open');
      document.body.style.overflow = 'hidden';

      if (!data || !data.base64) {
        nameEl.textContent = (data && data.name) || 'File';
        subEl.textContent  = 'Preview unavailable';
        bodyEl.innerHTML   = _kieUnavailablePreviewHTML((data && data.ext) || 'file');
        return;
      }

      nameEl.textContent = data.name || 'File';

      if (data.ext === 'txt' || data.mimeType === 'text/plain') {
        try {
          const text = decodeURIComponent(escape(atob(data.base64)));
          subEl.textContent = 'Text file';
          bodyEl.innerHTML = `<pre class="kie-file-overlay-txt">${esc(text)}</pre>`;
        } catch {
          subEl.textContent = 'Preview unavailable';
          bodyEl.innerHTML  = _kieUnavailablePreviewHTML('txt');
        }
        return;
      }

      if (data.ext === 'pdf' || data.mimeType === 'application/pdf') {
        subEl.textContent = 'Loading…';
        bodyEl.innerHTML   = `<div class="kie-file-overlay-loading"><div class="kie-file-overlay-spinner"></div><div class="kie-file-overlay-loading-txt">Loading preview…</div></div>`;
        try {
          await _ensurePdfJsLoaded();
          const bytes = _base64ToUint8Array(data.base64);
          const pdf   = await window.pdfjsLib.getDocument({ data: bytes }).promise;
          bodyEl.innerHTML = '';
          const maxPages = Math.min(pdf.numPages, 15); // sane cap for very long docs
          const pageEls = [];
          for (let i = 1; i <= maxPages; i++) {
            const page     = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.4 });
            const canvas   = document.createElement('canvas');
            canvas.className = 'kie-file-overlay-page';
            canvas.width  = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            bodyEl.appendChild(canvas);
            pageEls.push(canvas);
          }
          if (pdf.numPages > maxPages) {
            const note = document.createElement('div');
            note.className = 'kie-file-overlay-note';
            note.textContent = `+ ${pdf.numPages - maxPages} more page${pdf.numPages - maxPages === 1 ? '' : 's'} not shown in preview`;
            bodyEl.appendChild(note);
          }
          // Live "Page X of Y" counter that tracks scroll position, like a
          // standard PDF viewer (Chrome, Drive, Adobe) rather than a static label.
          const updatePageCounter = () => {
            const mid = bodyEl.scrollTop + bodyEl.clientHeight / 2;
            let current = 1;
            for (let i = 0; i < pageEls.length; i++) {
              if (pageEls[i].offsetTop <= mid) current = i + 1;
            }
            subEl.textContent = `Page ${current} of ${pdf.numPages}`;
          };
          updatePageCounter();
          bodyEl.onscroll = updatePageCounter;
        } catch {
          subEl.textContent = 'Preview unavailable';
          bodyEl.innerHTML  = _kieUnavailablePreviewHTML('pdf');
        }
        return;
      }

      // Unknown/unsupported type
      subEl.textContent = 'Preview unavailable';
      bodyEl.innerHTML  = _kieUnavailablePreviewHTML(data.ext || 'file');
    };

    function _kieUnavailablePreviewHTML(ext) {
      return `
        <div class="kie-file-overlay-unavail">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h.01M16 13h.01M8 17h.01M12 17h5"/></svg>
          <div class="kie-file-overlay-unavail-type">Document · ${esc((ext || 'file').toUpperCase())}</div>
          <div class="kie-file-overlay-unavail-msg">Preview unavailable</div>
        </div>`;
    }

    // ── APPEND CODE BLOCK CARD ────────────────────────────────────────────────
    function _appendKieCodeCard(content, label) {
      const msgs = g('kieMsgs');
      msgs.style.display = 'flex';
      const welcome = g('kieWelcome');
      if (welcome) welcome.style.display = 'none';
      const t = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      const cardId = 'kcc-' + Date.now();
      const w = document.createElement('div');
      w.className = 'km km-ai';
      w.innerHTML = `
        <div class="km-ai-body">
          <div class="kie-code-card" id="${cardId}">
            <div class="kie-code-card-hdr">
              <span class="kie-code-card-label">
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 8l3 4-3 4"/></svg>
                ${label || 'Content'}
              </span>
              <button class="kie-code-card-copy" onclick="_copyCodeCard('${cardId}')" title="Copy">
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
            <div class="kie-code-card-body">${content.replace(/</g,'&lt;')}</div>
          </div>
          <div class="km-meta">${t}</div>
        </div>`;
      msgs.insertBefore(w, g('kieTyp'));
      scrollKie();
      return w;
    }

    window._copyCodeCard = function(cardId) {
      const card = document.getElementById(cardId);
      if (!card) return;
      const body = card.querySelector('.kie-code-card-body');
      const text = body?.textContent || '';
      const copyBtn = card.querySelector('.kie-code-card-copy');
      navigator.clipboard?.writeText(text).then(() => {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = `<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#16a34a" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
        copyBtn.style.color = '#16a34a';
        setTimeout(() => { copyBtn.innerHTML = orig; copyBtn.style.color = ''; }, 1500);
      }).catch(() => {});
    };

    // ── SMART REPLY RENDERER ─────────────────────────────────────────────────
    // appendKMsg now handles [CODEBLOCK] live via _formatKieLive.
    // _renderKieReply routes to appendKMsg and fires [SEND_PDF] only once the
    // message has actually finished typing out — never on a guessed timeout.
    // (A fixed delay used to race against the typing animation: on longer
    // replies — especially now that Pro/Ultra get a bigger token budget — the
    // PDF flow could fire mid-type and steal the input lock back from it.)
    function _renderKieReply(reply, triggerPdfAfter, userRequest) {
      const shouldSendPdf = triggerPdfAfter || /\[SEND_PDF\]/i.test(reply);

      // If the response contains a CODEBLOCK with resume-style content AND the
      // user request was an edit verb, save it so a follow-up "yes love it" can
      // apply the change even if [SEND_PDF] wasn't included in this response.
      let hasCodeBlock = /\[CODEBLOCK/i.test(reply);
      const EDIT_VERBS   = /\b(add|extend|expand|improve|update|change|rewrite|fix|edit|revise|include|remove|delete|shorten|lengthen|strengthen|enhance|rephrase|reword)\b/i;
      if (hasCodeBlock && userRequest && EDIT_VERBS.test(userRequest) && kieSelectedResume) {
        _kieLastEditRequest = userRequest;
        _kieLastEditTs      = Date.now();
      }

      // SAFETY NET: the model is instructed never to pair [SEND_PDF] with a
      // [CODEBLOCK] in the same reply — but if it slips up anyway, don't show
      // the resume content twice (once as raw code block, once as the real PDF
      // card). Strip the code block out and keep just the surrounding coaching
      // text; the PDF card carries the actual content.
      if (shouldSendPdf && hasCodeBlock) {
        reply = reply.replace(/\[CODEBLOCK(?::[^\]]*)?\]([\s\S]*?)(\[\/CODEBLOCK\]|$)/gi, '').replace(/\n{3,}/g, '\n\n').trim();
        hasCodeBlock = false;
      }

      appendKMsg('ai', reply, true, shouldSendPdf ? () => kieActionSmartSend(userRequest || '') : null);
    }

    // ── SHARED: ASK AI FOR A RESUME PATCH (one source of truth for both the
    //    plain "update & resend" flow and the combined "update + template" flow) ──
    async function kieRequestResumePatch(userRequest, currentResumeData) {
      const patchPrompt = `You are updating a user's resume. The user says: "${userRequest}".

Current resume data (JSON):
${JSON.stringify(currentResumeData, null, 2)}

Return ONLY valid JSON with the fields to update. Only include a field if you have REAL information for it.
Supported fields: summary, jobTitle, fullName, resumeName, workExperience (array), skills (array), education (array).

CRITICAL RULES:
1. If the user asks you to ADD a new experience entry (e.g. "add a 4th experience about X"), build a new workExperience entry using the details they described and APPEND it to the existing workExperience array. Include ALL existing entries plus the new one.
2. If the user asks to EXTEND or EXPAND an existing experience, rewrite that entry with more bullet points/detail, keeping all other entries intact.
3. If the user asks to ADD or CHANGE something but gives you actual real details to work with (even rough ones like "I built AI automation for a company's WhatsApp inbox"), USE those details — don't refuse just because they're informal.
4. If the user asks you to add/change something but gives you ZERO real details (no company, no role, no achievement, nothing), return {} and do not invent content.
5. When updating workExperience, always return the FULL array (existing + changes), not just the changed entry.

Return ONLY JSON, no markdown, no explanation. If there is nothing you can confidently update, return {}.`;

      let raw = '{}';
      try {
        raw = await _kieCallSilent(
          // mode:'quick' here is intentional and unrelated to the chat pills — this
          // is a silent internal patch-classification call that wants KIE_MODES.quick's
          // terse 400-token behavior specifically. That mode has no visible UI pill
          // anymore (see dashboard.html mode-pills comment), but the backend config
          // still exists for exactly this kind of programmatic call. Don't touch.
          { messages: [{ role: 'user', content: patchPrompt }], mode: 'quick', model: kieModel, resumeContext: '' },
          _kieAbort?.signal
        ) || '{}';
      } catch (e) { raw = '{}'; }
      let patchFields = {};
      try {
        raw = raw.replace(/```json|```/g,'').trim();
        patchFields = JSON.parse(raw);
      } catch(e) { patchFields = {}; }
      return patchFields;
    }

    // Figures out which fields the user clearly asked about but that didn't make it
    // into the patch — so KIE can say so honestly instead of claiming "Done" on a
    // request it couldn't actually fulfil (e.g. "add education" with no real details).
    function kieRequestedFieldsNotInPatch(userRequest, patchFields) {
      const fieldKeywords = {
        education:      /\beducat\w*|degree|school|university|college|certificat\w*/i,
        summary:        /\bsummary|\bbio\b|objective/i,
        skills:         /\bskills?\b/i,
        workExperience: /\bexperience|job\s?history|work\s?history/i,
      };
      const missing = [];
      for (const [field, re] of Object.entries(fieldKeywords)) {
        if (re.test(userRequest) && !(field in patchFields)) missing.push(field);
      }
      return missing;
    }

    // Pushes a resume-file message into history in a way restoreKieUI can
    // recreate later (the actual download/print card, not just the text).
    function kiePushFileCardHistory(name, html, introText) {
      kieHist.push({ role: 'assistant', content: introText, fileCard: { name, html } });
      saveKieHistory();
    }

    // Shows a one-time "this is just a preview, tap Download for the real PDF"
    // explainer the very first time a resume card appears in this browser.
    // Stored in localStorage so it never repeats after the first time.
    function _kieMaybeExplainPreviewFlow(introText) {
      const KEY = 'kievora_kie_explained_preview_flow';
      try {
        if (localStorage.getItem(KEY)) return introText;
        localStorage.setItem(KEY, '1');
      } catch(e) {}
      return "Here's a live preview below — not a final file yet, just how it'll look. Tap **Download** whenever you're ready and I'll generate the real PDF. 👇\n\n" + introText;
    }

    // ── UPDATE RESUME + RESEND PDF (with animated progress) ──────────────────
    async function kieActionUpdateAndSendResume(userRequest) {
      if (!kieSelectedResume || !kieSelectedResume.resumeData) {
        appendKMsg('ai', "I need a saved resume to edit. Tap one from the **COACH ON:** picker above first. 👆", true);
        return;
      }

      if (_kieGenerating) stopKieGeneration();
      _kieGenerating = true;
      _kieStopTyping = false;
      _kieAbort = new AbortController();
      g('kieInp').disabled = true;
      setKieSendMode('stop');

      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';
      if (g('kieMsgs'))   g('kieMsgs').style.display    = 'flex';
      g('kieTyp').style.display = 'flex';

      const pdfSteps = [
        'Analysing your resume…',
        'Adding the relevant experience…',
        'Applying industry-standard improvements…',
        'Selecting the best content…',
        'Packaging your file…',
      ];
      _setKieStatusCustom(pdfSteps);
      const _startedAt = Date.now();
      scrollKie();

      try {
        // Step 1: Ask AI to generate the patch
        const patchFields = await kieRequestResumePatch(userRequest, kieSelectedResume.resumeData);
        const missingFields = kieRequestedFieldsNotInPatch(userRequest, patchFields);

        // Step 2: Apply changes
        const updatedData = { ...kieSelectedResume.resumeData, ...patchFields };
        const updatedResume = { ...kieSelectedResume, resumeData: updatedData };
        if (patchFields.resumeName) updatedResume.resumeName = patchFields.resumeName;

        // Step 3: Save to Firestore if it's a saved resume
        if (kieSelectedResume.id) {
          tok = await usr.getIdToken();
          await fetch(`/api/resumes/${kieSelectedResume.id}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body:    JSON.stringify(updatedResume),
          });
        }
        kieSelectedResume = updatedResume;
        kieResumeContext  = buildResumeContext(updatedResume);
        const idx = resumes.findIndex(r => r.id === updatedResume.id);
        if (idx >= 0) resumes[idx] = updatedResume;

        await _kieEnforceMinThinkTime(_startedAt);
        g('kieTyp').style.display = 'none'; hideKieStatus();

        const changedKeys = Object.keys(patchFields);

        // If the user asked for something we genuinely couldn't fulfil (no real
        // info given) AND nothing else changed either, say so honestly and stop —
        // don't claim "Done" and resend an unchanged file.
        if (!changedKeys.length && missingFields.length) {
          appendKMsg('ai', `I'd love to add your ${missingFields.join(' and ')}, but I'll need the real details first — school name, degree, dates, that kind of thing. Share those and I'll update it right away. 🙏`, true);
          _kieGenerating = false; _kieStopTyping = false;
          const inp2 = g('kieInp'); if (inp2) { inp2.disabled = false; }
          setKieSendMode('send');
          return;
        }

        // Step 4: Generate PDF
        const d       = { ...(updatedResume.resumeData || {}) };
        const tpl     = updatedResume.templateType || 'classic';
        const tplObj  = (window.TPLS_REF || []).find(t => t.id === tpl) || { bg:'#1e3a8a', name: tpl };
        const name    = updatedResume.resumeName || d.fullName || 'Resume';
        const html    = buildPrevHTML(d, tpl, tplObj.bg, 'rf-sans');

        const changeDesc = changedKeys.length
          ? changedKeys.map(k => k === 'summary' ? 'summary' : k === 'skills' ? 'skills' : k).join(', ')
          : 'your resume';

        let intro = `Done — I've updated your ${changeDesc}. Tap the button below to download your resume. 📄`;
        if (missingFields.length) {
          intro += `\n\nOne thing — I still need real details for your ${missingFields.join(' and ')} to add ${missingFields.length > 1 ? 'those' : 'that'} in. Share them and I'll update and resend.`;
        }
        appendKiePrintCard(name, html, intro);
        kiePushFileCardHistory(name, html, intro);

      } catch (err) {
        if (err.name === 'AbortError') return;
        g('kieTyp').style.display = 'none'; hideKieStatus();
        appendKMsg('ai', "Something went wrong generating that PDF. Try again in a moment. 🙏", true);
      }
    }

    // ── UPDATE CONTENT + CHANGE TEMPLATE + RESEND — all in one go ────────────
    // Handles messages like "add my education and use the tribune template and
    // resend as file" — previously the template-change always won and silently
    // dropped the content-update part of the request.
    async function kieActionUpdateTemplateAndSend(userRequest, templateId) {
      const tplObj = (window.TPLS_REF || []).find(t => t.id === templateId);
      if (!kieSelectedResume || !kieSelectedResume.resumeData || !tplObj) {
        const hasUploadedResume = !!kieResumeContext && kieResumeContext !== 'NO_RESUME_YET' && kieResumeContext !== 'HAS_RESUMES_UNSELECTED';
        if (hasUploadedResume) {
          appendKMsg('ai', "Your uploaded resume is raw text — there's no template or real PDF behind it yet.\n\nSay \"build me a resume\" and I'll turn it into a full editable Kievora resume you can style and download. 📄", true);
        } else {
          appendKMsg('ai', "I need a saved resume to work with. Select one from the **COACH ON:** picker at the top first. 👆", true);
        }
        return;
      }

      if (_kieGenerating) stopKieGeneration();
      _kieGenerating = true;
      _kieStopTyping = false;
      _kieAbort = new AbortController();
      g('kieInp').disabled = true;
      setKieSendMode('stop');
      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';
      if (g('kieMsgs'))   g('kieMsgs').style.display    = 'flex';
      g('kieTyp').style.display = 'flex';
      _setKieStatusCustom(['Analysing your resume…', 'Adding the relevant experience…', 'Applying the new template…', 'Applying industry-standard improvements…', 'Packaging your file…']);
      const _startedAt = Date.now();
      scrollKie();

      try {
        const patchFields  = await kieRequestResumePatch(userRequest, kieSelectedResume.resumeData);
        const missingFields = kieRequestedFieldsNotInPatch(userRequest, patchFields);

        const updatedData   = { ...kieSelectedResume.resumeData, ...patchFields };
        const updatedResume = { ...kieSelectedResume, resumeData: updatedData, templateType: templateId, primaryColor: tplObj.bg };
        if (patchFields.resumeName) updatedResume.resumeName = patchFields.resumeName;

        if (kieSelectedResume.id) {
          tok = await usr.getIdToken();
          await fetch(`/api/resumes/${kieSelectedResume.id}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body:    JSON.stringify(updatedResume),
          });
        }
        kieSelectedResume = updatedResume;
        kieResumeContext  = buildResumeContext(updatedResume);
        const idx = resumes.findIndex(r => r.id === updatedResume.id);
        if (idx >= 0) resumes[idx] = updatedResume;

        const d    = { ...(updatedResume.resumeData || {}) };
        const name = updatedResume.resumeName || d.fullName || 'Resume';
        const html = buildPrevHTML(d, templateId, tplObj.bg, 'rf-sans');

        await _kieEnforceMinThinkTime(_startedAt);
        g('kieTyp').style.display = 'none'; hideKieStatus();

        const changedKeys = Object.keys(patchFields);
        let reply = `Done — switched to the **${tplObj.name}** template (${tplObj.tag})`;
        reply += changedKeys.length ? ` and updated your ${changedKeys.join(', ')}. ✅` : '. ✅';
        if (missingFields.length) {
          reply += `\n\nOne thing though — I still need real details for your ${missingFields.join(' and ')} (school, dates, etc.) to actually add ${missingFields.length > 1 ? 'those' : 'that'} in. Share them and I'll update and resend.`;
        }
        reply += `\n\nHere's your resume with the **${tplObj.name}** template applied — tap to download. 📄`;

        appendKiePrintCard(name, html, reply);
        kiePushFileCardHistory(name, html, reply);

      } catch (err) {
        if (err.name === 'AbortError') return;
        g('kieTyp').style.display = 'none'; hideKieStatus();
        appendKMsg('ai', "Something went wrong updating that. Try again in a moment. 🙏", true);
        _kieGenerating = false;
        const inp2 = g('kieInp'); if (inp2) { inp2.disabled = false; }
        setKieSendMode('send');
      }
    }

    // ── BUILD A BRAND-NEW RESUME FROM CHAT, START TO FINISH ──────────────────
    // MISSING FEATURE FIX: every mode's system prompt tells the user to say
    // "build me a resume" when they have nothing saved yet — but until now
    // nothing in the chat actually caught that phrase and acted on it. It was
    // pure dead-end copy. This generates a full resume (reusing the existing
    // /api/prompt-resume endpoint), saves it as a real Kievora resume so future
    // edits/sends work on it, and delivers it as a downloadable PDF — all in
    // one continuous chat flow, no bouncing the user out to a separate screen.
    function _kieBuildResumeBrief(triggerMsg) {
      // Pull in recent user messages too, so "build me a resume" picks up
      // role/experience/industry the person already mentioned earlier in the
      // conversation instead of only looking at this one bare trigger message.
      const recentUserMsgs = kieHist.filter(h => h.role === 'user').slice(-5).map(h => h.content).join('. ');
      return `${recentUserMsgs}. ${triggerMsg}`.trim();
    }

    async function kieActionBuildResumeFromChat(triggerMsg) {
      const brief = _kieBuildResumeBrief(triggerMsg);

      // Strip the generic trigger phrasing itself and see if anything real is
      // left to build from. If not, ask one direct question instead of
      // generating (and SAVING) a resume full of fabricated placeholder info.
      const strippedForCheck = brief
        .replace(/\b(build|create|make|generate|write|draft|start)\s+(me\s+)?(a\s+|the\s+)?(new\s+|fresh\s+|full\s+)?resume\b/gi, '')
        .replace(/\bfrom\s+scratch\b/gi, '')
        .trim();
      if (strippedForCheck.length < 12) {
        appendKMsg('ai', "Happy to build that — what role is it for, and roughly how many years of experience? I'll generate the full resume the moment you tell me. 🚀", true);
        return;
      }

      // BUG FIX: this used to hard-block generation entirely unless the message
      // itself contained a Proper-Noun name, a self-intro phrase, or a literal
      // email — then dumped a 4-item questionnaire (name, title, years, skills,
      // location) on the user before it would build anything. That's exactly
      // backwards: the account already has the user's real name and email, so
      // asking for them in chat is pure friction, and the resume generator
      // below (see server/tools.js /api/prompt-resume) is already built to
      // invent strong, realistic content for anything else that's missing —
      // it just never got the chance because this gate stopped it first.
      // Real name/email come straight from the signed-in account now; nothing
      // else is asked for. If the account has no display name yet (email/
      // password signup with no name set), the generator falls back to its
      // own realistic placeholder rather than blocking on a question.
      const enrichedBrief = [
        brief,
        usr?.displayName ? `Full name: ${usr.displayName}.` : '',
        usr?.email ? `Email: ${usr.email}.` : '',
      ].filter(Boolean).join(' ');

      _kieGenerating = true;
      _kieStopTyping = false;
      _kieAbort = new AbortController();
      const inp = g('kieInp');
      if (inp) inp.disabled = true;
      setKieSendMode('stop');
      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';
      if (g('kieMsgs'))   g('kieMsgs').style.display    = 'flex';
      g('kieTyp').style.display = 'flex';
      _setKieStatusCustom(['Analyzing your background…', 'Adding relevant experience…', 'Applying industry-standard formatting…', 'Polishing the final details…', 'Packaging your resume…']);
      const _startedAt = Date.now();
      scrollKie();

      try {
        tok = await usr.getIdToken();
        const r = await fetch('/api/prompt-resume', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body:    JSON.stringify({ prompt: enrichedBrief, model: kieModel }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Resume generation failed.');
        const data = await r.json();
        const resumeData = data.resumeData;

        const tplId  = (window.TPLS_REF || []).some(t => t.id === resumeData.templateSuggestion) ? resumeData.templateSuggestion : 'classic';
        const tplObj = (window.TPLS_REF || []).find(t => t.id === tplId) || { bg: '#1e3a8a', name: 'Classic' };
        const resumeName = resumeData.fullName ? `${resumeData.fullName} — ${resumeData.jobTitle || 'Resume'}` : (resumeData.jobTitle || 'New Resume');

        // Save as a real Kievora resume — not just a chat reply — so the next
        // "send it" / "change the template" / "update my summary" all work.
        const saveRes = await fetch('/api/resumes', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body:    JSON.stringify({ resumeName, templateType: tplId, primaryColor: tplObj.bg, fontFamily: 'sans', resumeData }),
        });
        if (!saveRes.ok) throw new Error('Could not save the new resume.');
        const saved = await saveRes.json();

        kieSelectedResume = saved;
        kieResumeContext  = buildResumeContext(saved);
        resumes.push(saved);

        await _kieEnforceMinThinkTime(_startedAt);
        g('kieTyp').style.display = 'none'; hideKieStatus();

        const html  = buildPrevHTML(resumeData, tplId, tplObj.bg, 'rf-sans');
        const intro = _kieMaybeExplainPreviewFlow(`Done — built you a full **${resumeData.jobTitle || 'professional'}** resume using the **${tplObj.name}** template, and saved it to your account. Tap below to download. 📄\n\nWant me to tweak anything — summary, skills, experience?`);
        appendKiePrintCard(resumeName, html, intro);
        kiePushFileCardHistory(resumeName, html, intro);

      } catch (err) {
        console.error('Build resume from chat error:', err.message);
        g('kieTyp').style.display = 'none'; hideKieStatus();
        appendKMsg('ai', "Something went wrong building that resume. Try again in a moment, or tell me the role again. 🙏", true);
      } finally {
        _kieGenerating = false;
        _kieStopTyping = false;
        const inp2 = g('kieInp'); if (inp2) { inp2.disabled = false; }
        setKieSendMode('send');
      }
    }
    async function _sendKieWithImage(att, userPrompt) {
      if (_kieGenerating) stopKieGeneration();
      _kieGenerating = true;
      _kieStopTyping = false;
      _kieAbort = new AbortController();
      const inp = g('kieInp');
      inp.disabled = true;
      setKieSendMode('stop');

      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';
      const msgsEl = g('kieMsgs');
      if (msgsEl) msgsEl.style.display = 'flex';
      const typEl = g('kieTyp');
      typEl.style.display = 'flex';
      showKieStatus(kieMode);
      scrollKie();

      // Show the image in the user bubble
      _appendKieImageMsg(att.dataUrl, userPrompt);

      const base64 = att.dataUrl.split(',')[1];
      const prompt  = userPrompt || 'What do you see in this image? Give me career coaching advice based on it.';

      // BUG FIX #7 — Store image in the in-memory store and keep a reference
      // in kieHist instead of only storing the text "[Image sent]".
      // This way follow-up questions about the image include it in context.
      const imgKey = 'img_' + Date.now();
      _kieImageStore.set(imgKey, { base64, mimeType: att.mimeType, name: att.name || 'image' });
      kieHist.push({
        role: 'user', content: userPrompt || '[Image sent]',
        imageRef: imgKey, imageType: att.mimeType, imageName: att.name || 'image',
      });

      // BUG FIX #3 — Refresh auth token before API call
      try { tok = await usr.getIdToken(); } catch (_) { /* use existing */ }

      // Resolve full history (previous messages may also have imageRefs)
      const historyForApi = kieHist.map(m => {
        if (!m.imageRef) return m;
        const imgData = _kieImageStore.get(m.imageRef);
        if (!imgData) return { role: m.role, content: m.content };
        return { role: m.role, content: m.content, imageBase64: imgData.base64,
                 imageType: m.imageType, imageName: m.imageName };
      });

      // Build the streaming bubble lazily — only once the first token exists,
      // same as the main text-send path, so only the Thinking panel shows
      // until there's a real answer to display.
      let bubbleW = null, bubble = null, actionsEl = null;
      const msgId  = 'kb-' + Date.now();
      const tStamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      function _ensureImageBubble() {
        if (bubbleW) return;
        bubbleW = document.createElement('div');
        bubbleW.className = 'km km-ai';
        bubbleW.innerHTML = `
        <div class="km-ai-body">
          <div class="km-bubble" id="${msgId}"></div>
          <div class="km-actions" id="kact-${msgId}">
            <button class="km-act-btn" onclick="kieyCopy(this)" title="Copy response">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <button class="km-act-btn" onclick="kieSpeak(this)" title="Listen aloud">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path stroke-linecap="round" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
            </button>
            <button class="km-act-btn" onclick="kieShare(this)" title="Share">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button class="km-act-btn" onclick="kieRegen(this)" title="Regenerate">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
          </div>
          <div class="km-meta">${tStamp}</div>
        </div>`;
        msgsEl.insertBefore(bubbleW, typEl);
        bubble    = bubbleW.querySelector('.km-bubble');
        actionsEl = bubbleW.querySelector('.km-actions');
        bubble.innerHTML = '<span class="kie-stream-cursor">▌</span>';
        scrollKie(true);
      }

      let streamedText = '';
      let firstToken   = false;
      let turnSources  = null;
      let turnImages   = null;

      function _finishImageBubble(text) {
        _ensureImageBubble();
        const display = text.replace(/\s*\[FU\].*?\[\/FU\]/gs, '').trim();
        bubble.innerHTML = _formatKieLive(display, true, turnSources, turnImages, kieMode);
        _kieInsertSourceCards(bubbleW.querySelector('.km-ai-body'), turnSources, kieMode);
        if (actionsEl) actionsEl.classList.add('visible');
        maybeShowKieSuggestions(text, bubbleW);
        _kieGenerating = false;
        _kieStopTyping = false;
        inp.disabled = false;
        _kieSafeFocusInput(inp);
        setKieSendMode('send');
        scrollKie();
      }

      try {
        const fetchRes = await _kieFetchWithRetry('/api/kie', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body:    JSON.stringify({
            messages:      historyForApi,
            mode:          kieMode,
            model:         kieModel,
            resumeContext: kieResumeContext,
            docContext:    kieDocContext,
            userCategory:  (typeof getUserCategory === 'function' ? getUserCategory() : null),
            convId:        _getKieConvId(),
          }),
          signal: _kieAbort?.signal,
        });

        if (!fetchRes.ok) throw new Error('HTTP ' + fetchRes.status);

        const reader  = fetchRes.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          let done, value;
          try { ({ done, value } = await reader.read()); }
          catch (readErr) { if (_kieStopTyping) break; throw readErr; }
          if (_kieStopTyping || done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let chunk;
            try { chunk = JSON.parse(line.slice(6)); } catch { continue; }

            if (chunk.t === 'd') {
              if (!firstToken) { typEl.style.display = 'none'; hideKieStatus(); _ensureImageBubble(); firstToken = true; }
              streamedText += chunk.v;
              const live = streamedText.replace(/\s*\[FU\].*?\[\/FU\]/gs, '').trim();
              bubble.innerHTML = _formatKieLive(live, false, turnSources, turnImages, kieMode) + '<span class="kie-stream-cursor">▌</span>';
              scrollKie();
            } else if (chunk.t === 'search') {
              _kieShowRealSearch(chunk.v);
            } else if (chunk.t === 'searchdone') {
              _kieEndRealSearch(chunk.count);
              if (chunk.sources?.length) turnSources = chunk.sources;
              if (chunk.images?.length) turnImages = chunk.images;
            } else if (chunk.t === 'err') {
              throw new Error(chunk.v || 'KIE error');
            }
          }
        }

        typEl.style.display = 'none'; hideKieStatus();
        const finalText = streamedText || "I couldn't analyse that image right now. Try again! 🙏";
        kieHist.push({ role:'assistant', content: finalText, sources: turnSources || undefined, images: turnImages || undefined, mode: kieMode });
        saveKieHistory();
        _finishImageBubble(finalText);

      } catch(e) {
        typEl.style.display = 'none'; hideKieStatus();
        if (e.name === 'AbortError' || _kieStopTyping) {
          if (streamedText) {
            kieHist.push({ role:'assistant', content: streamedText });
            saveKieHistory();
            _finishImageBubble(streamedText);
          } else {
            if (bubbleW && bubbleW.parentNode) bubbleW.parentNode.removeChild(bubbleW);
            if (kieHist.length && kieHist[kieHist.length-1].role === 'user') { kieHist.pop(); saveKieHistory(); }
            _kieGenerating = false; _kieStopTyping = false;
            inp.disabled = false; setKieSendMode('send');
          }
          return;
        }
        _ensureImageBubble();
        bubble.innerHTML = `<span style="opacity:.8">I had trouble reading that image. Try again! 🙏</span>`;
        if (actionsEl) actionsEl.style.display = 'none';
        if (kieHist.length && kieHist[kieHist.length-1].role === 'user') { kieHist.pop(); saveKieHistory(); }
        _kieGenerating = false;
        inp.disabled = false;
        setKieSendMode('send');
      }
    }

    // ── KIE INTENT DETECTION ─────────────────────────────────────────────────
    // Hoisted out of detectKieIntent so the smart-classifier gate further down
    // can reuse the same "this looks like a resume edit" signal instead of
    // needing its own separate (and inevitably narrower) keyword list.
    const UPDATE_VERBS = /\b(add|change|update|rewrite|improve|fix|edit|revise|rework|redo|include|re[\s-]?structure|reorgani[sz]e|reformat|revamp|redesign|overhaul|tailor|polish|refine|reflect)\b/i;
    const UPDATE_NOUNS = /\b(summary|headline|bio|objective|experience|skills?|bullet|educat\w*|degree|school|university|college|certificat\w*|qualification|name|email|phone|location|contact|address|title|role|resume|cv)\b/i;

    function detectKieIntent(msg) {
      const m = msg.toLowerCase();

      // Exclude photo/image change requests
      if (/\b(change|update|replace|upload|add)\b.*\b(image|photo|picture|pic)\b|\b(image|photo|picture)\b.*\b(change|update|replace|upload|send)\b/i.test(msg)) return null;

      // Detect each signal independently first, so we can combine them when more
      // than one shows up in the same message — e.g. "add my education and use
      // the tribune template and resend as file" previously matched ONLY the
      // template change and silently dropped the content-update request.
      const namedTpl = detectTemplateInMsg(msg);
      const hasTemplateSignal = !!namedTpl || /\b(change|switch|update|use|apply|try|pick|select|go with)\b.*\btemplates?\b|\btemplates?\b.*(change|switch|update|use|apply)/i.test(msg);

      // BUG FIX: "restructure the resume and resend" used to fall through to
      // plain SEND_RESUME — "restructure" wasn't in the update-verb list, and
      // bare "resume" (as opposed to a specific section like "summary") wasn't
      // in the noun list either. Broadened both, and switched from a single
      // fragile order-dependent regex (verb...noun in that exact sequence) to
      // independent presence checks, so "resend my resume, restructured" and
      // "restructure the resume and resend" both work regardless of word order.
      const RESEND_SIGNAL = /\b(and\s+(re)?send|resend|send\s+(it|the\s+(pdf|resume))|give\s+me\s+the\s+pdf|as\s+a?\s*file)\b/i;
      const hasContentUpdateSignal = UPDATE_VERBS.test(msg) && UPDATE_NOUNS.test(msg);

      if (hasTemplateSignal && hasContentUpdateSignal && namedTpl) {
        return { type: 'UPDATE_TEMPLATE_AND_SEND', templateId: namedTpl.id };
      }

      // BUG FIX: build-from-scratch requests ("build me a resume", "make me a
      // resume for a PM role") used to fall straight through to the generic
      // chat model, which had no real way to actually create + save a resume —
      // it could only TELL the user to say this phrase, not act on it. Checked
      // before SEND_RESUME/UPDATE_RESUME_AND_SEND so "build me a resume and
      // send it" doesn't get swallowed by the generic "send...resume" pattern.
      // Negative lookahead excludes "create a resume summary/headline/etc" —
      // those are normal content-generation asks, not "make me a new resume".
      const BUILD_RESUME_PATTERN = /\b(build|create|make|generate|write|draft|start)\s+(?:me\s+)?(?:a\s+|the\s+)?(?:new\s+|fresh\s+|full\s+)?resume\b(?!\s+(summary|headline|bullet|bio|section|objective))/i;
      if (BUILD_RESUME_PATTERN.test(msg)) return 'BUILD_RESUME_FROM_SCRATCH';

      // BUG FIX: this used to run AFTER the plain "send/resend...resume" check
      // below, which is broad enough to match almost any sentence containing
      // both words — so "Add my certification and send me the updated resume"
      // matched plain SEND_RESUME first and the requested edit was silently
      // dropped. Compound (update + send) intents now resolve before the plain
      // send-only pattern, mirroring the UPDATE_TEMPLATE_AND_SEND fix above.
      if (hasContentUpdateSignal && RESEND_SIGNAL.test(msg)) return 'UPDATE_RESUME_AND_SEND';
      // BUG FIX: dropped the bare "resend my resume" alternative that used to
      // live here — it had no requirement that anything was actually changed,
      // so a plain "resend my resume" (nothing to update) was being misfiled as
      // an UPDATE intent instead of a plain SEND. Kept only the phrasings that
      // genuinely imply a prior edit ("the UPDATED resume", "new version").
      if (/send\s+(me\s+)?the\s+updated|updated?\s+pdf|new\s+version\s+of\s+(my\s+)?resume/i.test(msg)) return 'UPDATE_RESUME_AND_SEND';

      // Send PDF / resume as file — broad natural language coverage
      if (/\b(send|get|give me|share|show me)\b.*\bpdf\b|\bpdf\b.*\b(send|get|download|please)\b/i.test(msg)) return 'SEND_RESUME';
      if (/\b(send|resend|download|give me|get me|share|show me|forward|attach|export)\b.*\bresume\b|\bresume\b.*(send|file|pdf|download|please)/i.test(msg)) return 'SEND_RESUME';
      if (/\b(can i (get|have|download|see)|i (need|want) (my|the)|let me (see|have|get))\b.*\bresume\b/i.test(msg)) return 'SEND_RESUME';
      // BUG FIX: the exclusion below used to be \b(upload|attach|add)\b — a
      // strict whole-word match that does NOT match "uploaded"/"uploading"
      // ("upload" and the following "ed" share no word boundary), so "analyze
      // the file I uploaded" slipped past the exclusion and got misread as a
      // download request. Widened to \w* so any form of the verb excludes.
      // Also excludes inspection/discussion verbs — "analyze/check/summarize
      // the file" means "look at it and talk to me", not "send it to me".
      const FILE_INSPECT_VERBS = /\b(analy[sz]e|read|review|check|summar\w*|explain|examine|look at|go over|break\s?down|discuss|what('?s| is| does| are)|tell me about)\b/i;
      if (/\b(the (file|pdf|document)|my (file|pdf|document))\b/i.test(msg) && !/\b(upload\w*|attach\w*|add\w*)\b/i.test(msg) && !FILE_INSPECT_VERBS.test(msg)) return 'SEND_RESUME';
      // Catches phrasing with no literal "resume"/"pdf" — "send as file so I can download",
      // "can I download this", "let me download it" — all of which previously fell through
      // to the raw LLM and produced generic "I'm a language model" replies.
      // Same word-boundary bug as above lived here too — \b(upload|attach|add)\b
      // doesn't match "attached"/"adding"/"uploaded". Fixed identically, plus
      // the same inspection-verb exclusion ("read it as a file" for context
      // isn't "send it to me").
      if (/\bas\s+a?\s*file\b|\bsend\s+(it|this|that)?\s*as\s+a?\s*(file|document)\b/i.test(msg) && !/\b(upload\w*|attach\w*|add\w*)\b/i.test(msg) && !FILE_INSPECT_VERBS.test(msg)) return 'SEND_RESUME';
      if (/\b(can|could)\s+i\s+download|\bi\s+(want|need)\s+to\s+download|\blet\s+me\s+download|\bdownload\s+(it|this|that)\b/i.test(msg)) return 'SEND_RESUME';

      // Template change — also catch "use the [name] one", "switch it to [name]"
      if (namedTpl) return 'CHANGE_TEMPLATE';
      if (/\b(change|switch|update|use|apply|try|pick|select|go with)\b.*\btemplates?\b|\btemplates?\b.*(change|switch|update|use|apply)/i.test(msg)) return 'CHANGE_TEMPLATE';

      return null;
    }

    function detectTemplateInMsg(msg) {
      const lower = msg.toLowerCase();
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Word-boundary match only — a plain .includes() here matches "ink"
      // inside "think"/"LinkedIn" and "nova" inside "innovative"/"innovation",
      // silently hijacking completely unrelated messages into a template
      // switch. Short template names/ids must only match as a whole word.
      return (window.TPLS_REF || []).find(t => {
        const name = esc(t.name.toLowerCase());
        const id   = esc(t.id.toLowerCase());
        return new RegExp(`\\b${name}\\b`).test(lower) || new RegExp(`\\b${id}\\b`).test(lower);
      });
    }

    // ── INTENT SAFETY-NET — fast server-side classification fallback ────────
    // Only called when the instant regex layer (detectKieIntent) found nothing
    // but the message still mentions something file/resume-shaped. Runs on KIE
    // Spark (Groq) — typically ~300–600ms — and never blocks normal chat if it
    // errors or times out; the caller treats any failure as "fall through".
    async function _kieClassifyIntent(msg) {
      const recentHistory = kieHist.slice(-8).map(h => ({ role: h.role, content: (h.content || '').slice(0, 300) }));
      const r = await fetch('/api/kie-intent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body:    JSON.stringify({
          message:           msg,
          recentHistory,
          hasSelectedResume: !!(kieSelectedResume && kieSelectedResume.resumeData),
        }),
      });
      if (!r.ok) throw new Error('Intent classification HTTP ' + r.status);
      return await r.json();
    }

    // ── KIE: SEND RESUME AS DOWNLOADABLE FILE CARD ───────────────────────────
    async function kieActionSendResume() {
      if (!kieSelectedResume || !kieSelectedResume.resumeData) {
        const hasUploadedResume = !!kieResumeContext && kieResumeContext !== 'NO_RESUME_YET' && kieResumeContext !== 'HAS_RESUMES_UNSELECTED';
        if (hasUploadedResume) {
          appendKMsg('ai', "Your uploaded resume is raw text — there's no real PDF behind it yet, so there's nothing to download just yet.\n\nWant me to **build it into a real Kievora resume**? Just say \"build me a resume\" and I'll turn it into a full editable version with any of the 13 templates applied — and a real, downloadable PDF. 📄", true);
        } else {
          appendKMsg('ai', "I'd love to send your resume, but I need you to select one first. Tap a resume from the **COACH ON:** picker above and I'll have it ready for you. 👆", true);
        }
        return;
      }

      // Lock UI so user can't double-fire
      if (_kieGenerating) return;
      _kieGenerating = true;
      _kieStopTyping = false;
      const inp = g('kieInp');
      if (inp) inp.disabled = true;
      setKieSendMode('stop');
      g('kieTyp').style.display = 'flex';
      _setKieStatusCustom([
        'Preparing your resume…',
        'Building the layout…',
        'Generating your PDF…',
        'Almost there…',
      ]);
      scrollKie();

      try {
        const r        = kieSelectedResume;
        const d        = { ...(r.resumeData || {}) };
        const tpl      = r.templateType || 'classic';
        const tplObj   = (window.TPLS_REF || []).find(t => t.id === tpl) || { bg: '#1e3a8a', name: tpl };
        const name     = r.resumeName || d.fullName || 'Resume';
        const filename = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';
        const html     = buildPrevHTML(d, tpl, tplObj.bg, 'rf-sans');

        g('kieTyp').style.display = 'none'; hideKieStatus();
        const intro = `Here's your **${name}** resume — ${tplObj.name || tpl} template. Tap the button below to download. 📄`;
        appendKiePrintCard(name, html, intro);
        kiePushFileCardHistory(name, html, intro);

      } catch (e) {
        console.error('KIE send resume error:', e.message);
        g('kieTyp').style.display = 'none'; hideKieStatus();
        const friendly = e.message?.includes('503') || e.message?.includes('unavailable')
          ? "PDF service isn't available right now — try the download button on your resume card instead. 🙏"
          : `Couldn't generate the PDF right now (${e.message || 'unknown error'}). Try again in a moment. 🙏`;
        appendKMsg('ai', friendly, true);
      }
    }

    // ── SMART SEND: checks conversation for pending edits before sending PDF ──
    // Tracks the last edit request that triggered a CODEBLOCK response —
    // so a follow-up confirmation ("yes", "love it") can apply those changes.
    let _kieLastEditRequest = '';
    let _kieLastEditTs      = 0;

    // Called whenever [SEND_PDF] fires from free-form chat.
    // Three paths:
    //  A) request contains an edit verb → apply the edit immediately via kieActionUpdateAndSendResume
    //  B) pure confirmation + pending edit → apply _kieLastEditRequest
    //  C) ambiguous → AI patch-check on history, then resend
    async function kieActionSmartSend(userRequest) {
      if (!kieSelectedResume || !kieSelectedResume.resumeData) {
        return kieActionSendResume();
      }

      const req = (userRequest || '').trim();

      // PATH A: the user request itself is an edit instruction
      const EDIT_VERBS = /\b(add|extend|expand|improve|update|change|rewrite|fix|edit|revise|include|remove|delete|shorten|lengthen|strengthen|enhance|rephrase|reword)\b/i;
      if (EDIT_VERBS.test(req)) {
        _kieLastEditRequest = req;
        _kieLastEditTs      = Date.now();
        return kieActionUpdateAndSendResume(req);
      }

      // PATH B: pure confirmation — apply the last pending edit if fresh (<5 min)
      const IS_CONFIRM = /^\s*(yes|yeah|yep|ok|okay|sure|go ahead|do it|send it|sounds good|love it|perfect|apply it|use that|save it|confirm|great|looks good|that'?s? (great|perfect|good|fine|right)|i love it)\s*[.!]?\s*$/i;
      if (IS_CONFIRM.test(req) && _kieLastEditRequest && (Date.now() - _kieLastEditTs < 5 * 60 * 1000)) {
        const pendingReq    = _kieLastEditRequest;
        _kieLastEditRequest = '';
        return kieActionUpdateAndSendResume(pendingReq);
      }

      // PATH C: ambiguous — scan history for explicitly confirmed changes
      const recentHist = kieHist.slice(-10);
      const conversationContext = recentHist
        .map(m => (m.role === 'user' ? 'User' : 'KIE') + ': ' + m.content)
        .join('\n');

      const patchPrompt = `You are reviewing a conversation to determine whether the user has clearly approved specific resume changes that should be applied before sending the PDF.

Conversation:
${conversationContext}

Current resume data (JSON):
${JSON.stringify(kieSelectedResume.resumeData, null, 2)}

Rules:
- Only extract changes the user has EXPLICITLY confirmed (e.g. "yes do that", "go ahead", "apply it", "yes please", "sounds good").
- If KIE proposed specific text and the user confirmed it, use that exact proposed text.
- Do NOT invent or guess anything. Do NOT include a field unless you have real confirmed content for it.
- Supported fields: summary, jobTitle, fullName, resumeName, workExperience (array), skills (array), education (array).
- If no confirmed changes are found, return {}.

Return ONLY valid JSON, no markdown, no explanation.`;

      try {
        // Same as the other patch-prompt call earlier in this file — intentional
        // internal use of KIE_MODES.quick (no visible UI pill), not a bug. Don't touch.
        const raw = await _kieCallSilent(
          { messages: [{ role: 'user', content: patchPrompt }], mode: 'quick', model: kieModel, resumeContext: '' }
        ) || '{}';
        let patchFields = {};
        try {
          const cleaned = raw.replace(/```json|```/g, '').trim();
          patchFields = JSON.parse(cleaned);
        } catch(e) { patchFields = {}; }

        if (Object.keys(patchFields).length > 0) {
          const updatedData   = { ...kieSelectedResume.resumeData, ...patchFields };
          const updatedResume = { ...kieSelectedResume, resumeData: updatedData };
          if (patchFields.resumeName) updatedResume.resumeName = patchFields.resumeName;
          if (kieSelectedResume.id) {
            tok = await usr.getIdToken();
            await fetch(`/api/resumes/${kieSelectedResume.id}`, {
              method:  'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
              body:    JSON.stringify(updatedResume),
            });
          }
          kieSelectedResume = updatedResume;
          kieResumeContext  = buildResumeContext(updatedResume);
          const idx = resumes.findIndex(r => r.id === updatedResume.id);
          if (idx >= 0) resumes[idx] = updatedResume;
        }
      } catch(e) {
        console.warn('KIE smart send patch check failed:', e.message);
      }

      return kieActionSendResume();
    }

    // ── KIE: SHOW TEMPLATE PICKER IN CHAT ────────────────────────────────────
    function showKieTemplatePicker(introText, persist = true) {
      const tpls = window.TPLS_REF || [];
      const msgs = g('kieMsgs');
      msgs.style.display = 'flex';
      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';

      const w = document.createElement('div');
      w.className = 'km km-ai';
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const pillsHTML = tpls.map(t =>
        `<button class="kie-tpl-pick-pill" onclick="applyKieTemplate('${t.id}')">
          <span class="kie-tpl-pick-dot" style="background:${t.bg}"></span>
          <span class="kie-tpl-pick-name">${esc(t.name)}</span>
          <span class="kie-tpl-pick-tag">${esc(t.tag)}</span>
        </button>`
      ).join('');

      w.innerHTML = `
        <div class="km-ai-body">
          <div class="km-bubble">
            ${introText ? `<div style="margin-bottom:10px">${esc(introText)}</div>` : ''}
            <strong>Choose a template:</strong>
            <div class="kie-tpl-pick-grid">${pillsHTML}</div>
          </div>
          <div class="km-meta">${time}</div>
        </div>`;
      msgs.insertBefore(w, g('kieTyp'));
      scrollKie();

      // Persist so the picker survives a reload/navigate-away instead of just
      // vanishing — same pattern used for file cards and attached images.
      if (persist) {
        kieHist.push({ role: 'assistant', content: introText || '', templatePicker: true });
        saveKieHistory();
      }
    }

    window.applyKieTemplate = async function(tplId) {
      const tplObj = (window.TPLS_REF || []).find(t => t.id === tplId);
      if (!tplObj) return;

      if (!kieSelectedResume || !kieSelectedResume.id) {
        const hasUploadedResume = !!kieResumeContext;
        if (hasUploadedResume) {
          appendKMsg('ai', "Template changes only work on Kievora-saved resumes — your uploaded resume is a read-only text file, so I can't apply templates to it directly.\n\nWant me to **build you a new Kievora resume** from your uploaded one? Just say \"build me a resume\" and I'll create a full editable version you can style with any of the 13 templates. 🎨", true);
        } else {
          appendKMsg('ai', "I need a saved resume to apply a template to. Select one from the **COACH ON:** picker at the top, then pick a template. 👆", true);
        }
        return;
      }

      // Disable all picker pills to prevent double-tap
      document.querySelectorAll('.kie-tpl-pick-pill').forEach(p => { p.disabled = true; p.style.opacity = '.5'; });

      const isPhotoTpl = (window.PHOTO_SUPPORTED_TPLS_REF || new Set()).has(tplId);
      const hasPhoto   = !!(kieSelectedResume.resumeData?.photo);

      try {
        const updated = { ...kieSelectedResume, templateType: tplId, primaryColor: tplObj.bg };

        const res = await fetch(`/api/resumes/${kieSelectedResume.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body:    JSON.stringify(updated),
        });
        if (!res.ok) throw new Error('Save failed');

        // Update in memory
        kieSelectedResume = updated;
        const idx = resumes.findIndex(r => r.id === updated.id);
        if (idx >= 0) resumes[idx] = updated;
        kieResumeContext = buildResumeContext(updated);

        // Update picker pill label if needed (template change doesn't change resume name)
        let reply = `Done — switched to the **${tplObj.name}** template (${tplObj.tag}). ✅`;
        if (isPhotoTpl && !hasPhoto) {
          reply += `\n\nThis template supports a profile photo. Upload one with the 📎 button if you'd like to add one — or it'll look great without it too.`;
        }
        reply += `\n\nHere's your resume with the **${tplObj.name}** template applied — tap to download. 📄`;

        // One cohesive message — text + file card together, not two separate bubbles
        const _d    = { ...(updated.resumeData || {}) };
        const _name = updated.resumeName || _d.fullName || 'Resume';
        const _html = buildPrevHTML(_d, tplId, tplObj.bg, 'rf-sans');
        appendKiePrintCard(_name, _html, reply);
        kiePushFileCardHistory(_name, _html, reply);

      } catch(e) {
        console.error('Template change error:', e);
        appendKMsg('ai', "I had trouble saving that. Try again in a moment. 🙏", true);
        document.querySelectorAll('.kie-tpl-pick-pill').forEach(p => { p.disabled = false; p.style.opacity = '1'; });
      }
    };

    // ── KIE: FILE CARD IN CHAT ────────────────────────────────────────────────
    // ── CLIENT-SIDE RESUME PRINT (no Puppeteer needed) ───────────────────────
    // Attached to window so inline onclick strings inside innerHTML can always
    // reach it, even across script-scope boundaries on some mobile browsers.
    window.kieOpenResumePrint = function kieOpenResumePrint(html, name) {
      const title = (name || 'Resume').replace(/[<>]/g, '');
      const pageSizeCSS = _kvComputePageSize(html);
      const fullHtml = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + title + '</title>'
        + '<link rel="preconnect" href="https://fonts.googleapis.com">'
        + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">'
        + '<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
        + 'html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
        + '.rf-sans{font-family:"Inter",system-ui,-apple-system,sans-serif}'
        + '.rf-serif{font-family:Georgia,"Times New Roman",serif}'
        + '.rf-mono{font-family:"Courier New",Courier,monospace}'
        + '@media print{@page{size:' + pageSizeCSS + ';margin:0}html,body{margin:0;padding:0;width:100%}}</style>'
        + '</head><body>' + html + '</body></html>';

      _kieShowDownloadOverlay('Preparing your resume PDF…');

      // PRIMARY: hidden iframe — bypasses Android Chrome popup blocker entirely
      // because it prints within the same page context, no new window needed.
      try {
        const ifrEl = document.createElement('iframe');
        ifrEl.style.cssText = 'position:fixed;width:0;height:0;border:0;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
        document.body.appendChild(ifrEl);
        const iDoc = ifrEl.contentDocument || ifrEl.contentWindow.document;
        iDoc.open(); iDoc.write(fullHtml); iDoc.close();
        setTimeout(function() {
          try { ifrEl.contentWindow.focus(); ifrEl.contentWindow.print(); } catch(pe) {}
          _kieHideDownloadOverlay();
          setTimeout(function() { try { document.body.removeChild(ifrEl); } catch(e) {} }, 60000);
        }, 600);
        toast('Print dialog opening — choose "Save as PDF" in the menu');
        return true;
      } catch(ifrErr) { _kieHideDownloadOverlay(); /* fall through to blob-URL approaches */ }

      // FALLBACK A: blob URL in a new tab (desktop + some mobile)
      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      let opened = false;
      try {
        const printWin = window.open(url, '_blank');
        if (printWin) {
          opened = true;
          setTimeout(function() { try { printWin.focus(); printWin.print(); } catch(e) {} _kieHideDownloadOverlay(); }, 700);
        }
      } catch(e) { opened = false; }

      if (!opened) {
        _kieHideDownloadOverlay();
        // FALLBACK B: <a download> — downloads the HTML file to device storage,
        // most reliable last resort on stubborn Android browsers.
        const a = document.createElement('a');
        a.href = url; a.download = title + '.html';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('Resume saved to Downloads — open it and tap Print to save as PDF');
        setTimeout(function() { try { URL.revokeObjectURL(url); } catch(e) {} }, 30000);
        return true;
      }

      toast('Choose "Save as PDF" in the print dialog');
      setTimeout(function() { try { URL.revokeObjectURL(url); } catch(e) {} }, 120000);
      return true;
    };

    // Print-card variant — shows a reopen button instead of blob download link
    function appendKiePrintCard(resumeName, html, introMsg, silent) {
      const msgs = g('kieMsgs');
      msgs.style.display = 'flex';
      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';

      const w = document.createElement('div');
      w.className = 'km km-ai';
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const rawMsg = introMsg || `Here's your resume — tap the button below to open it and save as a PDF. 📄`;
      const displayMsg = rawMsg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // Store html keyed by a unique id so the reopen button can access it
      const printId = 'kp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      if (!window._kiePrintStore) window._kiePrintStore = {};
      window._kiePrintStore[printId] = { html, name: resumeName };

      w.innerHTML = `
        <div class="km-ai-body">
          <div class="km-bubble">${displayMsg}</div>
          <div class="km-file-card">
            <div class="km-file-ico">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div class="km-file-info">
              <div class="km-file-name">${esc(resumeName)}.pdf</div>
              <div class="km-file-meta">Tap to open & save as PDF</div>
            </div>
            <button class="km-file-dl" onclick="(function(){var s=window._kiePrintStore&&window._kiePrintStore['${printId}'];if(s)kieOpenResumePrint(s.html,s.name);})()">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Save as PDF
            </button>
          </div>
          <div class="km-meta">${time}</div>
        </div>`;
      msgs.insertBefore(w, g('kieTyp'));
      scrollKie();

      if (silent) return;
      _kieGenerating = false;
      _kieStopTyping = false;
      const inp = g('kieInp');
      if (inp) { inp.disabled = false; _kieSafeFocusInput(inp); }
      setKieSendMode('send');
    }


    function appendKieFileCard(resumeName, filename, blobUrl, introMsg) {
      const msgs = g('kieMsgs');
      msgs.style.display = 'flex';
      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';

      const w = document.createElement('div');
      w.className = 'km km-ai';
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const rawMsg = introMsg || `Here's your resume — formatted with your chosen template, text extractable and ready. 📄`;
      // Render markdown bold in intro message
      const displayMsg = rawMsg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      w.innerHTML = `
        <div class="km-ai-body">
          <div class="km-bubble">${displayMsg}</div>
          <div class="km-file-card">
            <div class="km-file-ico">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div class="km-file-info">
              <div class="km-file-name">${esc(filename)}</div>
              <div class="km-file-meta">Text extractable PDF · ${esc(resumeName)}</div>
            </div>
            <a class="km-file-dl" href="${blobUrl}" download="${esc(filename)}">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download
            </a>
          </div>
          <div class="km-meta">${time}</div>
        </div>`;
      msgs.insertBefore(w, g('kieTyp'));
      scrollKie();

      // Always restore UI — file card is a terminal output like a finished message
      _kieGenerating = false;
      _kieStopTyping = false;
      const inp = g('kieInp');
      if (inp) { inp.disabled = false; _kieSafeFocusInput(inp); }
      setKieSendMode('send');
    }

    // ── KIE Generation State ───────────────────────────────────────────────────
    let _kieGenerating  = false;   // blocks double-send from any entry point
    let _kieAbort       = null;    // AbortController — cancels the fetch
    let _kieStopTyping  = false;   // stops the typewriter mid-animation
    let _kieIntentClassifying = false; // guards the layer-2 intent-safety-net call below

    const SEND_ICON = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>`;
    const STOP_ICON_BTN = `<svg width="13" height="13" viewBox="0 0 13 13" fill="#fff"><rect x="0" y="0" width="13" height="13" rx="2"/></svg>`;
    const WAVE_ICON_BTN = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="10" x2="4" y2="14"/><line x1="8" y1="6" x2="8" y2="18"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="16" y1="7" x2="16" y2="17"/><line x1="20" y1="10" x2="20" y2="14"/></svg>`;

    // Same pattern as this chat's own composer: one button does double duty.
    // Empty input → it's KIE's live-voice-chat trigger. Start typing → it
    // becomes send. Mid-reply → it's the stop button. Every existing call
    // site in the file just passes 'send' or 'stop' as before — this
    // function decides voice-vs-send on its own based on the input's
    // current content, so nothing else needed to change.
    function setKieSendMode(mode) {
      const btn = g('kieSend');
      if (!btn) return;
      if (mode === 'stop') {
        btn.innerHTML = STOP_ICON_BTN;
        btn.classList.add('kie-stop');
        btn.disabled = false;
        btn.title = 'Stop generating';
        return;
      }
      btn.classList.remove('kie-stop');
      btn.disabled = false;
      const inp = g('kieInp');
      const hasText = !!(inp && inp.value.trim().length);
      if (hasText) {
        btn.innerHTML = SEND_ICON;
        btn.title = 'Send';
      } else {
        btn.innerHTML = WAVE_ICON_BTN;
        btn.title = 'Talk live with KIE';
      }
    }

    function stopKieGeneration() {
      // Abort fetch if still in flight
      if (_kieAbort) { _kieAbort.abort(); _kieAbort = null; }
      // Signal typewriter to stop mid-animation
      _kieStopTyping = true;
      // If fetch was aborted before assistant replied, remove the orphaned user message
      // so the next conversation doesn't inherit a dangling user turn
      if (kieHist.length && kieHist[kieHist.length - 1].role === 'user') {
        kieHist.pop();
        saveKieHistory();
      }
      // Hide indicators
      const typ = g('kieTyp');
      if (typ) typ.style.display = 'none';
      hideKieStatus();
      // Restore UI
      _kieGenerating = false;
      g('kieInp').disabled = false;
      setKieSendMode('send');
    }

    // ── BUG FIX #8 — Retry wrapper ───────────────────────────────────────────
    // Retries on transient network errors and 5xx/429 responses with exponential
    // backoff (600 ms → 1.2 s → give up). AbortErrors are never retried.
    async function _kieFetchWithRetry(url, options, maxRetries = 2) {
      let lastErr;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(url, options);
          // Retry on server errors and rate-limit responses
          if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)));
            continue;
          }
          return res;
        } catch (e) {
          if (e.name === 'AbortError') throw e; // never retry a user-initiated stop
          lastErr = e;
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)));
          }
        }
      }
      throw lastErr;
    }

    // ── SEND KIE — unified handler ────────────────────────────────────────────
    async function sendKie() {
      // Stop if generating
      if (_kieGenerating) { stopKieGeneration(); return; }

      const inp = g('kieInp');
      const msg = inp.value.trim();
      const att = _stagedKieAttachment;

      // Nothing to send
      if (!msg && !att) return;

      // ── IMAGE ATTACHMENT → vision send ──────────────────────────────────────
      if (att && att.type === 'image') {
        clearKieAttachStage();
        inp.value = ''; inp.style.height = 'auto';
        await _sendKieWithImage(att, msg);
        return;
      }

      // ── PDF/TXT ATTACHMENT → analyse and coach ───────────────────────────────
      if (att && (att.type === 'pdf' || att.type === 'txt')) {
        clearKieAttachStage();
        const fileRef = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const base64  = (att.previewDataUrl || '').split(',')[1] || '';
        const mimeType = att.file?.type || (att.type === 'pdf' ? 'application/pdf' : 'text/plain');
        _kieFileStore.set(fileRef, { base64, mimeType, name: att.name, ext: att.type });
        _appendKieFileMsg(fileRef, att.name, att.type, msg);
        kieHist.push({ role:'user', content: msg || '', fileRef, fileName: att.name, fileExt: att.type });
        inp.value = ''; inp.style.height = 'auto';
        await _processKieFileAttachment(att, msg);
        return;
      }

      // ── PENDING RESUME CONFIRMATION (plain text, no button needed) ─────────
      // If KIE read an uploaded file, decided it wasn't a resume, and is now
      // holding it as pending — a plain "yes it's my resume" / "score it"
      // reply should promote it exactly like tapping the CTA button would,
      // instead of forcing the user to hunt for a button that may not even
      // be showing (it's hidden entirely for obviously unrelated files).
      if (_kiePendingFileText && /\b(yes|yeah|yep|it'?s|treat (it|this) as|score it as|analyze it as|that is)\b.*\b(my )?resume\b|\b(it'?s|this is) my resume\b/i.test(msg)) {
        appendKMsg('user', msg, true);
        kieHist.push({ role: 'user', content: msg });
        inp.value = ''; inp.style.height = 'auto';
        window.kieConfirmPendingResume();
        return;
      }

      // ── INTENT DETECTION ────────────────────────────────────────────────────
      let intent = detectKieIntent(msg);

      if (intent && intent.type === 'UPDATE_TEMPLATE_AND_SEND') {
        appendKMsg('user', msg, true);
        kieHist.push({ role:'user', content: msg });
        inp.value = ''; inp.style.height = 'auto';
        kieActionUpdateTemplateAndSend(msg, intent.templateId);
        return;
      }

      // ── CONFIRMATION INTERCEPT: "yes", "save it", "love it" etc. ─────────────
      // If the user sends a pure confirmation AND we have a pending edit from a
      // recent CODEBLOCK response, apply that edit now instead of going to chat.
      const IS_CONFIRM_MSG = /^\s*(yes|yeah|yep|ok|okay|sure|go ahead|do it|send it|sounds good|love it|perfect|apply it|use that|save it|confirm|great|looks good|that'?s? (great|perfect|good|fine|right)|i love it)\s*[.!]?\s*$/i;
      if (IS_CONFIRM_MSG.test(msg) && _kieLastEditRequest && (Date.now() - _kieLastEditTs < 5 * 60 * 1000) && kieSelectedResume?.resumeData) {
        const pendingReq    = _kieLastEditRequest;
        _kieLastEditRequest = '';
        appendKMsg('user', msg, true);
        kieHist.push({ role:'user', content: msg });
        inp.value = ''; inp.style.height = 'auto';
        kieActionUpdateAndSendResume(pendingReq);
        return;
      }

      if (intent === 'SEND_RESUME') {
        appendKMsg('user', msg, true);
        kieHist.push({ role:'user', content: msg });
        inp.value = ''; inp.style.height = 'auto';

        // If the last AI response was a roadmap/long-form report (not a resume
        // PDF card), the user is probably asking to save THAT, not the resume.
        // Detect by checking if _kieLastReportData is set and recent (<10 min).
        // SAFETY: an explicit "resume"/"cv" mention in THIS message always wins
        // over cached report data — if they said "resume", they mean the resume,
        // full stop, regardless of what's sitting in the cache.
        // Same \b(word)\b suffix bug as elsewhere in this file — \bresume\b
        // doesn't match "resumes" (plural), so widened to \w*.
        if (window._kieLastReportData && (Date.now() - (window._kieLastReportData.ts || 0) < 10 * 60 * 1000) && !/\bresume\w*\b|\bcvs?\b/i.test(msg)) {
          const rd = window._kieLastReportData;
          // Brief, honest loading beat before the print dialog opens — there's
          // no AI call on this path (the content's already generated), but
          // popping a native print sheet with zero chat acknowledgment felt
          // like the file just appearing out of nowhere.
          g('kieTyp').style.display = 'flex';
          _setKieStatusCustom(['Preparing your report…', 'Formatting for PDF…']);
          setTimeout(function() {
            g('kieTyp').style.display = 'none';
            hideKieStatus();
            window.downloadKieReport(rd.title, rd.subtitle, rd.bodyHtml);
          }, 900);
          window._kieLastReportData = null;
          return;
        }

        kieActionSendResume();
        return;
      }

      // Same broadened intelligence as the upload-classification fix: an
      // update/restructure verb + noun match doesn't automatically mean "edit
      // my resume" — if there's no resume selected or uploaded, but there IS
      // a pending non-resume file from this conversation, "restructure my
      // bio" almost certainly means that file, not a resume nobody picked.
      // Downgrade to no-intent so it falls through to normal chat, where
      // docContext lets KIE handle it against the actual file in play.
      if (intent === 'UPDATE_RESUME_AND_SEND') {
        const hasResumeTarget = (kieSelectedResume && kieSelectedResume.resumeData) ||
          (!!kieResumeContext && kieResumeContext !== 'NO_RESUME_YET' && kieResumeContext !== 'HAS_RESUMES_UNSELECTED');
        if (!hasResumeTarget && _kiePendingFileText) intent = null;
      }

      if (intent === 'UPDATE_RESUME_AND_SEND') {
        appendKMsg('user', msg, true);
        kieHist.push({ role:'user', content: msg });
        inp.value = ''; inp.style.height = 'auto';
        if (kieSelectedResume && kieSelectedResume.resumeData) {
          kieActionUpdateAndSendResume(msg);
        } else {
          const hasUploadedResume = !!kieResumeContext && kieResumeContext !== 'NO_RESUME_YET' && kieResumeContext !== 'HAS_RESUMES_UNSELECTED';
          if (hasUploadedResume) {
            appendKMsg('ai', "Your uploaded resume is raw text, so there's no template or real PDF to edit and resend yet.\n\nSay \"build me a resume\" and I'll turn it into a full editable Kievora resume — then I can apply changes and send you a real PDF anytime. 📄", true);
          } else {
            appendKMsg('ai', "I need a saved resume to edit. Select one from the **COACH ON:** picker at the top first, then ask me again. 👆", true);
          }
        }
        return;
      }

      if (intent === 'CHANGE_TEMPLATE') {
        appendKMsg('user', msg, true);
        kieHist.push({ role:'user', content: msg });
        inp.value = ''; inp.style.height = 'auto';
        const namedTpl = detectTemplateInMsg(msg);
        if (namedTpl) { applyKieTemplate(namedTpl.id); }
        else { showKieTemplatePicker("Sure! Pick a template from the list below — I'll switch it right away:"); }
        return;
      }

      if (intent === 'BUILD_RESUME_FROM_SCRATCH') {
        appendKMsg('user', msg, true);
        kieHist.push({ role:'user', content: msg });
        inp.value = ''; inp.style.height = 'auto';
        kieActionBuildResumeFromChat(msg);
        return;
      }

      // ── SMART INTENT SAFETY NET (layer 2) ───────────────────────────────────
      // The regex patterns above are instant and catch the obvious phrasings
      // with zero added latency — that stays the fast path for most messages.
      // For the messages that don't cleanly match any pattern (paraphrased,
      // oddly worded, multi-part), this runs one fast classification call on
      // KIE Spark before falling through to plain chat.
      //
      // BUG FIX: this used to gate on ONLY a hard six-word literal list
      // (resume|cv|pdf|file|document|template) — so "update my experience
      // with what I learned getting that certification" never even reached
      // the classifier below, because none of those exact words appear in
      // it. That's the "you're just keyword-matching" problem: a real edit
      // request with zero listed keywords silently fell through to plain
      // chat instead of actually editing the resume. Fixed two ways:
      //   1. ACTION_HINT now also covers the resume SECTION nouns (experience,
      //      certificate, education, skills, etc.), not just the file-shaped
      //      words.
      //   2. When the user actually has a resume in play this session, ANY
      //      edit-shaped verb (add/change/update/reflect/etc.) is enough to
      //      run the classifier — no noun needed at all — because there's
      //      almost nothing else "update this" could mean in that context.
      const ACTION_HINT = /\b(resume|cv|pdf|file|document|template|summary|headline|bio|objective|experience|skills?|bullet|educat\w*|degree|school|university|college|certificat\w*|qualification)\b/i;
      const hasActiveResumeSession = (kieSelectedResume && kieSelectedResume.resumeData) ||
        (!!kieResumeContext && kieResumeContext !== 'NO_RESUME_YET' && kieResumeContext !== 'HAS_RESUMES_UNSELECTED');
      const looksLikeEditInContext = hasActiveResumeSession && UPDATE_VERBS.test(msg);
      if (!intent && (ACTION_HINT.test(msg) || looksLikeEditInContext) && !_kieIntentClassifying) {
        _kieIntentClassifying = true;
        let classified = null;
        try { classified = await _kieClassifyIntent(msg); }
        catch (e) { console.warn('[kie] intent safety-net skipped:', e.message); }
        _kieIntentClassifying = false;

        // Same broadened intelligence as the regex layer above: don't commit
        // to "edit my resume" when there's no resume to edit but there IS a
        // pending non-resume file in play — neutralize BEFORE dispatch so
        // this falls straight through to the normal chat path below (which
        // does its own single append), instead of returning early with
        // nothing sent and the user's message stuck unanswered.
        if (classified && classified.intent === 'UPDATE_RESUME_AND_SEND') {
          const hasResumeTarget = (kieSelectedResume && kieSelectedResume.resumeData) ||
            (!!kieResumeContext && kieResumeContext !== 'NO_RESUME_YET' && kieResumeContext !== 'HAS_RESUMES_UNSELECTED');
          if (!hasResumeTarget && _kiePendingFileText) classified.intent = 'NONE';
        }

        if (classified && classified.intent && classified.intent !== 'NONE') {
          appendKMsg('user', msg, true);
          kieHist.push({ role:'user', content: msg });
          inp.value = ''; inp.style.height = 'auto';

          if (classified.intent === 'SEND_RESUME') { kieActionSendResume(); return; }

          if (classified.intent === 'UPDATE_RESUME_AND_SEND') {
            if (kieSelectedResume && kieSelectedResume.resumeData) kieActionUpdateAndSendResume(msg);
            else appendKMsg('ai', "I need a saved resume to edit. Select one from the **COACH ON:** picker at the top first. 👆", true);
            return;
          }

          if (classified.intent === 'CHANGE_TEMPLATE') {
            const namedTpl2 = detectTemplateInMsg(classified.templateName || msg);
            if (namedTpl2) applyKieTemplate(namedTpl2.id);
            else { showKieTemplatePicker("Sure! Pick a template from the list below — I'll switch it right away:"); }
            return;
          }

          if (classified.intent === 'BUILD_RESUME_FROM_SCRATCH') {
            kieActionBuildResumeFromChat(classified.resumeBrief || msg);
            return;
          }
        }
        // classifier returned NONE (or failed) — fall straight through to normal chat below
      }

      // ── NORMAL KIE FLOW (real SSE streaming) ────────────────────────────────
      _kieGenerating = true;
      _kieStopTyping = false;
      _kieAbort = new AbortController();

      // BUG FIX #3 — Refresh Firebase auth token before every API call.
      // Firebase ID tokens expire after 60 minutes. The module-level `tok` is set
      // once at login and never refreshed, so any chat after an hour silently
      // returns 401 Unauthorized. getIdToken() auto-refreshes if near expiry.
      try { tok = await usr.getIdToken(); } catch (_) { /* use existing tok if offline */ }

      appendKMsg('user', msg, true);
      kieHist.push({ role:'user', content: msg });
      if(typeof window._checkGmailConvTrigger==='function') window._checkGmailConvTrigger(msg).catch(()=>{});
      inp.value = ''; inp.style.height = 'auto';
      inp.disabled = true;
      setKieSendMode('stop');

      const typEl = g('kieTyp');
      typEl.style.display = 'flex';
      showKieStatus(kieMode);
      scrollKie(true);

      // BUG FIX #7 — Resolve image history: map imageRef keys back to full base64
      // so follow-up questions about an image include it in the context sent to the API.
      const historyForApi = kieHist.map(m => {
        if (!m.imageRef) return m;
        const imgData = _kieImageStore.get(m.imageRef);
        if (!imgData) return { role: m.role, content: m.content }; // image gone (prev session)
        return { role: m.role, content: m.content, imageBase64: imgData.base64,
                 imageType: m.imageType, imageName: m.imageName };
      });

      // ── AI bubble is created lazily — only once the first real token (or
      // an error/fallback message) actually exists. Until then, the Thinking
      // panel is the only thing on screen — no empty placeholder bubble with
      // a lone blinking cursor sitting above/alongside it.
      const msgsEl = g('kieMsgs');
      msgsEl.style.display = 'flex';
      if (g('kieWelcome')) g('kieWelcome').style.display = 'none';

      let bubbleW = null, bubble = null, actionsEl = null;
      const msgId  = 'kb-' + Date.now();
      const tStamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      function _ensureBubble() {
        if (bubbleW) return;
        bubbleW = document.createElement('div');
        bubbleW.className = 'km km-ai';
      bubbleW.innerHTML = `
        <div class="km-ai-body">
          <div class="km-bubble" id="${msgId}"></div>
          <div class="km-actions" id="kact-${msgId}">
            <button class="km-act-btn" onclick="kieyCopy(this)" title="Copy response">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <button class="km-act-btn" onclick="kieSpeak(this)" title="Listen aloud">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path stroke-linecap="round" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
            </button>
            <button class="km-act-btn" onclick="kieShare(this)" title="Share">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button class="km-act-btn" onclick="kieRegen(this)" title="Regenerate">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
          </div>
          <div class="km-meta">${tStamp}</div>
        </div>`;
        msgsEl.insertBefore(bubbleW, typEl);
        bubble    = bubbleW.querySelector('.km-bubble');
        actionsEl = bubbleW.querySelector('.km-actions');
        bubble.innerHTML = '<span class="kie-stream-cursor">▌</span>';
        scrollKie(true);
      }

      let streamedText = '';
      let firstToken   = false;
      let finalModel   = kieModel;
      let wasFallback  = false;
      let modeSuggested = null;
      let turnSources  = null;
      let turnImages   = null;

      // Applies final formatting, shows action buttons, re-enables input
      function _finishBubble(text) {
        _ensureBubble();
        const display = text.replace(/\s*\[FU\].*?\[\/FU\]/gs, '').trim();
        bubble.innerHTML = _formatKieLive(display, true, turnSources, turnImages, kieMode);
        // Rich source-card row (Deep Think / Web Search / Creative only) — inserted
        // right after the text, before the actions row and Sources pill below it.
        _kieInsertSourceCards(bubbleW.querySelector('.km-ai-body'), turnSources, kieMode);
        // Sources button — injected into the actions bar (after regen), like ChatGPT
        _kieAttachSources(actionsEl, turnSources);
        if (actionsEl) actionsEl.classList.add('visible');
        maybeShowKieSuggestions(text, bubbleW);
        _kieGenerating = false;
        _kieStopTyping = false;
        inp.disabled = false;
        _kieSafeFocusInput(inp);
        setKieSendMode('send');
        scrollKie();
      }

      try {
        const fetchRes = await _kieFetchWithRetry('/api/kie', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body:    JSON.stringify({
            messages:      historyForApi,
            mode:          kieMode,
            model:         kieModel,
            resumeContext: kieResumeContext,
            docContext:    kieDocContext,
            convId:        _getKieConvId(),
            userCategory:  (typeof getUserCategory === 'function' ? getUserCategory() : null),
            voiceMode:     !!window._kieVoiceModeActive,
          }),
          signal: _kieAbort.signal,
        });

        if (!fetchRes.ok) throw new Error('HTTP ' + fetchRes.status);

        // ── Read SSE stream token by token ─────────────────────────────────────
        const reader  = fetchRes.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          let done, value;
          try { ({ done, value } = await reader.read()); }
          catch (readErr) { if (_kieStopTyping) break; throw readErr; }

          if (_kieStopTyping || done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop(); // hold incomplete line for next iteration

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let chunk;
            try { chunk = JSON.parse(line.slice(6)); } catch { continue; }

            if (chunk.t === 'd') {
              // First real token — thinking panel hides, answer bubble appears
              if (!firstToken) {
                typEl.style.display = 'none';
                hideKieStatus();
                _ensureBubble();
                firstToken = true;
              }
              streamedText += chunk.v;
              const live = streamedText.replace(/\s*\[FU\].*?\[\/FU\]/gs, '').trim();
              bubble.innerHTML = _formatKieLive(live, false, turnSources, turnImages, kieMode) + '<span class="kie-stream-cursor">▌</span>';
              scrollKie();
            } else if (chunk.t === 'search') {
              // Real search in flight — rolling globe icon, driven by the server
              _kieShowRealSearch(chunk.v);
            } else if (chunk.t === 'searchdone') {
              _kieEndRealSearch(chunk.count);
              if (chunk.sources?.length) turnSources = chunk.sources;
              if (chunk.images?.length) turnImages = chunk.images;
            } else if (chunk.t === 'done') {
              finalModel    = chunk.model   || finalModel;
              wasFallback   = chunk.fallback || false;
              modeSuggested = chunk.modeSuggestion || null;
            } else if (chunk.t === 'err') {
              throw new Error(chunk.v || 'KIE error');
            }
          }
        }

        // Always hide typing indicator (it may still be visible if no tokens arrived)
        typEl.style.display = 'none';
        hideKieStatus();

        const finalText = streamedText || "Sorry, I couldn't get a response.";

        // SAFETY NET: the model is instructed never to pair [SEND_PDF] with a
        // [CODEBLOCK] in the same reply — but if it slips up anyway, don't show
        // the resume content twice (once as raw code block, once as the real
        // PDF card kieActionSmartSend generates below). Strip the code block
        // before this text is saved to history or rendered, so a reload later
        // doesn't bring the duplicate back either.
        let cleanedFinalText = finalText;
        if (/\[SEND_PDF\]/i.test(finalText) && /\[CODEBLOCK/i.test(finalText)) {
          cleanedFinalText = finalText
            .replace(/\[CODEBLOCK(?::[^\]]*)?\]([\s\S]*?)(\[\/CODEBLOCK\]|$)/gi, '')
            .replace(/\n{3,}/g, '\n\n').trim();
        }

        kieHist.push({ role:'assistant', content: cleanedFinalText, sources: turnSources || undefined, images: turnImages || undefined, mode: kieMode });
        saveKieHistory();

        // Final render on the streaming bubble (already visible to user)
        _finishBubble(cleanedFinalText);

        // If the AI generated a long roadmap/plan in chat (not from the tool panel),
        // store it so "send in file form" can package it as a PDF report.
        // BUG FIX: this used to scan the AI's RESPONSE for generic words like
        // "step"/"plan"/"week"/"month" — which fires on almost any substantive
        // coaching reply (especially since "Next step:" is now the standard
        // action-label pattern), silently overwriting this with garbage from
        // ordinary replies that were never a plan request at all. That stale,
        // wrongly-set data would then get resent later when the user asked for
        // something completely different (like an updated resume), because the
        // SEND_RESUME branch below trusts whatever's most recently cached here.
        // Now it checks what the USER actually asked for, not the AI's wording.
        const PLAN_REQUEST_PATTERN = /\b(career\s+plan|action\s+plan|roadmap|30[\s-]?60[\s-]?90|strategy\s+(doc|document|plan)|game\s*plan|\d+[\s-]?(day|week|month)\s+plan|plan\s+(for|to)\s+(my|get|land|find|switch|become)|step[\s-]by[\s-]step\s+plan)\b/i;
        const isLongformPlan = finalText.length > 300
          && msg && PLAN_REQUEST_PATTERN.test(msg)
          && !/\[SEND_PDF\]/i.test(finalText);
        if (isLongformPlan) {
          // Build simple HTML body from the markdown text for the report PDF
          const planHtml = finalText
            .replace(/\[SEND_PDF\]/gi, '')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
          window._kieLastReportData = {
            title:    'Career Plan',
            subtitle: msg ? msg.slice(0, 60) : 'Generated by KIE',
            bodyHtml: `<div class="rep-card"><p style="font-size:13px;line-height:1.7;color:#1f2937">${planHtml}</p></div>`,
            ts: Date.now(),
          };
        }

        // Handle [SEND_PDF] trigger from AI (e.g. after resume edit + send)
        if (/\[SEND_PDF\]/i.test(finalText)) kieActionSmartSend(msg || '');

        // Notify if a fallback engine was used
        if (wasFallback && finalModel !== kieModel) {
          const used   = KIE_MODEL_META[finalModel]?.label || 'a backup engine';
          const wanted = KIE_MODEL_META[kieModel]?.label   || 'your selected engine';
          appendKMsg('ai', `${wanted} was unavailable for a moment, so this reply came from ${used}. Your next message will try ${wanted} again.`, false);
        }

        // Advisory-only nudge — server flagged this as the kind of question Deep
        // Think handles better. Never auto-switches; just offers a one-tap option.
        if (modeSuggested === 'deep' && kieMode !== 'deep') {
          _kieShowDeepModeNudge(bubbleW);
        }

      } catch (e) {
        typEl.style.display = 'none';
        hideKieStatus();

        if (e.name === 'AbortError' || _kieStopTyping) {
          // User hit Stop — preserve whatever was already streamed into the bubble
          if (streamedText) {
            kieHist.push({ role:'assistant', content: streamedText, sources: turnSources || undefined, images: turnImages || undefined, mode: kieMode });
            saveKieHistory();
            _finishBubble(streamedText);
          } else {
            // Nothing streamed yet — bubble may never have been created; if it
            // was, remove it, then clean up either way
            if (bubbleW && bubbleW.parentNode) bubbleW.parentNode.removeChild(bubbleW);
            // Also pop the dangling user message from history
            if (kieHist.length && kieHist[kieHist.length - 1].role === 'user') {
              kieHist.pop(); saveKieHistory();
            }
            _kieGenerating = false;
            _kieStopTyping = false;
            inp.disabled = false;
            setKieSendMode('send');
          }
          return;
        }

        // Actual error — show message inside the streaming bubble (create it
        // now if the thinking panel was still showing when this failed)
        _ensureBubble();
        bubble.innerHTML = `<span style="opacity:.8">I'm having trouble connecting right now. Please try again! 🙏</span>`;
        if (actionsEl) actionsEl.style.display = 'none';
        // Pop the unanswered user message so history stays clean
        if (kieHist.length && kieHist[kieHist.length - 1].role === 'user') {
          kieHist.pop(); saveKieHistory();
        }
        _kieGenerating = false;
        inp.disabled = false;
        setKieSendMode('send');
      }
    }

    window.sendChip = function(prompt) {
      if (_kieGenerating) return;
      const inp = g('kieInp');

      // If web-search mode is currently active, the chip was tapped in a career
      // context (not a raw search query), so switch back to default mode first
      // to avoid treating "Add relevant keywords" as a web search term.
      // NOTE: this looks up data-mode="default" — that pill now displays
      // "Quick Answer" text, but the data-mode attribute is unchanged, so
      // this lookup still works. If that attribute is ever renamed, this
      // breaks silently (the `if (defaultPill)` guard just no-ops instead
      // of throwing) and kieMode gets stuck on 'web' after a chip tap.
      if (kieMode === 'web') {
        const defaultPill = document.querySelector('.kie-mode-pill[data-mode="default"]');
        if (defaultPill) setKieMode('default', defaultPill);
      }

      inp.value = prompt;
      inp.style.height = 'auto';
      sendKie();
    };

    function appendKMsg(role, text, animate, onDone, sources, msgMode, images) {
      const msgs = g('kieMsgs');
      msgs.style.display = 'flex';
      const welcome = g('kieWelcome');
      if (welcome) welcome.style.display = 'none';

      const w = document.createElement('div');
      w.className = 'km km-' + role;
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (role === 'ai') {
        const msgId = 'kb-' + Date.now();
        w.innerHTML = `
          <div class="km-ai-body">
            <div class="km-bubble" id="${msgId}"></div>
            <div class="km-actions" id="kact-${msgId}">
              <button class="km-act-btn" onclick="kieyCopy(this)" title="Copy response">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
              <button class="km-act-btn" onclick="kieSpeak(this)" title="Listen aloud">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path stroke-linecap="round" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>
              </button>
              <button class="km-act-btn" onclick="kieShare(this)" title="Share">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
              <button class="km-act-btn" onclick="kieRegen(this)" title="Regenerate">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              </button>
            </div>
            <div class="km-meta">${t}</div>
          </div>`;
        msgs.insertBefore(w, g('kieTyp'));
        const bubble    = w.querySelector('.km-bubble');
        const actionsEl = w.querySelector('.km-actions');
        scrollKie(true);

        function finishMsg() {
          // Strip [FU]...[/FU] tags from visible text (they render as chips, not prose)
          const displayText = text.replace(/\s*\[FU\].*?\[\/FU\]/gs, '').trim();
          bubble.innerHTML = _formatKieLive(displayText, true, sources, images, msgMode || kieMode);
          // Rich source-card row (Deep Think / Web Search / Creative only)
          _kieInsertSourceCards(w.querySelector('.km-ai-body'), sources, msgMode || kieMode);
          // Re-inject Sources button if this message had web search
          _kieAttachSources(actionsEl, sources);
          if (actionsEl) actionsEl.classList.add('visible');
          maybeShowKieSuggestions(text, w);
          _kieGenerating = false;
          g('kieInp').disabled = false;
          setKieSendMode('send');
          scrollKie();
          if (typeof onDone === 'function') onDone();
        }

        if (animate) {
          let i = 0;
          // Strip [FU] tags from what gets typed out — they appear as chips, not text
          const typeText = text.replace(/\s*\[FU\].*?\[\/FU\]/gs, '').trim();
          // 3 chars per RAF frame ≈ 180 chars/sec at 60 fps — readable, deliberate
          // pace (was 15 chars/frame ≈ 900 chars/sec, way too fast to actually read)
          const CHUNK = 3;
          let rafId;
          function typeFrame() {
            if (_kieStopTyping) {
              cancelAnimationFrame(rafId);
              finishMsg();
              _kieStopTyping = false;
              return;
            }
            i = Math.min(i + CHUNK, typeText.length);
            // Format live on every frame — formatting appears as text streams in
            bubble.innerHTML = _formatKieLive(typeText.slice(0, i), false, sources, images, msgMode || kieMode);
            scrollKie();
            if (i < typeText.length) {
              rafId = requestAnimationFrame(typeFrame);
            } else {
              finishMsg();
            }
          }
          rafId = requestAnimationFrame(typeFrame);
        } else {
          // Restored from history (page reload / nav away+back) — must strip [FU]
          // tags, rebuild the suggestion chips, AND rebuild the Sources pill,
          // same as a live response does. Skipping any of these is what caused
          // chips/sources to vanish and raw [FU]...[/FU] text to leak on revisit.
          const restoredDisplay = text.replace(/\s*\[FU\].*?\[\/FU\]/gs, '').trim();
          bubble.innerHTML = _formatKieLive(restoredDisplay, true, sources, images, msgMode || kieMode);
          _kieInsertSourceCards(w.querySelector('.km-ai-body'), sources, msgMode || kieMode);
          _kieAttachSources(actionsEl, sources);
          if (actionsEl) actionsEl.classList.add('visible');
          maybeShowKieSuggestions(text, w, true);
          if (typeof onDone === 'function') onDone();
        }
      } else {
        const formattedText = text.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
        w.innerHTML = `<div class="km-bubble"></div><div class="km-meta">${t}</div>`;
        const uBubble = w.querySelector('.km-bubble');
        uBubble.innerHTML = formattedText;
        uBubble.dataset.raw = text; // property assignment — safe regardless of quotes/newlines in text
        msgs.insertBefore(w, g('kieTyp'));
      }
      scrollKie();
    }

    // ══ SENT-MESSAGE LONG-PRESS MENU (Copy / Select Text / Share) ═══════════
    // Long-pressing a message YOU sent (not KIE's reply — that already has its
    // own always-visible Copy/Share/Regenerate row) pops a small WhatsApp-style
    // context menu. "Select Text" opens a bottom sheet with the raw message in
    // a natively selectable block, so the person can drag-select and copy any
    // portion of it using the device's own selection handles — full custom
    // drag-selection UI isn't worth building when the browser already does
    // this natively once user-select:text is turned on for that block.
    (function initKieSentMsgLongPress() {
      let pressTimer = null, startX = 0, startY = 0, pressedEl = null, longPressFired = false;
      const MOVE_CANCEL_PX = 10;
      const HOLD_MS = 420;

      function clearPress() {
        clearTimeout(pressTimer);
        if (pressedEl) pressedEl.classList.remove('km-pressed');
        pressedEl = null;
      }

      document.addEventListener('pointerdown', (e) => {
        const bubble = e.target.closest?.('.km-user .km-bubble');
        if (!bubble) return;
        longPressFired = false;
        startX = e.clientX; startY = e.clientY;
        pressedEl = bubble;
        pressTimer = setTimeout(() => {
          longPressFired = true;
          bubble.classList.add('km-pressed');
          if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
          const raw = bubble.dataset.raw ?? (bubble.innerText || bubble.textContent || '');
          showKMenu(e.clientX, e.clientY, raw);
        }, HOLD_MS);
      }, { passive: true });

      document.addEventListener('pointermove', (e) => {
        if (!pressTimer) return;
        if (Math.abs(e.clientX - startX) > MOVE_CANCEL_PX || Math.abs(e.clientY - startY) > MOVE_CANCEL_PX) clearPress();
      }, { passive: true });

      document.addEventListener('pointerup', () => { if (!longPressFired) clearPress(); });
      document.addEventListener('pointercancel', clearPress);

      // Suppress the native OS "select/copy" callout on the bubble itself —
      // our custom menu replaces it — but still allow it inside the sheet.
      document.addEventListener('contextmenu', (e) => {
        if (e.target.closest?.('.km-user .km-bubble')) e.preventDefault();
      });
    })();

    // Builds (once) and shows the small floating context menu near (x, y).
    function showKMenu(x, y, rawText) {
      let overlay = g('kmenuOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'kmenuOverlay';
        overlay.className = 'kmenu-overlay';
        overlay.innerHTML = `<div class="kmenu" id="kmenu">
          <div class="kmenu-item" id="kmenuCopy">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy
          </div>
          <div class="kmenu-sep"></div>
          <div class="kmenu-item" id="kmenuSelect">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h10M4 18h16"/></svg>
            Select Text
          </div>
          <div class="kmenu-sep"></div>
          <div class="kmenu-item" id="kmenuShare">
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeKMenu(); });
      }
      const menu = g('kmenu');
      g('kmenuCopy').onclick = () => { kmenuCopyAction(rawText); closeKMenu(); };
      g('kmenuSelect').onclick = () => { closeKMenu(); openKSelSheet(rawText); };
      g('kmenuShare').onclick = () => { kmenuShareAction(rawText); closeKMenu(); };

      overlay.classList.add('show');
      // Position after showing so we can read the menu's real size, then clamp
      // it to stay fully on-screen near the press point.
      requestAnimationFrame(() => {
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        let left = Math.min(Math.max(8, x - mw / 2), window.innerWidth - mw - 8);
        let top = y - mh - 14;
        if (top < 8) top = Math.min(y + 14, window.innerHeight - mh - 8);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.classList.add('show');
      });
    }
    function closeKMenu() {
      const overlay = g('kmenuOverlay');
      if (!overlay) return;
      overlay.classList.remove('show');
      g('kmenu')?.classList.remove('show');
      document.querySelectorAll('.km-user .km-bubble.km-pressed').forEach(el => el.classList.remove('km-pressed'));
    }
    function kmenuCopyAction(rawText) {
      navigator.clipboard?.writeText(rawText).then(() => toast('Copied to clipboard')).catch(() => toast('Could not copy', 'err'));
    }
    function kmenuShareAction(rawText) {
      if (navigator.share) {
        navigator.share({ text: rawText }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(rawText).then(() => toast('Copied — sharing isn\'t supported here')).catch(() => {});
      }
    }
    window.showKMenu = showKMenu;
    window.closeKMenu = closeKMenu;

    // ── Select-text bottom sheet ──────────────────────────────────────────────
    function openKSelSheet(rawText) {
      let overlay = g('kselOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'kselOverlay';
        overlay.className = 'ksel-overlay';
        overlay.innerHTML = `<div class="ksel-sheet">
          <div class="ksel-handle"></div>
          <div class="ksel-title">Select any part to copy</div>
          <div class="ksel-text" id="kselText"></div>
          <div class="ksel-foot">
            <button class="ksel-close-btn" id="kselCloseBtn">Close</button>
            <button class="ksel-copy-all" id="kselCopyAllBtn">Copy All</button>
          </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeKSelSheet(); });
        g('kselCloseBtn').onclick = closeKSelSheet;
      }
      g('kselText').textContent = rawText;
      g('kselCopyAllBtn').onclick = () => {
        navigator.clipboard?.writeText(rawText).then(() => toast('Copied to clipboard')).catch(() => toast('Could not copy', 'err'));
      };
      overlay.classList.add('show');
    }
    function closeKSelSheet() { g('kselOverlay')?.classList.remove('show'); }
    window.openKSelSheet = openKSelSheet;
    window.closeKSelSheet = closeKSelSheet;

    // ── LIVE PROGRESSIVE FORMATTER ────────────────────────────────────────────
    // Called on every streaming frame — formats partial text including live code
    // blocks and strips internal markers ([SEND_PDF], [GMAIL_CTA]).
    // Parses [TABLE] block content into rows of cells. Splits on '|', trims
    // each cell, drops empty lines, markdown-style separator rows (e.g.
    // "---|---|---"), and rows where every cell is blank — all cases where
    // a model habit or stray formatting could otherwise leave an empty
    // header/row rendering as a blank strip. While still streaming (not
    // closed), the last line may be a row mid-typing — drop it so a
    // half-typed row never flashes on screen as broken cells.
    function _parseTableRows(content, closed) {
      const lines = content.split('\n').map(l => l.trim());
      const usable = closed ? lines : lines.slice(0, -1);
      return usable
        .filter(l => l && l.includes('|'))
        .map(line => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
        .filter(cells => !cells.every(c => !c || /^:?-{2,}:?$/.test(c)));
    }

    // Builds a clean comparison-table card from parsed rows — first row is
    // the header. Rendered as a real HTML table (never raw pipes on screen).
    // No label/title bar — the table itself is the card, same as a plain
    // rendered markdown table would look, just styled and never broken.
    // Returns '' (renders nothing at all) once closed with no real rows —
    // this is what stops a stray/duplicate empty [TABLE][/TABLE] pair from
    // ever showing up as a blank floating box.
    function _buildTableCard(label, content, closed, cardId) {
      const allRows = _parseTableRows(content, closed);

      if (!allRows.length) {
        if (closed) return ''; // nothing real ever arrived — render nothing
        // Still streaming and no complete row yet — a plain unboxed line,
        // no border/shadow/card chrome, so there's never an empty box on
        // screen while the first row is still being typed out.
        return `<div class="kie-table-writing" id="${cardId}"><span class="kie-typing-dot-sm"></span>writing…</div>`;
      }

      const header = allRows[0];
      const bodyRows = allRows.slice(1);
      const thead = '<tr>' + header.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>';
      const tbody = bodyRows.map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('');
      const writing = closed
        ? ''
        : `<div class="kie-table-writing"><span class="kie-typing-dot-sm"></span>writing…</div>`;

      return `<div class="kie-table-card" id="${cardId}"><div class="kie-table-scroll"><table class="kie-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>${writing}</div>`;
    }

    function _formatKieLive(partial, isFinal, sources, images, mode) {
      let text = partial.replace(/\[SEND_PDF\]/gi, '').replace(/\[GMAIL_CTA\]/gi, '').replace(/\[BILLING_CTA\]/gi, '').replace(/\[MODEL_CTA\]/gi, '').replace(/\[CONFIRM_RESUME_CTA\]/gi, '').trim();

      // Detect code blocks AND table blocks — handles MULTIPLE blocks of
      // either kind in the same message (previously only the first was ever
      // found; a second block's raw tags would show up as literal,
      // unrendered text). The currently-streaming block (no closing tag yet,
      // mid-typing) still renders live — code blocks show a "writing…" label
      // on raw text, table blocks render as a real table from whatever
      // complete rows have arrived so far, never raw pipe text.
      const blockRe = /\[(CODEBLOCK|TABLE)(?::([^\]]*))?\]([\s\S]*?)(\[\/\1\]|$)/gi;
      let html = '', lastIndex = 0, blockIdx = 0, found = false, match;
      while ((match = blockRe.exec(text)) !== null) {
        found = true;
        const before = text.slice(lastIndex, match.index).trim();
        if (before) html += formatKieText(before, sources, images, mode);

        const kind    = match[1].toUpperCase();
        const label   = (match[2] || (kind === 'TABLE' ? 'Comparison' : 'content')).trim();
        const content = match[3];
        const closed  = !!match[4];
        const cardId  = (kind === 'TABLE' ? 'kct-live-' : 'kcc-live-') + label.replace(/\s+/g,'_') + '_' + blockIdx;

        if (kind === 'TABLE') {
          html += _buildTableCard(label, content, closed, cardId);
        } else if (closed && !content.trim()) {
          // Empty closed code block (e.g. a stray duplicate tag pair) — skip
          // entirely rather than rendering a blank card.
        } else {
          const docIcon  = '<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 8l3 4-3 4"/></svg>';

          const copyBtn = (closed || isFinal)
            ? `<button class="kie-code-card-copy" onclick="_copyCodeCard('${cardId}')" title="Copy"><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.1"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>`
            : `<span style="color:#a855f7;font-size:10px;font-weight:600;display:flex;align-items:center;gap:4px"><span class="kie-typing-dot-sm"></span>writing…</span>`;

          html += `<div class="kie-code-card" id="${cardId}"><div class="kie-code-card-hdr"><span class="kie-code-card-label">${docIcon}${esc(label)}</span>${copyBtn}</div><div class="kie-code-card-body">${esc(content.trim())}</div></div>`;
        }

        lastIndex = match.index + match[0].length;
        blockIdx++;
        // A still-open block (no closing tag = ran to end of string) is the
        // one actively streaming right now — nothing comes after it yet.
        if (!closed) break;
      }

      if (found) {
        const remaining = text.slice(lastIndex).trim();
        if (remaining) html += formatKieText(remaining, sources, images, mode);
        return html;
      }

      return formatKieText(text, sources, images, mode);
    }

    // Expose for the history-restore system (lives in a different scope)
    window.appendKMsg = appendKMsg;
    window.formatKieText = formatKieText;
    window._formatKieLive = _formatKieLive;

    // ── Advisory Deep Think nudge ─────────────────────────────────────────────
    // Shown when the server flags a question as the strategic/weighing-trade-offs
    // kind Deep Think handles better — never switches mode automatically, just
    // offers a one-tap option, the same way ChatGPT/Claude surface "try o1/Opus
    // for this" rather than silently deciding for the user.
    function _kieShowDeepModeNudge(bubbleW) {
      const body = bubbleW.querySelector('.km-ai-body');
      if (!body) return;
      const row = document.createElement('div');
      row.className = 'kie-suggest-row';
      const btn = document.createElement('button');
      btn.className = 'kie-suggest-chip';
      btn.textContent = '🧠 This felt deep — try Deep Think mode';
      btn.onclick = function() {
        const deepPill = document.querySelector('.kie-mode-pill[data-mode="deep"]');
        if (deepPill) setKieMode('deep', deepPill);
        row.remove();
      };
      row.appendChild(btn);
      body.appendChild(row);
    }

    // Builds/re-attaches the "Sources" pill in a message's action bar. Shared
    // by the live streaming finish, and history restore — previously this
    // logic only lived inside the live-stream path, so the pill vanished
    // whenever a message was redrawn from saved history (nav away + back).
    // Modes where the rich, image-forward source-card row appears (the
    // ChatGPT-style row Tomiwa referenced). Default and Quick Answer keep the
    // plain "Sources" pill only — those replies are meant to stay short, and
    // a full card row would feel heavy bolted onto a quick answer.
    const KIE_SOURCE_CARD_MODES = ['deep', 'web', 'creative'];

    function _kieSrcImgErr(imgEl, favUrl) {
      const div = document.createElement('div');
      div.className = 'kie-source-card-img-fallback';
      div.innerHTML = `<img src="${favUrl}" onerror="this.style.display='none'">`;
      imgEl.replaceWith(div);
    }
    window._kieSrcImgErr = _kieSrcImgErr;

    // Builds the inner <a class="kie-source-card"> markup for one group of
    // sources (no wrapping row div — caller decides how to mount that).
    function _kieCardsInnerHtml(list) {
      return list.map(s => {
        let domain = '';
        try { domain = new URL(s.url).hostname.replace(/^www\./, ''); } catch { return ''; }
        if (!domain) return '';
        const favUrl  = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
        const safeUrl = esc(s.url);
        // Real thumbnail when Tavily's image search matched one to this
        // domain; otherwise a branded favicon card — some gaps are expected
        // here since Tavily returns a general related-images list, not a
        // guaranteed one-to-one thumbnail per result.
        const media = s.image
          ? `<img src="${esc(s.image)}" class="kie-source-card-img" loading="lazy" onerror="_kieSrcImgErr(this,'${favUrl}')">`
          : `<div class="kie-source-card-img-fallback"><img src="${favUrl}" onerror="this.style.display='none'"></div>`;
        const dateHtml = s.publishedDate ? `<div class="kie-source-card-date">${esc(s.publishedDate)}</div>` : '';
        return `
          <a class="kie-source-card" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
            ${media}
            <div class="kie-source-card-body">
              <div class="kie-source-card-pub"><img src="${favUrl}" onerror="this.style.display='none'">${esc(domain)}</div>
              <div class="kie-source-card-title">${esc(s.title || domain)}</div>
              ${dateHtml}
            </div>
          </a>`;
      }).filter(Boolean).join('');
    }

    // Wraps one group of sources into a mountable row element, or null if
    // the group produced no valid cards (bad/missing domains etc).
    function _kieCardRow(list, extraClass) {
      const inner = _kieCardsInnerHtml(list);
      if (!inner) return null;
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="kie-source-cards${extraClass ? ' ' + extraClass : ''}">${inner}</div>`;
      return wrap.firstElementChild;
    }

    // Turns a single "[CARDS:n]" / "[CARDS:n,m]" marker the model drops
    // right under its single most newsworthy grounded point into the same
    // rich card-row markup as the end-of-message row — but mounted exactly
    // where the model placed it (the ChatGPT-style "cards sit next to the
    // point they support" layout Tomiwa referenced), instead of always at
    // the very end. Everyday [C:n] pills still cover every other citation.
    // Same shape as _kieApplyImageMarker: matches the marker whether or not
    // it landed alone in its own <p>, and only ever mounts the first one.
    function _kieApplyCardMarker(html, sources, mode) {
      const re = /<p>\s*\[CARDS:\s*([\d,\s]+)\]\s*<\/p>|\[CARDS:\s*([\d,\s]+)\]/g;
      if (!sources || !sources.length || !KIE_SOURCE_CARD_MODES.includes(mode)) {
        return html.replace(re, '');
      }
      let used = false;
      return html.replace(re, (m, g1, g2) => {
        if (used) return ''; // model is told to use this once — never mount a second if it slips up
        const idxs = (g1 || g2 || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        const list = idxs.map(n => sources[n - 1]).filter(Boolean).slice(0, 2);
        const inner = _kieCardsInnerHtml(list);
        if (!inner) return '';
        used = true;
        return `<div class="kie-source-cards kie-source-cards-inline">${inner}</div>`;
      });
    }

    // Single row of clickable "read more" cards — the end-of-message
    // fallback for whatever the inline [CARDS:] marker above didn't cover.
    // If that marker already mounted a row inside the bubble's own HTML,
    // the sources are already visible in the answer, so this backs off
    // entirely rather than showing the same 1-2 sources a second time.
    function _kieInsertSourceCards(bodyEl, sources, mode) {
      if (!bodyEl) return;
      if (bodyEl.querySelector('.kie-source-cards-inline')) return;
      bodyEl.querySelectorAll('.kie-source-cards').forEach(el => el.remove());
      if (!sources || !sources.length || !KIE_SOURCE_CARD_MODES.includes(mode)) return;

      const bubbleEl = bodyEl.querySelector('.km-bubble');
      if (!bubbleEl) return;

      const row = _kieCardRow(sources.slice(0, 6));
      if (row) bubbleEl.appendChild(row);
    }

    function _kieAttachSources(actionsEl, sources) {
      if (!sources || !sources.length || !actionsEl) return;
      actionsEl.querySelector('.kie-sources-btn')?.remove();
      actionsEl.querySelector('.km-act-sep')?.remove();
      const sep = document.createElement('span');
      sep.className = 'km-act-sep';
      const btn = document.createElement('button');
      btn.className = 'kie-sources-btn';
      const favHtml = sources.slice(0, 3).map(s => {
        const domain = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
        return domain ? `<img src="https://www.google.com/s2/favicons?sz=32&domain=${domain}" class="kie-src-fav-sm" onerror="this.style.display='none'" width="16" height="16">` : '';
      }).join('');
      btn.innerHTML = `${favHtml}<span class="kie-src-label">Sources</span>`;
      btn.onclick = () => window._openSourcesDrawer(sources);
      actionsEl.appendChild(sep);
      actionsEl.appendChild(btn);
    }

    // Small wavy arrow icon used on every suggestion chip — replaces the old
    // plain "→" character so it actually looks designed rather than typed.
    const KIE_CHIP_ARROW = '<svg class="kie-suggest-arrow" width="16" height="10" viewBox="0 0 26 14" fill="none"><path d="M1 9c2-6 4 6 6 0s4-6 6 0 4 6 6 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 4l4.5 3-4.5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function _kieMakeChip(label, idx, onPick) {
      var btn = document.createElement('button');
      btn.className = 'kie-suggest-chip';
      btn.style.animationDelay = (idx * 70) + 'ms';
      btn.innerHTML = KIE_CHIP_ARROW + '<span>' + esc(label) + '</span>';
      btn.title = label;
      btn.onclick = onPick;
      return btn;
    }

    function maybeShowKieSuggestions(text, msgWrapper, instant) {
      // Guard: don't add chips if they already exist for this bubble
      if (msgWrapper.querySelector('.kie-suggest-row')) return;

      // Suggestions land a beat after the message itself settles, so the chip
      // row reads as a distinct follow-up rather than part of the same blob.
      // Restored history (instant=true) skips the wait — it should look
      // finished the moment it's back on screen, not animate in again.
      function place(row) {
        if (row.children.length === 0) return;
        if (!document.contains(msgWrapper)) return;
        if (msgWrapper.querySelector('.kie-suggest-row')) return; // race guard
        var body = msgWrapper.querySelector('.km-ai-body');
        if (!body) return;
        // Insert right after the message text, BEFORE the copy/speaker/share/
        // regenerate icon row — landing after those (and the timestamp) made
        // it look like an afterthought instead of part of what KIE just said.
        var actionsEl = body.querySelector('.km-actions');
        if (actionsEl) body.insertBefore(row, actionsEl);
        else body.appendChild(row);
        scrollKie();
      }
      function schedule(row) {
        if (instant) place(row); else setTimeout(function () { place(row); }, 550);
      }

      // [BILLING_CTA] — a real, tappable button that sends the user to /billing.
      // Sent by the server as a deterministic gate (e.g. KIE Spark can't read
      // an attached image) rather than something the model decides to add.
      if (/\[BILLING_CTA\]/i.test(text)) {
        var bRow = document.createElement('div');
        bRow.className = 'kie-suggest-row';
        var bBtn = document.createElement('button');
        bBtn.className = 'kie-gmail-cta-btn';
        bBtn.innerHTML = 'Upgrade plan <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';
        bBtn.onclick = function () { window.location.href = '/billing'; };
        bRow.appendChild(bBtn);
        schedule(bRow);
        return; // don't also run [FU]/fallback chip logic on the same message
      }

      // [MODEL_CTA] — a real, tappable button that opens the model picker
      // drawer. Sent by the server instead of [BILLING_CTA] when the vision
      // gate fires but the user's plan already includes Core/Nova — they
      // don't need to pay, they just need to switch off Spark.
      if (/\[MODEL_CTA\]/i.test(text)) {
        var mRow = document.createElement('div');
        mRow.className = 'kie-suggest-row';
        var mBtn = document.createElement('button');
        mBtn.className = 'kie-gmail-cta-btn';
        mBtn.innerHTML = 'Switch model <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';
        mBtn.onclick = function () { window.openModelDrawer(); };
        mRow.appendChild(mBtn);
        schedule(mRow);
        return; // don't also run [FU]/fallback chip logic on the same message
      }

      // [CONFIRM_RESUME_CTA] — shown when KIE read an uploaded file and
      // classified it as NOT a resume (a biography, book excerpt, etc). Gives
      // the user a one-tap way to correct that instead of having to explain
      // it in words — tapping runs the full ATS analysis on the same file.
      if (/\[CONFIRM_RESUME_CTA\]/i.test(text)) {
        var rRow = document.createElement('div');
        rRow.className = 'kie-suggest-row';
        var rBtn = document.createElement('button');
        rBtn.className = 'kie-gmail-cta-btn';
        rBtn.innerHTML = 'Yes, score it as my resume <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';
        rBtn.onclick = function () { window.kieConfirmPendingResume(); };
        rRow.appendChild(rBtn);
        schedule(rRow);
        return; // don't also run [FU]/fallback chip logic on the same message
      }

      // [GMAIL_CTA] — a real, tappable button that opens the Gmail Intelligence
      // panel. KIE only includes this tag when Gmail genuinely came up in the
      // conversation, so this doesn't fire on every message.
      if (/\[GMAIL_CTA\]/i.test(text)) {
        var gRow = document.createElement('div');
        gRow.className = 'kie-suggest-row';
        var gBtn = document.createElement('button');
        gBtn.className = 'kie-gmail-cta-btn';
        gBtn.innerHTML = (_gmailConnected ? 'Open Gmail Intelligence' : 'Connect your Gmail') +
          ' <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';
        gBtn.onclick = function () { gRow.remove(); openGmailPanel(); };
        gRow.appendChild(gBtn);
        schedule(gRow);
        return; // don't also run [FU]/fallback chip logic on the same message
      }

      const fuMatches = [...text.matchAll(/\[FU\](.*?)\[\/FU\]/gs)];
      if (fuMatches.length >= 1) {
        var row = document.createElement('div');
        row.className = 'kie-suggest-row';
        var idx = 0;
        fuMatches.forEach(function(m) {
          var chip = m[1].replace(/\s+/g, ' ').trim();
          if (!chip) return;
          row.appendChild(_kieMakeChip(chip, idx++, function () { row.remove(); sendChip(chip); }));
        });
        schedule(row);
      }
      // No fallback beyond this point — if KIE didn't include [FU] chips, that
      // means it decided this reply doesn't need them. A regex heuristic used
      // to guess suggestions from bullet points here, which is exactly the
      // "reacts to keywords instead of understanding" behavior we don't want —
      // removed rather than patched.
    }

    // Copy text from AI message bubble
    window.kieyCopy = function(btn) {
      const bubble = btn.closest('.km-ai-body')?.querySelector('.km-bubble');
      if (!bubble) return;
      const txt = bubble.innerText || bubble.textContent || '';
      const COPY_ICON  = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
      const CHECK_ICON = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#059669" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
      navigator.clipboard?.writeText(txt).then(() => {
        btn.innerHTML = CHECK_ICON;
        setTimeout(() => { btn.innerHTML = COPY_ICON; }, 1500);
      }).catch(() => {});
    };

    // Shared handler for AI-tool-output copy buttons (cover letters, personal
    // branding, outreach messages, etc). The text to copy lives in a data-*
    // attribute — HTML-escaped by esc() when the button markup is built —
    // instead of being inlined into the onclick JS string. Reading it back
    // via getAttribute() auto-decodes the HTML entities, so any quotes,
    // apostrophes, or newlines in AI-generated content are handled safely and
    // can never break out of the attribute and render as raw visible text.
    window.kieCopyBtnClick = function(btn) {
      const txt = btn.getAttribute('data-copy') || '';
      if (!txt || !navigator.clipboard) return;
      const orig = btn.getAttribute('data-label') || btn.textContent;
      navigator.clipboard.writeText(txt).then(() => {
        clearTimeout(btn._kieCopyResetTimer);
        btn.textContent = 'Copied!';
        btn._kieCopyResetTimer = setTimeout(() => { btn.textContent = orig; }, 1500);
      }).catch(() => {});
    };

    // Text-to-speech: read AI message aloud with male coaching voice
    let _activeSpeakBtn = null;
    const _speakOrigIcons = new WeakMap();

    const LISTEN_ICON = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path stroke-linecap="round" d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`;
    const STOP_ICON  = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;

    // ── Speech engine pre-warm ──────────────────────────────────────────────
    // Chrome (especially on Android) has a real cold-start delay the first
    // time speechSynthesis.speak() is ever called in a page — the native TTS
    // engine has to spin up. Firing one silent utterance on the user's very
    // first tap anywhere "wakes it up" long before they can possibly reach
    // the Listen-aloud button (they have to send a message and get a reply
    // first) or hear Live Voice's first reply, so the real moment has no
    // cold-start lag left. Also kicks off voice loading early so
    // pickMaleVoice() isn't guessing.
    let _kieSpeechPrimed = false;
    function _kiePrimeSpeech() {
      if (_kieSpeechPrimed || !window.speechSynthesis) return;
      _kieSpeechPrimed = true;
      try {
        window.speechSynthesis.getVoices();
        const warm = new SpeechSynthesisUtterance('hi');
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
        // No cancel() here — that was the bug. Calling cancel() on the very
        // next line was killing the native engine before it had actually
        // finished spinning up, so this "warm-up" never did its job and the
        // real cold-start delay still landed on whichever button (chat's
        // Listen-aloud, or Live Voice's first spoken reply) fired the first
        // genuine utterance. It's silent and two letters, so it finishes on
        // its own in a fraction of a second — nothing left to clean up, and
        // there's no risk of it colliding with a real utterance since a
        // message still has to be sent and replied to (or, for Live Voice,
        // the whole listen→think round trip) before either surface can
        // possibly speak for real.
      } catch {}
    }
    document.addEventListener('pointerdown', _kiePrimeSpeech, { once: true, passive: true });

    // Some browsers populate the voice list asynchronously after page load —
    // getVoices() can still return [] at the moment priming runs above. This
    // re-syncs once the real list lands, so pickMaleVoice() finds the actual
    // best voice on the very first real tap instead of quietly falling back
    // to a browser default while voices were still loading.
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
    }

    function pickMaleVoice() {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return null;
      const englishVoices = voices.filter(v => v.lang.startsWith('en'));
      const pool = englishVoices.length ? englishVoices : voices;

      // Tier 1 — genuinely high-quality engines, wherever the OS/browser
      // exposes them: Apple's own Enhanced/Siri voices on iOS Safari, Edge's
      // "X Online (Natural)" voices, Google's Wavenet/Neural voices on
      // Android Chrome. These sound dramatically better than a default
      // system voice and are worth prioritizing over anything below,
      // regardless of gender.
      const qualityKeywords = ['premium', 'enhanced', 'neural', 'natural', 'siri', 'wavenet'];
      for (const kw of qualityKeywords) {
        const v = pool.find(v => v.name.toLowerCase().includes(kw));
        if (v) return v;
      }

      // Tier 2 — known warm, natural-sounding voices even without an
      // explicit quality tag (Apple's stock Daniel/Aaron are genuinely good;
      // Edge's Guy/Ryan are its natural voices without the "(Natural)" suffix
      // on some builds). Ordered by how natural they tend to sound.
      const goodNames = ['daniel', 'aaron', 'guy', 'ryan', 'nicky', 'matthew', 'samuel', 'david', 'mark', 'james', 'george', 'oliver', 'arthur', 'tom', 'fred', 'alex'];
      for (const name of goodNames) {
        const v = pool.find(v => v.name.toLowerCase().includes(name));
        if (v) return v;
      }

      return pool[0] || voices[0] || null;
    }

    function resetSpeakBtn(btn) {
      if (!btn) return;
      btn.innerHTML = LISTEN_ICON;
      btn.classList.remove('act-speaking');
      btn.title = 'Listen aloud';
    }

    // ── Floating voice player (pill with play/pause, timer, progress, close) ─
    let _kieVoiceTimer = null;
    let _kieVoiceElapsed = 0;
    let _kieVoiceDuration = 0;
    let _kieVoicePaused = false;

    function _kieEstimateDuration(text, rate) {
      const words = (text.trim().match(/\S+/g) || []).length;
      const wpm = 155 * (rate || 1); // avg TTS speaking pace, adjusted for utterance rate
      return Math.max(3, (words / wpm) * 60);
    }

    function _kieFormatTime(sec) {
      sec = Math.max(0, Math.round(sec));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function _kieSetVoicePlayIcon(playing) {
      const playBtn = document.getElementById('kieVoicePlayBtn');
      if (!playBtn) return;
      const pauseIco = playBtn.querySelector('.kvp-icon-pause');
      const playIco  = playBtn.querySelector('.kvp-icon-play');
      if (pauseIco) pauseIco.style.display = playing ? '' : 'none';
      if (playIco)  playIco.style.display  = playing ? 'none' : '';
      playBtn.title = playing ? 'Pause' : 'Play';
    }

    function _kieVoiceTick() {
      if (_kieVoicePaused) return;
      _kieVoiceElapsed += 0.25;
      const timeEl = document.getElementById('kieVoiceTime');
      const fillEl = document.getElementById('kieVoiceFill');
      if (timeEl) timeEl.textContent = _kieFormatTime(_kieVoiceElapsed);
      if (fillEl) fillEl.style.width = Math.min(100, (_kieVoiceElapsed / _kieVoiceDuration) * 100) + '%';
      // Once estimated duration is reached but speech is still going (estimate ran short),
      // hold the bar near-full instead of stalling visibly.
      if (_kieVoiceElapsed >= _kieVoiceDuration && fillEl) fillEl.style.width = '100%';
    }

    function showKieVoicePlayer(duration) {
      _kieVoiceElapsed = 0;
      _kieVoiceDuration = duration;
      _kieVoicePaused = false;
      const player = document.getElementById('kieVoicePlayer');
      const timeEl  = document.getElementById('kieVoiceTime');
      const fillEl  = document.getElementById('kieVoiceFill');
      if (timeEl) timeEl.textContent = '00:00';
      if (fillEl) fillEl.style.width = '0%';
      _kieSetVoicePlayIcon(true);
      if (player) player.classList.add('show');
      clearInterval(_kieVoiceTimer);
      _kieVoiceTimer = setInterval(_kieVoiceTick, 250);
    }

    function hideKieVoicePlayer() {
      clearInterval(_kieVoiceTimer);
      _kieVoiceTimer = null;
      const player = document.getElementById('kieVoicePlayer');
      if (player) player.classList.remove('show');
    }

    window.kieVoiceToggle = function() {
      if (!window.speechSynthesis) return;
      if (_kieVoicePaused) {
        window.speechSynthesis.resume();
        _kieVoicePaused = false;
        _kieSetVoicePlayIcon(true);
      } else {
        window.speechSynthesis.pause();
        _kieVoicePaused = true;
        _kieSetVoicePlayIcon(false);
      }
    };

    window.kieVoiceClose = function() {
      window.speechSynthesis?.cancel();
      hideKieVoicePlayer();
      if (_activeSpeakBtn) {
        resetSpeakBtn(_activeSpeakBtn);
        _activeSpeakBtn = null;
      }
    };

    window.kieSpeak = function(btn) {
      const bubble = btn.closest('.km-ai-body')?.querySelector('.km-bubble');
      if (!bubble) return;
      const txt = (bubble.innerText || bubble.textContent || '').trim();
      if (!txt || !window.speechSynthesis) return;

      // If this button is already active — stop instantly. cancel() is fired
      // twice (now, and again on the next tick) because some Chrome/Android
      // builds leave a trailing fraction of a word queued after a single
      // cancel() — repeating it is the standard fix to make stop feel instant.
      if (_activeSpeakBtn === btn) {
        window.speechSynthesis.cancel();
        resetSpeakBtn(btn);
        _activeSpeakBtn = null;
        hideKieVoicePlayer();
        setTimeout(() => window.speechSynthesis.cancel(), 0);
        return;
      }

      // Stop any other active speech first
      if (_activeSpeakBtn) {
        window.speechSynthesis.cancel();
        resetSpeakBtn(_activeSpeakBtn);
        _activeSpeakBtn = null;
        hideKieVoicePlayer();
      }

      // Mark this btn as active
      _activeSpeakBtn = btn;
      btn.innerHTML = STOP_ICON;
      btn.classList.add('act-speaking');
      btn.title = 'Stop';

      const utter = new SpeechSynthesisUtterance(txt);
      // No pitch-shift: pitch=1 is critical here — shifting pitch on a
      // genuinely good voice (Apple Enhanced/Siri, Edge Natural, Wavenet) is
      // what makes it sound artificial and robotic again. A slightly slower
      // rate reads as calmer and more natural without distorting the voice.
      utter.rate  = 0.98;
      utter.pitch = 1;
      utter.volume = 1;
      const voice = pickMaleVoice();
      if (voice) utter.voice = voice;

      showKieVoicePlayer(_kieEstimateDuration(txt, utter.rate));

      utter.onend = utter.onerror = () => {
        if (_activeSpeakBtn === btn) {
          resetSpeakBtn(btn);
          _activeSpeakBtn = null;
        }
        hideKieVoicePlayer();
      };

      // Defensive cancel right before speaking — on some Chrome builds the
      // queue can be left in a stale "pending" state with no audio until a
      // cancel() flushes it. This is most of the perceived startup lag, and
      // costs nothing when the queue was already empty.
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    };

    // Share AI message
    window.kieShare = function(btn) {
      const bubble = btn.closest('.km-ai-body')?.querySelector('.km-bubble');
      if (!bubble) return;
      const txt = (bubble.innerText || bubble.textContent || '').trim();
      if (!txt) return;

      const SHARE_ICON = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
      const CHECK_ICON = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;

      if (navigator.share) {
        navigator.share({ title: 'KIE Career Advice', text: txt }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(txt).then(() => {
          btn.innerHTML = CHECK_ICON;
          setTimeout(() => { btn.innerHTML = SHARE_ICON; }, 1500);
        }).catch(() => {});
      }
    };

    // ══ LIVE VOICE CHAT — full-screen hands-free conversation with KIE ═══════
    // Tap the waveform icon in the KIE input bar → overlay opens, mic starts
    // listening automatically. On a pause in speech, the transcript is sent
    // through the normal sendKie() pipeline; once KIE's reply has finished
    // rendering, it's read aloud, then the mic re-opens for the next turn —
    // a turn-based loop (listen → think → speak → listen) similar to
    // ChatGPT/Gemini/Grok's voice mode, built entirely on the Web Speech API.
    (function initKieLiveVoice() {
      const LiveSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const BAR_COUNT = 40;
      // Two-tier silence timeout for the main turn-taking recognizer. A single
      // flat window doesn't work: on Android, cloud STT delivers *interim*
      // results in bursts, with natural gaps of 1-2s+ even while the person
      // is still actively mid-sentence — that gap is a batching artifact, not
      // real silence. So while only interim text has landed, stay patient.
      // Once a *final* chunk arrives with nothing interim trailing it, the
      // engine itself just drew a phrase boundary — that's a much stronger
      // "they paused for real" signal, so a short confirm window is enough
      // and keeps the back-and-forth feeling responsive.
      const SILENCE_MS_INTERIM = 2400;
      const SILENCE_MS_FINAL   = 1100;

      let liveOn         = false;  // overlay open / session active
      let liveRec         = null;   // current SpeechRecognition instance (main turn-taking loop)
      let liveMicMuted    = false;
      let liveShowCaption = false;  // whether the live transcript/reply text is shown on screen
      let liveBusy        = false;  // true while KIE is thinking or speaking
      let silenceTimer    = null;
      let lastResultTs    = 0;      // last time SpeechRecognition reported anything — drives the "listening" wave
      let turnId          = 0;      // invalidates a stale in-flight turn when barge-in supersedes it
      let speakToken      = 0;      // invalidates a stale utterance's onend/onerror after cancel()
      let emptyRestarts   = 0;      // consecutive restarts with nothing heard — backs off instead of hammering .start()/.stop()

      function ov()      { return g('kieLiveOverlay'); }
      function orbEl()    { return g('kieLiveOrb'); }
      function statusEl() { return g('kieLiveStatus'); }
      function capEl()    { return g('kieLiveCaption'); }

      function setLiveState(state) {
        currentOrbState = state;
        const o = orbEl();
        if (o) o.className = 'kie-live-orb' + (state ? ' ' + state : '') + (liveMicMuted && state === 'listening' ? ' muted' : '');
        const s = statusEl();
        if (s) s.textContent =
          state === 'listening' ? (liveMicMuted ? 'Mic muted' : 'Listening…') :
          state === 'thinking'  ? 'Thinking…' :
          state === 'speaking'  ? 'Speaking…' : '';
      }

      // ── Transcript log ("Me: … / KIE: …") ────────────────────────────────────
      // Only touches the .kie-live-caption element — the orb/waveform above is
      // untouched. Each turn appends a labeled line; KIE's line fills in with a
      // typewriter effect instead of appearing all at once.
      let curMeLineEl = null; // the in-progress "Me:" line's text span, while listening
      let typeTimer   = null;

      function resetTranscript() {
        clearInterval(typeTimer); typeTimer = null;
        curMeLineEl = null;
        const c = capEl();
        if (c) c.innerHTML = '';
      }

      function addTranscriptLine(role) {
        const c = capEl();
        if (!c) return null;
        const row = document.createElement('div');
        row.className = 'kie-live-tline kie-live-tline-' + role;
        row.innerHTML = '<span class="kie-live-tlabel">' + (role === 'me' ? 'Me: ' : 'KIE: ') + '</span><span class="kie-live-ttext"></span>';
        c.appendChild(row);
        c.scrollTop = c.scrollHeight;
        return row.querySelector('.kie-live-ttext');
      }

      function updateMeLine(text) {
        if (!liveShowCaption) return;
        if (!curMeLineEl) curMeLineEl = addTranscriptLine('me');
        if (curMeLineEl) curMeLineEl.textContent = text;
        const c = capEl(); if (c) c.scrollTop = c.scrollHeight;
      }

      function finalizeMeLine(text) {
        if (liveShowCaption) {
          if (!curMeLineEl) curMeLineEl = addTranscriptLine('me');
          if (curMeLineEl) curMeLineEl.textContent = text;
        }
        curMeLineEl = null; // next turn starts a fresh "Me:" line
      }

      function typeKieLine(text) {
        clearInterval(typeTimer); typeTimer = null;
        if (!liveShowCaption) return;
        const body = addTranscriptLine('kie');
        if (!body) return;
        let i = 0;
        typeTimer = setInterval(() => {
          i += 2; // couple characters per tick — snappy but still visibly "typed"
          body.textContent = text.slice(0, i);
          const c = capEl(); if (c) c.scrollTop = c.scrollHeight;
          if (i >= text.length) { body.textContent = text; clearInterval(typeTimer); typeTimer = null; }
        }, 18);
      }

      // ── Waveform orb engine ─────────────────────────────────────────────────
      // Draws an audio-style bar visualizer onto a canvas inside the orb, driven
      // by how recently SpeechRecognition itself reported activity (no second
      // mic stream — that used to starve the recognizer on some phones). Bars
      // move on a spring (not a straight lerp) so they overshoot and settle
      // instead of snapping — plus a drift of little dust particles peeling
      // off the tall bars and floating upward, for a weightless, anti-gravity
      // feel rather than a rigid, gravity-bound bar chart.
      let rafId = null;
      let speakPhase = 0, thinkPhase = 0;
      let currentOrbState = '';
      let smoothedBars = new Array(BAR_COUNT).fill(0.05);
      let barVel       = new Array(BAR_COUNT).fill(0);
      let dustParticles = [];

      function computeBars() {
        const bars = new Array(BAR_COUNT);
        if (currentOrbState === 'listening' && !liveMicMuted) {
          const sinceResult = Date.now() - lastResultTs;
          const activity = Math.max(0, 1 - sinceResult / 700);
          speakPhase += 0.14;
          for (let i = 0; i < BAR_COUNT; i++) {
            const t = speakPhase + i * 0.35;
            const v = Math.sin(t) * 0.5 + Math.sin(t * 1.9 + 1) * 0.3 + Math.sin(t * 0.6 + 2) * 0.2;
            bars[i] = Math.max(0.04, (v * 0.5 + 0.4) * (0.3 + activity * 0.7));
          }
        } else if (currentOrbState === 'speaking') {
          speakPhase += 0.16;
          for (let i = 0; i < BAR_COUNT; i++) {
            const t = speakPhase + i * 0.35;
            const v = Math.sin(t) * 0.5 + Math.sin(t * 1.9 + 1) * 0.3 + Math.sin(t * 0.6 + 2) * 0.2;
            bars[i] = Math.max(0.04, v * 0.5 + 0.4);
          }
        } else if (currentOrbState === 'thinking') {
          thinkPhase += 0.1;
          for (let i = 0; i < BAR_COUNT; i++) {
            const t = thinkPhase + i * 0.35;
            const v = Math.sin(t) * 0.5 + Math.sin(t * 1.9 + 1) * 0.3 + Math.sin(t * 0.6 + 2) * 0.2;
            bars[i] = Math.max(0.04, (v * 0.5 + 0.4) * 0.6);
          }
        } else {
          for (let i = 0; i < BAR_COUNT; i++) bars[i] = 0.05;
        }
        return bars;
      }

      function drawWave() {
        const canvas = g('kieLiveWave');
        const o = orbEl();
        if (!canvas || !o) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = o.clientWidth, h = o.clientHeight;
        if (!w || !h) return;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        ctx.clearRect(0, 0, w, h);
        const raw = computeBars();
        const gap  = w / BAR_COUNT;
        const barW = Math.max(1.4, gap * 0.55);
        const cy   = h / 2;

        // Spring toward each target instead of a straight lerp — stiffness
        // pulls it in, damping bleeds energy, but it's loose enough to
        // overshoot and gently bounce back rather than settling flat.
        const stiffness = 0.22, damping = 0.76;
        for (let i = 0; i < BAR_COUNT; i++) {
          barVel[i] = (barVel[i] + (raw[i] - smoothedBars[i]) * stiffness) * damping;
          smoothedBars[i] += barVel[i];
          if (smoothedBars[i] < 0) { smoothedBars[i] = 0; barVel[i] *= -0.35; }
        }

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        for (let i = 0; i < BAR_COUNT; i++) {
          const envelope = Math.sin(((i + 0.5) / BAR_COUNT) * Math.PI);
          const bh = Math.max(2.5, smoothedBars[i] * h * 0.44 * envelope);
          const x = i * gap + (gap - barW) / 2;
          const y = cy - bh / 2;
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, barW, bh, barW / 2); ctx.fill(); }
          else ctx.fillRect(x, y, barW, bh);

          // Tall, lively bars occasionally shed a fleck of dust that drifts
          // upward off the top and fades — the "anti-gravity" touch.
          if (smoothedBars[i] > 0.4 && dustParticles.length < 70 && Math.random() < smoothedBars[i] * 0.045) {
            dustParticles.push({
              x: x + barW / 2 + (Math.random() - 0.5) * barW * 1.4,
              y: y + (Math.random() < 0.5 ? 0 : bh),
              vy: -(0.25 + Math.random() * 0.35),
              vx: (Math.random() - 0.5) * 0.14,
              life: 0,
              maxLife: 32 + Math.random() * 30,
              size: 0.6 + Math.random() * 1.1,
            });
          }
        }

        for (let i = dustParticles.length - 1; i >= 0; i--) {
          const p = dustParticles[i];
          p.life++;
          p.x += p.vx;
          p.y += p.vy;
          p.vy *= 0.985; // keeps easing off, never "falls" back down — reads as floating away
          if (p.life >= p.maxLife || p.y < -6 || p.y > h + 6) { dustParticles.splice(i, 1); continue; }
          const alpha = (1 - p.life / p.maxLife) * 0.75;
          ctx.beginPath();
          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      function orbLoop() {
        rafId = requestAnimationFrame(orbLoop);
        drawWave(); // same pulse in every state now — no separate spin animation for "thinking"
      }

      // ── Main turn-taking recognizer ──────────────────────────────────────────
      // ── Chime ─────────────────────────────────────────────────────────────
      // The little "beep" when a mic starts/stops on Android is generated by
      // the OS/browser itself (Chrome's SpeechRecognition implementation) —
      // there's no JS API to silence or replace that specific sound. What we
      // CAN control is our own audio cue at the moments that actually matter
      // (opening/closing the call), and — more importantly — how often we
      // force a restart mid-conversation, since every unnecessary restart is
      // another one of those OS beeps. See emptyRestarts backoff below.
      let chimeCtx = null;
      function playChime(kind) {
        try {
          if (!chimeCtx) chimeCtx = new (window.AudioContext || window.webkitAudioContext)();
          if (chimeCtx.state === 'suspended') chimeCtx.resume().catch(() => {});
          const now = chimeCtx.currentTime;
          const notes = kind === 'open' ? [660, 880] : [740, 560]; // soft rise on open, soft fall on close
          notes.forEach((freq, i) => {
            const osc = chimeCtx.createOscillator();
            const gain = chimeCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = now + i * 0.09;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
            osc.connect(gain); gain.connect(chimeCtx.destination);
            osc.start(t); osc.stop(t + 0.19);
          });
        } catch (_) {}
      }

      function stopRec() {
        clearTimeout(silenceTimer);
        if (liveRec) {
          liveRec.onend = null; liveRec.onresult = null; liveRec.onerror = null;
          try { liveRec.stop(); } catch (_) {}
          liveRec = null;
        }
      }

      // carryText: words the person had already said before an interruption
      // reset us back to listening — seeded in so they don't have to repeat
      // themselves.
      function startListening(carryText) {
        if (!liveOn || liveBusy || liveMicMuted) return;
        if (!LiveSpeechRecognition) return;
        stopRec();
        stopInterruptListener();
        liveRec = new LiveSpeechRecognition();
        liveRec.lang = 'en-US';
        liveRec.continuous = true;
        liveRec.interimResults = true;
        liveRec.maxAlternatives = 1;
        // Final results are kept per result-index rather than concatenated
        // blindly — some browsers (notably Android Chrome) redeliver the same
        // final result more than once in continuous mode, which previously
        // caused the transcript to duplicate itself ("let's talk about
        // football, let's talk about football, ...").
        const finalChunks = carryText ? [carryText] : [];
        liveRec.onstart = () => { setLiveState('listening'); if (carryText) updateMeLine(carryText); };
        liveRec.onresult = (e) => {
          lastResultTs = Date.now();
          let interim = '';
          let sawFinal = false;
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;
            const idx = carryText ? i + 1 : i; // keep carried text pinned at slot 0
            if (e.results[i].isFinal) { finalChunks[idx] = t; sawFinal = true; } else interim += t;
          }
          const finalTxt = finalChunks.filter(Boolean).join(' ');
          setLiveState('listening');
          updateMeLine((finalTxt + ' ' + interim).trim());
          clearTimeout(silenceTimer);
          // Only "final chunk with nothing interim behind it" is a confident
          // end-of-phrase signal. Pure interim, or a final that still has
          // interim trailing it, stays on the longer window — Android may
          // just be mid-batch, not actually silent.
          const wait = (sawFinal && !interim) ? SILENCE_MS_FINAL : SILENCE_MS_INTERIM;
          silenceTimer = setTimeout(() => { try { liveRec && liveRec.stop(); } catch (_) {} }, wait);
        };
        liveRec.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            toast('Mic access denied — allow microphone permission to use voice chat.', 'err');
            closeLive();
            return;
          }
          // 'no-speech' / 'aborted' / 'network' fall through to onend, which restarts listening
        };
        liveRec.onend = () => {
          clearTimeout(silenceTimer);
          const text = finalChunks.filter(Boolean).join(' ').trim();
          if (!liveOn) return;
          if (text) {
            emptyRestarts = 0;
            handleLiveTurn(text);
            return;
          }
          if (liveBusy || liveMicMuted) return;
          // Nothing was heard — this is almost always Android auto-cutting the
          // recognizer after a stretch of silence, not a real turn ending.
          // Restarting instantly every time is what makes the mic-toggle sound
          // repeat rapidly; back off a little more each consecutive empty cycle
          // instead, and reset the moment real speech comes back.
          emptyRestarts++;
          const backoff = Math.min(350 + emptyRestarts * 300, 2000);
          setTimeout(() => { if (liveOn && !liveBusy && !liveMicMuted) startListening(); }, backoff);
        };
        try { liveRec.start(); } catch (_) { setTimeout(() => { if (liveOn && !liveBusy) startListening(carryText); }, 400); }
      }

      // ── Barge-in listener ─────────────────────────────────────────────────
      // Runs alongside the "thinking" and "speaking" states so the person can
      // interrupt KIE mid-reply ("hold on, let me finish" / jumping in with a
      // new question) instead of being forced to wait it out. Without a
      // headset, this mic also picks up whatever comes out of the same
      // phone's speaker — including KIE's own TTS voice — on top of ordinary
      // room noise. Neither of those means "the person wants to interrupt,"
      // so a transcript alone isn't trusted: it has to (a) not just be KIE
      // hearing itself, and (b) show up on more than one tick in a row,
      // before it counts as a real barge-in.
      const INTERRUPT_MIN_CHARS      = 6;    // one-off noise/echo blips rarely clear this alone
      const INTERRUPT_CONFIRM_GAP_MS = 1200; // two qualifying hits must land close together to count as one sustained voice

      function normalizeForCompare(s) {
        return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      }

      // True if "heard" looks like it's just KIE's own voice bleeding back
      // into the mic rather than the person saying something new — i.e. it's
      // a chunk of (or heavily overlaps with) the line KIE is currently
      // speaking, rather than unrelated speech.
      function looksLikeOwnEcho(heard, aiText) {
        if (!aiText) return false;
        const h = normalizeForCompare(heard);
        const a = normalizeForCompare(aiText);
        if (!h || !a) return false;
        if (a.includes(h)) return true;
        const hWords = h.split(' ').filter(w => w.length > 2);
        if (!hWords.length) return false;
        const aWords = new Set(a.split(' '));
        const overlap = hWords.filter(w => aWords.has(w)).length;
        return overlap / hWords.length >= 0.7;
      }

      let interruptRec = null;

      function stopInterruptListener() {
        if (interruptRec) {
          interruptRec.onresult = null; interruptRec.onerror = null; interruptRec.onend = null;
          try { interruptRec.stop(); } catch (_) {}
          interruptRec = null;
        }
      }

      // aiText: the line KIE is currently speaking, passed in only while this
      // listener runs alongside TTS playback — used to filter out KIE
      // hearing itself. Left blank during "thinking," when no audio is
      // playing and the only real risk is ambient noise, not echo.
      function startInterruptListener(carryText, aiText) {
        if (!liveOn || liveMicMuted || !LiveSpeechRecognition) return;
        stopInterruptListener();
        interruptRec = new LiveSpeechRecognition();
        interruptRec.lang = 'en-US';
        interruptRec.continuous = true;
        interruptRec.interimResults = true;
        interruptRec.maxAlternatives = 1;
        let triggered   = false;
        let confirmHits = 0;
        let lastHitTs   = 0;
        interruptRec.onresult = (e) => {
          if (triggered) return;
          let heard = '';
          for (let i = e.resultIndex; i < e.results.length; i++) heard += e.results[i][0].transcript;
          heard = heard.trim();
          if (!heard || heard.length < INTERRUPT_MIN_CHARS || looksLikeOwnEcho(heard, aiText)) {
            confirmHits = 0;
            return;
          }
          const now = Date.now();
          confirmHits = (now - lastHitTs <= INTERRUPT_CONFIRM_GAP_MS) ? confirmHits + 1 : 1;
          lastHitTs = now;
          if (confirmHits < 2) return; // must persist across two ticks, not just one blip
          triggered = true;
          handleBargeIn(carryText);
        };
        interruptRec.onerror = () => {};
        interruptRec.onend = () => {}; // the owning state (thinking/speaking) restarts this if still relevant
        try { interruptRec.start(); } catch (_) {}
      }

      function handleBargeIn(carryText) {
        stopInterruptListener();
        turnId++; // invalidate any in-flight handleLiveTurn so it won't speak a stale reply
        if (currentOrbState === 'speaking') {
          speakToken++; // invalidate the current utterance's onend/onerror before cancelling
          window.speechSynthesis.cancel();
        } else if (currentOrbState === 'thinking') {
          try { if (typeof stopKieGeneration === 'function') stopKieGeneration(); } catch (_) {}
          if (typeof _kieGenerating !== 'undefined') _kieGenerating = false;
        }
        liveBusy = false;
        startListening(carryText);
      }

      async function handleLiveTurn(text) {
        const myTurn = ++turnId;
        liveBusy = true;
        stopRec();
        setLiveState('thinking');
        finalizeMeLine(text);
        startInterruptListener(text); // "wait, let me finish" — resumes listening with this carried forward
        const inp = g('kieInp');
        if (!inp) { liveBusy = false; return; }

        // Defensive: if a previous turn ever left the shared generation flag
        // stuck true, sendKie() would no-op forever on every future turn.
        if (typeof _kieGenerating !== 'undefined' && _kieGenerating) {
          try { inp.disabled = false; } catch (_) {}
          _kieGenerating = false;
        }

        const bubblesBefore = document.querySelectorAll('#kieMsgs .km-ai-body .km-bubble').length;
        inp.value = text;
        inp.style.height = 'auto';
        try { sendKie(); } catch (_) {}

        const waitStart = Date.now();
        while (liveOn && myTurn === turnId && Date.now() - waitStart < 30000) {
          const count = document.querySelectorAll('#kieMsgs .km-ai-body .km-bubble').length;
          const stillGenerating = typeof _kieGenerating !== 'undefined' && _kieGenerating;
          if (count > bubblesBefore && !stillGenerating) break;
          await new Promise(r => setTimeout(r, 200));
        }
        if (!liveOn || myTurn !== turnId) { liveBusy = false; return; } // superseded by a barge-in

        stopInterruptListener();
        const bubbles = document.querySelectorAll('#kieMsgs .km-ai-body .km-bubble');
        const last = bubbles[bubbles.length - 1];
        const replyTxt = last ? (last.innerText || last.textContent || '').trim() : '';

        if (!replyTxt) {
          if (typeof _kieGenerating !== 'undefined') _kieGenerating = false;
          speakLiveReply("Sorry, I didn't catch a reply there — try asking again.");
          return;
        }
        speakLiveReply(replyTxt);
      }

      function speakLiveReply(text) {
        if (!text || !window.speechSynthesis) {
          liveBusy = false;
          if (liveOn) startListening();
          return;
        }
        setLiveState('speaking');
        typeKieLine(text);
        window.speechSynthesis.cancel();
        const myTok = ++speakToken;
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.98; utter.pitch = 1; utter.volume = 1;
        const voice = (typeof pickMaleVoice === 'function') ? pickMaleVoice() : null;
        if (voice) utter.voice = voice;
        utter.onend = utter.onerror = () => {
          if (myTok !== speakToken) return; // superseded by a barge-in — that flow already restarted listening
          liveBusy = false;
          stopInterruptListener();
          if (!liveOn) return;
          startListening();
        };
        window.speechSynthesis.speak(utter);
        startInterruptListener('', text); // let the person cut in while KIE is talking — "text" lets it ignore KIE's own echo
      }

      function closeLive() {
        liveOn = false;
        liveBusy = false;
        turnId++;
        stopRec();
        stopInterruptListener();
        window.speechSynthesis?.cancel();
        speakToken++;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        smoothedBars = new Array(BAR_COUNT).fill(0.05);
        barVel = new Array(BAR_COUNT).fill(0);
        dustParticles = [];
        speakPhase = 0; thinkPhase = 0; lastResultTs = 0; emptyRestarts = 0;
        clearInterval(typeTimer); typeTimer = null; curMeLineEl = null;
        window._kieVoiceModeActive = false;
        const ovEl = ov();
        if (ovEl) ovEl.classList.remove('open');
        playChime('close');
      }

      window.openKieLive = function () {
        if (!LiveSpeechRecognition) { toast('Voice chat needs a browser with speech recognition support (try Chrome).', 'err'); return; }
        liveOn = true; liveBusy = false; liveMicMuted = false; emptyRestarts = 0;
        window._kieVoiceModeActive = true; // tells the backend to write for the ear, not the eye
        const mBtn = g('kieLiveMuteBtn'); if (mBtn) mBtn.classList.remove('active');
        const cBtn = g('kieLiveCaptionBtn'); if (cBtn) cBtn.classList.toggle('active', liveShowCaption);
        const ovEl = ov();
        if (ovEl) { ovEl.classList.add('open'); ovEl.classList.toggle('no-caption', !liveShowCaption); }
        window.speechSynthesis?.cancel();
        resetTranscript();
        setLiveState('listening');
        if (!rafId) orbLoop();
        playChime('open');
        setTimeout(startListening, 200);
      };
      window.closeKieLive = closeLive;

      document.addEventListener('DOMContentLoaded', () => {
        if (!LiveSpeechRecognition) return; // kieSend just behaves as send-only; openKieLive() itself also guards this
        const endBtn = g('kieLiveEndBtn'); if (endBtn) endBtn.onclick = closeLive;
        const mBtn = g('kieLiveMuteBtn');
        if (mBtn) mBtn.onclick = () => {
          liveMicMuted = !liveMicMuted;
          mBtn.classList.toggle('active', liveMicMuted);
          if (liveMicMuted) { stopRec(); stopInterruptListener(); setLiveState('listening'); }
          else if (liveOn && !liveBusy) startListening();
        };
        const cBtn = g('kieLiveCaptionBtn');
        if (cBtn) {
          cBtn.classList.toggle('active', liveShowCaption);
          cBtn.onclick = () => {
            liveShowCaption = !liveShowCaption;
            cBtn.classList.toggle('active', liveShowCaption);
            cBtn.title = liveShowCaption ? 'Hide transcript' : 'Show transcript';
            const ovEl = ov();
            if (ovEl) ovEl.classList.toggle('no-caption', !liveShowCaption);
          };
        }
      });
    })();

    // ══ JOBS PROFESSION TRACKING ══════════════════════════════════════════════
    // PROF_KEY is uid-scoped at runtime via usr.uid to prevent cross-account leakage
    function getProfKey() { return `kievora_jobs_prof_${usr?.uid || 'anon'}`; }

    function setJobProfession(title, source) {
      if (!title || title.trim().length < 2) return;
      const rec = { title: title.trim(), source, ts: Date.now() };
      localStorage.setItem(getProfKey(), JSON.stringify(rec));
      // Clear the swiper cache so the new profession triggers a fresh fetch
      try { sessionStorage.removeItem(JOBS_CACHE_KEY); } catch {}
      _jobsSwiperRendered = false;
      // Refresh jobs swiper if home is visible
      if (document.getElementById('v-home')?.classList.contains('active')) {
        renderJobsSwiper();
      }
    }
    window.setJobProfession = setJobProfession;

    function getJobProfession() {
      try { return JSON.parse(localStorage.getItem(getProfKey())) || null; }
      catch { return null; }
    }

    // ── Category key (set during onboarding / profile edit) ───────────────────
    function getUserCatKey() { return `kievora_user_cat_${usr?.uid || 'anon'}`; }
    function getUserCategory() {
      try { return JSON.parse(localStorage.getItem(getUserCatKey()))?.category || null; }
      catch { return null; }
    }
    window.getUserCategory = getUserCategory;

    // Map a broad category to a sensible default job-search query
    const CATEGORY_TO_QUERY = {
      'Software & Tech':       'Software Engineer',
      'Data & Analytics':      'Data Analyst',
      'Design & Creative':     'Product Designer',
      'Marketing & Growth':    'Marketing Manager',
      'Product & Strategy':    'Product Manager',
      'Finance & Banking':     'Financial Analyst',
      'Healthcare':            'Healthcare',
      'Sales & Business Dev':  'Sales Representative',
      'Operations':            'Operations Manager',
      'HR & People':           'HR Manager',
      'Legal & Compliance':    'Legal Counsel',
      'Education & Academia':  'Teacher',
      'Engineering':           'Engineer',
      'Writing & Content':     'Content Writer',
      'Consulting':            'Consultant',
      'Administration':        'Administrative Assistant'
    };

    // ── Fetch jobs from Remotive (free, no key) ────────────────────────────────
    async function fetchJobsRemotive(query, limit = 8) {
      try {
        const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${limit}`;
        const res  = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.jobs || []).map(j => ({
          id:          j.id,
          title:       j.title,
          company:     j.company_name,
          logo:        j.company_logo_url || j.company_logo || '',
          location:    j.candidate_required_location || 'Remote',
          remote:      true,
          salary:      j.salary || '',
          type:        j.job_type || '',
          url:         j.url,
          source:      'Remotive',
          posted:      j.publication_date || '',
          snippet:     (j.description||'').replace(/<[^>]+>/g,'').slice(0,200)+'…',
          description: (j.description||'').replace(/<[^>]+>/g,'').slice(0,3000),
          requirements: '',
        }));
      } catch { return []; }
    }

    // ── Country detection (IP-based, one-shot, cached in localStorage) ──────────
    const COUNTRY_LS_KEY = `kievora_country_${usr?.uid||'anon'}`;
    let _detectedCountry = null;

    async function getUserCountry() {
      if (_detectedCountry) return _detectedCountry;
      try {
        const cached = JSON.parse(localStorage.getItem(COUNTRY_LS_KEY) || 'null');
        if (cached?.code) { _detectedCountry = cached; return cached; }
      } catch {}
      try {
        const r = await api('GET', '/api/user-country');
        if (r?.countryCode) {
          _detectedCountry = { code: r.countryCode, name: r.country };
          localStorage.setItem(COUNTRY_LS_KEY, JSON.stringify(_detectedCountry));
          return _detectedCountry;
        }
      } catch {}
      _detectedCountry = { code: 'worldwide', name: 'Worldwide' };
      return _detectedCountry;
    }

    // ── Try server first, fall back to Remotive ────────────────────────────────
    async function fetchJobs(query, limit = 8) {
      const country = await getUserCountry();
      try {
        const res = await api('POST', '/api/find-jobs', { query, limit, countryCode: country.code });
        if (res.jobs?.length) { logEvent('find_jobs'); return res.jobs; }
      } catch (_) { /* server might not have key yet */ }
      logEvent('find_jobs');
      return fetchJobsRemotive(query, limit);
    }

    // ── ARTICLE SWIPER (real data) ───────────────────────────────────────────
    // Pulls whatever articles the admin picked in Swiper Control (platform/swiperConfig).
    // If admin hasn't configured anything yet, falls back to the most recent
    // published articles so the carousel is never empty.
    async function renderArticleSwiper() {
      const track = g('artTrack');
      if (!track) return;

      try {
        let articleDocs = [];

        const cfgSnap = await getDoc(doc(db, 'platform', 'swiperConfig'));
        const cfg = cfgSnap.exists() ? cfgSnap.data() : null;
        const maxCount = cfg?.maxCount || 6;

        if (cfg?.articleIds?.length) {
          const fetched = await Promise.all(
            cfg.articleIds.slice(0, maxCount).map(id => getDoc(doc(db, 'articles', id)))
          );
          articleDocs = fetched.filter(d => d.exists());
        }

        if (!articleDocs.length) {
          const q = query(
            collection(db, 'articles'),
            where('status', '==', 'published'),
            orderBy('publishedAt', 'desc'),
            limit(maxCount)
          );
          const snap = await getDocs(q);
          articleDocs = snap.docs;
        }

        if (!articleDocs.length) {
          track.innerHTML = `<div style="padding:20px;color:#9ca3af;font-size:13px">No articles yet.</div>`;
          return;
        }

        track.innerHTML = articleDocs.map(d => {
          const a = d.data();
          const cat = (a.cat || 'CAREERS');
          return `
          <a class="art-card" href="/article-read?id=${d.id}">
            <div class="art-img">
              <img src="${a.cover || a.img || ''}" alt="${(a.title||'').replace(/"/g,'&quot;')}" loading="lazy" onerror="this.parentElement.style.background='linear-gradient(135deg,#1e3a8a,#3b82f6)'">
              <span class="art-cat">${cat}</span>
            </div>
            <div class="art-body">
              <div class="art-title">${a.title || ''}</div>
              <div class="art-brief">${a.brief || ''}</div>
              <div class="art-meta"><span>${a.readTime || a.read || '5 min read'}</span><span>${cat}</span></div>
            </div>
          </a>`;
        }).join('');

        // Cards changed — clear the swiper's "already initialized" guard so dots rebuild
        track._swiperReady = false;
        initArtSwiper();
      } catch (e) {
        console.error('Article swiper load error:', e);
        track.innerHTML = `<div style="padding:20px;color:#9ca3af;font-size:13px">Couldn't load articles right now.</div>`;
      }
    }

    // ── Render jobs swiper on home ─────────────────────────────────────────────
    const JOBS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    const JOBS_CACHE_KEY = 'kievora_home_jobs_cache';
    let _jobsSwiperRendered = false; // in-memory guard — cleared only on tab close

    function _saveJobsCache(jobs, query, countryCode) {
      try {
        sessionStorage.setItem(JOBS_CACHE_KEY, JSON.stringify({ jobs, query, countryCode: countryCode||'worldwide', ts: Date.now() }));
      } catch {}
    }
    function _loadJobsCache(query, countryCode) {
      try {
        const c = JSON.parse(sessionStorage.getItem(JOBS_CACHE_KEY) || 'null');
        if (!c || !c.jobs?.length) return null;
        if (Date.now() - c.ts > JOBS_CACHE_TTL) return null; // stale
        if (c.query !== query) return null; // different search
        if ((c.countryCode||'worldwide') !== (countryCode||'worldwide')) return null; // country changed (e.g. on find-jobs) — must refetch
        return c.jobs;
      } catch { return null; }
    }

    async function renderJobsSwiper(force) {
      let prof = getJobProfession();

      // Auto-seed from most recent resume if no profession saved yet
      if (!prof || !prof.title) {
        const merged = getMergedResumes();
        const latest = merged.find(r => r.resumeData?.jobTitle);
        if (latest) {
          setJobProfession(latest.resumeData.jobTitle, 'builder');
          prof = getJobProfession();
        }
      }

      // Final fallback: derive a starter query from the onboarding category
      if (!prof || !prof.title) {
        const cat = getUserCategory();
        if (cat) {
          const seedTitle = CATEGORY_TO_QUERY[cat] || cat;
          setJobProfession(seedTitle, 'category');
          prof = getJobProfession();
        }
      }

      const cta     = document.getElementById('jobsHomeCta');
      const section = document.getElementById('jobsHomeSection');
      const pill    = document.getElementById('jobsHomeProfPill');
      const cards   = document.getElementById('jobsHomeCards');

      if (!prof || !prof.title) {
        if (cta)     cta.style.display     = '';
        if (section) section.style.display = 'none';
        return;
      }

      if (cta)     cta.style.display     = 'none';
      if (section) section.style.display = '';

      const country = await getUserCountry();

      if (pill) {
        const countryLabel = country.code !== 'worldwide' ? ` · ${country.name}` : '';
        const sourceLabel = { builder:'resume', analyzer:'analysis', kie:'KIE AI', manual:'you', category:'your category', profile:'profile' }[prof.source] || '';
        pill.textContent = prof.title + (sourceLabel ? ` · via ${sourceLabel}` : '') + countryLabel;
      }

      // ── Cache check — skip fetch if data is still fresh ──────────────────────
      // If we already rendered this session AND it's the same query AND the same
      // country, just restore from sessionStorage (survives find-jobs → back
      // navigation) or skip entirely. A country change on find-jobs must bust this.
      if (!force) {
        const cached = _loadJobsCache(prof.title, country.code);
        if (cached) {
          window._homeJobs = cached;
          if (_jobsSwiperRendered) return; // DOM already has the cards — nothing to do
          _renderHomeJobCards(cached, cards);
          _jobsSwiperRendered = true;
          return;
        }
      }

      // Show skeletons only on real fetch
      if (cards) {
        cards.innerHTML = Array(3).fill(0).map(() => `<div class="job-snap-skel"></div>`).join('');
      }

      try {
        const allJobs = await fetchJobs(prof.title, 8);
        window._homeJobs = allJobs;
        _saveJobsCache(allJobs, prof.title, country.code);
        _jobsSwiperRendered = true;
        if (!cards) return;
        if (!allJobs.length) {
          cards.innerHTML = `<div style="padding:20px;color:#9ca3af;font-size:13px">No jobs found — <a href="/find-jobs" style="color:#7c3aed;font-weight:700">search manually</a></div>`;
          return;
        }
        _renderHomeJobCards(allJobs, cards);
      } catch (err) {
        if (cards) cards.innerHTML = `<div style="padding:20px;color:#9ca3af;font-size:13px">Could not load jobs right now.</div>`;
      }
    }

    function _renderHomeJobCards(allJobs, cards) {
      if (!cards) return;
      cards.innerHTML = allJobs.slice(0, 8).map((j, i) => {
        const tags = [
          j.remote ? `<span class="job-snap-tag remote">Remote</span>` : '',
          j.type   ? `<span class="job-snap-tag">${j.type}</span>` : '',
          j.salary ? `<span class="job-snap-tag salary">${j.salary}</span>` : ''
        ].filter(Boolean).join('');
        const locked = !j.url;
        return `
        <div class="job-snap-card${locked?' job-snap-locked':''}" onclick="${locked?`lockTapped('findJobs')`:`openJobDetail(${i},'home')`}" style="cursor:pointer">
          ${locked ? '<div class="premium-lock-corner">🔒 Premium</div>' : ''}
          <div style="display:flex;align-items:center;gap:10px">
            <div class="job-snap-logo">
              ${j.logo
                ? `<img src="${j.logo}" alt="${j.company}" onerror="this.style.display='none'">`
                : `<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3m4-10h2m4 0h2M9 7h2m4 0h2M9 11h2m4 0h2"/></svg>`
              }
            </div>
            <div style="flex:1;min-width:0">
              <div class="job-snap-company">${j.company}</div>
            </div>
          </div>
          <div class="job-snap-title">${j.title}</div>
          <div style="font-size:11px;color:#9ca3af;font-weight:500">${j.location}</div>
          ${tags ? `<div class="job-snap-tags">${tags}</div>` : ''}
          <div class="job-snap-apply">View details <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></div>
        </div>`;
      }).join('') + `
        <a class="job-snap-more" href="/find-jobs">
          <div class="job-snap-more-circle">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </div>
          <div class="job-snap-more-txt">See more<br>jobs</div>
        </a>`;
    }

    // ── Hook into builder save ─────────────────────────────────────────────────
    const _origSaveResume = window.saveResume;
    window.saveResume = async function() {
      const result = await _origSaveResume?.apply(this, arguments);
      const title  = document.getElementById('bTitle')?.value?.trim();
      if (title) setJobProfession(title, 'builder');
      return result;
    };

    // ── Hook into analyzer result ──────────────────────────────────────────────
    const _origRenderAnalysis = window.renderAnalysis;
    window.renderAnalysis = function(r) {
      _origRenderAnalysis?.apply(this, arguments);
      if (r?.jobTitle) setJobProfession(r.jobTitle, 'analyzer');
    };

    // ── Hook into KIE resume selection ────────────────────────────────────────
    // We patch the pill-click handler after KIE is opened
    document.addEventListener('kie-resume-selected', (e) => {
      if (e.detail?.jobTitle) setJobProfession(e.detail.jobTitle, 'kie');
    });

    // Mic init moved to DOMContentLoaded — see below

    // Regenerate last AI response
    window.kieRegen = function(btn) {
      if (_kieGenerating) return; // don't regen while already generating
      if (!kieHist.length) return;
      // Remove last assistant message from history
      if (kieHist[kieHist.length - 1]?.role === 'assistant') {
        kieHist.pop();
        saveKieHistory();
      }
      // Remove the message element from DOM
      const msgEl = btn.closest('.km-ai');
      if (msgEl) msgEl.remove();
      // Re-send last user message
      const lastUser = [...kieHist].reverse().find(m => m.role === 'user');
      if (!lastUser) return;
      const inp = g('kieInp');
      inp.value = lastUser.content;
      // Remove from history so it doesn't double up
      const idx = kieHist.lastIndexOf(lastUser);
      if (idx >= 0) kieHist.splice(idx, 1);
      sendKie();
    };
    // Track if user has manually scrolled up — if so, don't force-scroll during generation
    let _kieUserScrolled = false;
    function _initKieMsgScroll() {
      const msgs = g('kieMsgs');
      if (!msgs || msgs._scrollBound) return;
      msgs._scrollBound = true;
      msgs.addEventListener('scroll', () => {
        const distFromBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight;
        // If user scrolled more than 80px from bottom, they want to read — don't drag them down
        _kieUserScrolled = distFromBottom > 80;
      }, { passive: true });
      // Touch start: user is actively scrolling — stop auto-scroll
      msgs.addEventListener('touchstart', () => { _kieUserScrolled = true; }, { passive: true });
    }

    function scrollKie(force) {
      const msgs = g('kieMsgs');
      if (!msgs) return;
      _initKieMsgScroll();
      // Only scroll if: forced (new message sent/received start), or user is already near bottom
      if (force || !_kieUserScrolled) {
        msgs.scrollTop = msgs.scrollHeight;
        _kieUserScrolled = false;
      }
    }

    // ── UTILS ─────────────────────────────────────────────────────────────────
    function g(id) { return document.getElementById(id); }
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    // Varied closing-action labels for canned KIE messages — keeps it from always saying "Your move:"
    const KIE_CLOSERS = ['**Your move:**','**Next step:**','**Try this:**','**Here\'s what I\'d do:**','**Today\'s task:**','**One thing to try:**'];
    function kieCloser() { return KIE_CLOSERS[Math.floor(Math.random() * KIE_CLOSERS.length)]; }
    // Render KIE's reply text into structured HTML — paragraphs, bullet/numbered lists,
    // and bold mini-headings — instead of one clumped block with raw <br>s.
    // Turns "[C:2]" / "[C:2,4]" markers the model drops after a grounded
    // claim into small tappable pills (the inline "wikipedia +1" style chips
    // Tomiwa referenced) — resolved against that turn's numbered source list,
    // n matching the 1-indexed LIVE WEB SEARCH RESULTS list the model saw.
    // Runs as a final pass over the assembled HTML so it works whether the
    // tag landed inside a <p>, <li>, or heading.
    function _kieApplyCitePills(html, sources) {
      if (!sources || !sources.length) return html.replace(/\[C:\s*[\d,\s]+\]/g, '');
      return html.replace(/\[C:\s*([\d,\s]+)\]/g, (m, idxStr) => {
        const idxs = idxStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        const list = idxs.map(n => sources[n - 1]).filter(Boolean);
        if (!list.length) return '';
        let domain = '';
        try { domain = new URL(list[0].url).hostname.replace(/^www\./, ''); } catch { domain = (list[0].title || 'source').slice(0, 20); }
        const extra = list.length > 1 ? ` +${list.length - 1}` : '';
        const dataAttr = esc(JSON.stringify(list));
        return `<button type="button" class="kie-cite-pill" data-cite="${dataAttr}" onclick="_kieCitePillClick(this)">${esc(domain)}${extra}</button>`;
      });
    }
    function _kieCitePillClick(btn) {
      try {
        const list = JSON.parse(btn.getAttribute('data-cite') || '[]');
        if (list.length && typeof window._openSourcesDrawer === 'function') window._openSourcesDrawer(list);
      } catch { /* malformed data-cite — just no-op rather than throw */ }
    }
    window._kieCitePillClick = _kieCitePillClick;

    // Turns a single "[IMG]" marker the model drops directly under a specific
    // concrete thing it just described (per the REFERENCE PHOTO PLACEMENT
    // system-prompt rule) into a plain, un-linked photo — no card, no
    // click-through — mounted exactly where the model placed it, not at a
    // fixed beginning/middle/end position. Most answers have zero markers;
    // this is deliberately rare and at most one image per answer. Runs as a
    // final pass, same as citations, so it works inside a <p> either way.
    function _kieApplyImageMarker(html, images) {
      if (!images || !images.length) return html.replace(/<p>\s*\[IMG\]\s*<\/p>|\[IMG\]/g, '');
      let used = false;
      return html.replace(/<p>\s*\[IMG\]\s*<\/p>|\[IMG\]/g, () => {
        if (used) return ''; // model isn't supposed to emit more than one, but never mount a second if it does
        used = true;
        return `<div class="kie-inline-image-wrap"><img src="${esc(images[0])}" class="kie-inline-image" loading="lazy" alt="" onerror="this.closest('.kie-inline-image-wrap').remove()"></div>`;
      });
    }

    function formatKieText(text, sources, images, mode) {
      let t = esc(String(text || '')).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      const lines = t.split('\n');
      const out = [];
      let para = [];
      const flush = () => { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
      let i = 0;
      while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (trimmed === '') { flush(); i++; continue; }
        const head = trimmed.match(/^(#{2,4})\s+(.*)/);
        if (head) {
          flush();
          const lvl = head[1].length + 2;
          out.push(`<h${lvl} class="km-heading">${head[2]}</h${lvl}>`);
          i++; continue;
        }
        const bullet = trimmed.match(/^[-•*✓✔⚠→▸▪➜]\s+(.*)/);
        if (bullet) {
          flush();
          const items = [];
          while (i < lines.length) {
            const m = lines[i].trim().match(/^[-•*✓✔⚠→▸▪➜]\s+(.*)/);
            if (!m) break;
            items.push('<li>' + m[1] + '</li>');
            i++;
          }
          out.push('<ul class="km-list">' + items.join('') + '</ul>');
          continue;
        }
        const num = trimmed.match(/^(\d+)[.)]\s+(.*)/);
        if (num) {
          flush();
          const items = [];
          while (i < lines.length) {
            const m = lines[i].trim().match(/^(\d+)[.)]\s+(.*)/);
            if (!m) break;
            items.push('<li>' + m[2] + '</li>');
            i++;
          }
          out.push('<ol class="km-list">' + items.join('') + '</ol>');
          continue;
        }
        para.push(trimmed);
        i++;
      }
      flush();
      const withCites = _kieApplyCitePills(out.join(''), sources);
      const withCards = _kieApplyCardMarker(withCites, sources, mode);
      return _kieApplyImageMarker(withCards, images);
    }
    function toast(msg, type = 'ok') {
      const t = g('toast');
      const icon = type === 'err' ? '⚠️' : '✅';
      t.innerHTML = '<span class="toast-ico">' + icon + '</span><span>' + esc(msg) + '</span>';
      t.className = type === 'err' ? 'toast-err' : 'toast-ok';
      clearTimeout(window._tt);
      requestAnimationFrame(() => t.classList.add('show'));
      window._tt = setTimeout(() => t.classList.remove('show'), 3500);
    }
    window.toast = toast; // bridge — other <script> blocks (e.g. Gmail panel) aren't module-scoped and can't see this otherwise
    function fmtDate(ts) {
      if (!ts) return '—';
      const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Global expose
    window.showView    = showView;
    window.openBuilder = openBuilder;
    window.openKie     = openKie;
    // Extra — used by bottom-script patches
    window._resumesCache = () => resumes;
    window._apiHelper    = api;
    window.TPLS_REF      = TPLS;
    window._buildPrevHTML = buildPrevHTML;
    window.triggerPhotoUpload = triggerPhotoUpload;
    window.removePhoto        = removePhoto;

    window.closePhotoUnsupportedModal = function() {
      document.getElementById('photoUnsupportedModal').classList.remove('open');
      document.body.style.overflow = '';
    };

    // Populate the modal's template tag list once on load (runs after TPLS is defined)
    (function() {
      const list = document.getElementById('pumTplList');
      if (!list) return;
      list.innerHTML = [...PHOTO_SUPPORTED_TPLS].map(id => {
        const t = TPLS.find(x => x.id === id);
        return t ? `<span class="pum-tpl-tag">${t.name}</span>` : '';
      }).join('');
    })();

    // Before opening the modal, update the template name label
    const _origTrigger = triggerPhotoUpload;
    window.triggerPhotoUpload = triggerPhotoUpload; // already patched above, keep in sync
    window.openDetail  = openDetail;
    window.dlResume    = dlResume;
    window.confirmDel  = confirmDel;
    window.computeATSScore = computeATSScore;
    window.openATSDrawer   = openATSDrawer;
    window.closeATSDrawer  = closeATSDrawer;

    // ── UPLOAD / ANALYSIS STATE ───────────────────────────────────────────────
    let uploadedFile   = null;
    let uploadedText   = '';
    let analysisResult = null;

    function openUploadView() {
      uploadedFile = null; uploadedText = '';
      const fr = g('uploadFileReady'); if (fr) fr.style.display = 'none';
      const uz = g('uploadZone');      if (uz) uz.style.display = 'block';
      const fi = g('uploadFileInput'); if (fi) fi.value = '';
      const pw = g('pasteAreaWrap');   if (pw) { pw.classList.remove('show'); }
      const pt = g('pasteText');       if (pt) pt.value = '';
      const ab = g('analyzeBtn');
      if (ab) { ab.disabled = true; ab.innerHTML = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg> Analyze My Resume`; }
      showView('upload');
    }
    window.openUploadView = openUploadView;

    async function handleUploadFile(file) {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('File too large — max 5 MB', 'err'); return; }
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['pdf','doc','docx','txt'].includes(ext)) { toast('Please use a PDF, DOCX, or TXT file', 'err'); return; }
      uploadedFile = file;
      g('uploadFileName').textContent = file.name;
      g('uploadFileSize').textContent = (file.size / 1024).toFixed(0) + ' KB';
      g('uploadFileReady').style.display = 'flex';
      g('uploadZone').style.display = 'none';
      g('analyzeBtn').disabled = false;
    }
    window.handleUploadFile = handleUploadFile;

    function clearUploadFile() {
      uploadedFile = null;
      g('uploadFileReady').style.display = 'none';
      g('uploadZone').style.display = 'block';
      g('uploadFileInput').value = '';
      const pw = g('pasteAreaWrap');
      g('analyzeBtn').disabled = !(pw && pw.classList.contains('show') && g('pasteText').value.trim().length > 30);
    }
    window.clearUploadFile = clearUploadFile;

    function togglePasteArea() {
      const pw = g('pasteAreaWrap');
      if (!pw) return;
      pw.classList.toggle('show');
      if (pw.classList.contains('show')) {
        g('analyzeBtn').disabled = false;
        setTimeout(() => g('pasteText').focus(), 50);
      } else {
        g('analyzeBtn').disabled = !uploadedFile;
      }
    }
    window.togglePasteArea = togglePasteArea;

    async function extractTextFromFile(file) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'txt') return await file.text();
      if (ext === 'pdf') {
        if (!window.pdfjsLib) throw new Error('PDF reader not loaded yet — try again in a moment');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const buf = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
        let text = '';
        for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
          const page    = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += pdfItemsToText(content.items) + '\n';
        }
        return text.trim();
      }
      if (ext === 'docx' || ext === 'doc') {
        if (!window.mammoth) throw new Error('Word reader not loaded yet — try again in a moment');
        const buf    = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
        return result.value.trim();
      }
      throw new Error('Unsupported format');
    }

    async function runAnalysis() {
      if (!isFeatureUnlocked('uploadAnalyze')) {
        openPremiumDrawer('uploadAnalyze');
        return; // never extract text or call the API for a plan that can't see the result
      }
      const btn = g('analyzeBtn');
      btn.disabled = true;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:sping .7s linear infinite;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Analyzing with KIE AI…`;
      try {
        let text = '';
        const pw = g('pasteAreaWrap');
        if (pw && pw.classList.contains('show')) {
          text = g('pasteText').value.trim();
          if (text.length < 30) { toast('Please paste some resume text first', 'err'); throw new Error('too short'); }
        } else if (uploadedFile) {
          toast('Reading your file…');
          text = await extractTextFromFile(uploadedFile);
          if (text.length < 30) throw new Error('Could not extract text — try pasting instead');
        } else {
          toast('Upload a file or paste your resume text', 'err'); throw new Error('no input');
        }
        uploadedText = text;
        const result = await api('POST', '/api/analyze-resume', { resumeText: text, forceResume: true });
        analysisResult = result;
        window.renderAnalysis(result);  // calls patched version so cache write fires
        showView('analysis');
      } catch (err) {
        if (!['too short','no input'].includes(err.message)) toast(err.message || 'Analysis failed — try again', 'err');
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg> Analyze My Resume`;
      }
    }
    window.runAnalysis = runAnalysis;

    function renderAnalysis(r) {
      const score  = Math.min(100, Math.max(0, r.atsScore || 0));
      const grade  = r.grade || 'C';
      const R = 38, circum = 2 * Math.PI * R;
      const offset = circum - (score / 100) * circum;
      const col = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';

      // Ring SVG
      g('analysisScoreRing').innerHTML = `
        <svg width="92" height="92" viewBox="0 0 92 92" style="transform:rotate(-90deg);display:block">
          <circle cx="46" cy="46" r="${R}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="8"/>
          <circle cx="46" cy="46" r="${R}" fill="none" stroke="${col}" stroke-width="8"
            stroke-dasharray="${circum.toFixed(2)}" stroke-dashoffset="${circum.toFixed(2)}"
            stroke-linecap="round" id="scoreRingPath"
            style="transition:stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)"/>
        </svg>`;
      g('analysisScoreNum').textContent  = score;
      g('analysisGrade').textContent     = grade;
      const labels = {'A+':'Outstanding','A':'Excellent','B+':'Very Good','B':'Good','C+':'Fair','C':'Average','D':'Needs Work'};
      g('analysisGradeLbl').textContent  = labels[grade] || 'Your Score';

      // Pills
      const hasExp = (r.workExperience||[]).length > 0;
      const hasEdu = (r.education||[]).length > 0;
      const hasSk  = (r.skills||[]).length > 0;
      g('analysisPills').innerHTML = [
        hasExp  ? `<span class="sc-pill good">✓ Experience</span>` : `<span class="sc-pill bad">✗ Experience</span>`,
        hasEdu  ? `<span class="sc-pill good">✓ Education</span>`  : `<span class="sc-pill warn">✗ Education</span>`,
        hasSk   ? `<span class="sc-pill good">✓ Skills</span>`     : `<span class="sc-pill bad">✗ Skills</span>`,
        r.summary ? `<span class="sc-pill good">✓ Summary</span>`  : `<span class="sc-pill warn">✗ Summary</span>`,
        r.email   ? `<span class="sc-pill good">✓ Contact</span>`  : `<span class="sc-pill bad">✗ Contact</span>`,
      ].join('');

      // Strengths
      g('analysisStrengths').innerHTML = (r.strengths||[]).map(s =>
        `<div class="an-item"><div class="an-ico grn"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></div><span>${esc(s)}</span></div>`
      ).join('') || `<div class="an-item" style="color:var(--mute);font-style:italic">None detected</div>`;

      // Weaknesses
      g('analysisWeaknesses').innerHTML = (r.weaknesses||[]).map(w =>
        `<div class="an-item"><div class="an-ico red"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></div><span>${esc(w)}</span></div>`
      ).join('') || `<div class="an-item" style="color:var(--mute);font-style:italic">No critical issues</div>`;

      // Suggestions
      g('analysisSuggestions').innerHTML = (r.suggestions||[]).map((s,i) =>
        `<div class="an-item"><div class="an-ico pur">${i+1}</div><span>${esc(s)}</span></div>`
      ).join('') || `<div class="an-item" style="color:var(--mute);font-style:italic">No suggestions</div>`;

      // Missing
      const misCard = g('analysisMissingCard');
      if ((r.missingItems||[]).length) {
        g('analysisMissing').innerHTML = (r.missingItems||[]).map(m =>
          `<div class="an-item"><div class="an-ico ora"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01"/></svg></div><span>${esc(m)}</span></div>`
        ).join('');
        misCard.style.display = 'block';
      } else { misCard.style.display = 'none'; }

      // Extracted info
      g('extName').textContent     = r.fullName  || '—';
      g('extTitle').textContent    = r.jobTitle  || '—';
      g('extEmail').textContent    = r.email     || '—';
      g('extPhone').textContent    = r.phone     || '—';
      g('extLocation').textContent = r.location  || '—';
      g('extExp').innerHTML = (r.workExperience||[]).slice(0,3).map(w =>
        `<div style="margin-bottom:5px"><strong style="font-size:12px">${esc(w.position)}</strong> <span style="color:var(--sub);font-size:11px">@ ${esc(w.company)}</span></div>`
      ).join('') || `<span style="color:var(--mute);font-size:12px">None found</span>`;
      g('extSkills').innerHTML = (r.skills||[]).slice(0,14).map(s =>
        `<span class="ext-skill">${esc(s)}</span>`
      ).join('') || `<span style="color:var(--mute);font-size:12px">None found</span>`;

      // Animate ring
      setTimeout(() => {
        const path = document.getElementById('scoreRingPath');
        if (path) path.style.strokeDashoffset = offset.toFixed(2);
      }, 120);
    }
    window.renderAnalysis      = renderAnalysis;
    window._setAnalysisResult  = (r) => { analysisResult = r; };
    window._getSelTpl          = ()  => selTpl;

    function useAnalyzedResume() {
      if (!analysisResult) return;
      const r = analysisResult;
      resetForm();
      g('bRName').value  = r.fullName ? r.fullName + ' Resume' : 'Untitled Resume';
      g('bFull').value   = r.fullName  || '';
      g('bTitle').value  = r.jobTitle  || '';
      g('bEmail').value  = r.email     || '';
      g('bPhone').value  = r.phone     || '';
      g('bLoc').value    = r.location  || '';
      g('bSumm').value   = r.summary   || '';
      wList = (r.workExperience||[]).map((w,i) => ({_id:i,...w}));
      eList = (r.education||[]).map((e,i)      => ({_id:i,...e}));
      sList = [...(r.skills||[])];
      renderW(); renderE(); renderS();
      builderStep = 1; renderStep();
      currentDraftId = 'draft_' + Date.now();
      showView('builder');
      toast('Resume imported! Review and save your details ✏️');
    }
    window.useAnalyzedResume = useAnalyzedResume;

    function chatAboutResume() {
      if (!analysisResult) { openKie(); return; }
      const r = analysisResult;
      const prompt = `I just analyzed my resume. I'm ${r.fullName||'a job seeker'} targeting ${r.jobTitle||'a role'}. My ATS score is ${r.atsScore||0}/100. Weaknesses: ${(r.weaknesses||[]).join('; ')}. Missing: ${(r.missingItems||[]).join(', ')||'nothing flagged'}. How can I specifically improve this resume to land more interviews?`;
      openKie();
      setTimeout(() => { const inp = g('kieInp'); if (inp && !_kieGenerating) { inp.value = prompt; sendKie(); } }, 450);
    }
    window.chatAboutResume = chatAboutResume;

    window.runRecruiterIntel = async function() {
      const btn = g('recruiterIntelBtn');
      if (!analysisResult) { toast('Upload and analyze a resume first.', 'err'); return; }
      if (!isFeatureUnlocked('recruiterView')) {
        lockTapped('recruiterView');
        return; // never open the panel/spinner for something that's just going to fail
      }
      // Open the slide-in panel with loading state
      const panel = g('recPanel');
      const body  = g('recPanelBody');
      const spin  = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="animation:sping 1.2s linear infinite"><path stroke="#7c3aed" stroke-width="2" stroke-linecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';
      if (body) body.innerHTML = '<div class="rec-loading"><div class="rec-loading-spin">' + spin + '</div><div style="font-size:14px;font-weight:700;color:var(--sub)">Analyzing from a recruiter\'s perspective...</div></div>';
      if (panel) { panel.classList.add('open'); document.body.style.overflow = 'hidden'; }
      if (btn) { btn.disabled = true; btn.textContent = 'Analyzing...'; }
      try {
        const r = await fetch('/api/recruiter-intel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
          body: JSON.stringify({ resumeData: analysisResult, targetRole: analysisResult.jobTitle || '', model: kieModel }),
        });
        if (!r.ok) { const errBody = await r.json().catch(() => ({})); throw new Error(errBody.message || errBody.error || 'Failed'); }
        const data = await r.json();
        const dColor = data.recruiterScore >= 70 ? '#059669' : data.recruiterScore >= 55 ? '#d97706' : '#dc2626';
        function mkRecItems(arr, dotColor) {
          return (arr || []).map(function(t){ return '<div class="rec-item"><span class="rec-item-dot" style="background:' + dotColor + '"></span><span>' + esc(t) + '</span></div>'; }).join('');
        }
        if (body) body.innerHTML =
          '<div class="rec-score-hero">'
          + '<div class="rec-score-ring" style="border-color:' + dColor + '66;background:' + dColor + '18">'
          + '<div class="rec-score-num" style="color:' + dColor + '">' + (data.recruiterScore || 0) + '</div>'
          + '<div class="rec-score-slash">/ 100</div></div>'
          + '<div class="rec-score-info">'
          + '<div class="rec-score-label">Recruiter Score</div>'
          + '<div class="rec-score-verdict">"' + esc(data.firstImpression || '') + '"</div>'
          + '<div class="rec-score-meta">' + esc(data.passRate || '') + ' &middot; Reads in ' + esc(data.timeToRead || '') + '</div>'
          + '<div class="rec-chance-pill" style="background:' + dColor + '20;color:' + dColor + '">' + esc(data.interviewLikelihood || '') + ' Interview Chance</div>'
          + '</div></div>'
          + '<div class="rec-section"><div class="rec-section-title">&#128681; Red Flags</div>' + mkRecItems(data.redFlags, '#dc2626') + '</div>'
          + '<div class="rec-section"><div class="rec-section-title">&#128640; Standout Moves</div>' + mkRecItems(data.standoutMoves, '#059669') + '</div>'
          + '<div class="rec-section"><div class="rec-section-title">&#128203; Top Improvements</div>' + mkRecItems(data.improvements, '#7c3aed') + '</div>'
          + '<div class="rec-section" style="background:#f8f7ff;border-style:dashed"><div style="font-size:12px;color:var(--sub);font-style:italic;line-height:1.65">"' + esc(data.verdict || '') + '"</div></div>';
        if (body) body.scrollTop = 0;
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg> Recruiter View'; }
      } catch (err) {
        if (body) body.innerHTML = '<div style="text-align:center;padding:40px 20px"><div style="font-size:14px;font-weight:700;color:var(--txt);margin-bottom:8px">Analysis failed</div><div style="font-size:13px;color:var(--sub)">' + esc(err.message) + '</div></div>';
        if (btn) { btn.disabled = false; btn.textContent = 'Recruiter View'; }
      }
    };

    window.closeRecPanel = function() {
      const panel = g('recPanel');
      if (panel) panel.classList.remove('open');
      document.body.style.overflow = '';
    };

    // ── DOM READY ─────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
      initPhotoUpload();
      window.addEventListener('resize', () => { if (document.getElementById('v-tpick').classList.contains('active')) scaleTplThumbs(); });
      // Avatar menu
      // sidebar toggle handled by inline script at bottom
      g('logoutBtn').onclick = async () => {
        window._currentUid = null;
        window._currentUser = null;
        localStorage.removeItem('kievora_active_uid');
        await signOut(auth);
        window.location.href = '/';
      };

      // KIE
      g('kieFab').onclick    = openKie;
      g('kieCloseBtn').onclick = () => { if (_kieGenerating) stopKieGeneration(); showView('home'); };
      g('kieSend').onclick     = () => {
        const inp = g('kieInp');
        const hasText = !!(inp && inp.value.trim().length);
        if (!_kieGenerating && !hasText) { if (typeof window.openKieLive === 'function') window.openKieLive(); return; }
        sendKie(); // sendKie handles stop when _kieGenerating
      };
      g('kieInp').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendKie(); } });
      g('kieInp').addEventListener('input', function() {
        this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        if (!_kieGenerating) setKieSendMode('send'); // re-picks voice-vs-send icon based on new content
      });
      setKieSendMode('send'); // initial icon — starts on the voice-chat trigger since the input is empty

      // ── Mic init (must run here so kieMicBtn element exists) ────────────────
      (function initKieMic() {
        const micBtn = g('kieMicBtn');
        if (!micBtn) return;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { micBtn.style.display = 'none'; return; }
        let recognition = null;
        let isListening  = false;
        micBtn.addEventListener('click', () => {
          if (isListening) { recognition?.stop(); return; }
          recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.interimResults = true;
          recognition.maxAlternatives = 1;
          recognition.continuous = false;
          recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add('listening');
            micBtn.title = 'Tap to stop';
            const inp = g('kieInp');
            if (inp) inp.placeholder = 'Listening…';
          };
          recognition.onresult = (e) => {
            const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
            const inp = g('kieInp');
            if (inp) { inp.value = transcript; inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px'; }
            if (!_kieGenerating) setKieSendMode('send');
          };
          recognition.onend = () => {
            isListening = false;
            micBtn.classList.remove('listening');
            micBtn.title = 'Speak your question';
            const inp = g('kieInp');
            if (inp) {
              inp.placeholder = 'Ask KIE anything career-';
              if (inp.value.trim()) setTimeout(() => { if (!_kieGenerating) sendKie(); }, 300);
            }
          };
          recognition.onerror = (e) => {
            isListening = false;
            micBtn.classList.remove('listening');
            micBtn.title = 'Speak your question';
            const inp = g('kieInp');
            if (inp) inp.placeholder = 'Ask KIE anything career-';
            if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Mic error: ' + e.error, 'err');
          };
          recognition.start();
        });
      })();
      // Internal clear helper used by startNewKieChat and new conversation flow
      window._kieInternalClear = function() {
        kieHist = [];
        saveKieHistory();
        const msgs = g('kieMsgs');
        Array.from(msgs.children).forEach(c => { if (!c.id || c.id !== 'kieTyp') c.remove(); });
        msgs.style.display = 'none';
        const welcome = g('kieWelcome');
        if (welcome) welcome.style.display = 'flex';
        // Reset resume selection
        document.querySelectorAll('.kie-rpill').forEach(p => p.classList.remove('active'));
        const uploadedPill = document.querySelector('.kie-rpill-uploaded');
        if (uploadedPill) uploadedPill.remove();
        kieResumeContext  = resumes?.length ? 'HAS_RESUMES_UNSELECTED' : 'NO_RESUME_YET';
        kieSelectedResume = null;
        const attachBtn = g('kieAttachBtn');
        if (attachBtn) attachBtn.classList.remove('has-resume');
        updateKieTplIndicator();
        closeKieResumeDropdown();
      };

      // ── KIE CODE/TABLE CARD SWIPE ─────────────────────────────────────────
      // Code cards (ASCII trees/timelines) and comparison tables can be wider
      // than the chat panel. Native touch scrolling already swipes on mobile
      // (-webkit-overflow-scrolling:touch + overflow-x:auto in CSS); this adds
      // the same left-right swipe via mouse drag for desktop. Delegated at the
      // message-list level so it works on cards created after the fact by the
      // live streaming formatter, without needing per-card re-initialization.
      (function initKieCardSwipe() {
        const msgs = g('kieMsgs');
        if (!msgs) return;
        let dragEl = null, startX = 0, startScroll = 0;

        function scrollable(target) {
          return target.closest && target.closest('.kie-table-scroll, .kie-code-card-body, .kie-source-cards');
        }
        msgs.addEventListener('mousedown', (e) => {
          const el = scrollable(e.target);
          if (!el || el.scrollWidth <= el.clientWidth) return;
          dragEl = el; startX = e.pageX; startScroll = el.scrollLeft;
          el.classList.add('kie-dragging');
          e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
          if (!dragEl) return;
          dragEl.scrollLeft = startScroll - (e.pageX - startX);
        });
        window.addEventListener('mouseup', () => {
          if (dragEl) dragEl.classList.remove('kie-dragging');
          dragEl = null;
        });
      })();

      // ── KIE SWIPER ──────────────────────────────────────────────────────────
      (function initKieSwiper() {
        // NOTE: the element has id="kieSwiper", not "kieSwiperOuter"
        const outer = g('kieSwiper') || document.querySelector('.kie-swiper-outer');
        const track = g('kieSwiperTrack');
        const dotsWrap = g('kieSwiperDots');
        if (!outer || !track || !dotsWrap) return;
        const cards = Array.from(track.querySelectorAll('.kie-chip2'));
        const total = cards.length;
        if (!total) return;

        const cardW = () => cards[0] ? cards[0].getBoundingClientRect().width + 12 : 162;

        // Build dots — one per card
        dotsWrap.innerHTML = '';
        cards.forEach((_, i) => {
          const d = document.createElement('button');
          d.className = 'kie-swiper-dot' + (i === 0 ? ' active' : '');
          d.addEventListener('click', () => { scrollToCard(i); stopAuto(); });
          dotsWrap.appendChild(d);
        });

        function scrollToCard(idx) {
          outer.scrollTo({ left: idx * cardW(), behavior: 'smooth' });
        }
        function updateDots() {
          const idx = Math.round(outer.scrollLeft / cardW());
          dotsWrap.querySelectorAll('.kie-swiper-dot').forEach((d, i) =>
            d.classList.toggle('active', i === idx));
        }
        outer.addEventListener('scroll', updateDots, { passive: true });

        // Auto-advance every 3.2s
        let autoTimer;
        function startAuto() {
          autoTimer = setInterval(() => {
            const maxScroll = outer.scrollWidth - outer.clientWidth;
            if (outer.scrollLeft >= maxScroll - 10) {
              outer.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
              outer.scrollBy({ left: cardW(), behavior: 'smooth' });
            }
          }, 3200);
        }
        function stopAuto() { clearInterval(autoTimer); }

        outer.addEventListener('touchstart', stopAuto, { passive: true });
        outer.addEventListener('mousedown', stopAuto);

        // Start auto when KIE opens
        const origOpenKie = window.openKie;
        window.openKie = function() {
          origOpenKie && origOpenKie();
          stopAuto(); startAuto();
        };

        // Sync dots immediately
        updateDots();
      })();

      // Home
      g('newResumeBtn').onclick = () => showView('tpick');
      // "+ New Resume" link beside My Resumes now opens the all-resumes screen
      const shLink = document.getElementById('shAllLink'); if (shLink) shLink.onclick = () => showView('allresumes');
      const allBack = document.getElementById('allBack'); if (allBack) allBack.onclick = () => showView('home');
      const allNewBtn = document.getElementById('allNewBtn'); if (allNewBtn) allNewBtn.onclick = () => showView('tpick');

      // ATS drawer — swipe down to close
      (function initATSDrawerSwipe() {
        const drawer = g('atsDrawer');
        if (!drawer) return;
        let startY = 0, curY = 0, dragging = false;

        drawer.addEventListener('touchstart', e => {
          const inner = drawer.querySelector('.ats-drawer-inner');
          // Only allow drag-close if inner content is scrolled all the way to top
          if (inner && inner.scrollTop > 4) { dragging = false; return; }
          startY = e.touches[0].clientY;
          dragging = true;
          curY = 0;
          drawer.style.transition = 'none';
        }, { passive: true });

        drawer.addEventListener('touchmove', e => {
          if (!dragging) return;
          const dy = e.touches[0].clientY - startY;
          // If user swipes UP, cancel drag-to-close and let inner scroll handle it
          if (dy < 0) { dragging = false; drawer.style.transform = ''; drawer.style.transition = ''; return; }
          curY = dy;
          drawer.style.transform = `translateY(${curY}px)`;
        }, { passive: true });

        drawer.addEventListener('touchend', () => {
          drawer.style.transition = '';
          if (curY > 80) { closeATSDrawer(); }
          else { drawer.style.transform = ''; }
          dragging = false; curY = 0;
        });
      })();

      // Auto-save draft as user types in builder
      ['bRName','bFull','bTitle','bEmail','bPhone','bLoc','bSumm'].forEach(id=>{
        const el = g(id); if (el) el.addEventListener('input', autoSaveDraft);
      });
      // ✦ Coach: auto-trigger summary suggestions when job title changes
      const titleEl = g('bTitle');
      if (titleEl) titleEl.addEventListener('input', onTitleInput);
      // Hide work bullets panel when position/company change
      ['wPos','wComp'].forEach(id => {
        const el = g(id); if (el) el.addEventListener('input', () => { const p = g('workBulletsPanel'); if(p) p.style.display='none'; });
      });

      // Template picker
      g('tPickBack').onclick = () => showView('home');
      // (No bottom "Start Building" button anymore — each card has "Use Template")

      // Builder nav
      g('btnPrev').onclick = prevStep;
      g('btnNext').onclick = nextStep;
      g('bSvBtn').onclick  = saveResume;
      // builderBack: go to 'home' when editing an existing resume, 'tpick' when creating new
      g('builderBack').onclick = () => { showView(editId ? 'home' : 'tpick'); };
      g('bAddW').onclick = addW;
      g('bAddE').onclick = addE;
      g('bAddS').onclick = addS;
      if (g('bAddCrt')) g('bAddCrt').onclick = addCert;
      if (g('bAddPrj')) g('bAddPrj').onclick = addProj;
      if (g('bAddLng')) g('bAddLng').onclick = addLang;
      g('sInp').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addS(); } });

      // Success
      g('sDlBtn').onclick   = () => { if (editId) dlResume(editId); };
      g('sEditBtn').onclick = () => showView('builder');
      g('sDashBtn').onclick = () => { loadResumes().then(() => showView('home')); };

      // Detail
      if (g('detBack')) g('detBack').onclick = () => showView('home');
      g('detEdit').onclick = () => { if (detId) window.openBuilder(detId); };
      g('detDl').onclick   = () => { if (detId) dlResume(detId); };
      g('detDel').onclick  = () => { if (detId) confirmDel(detId); };

      // Delete modal
      g('delCancel').onclick = () => g('delModal').classList.remove('open');

      // ── UPLOAD & ANALYSIS ──────────────────────────────────────────────────
      // Back buttons
      g('uploadBack').onclick   = () => showView('home');
      g('analysisBack').onclick = () => showView('upload');

      // File input change
      g('uploadFileInput').onchange = e => { if (e.target.files[0]) handleUploadFile(e.target.files[0]); };

      // Drag & drop
      const uploadZone = g('uploadZone');
      uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
      uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('drag-over'));
      uploadZone.addEventListener('drop', e => {
        e.preventDefault(); uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleUploadFile(e.dataTransfer.files[0]);
      });

      // Paste textarea: enable analyze btn as user types
      g('pasteText').addEventListener('input', () => {
        g('analyzeBtn').disabled = g('pasteText').value.trim().length < 30;
      });

      // ── COVER LETTER LOGIC ───────────────────────────────────────────────────
      let clSource       = null;  // 'existing' | 'upload' | 'scratch'
      let clResume       = null;  // selected resume object or null
      let clUploadFile   = null;  // uploaded file
      let clTemplate     = null;  // selected template id
      let clFromSuccessId = null; // resume id when navigating from success screen

      // Step indicators
      function clUpdateSteps(step) {
        const states = [
          { s:'cl-stp-done', l:'done' },  // step 1
          { s:'cl-stp-done', l:'done' },  // step 2
          { s:'cl-stp-done', l:'done' },  // step 3
        ];
        const cur = step - 1;
        for (let i = 0; i < 3; i++) {
          const el = g('clS' + (i + 1));
          if (!el) continue;
          el.className = 'cl-stp ' + (i < cur ? 'cl-stp-done' : i === cur ? 'cl-stp-cur' : 'cl-stp-idle');
        }
        for (let i = 1; i <= 2; i++) {
          const ln = g('clL' + i);
          if (ln) ln.className = 'cl-stp-line' + (i < step ? ' done' : '');
        }
        const labels = ['Choose Resume', 'Pick Template', 'All Set!'];
        const lbl = g('clStepLbl');
        if (lbl) lbl.textContent = labels[cur] || '';

        ['clStep1','clStep2','clStep3'].forEach((id, idx) => {
          const el = g(id); if (el) el.className = 'cl-step-panel' + (idx === cur ? ' active' : '');
        });
      }

      window.clSelectSource = function(src) {
        if ((src === 'existing' || src === 'upload') && !isFeatureUnlocked('coverLetterFromResume')) {
          lockTapped('coverLetter');
          return; // stay on whatever was selected before — never select a locked source
        }
        clSource = src;
        ['clSrcExisting','clSrcUpload','clSrcScratch'].forEach(id => {
          const el = g(id); if (el) el.classList.remove('sel');
        });
        const selEl = g('clSrc' + src.charAt(0).toUpperCase() + src.slice(1));
        if (selEl) selEl.classList.add('sel');

        // Show/hide sub-panels
        const resPicker   = g('clResPicker');
        const uploadZone  = g('clUploadZone');
        const uploadReady = g('clUploadReady');

        if (resPicker)  resPicker.className  = 'cl-res-picker'   + (src === 'existing' ? ' show' : '');
        if (uploadZone) uploadZone.className = 'cl-upload-zone'  + (src === 'upload'   ? ' show' : '');
        if (uploadReady && src !== 'upload') { uploadReady.classList.remove('show'); }

        // Populate existing resumes if needed
        if (src === 'existing') clPopulateResList();

        clCheckStep1Ready();
      };

      function clPopulateResList() {
        const el = g('clResListEl');
        if (!el) return;
        if (!resumes || !resumes.length) {
          el.innerHTML = `<div style="font-size:13px;color:var(--sub);padding:8px 0">No resumes yet — <button onclick="showView('tpick')" style="background:none;border:none;color:var(--p);font-weight:700;cursor:pointer;font-family:inherit">create one first</button></div>`;
          return;
        }
        el.innerHTML = resumes.map((r, i) => {
          const name = r.resumeName || r.resumeData?.fullName || `Resume ${i + 1}`;
          const date = r.updatedAt?.seconds ? new Date(r.updatedAt.seconds * 1000).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';
          return `<div class="cl-res-item" id="clri_${r.id}" onclick="clSelectResume('${r.id}')">
            <div class="cl-res-thumb"><svg width="12" height="16" fill="none" viewBox="0 0 12 16"><rect x="1" y="1" width="10" height="14" rx="2" fill="#ede9fe" stroke="#c4b5fd" stroke-width="1"/><rect x="3" y="4" width="6" height="1" rx=".5" fill="#a78bfa"/><rect x="3" y="6.5" width="5" height="1" rx=".5" fill="#c4b5fd"/><rect x="3" y="9" width="4" height="1" rx=".5" fill="#c4b5fd"/></svg></div>
            <div style="flex:1;min-width:0">
              <div class="cl-res-name">${esc(name)}</div>
              ${date ? `<div class="cl-res-date">${date}</div>` : ''}
            </div>
          </div>`;
        }).join('');
      }

      window.clSelectResume = function(id) {
        clResume = resumes.find(r => r.id === id) || null;
        document.querySelectorAll('.cl-res-item').forEach(el => el.classList.remove('sel'));
        const el = g('clri_' + id);
        if (el) el.classList.add('sel');
        clCheckStep1Ready();
      };

      window.clHandleFile = function(input) {
        const file = input.files[0];
        if (!file) return;
        clUploadFile = file;
        const ready = g('clUploadReady');
        const zone  = g('clUploadZone');
        const nameEl = g('clFileName');
        if (nameEl) nameEl.textContent = file.name;
        if (ready) ready.classList.add('show');
        if (zone)  zone.style.opacity = '.5';
        clCheckStep1Ready();
      };

      window.clClearFile = function() {
        clUploadFile = null;
        const ready = g('clUploadReady');
        const zone  = g('clUploadZone');
        const inp   = g('clFileInput');
        if (ready) ready.classList.remove('show');
        if (zone)  zone.style.opacity = '';
        if (inp)   inp.value = '';
        clCheckStep1Ready();
      };

      function clCheckStep1Ready() {
        const btn = g('clNextBtn1');
        if (!btn) return;
        let ok = false;
        if (clSource === 'scratch') ok = true;
        if (clSource === 'existing' && clResume) ok = true;
        if (clSource === 'upload' && clUploadFile) ok = true;
        btn.disabled = !ok;
      }

      window.clGoStep2 = function() {
        if (!clSource) return;
        if (clSource === 'existing' && !clResume && !(resumes && resumes.length === 0)) return;
        clUpdateSteps(2);
      };

      window.clGoStep1 = function() {
        clUpdateSteps(1);
      };

      window.clPickTpl = function(id) {
        clTemplate = id;
        document.querySelectorAll('.cl-tcard').forEach(c => c.classList.remove('sel'));
        const el = g('clt_' + id);
        if (el) el.classList.add('sel');
        clCheckStep2Ready();
      };

      function clCheckStep2Ready() {
        const btn = g('clNextBtn2');
        if (!btn) return;
        const jobTitle   = (g('clJobTitle')?.value   || '').trim();
        const companyName = (g('clCompanyName')?.value || '').trim();
        btn.disabled = !(clTemplate && jobTitle && companyName);
      }

      window.clGoStep3 = async function() {
        if (!clTemplate) return;
        const jobTitle    = (g('clJobTitle')?.value   || '').trim();
        const companyName = (g('clCompanyName')?.value || '').trim();
        if (!jobTitle || !companyName) return;

        clUpdateSteps(3);
        await clGenerate(jobTitle, companyName);
      };

      async function clGenerate(jobTitle, companyName) {
        // Show loading, hide result
        const loading = g('clGenLoading');
        const result  = g('clGenResult');
        const back    = g('clStep3Back');
        const regenBtn = g('clRegenBtn');
        if (loading) loading.style.display = 'block';
        if (result)  result.style.display  = 'none';
        if (back)    back.style.display    = 'none';
        if (regenBtn) regenBtn.disabled = true;

        // Rotate loading messages
        const statusMsgs = [
          'Writing your cover letter…',
          'Matching your experience to the role…',
          'Crafting the perfect opening…',
          'Polishing the final paragraph…',
        ];
        let si = 0;
        const statusEl = g('clGenStatus');
        const statusInterval = setInterval(() => {
          if (statusEl) { si = (si + 1) % statusMsgs.length; statusEl.textContent = statusMsgs[si]; }
        }, 2200);

        // Loading label — never mentions which model; cover letters always run on
        // Groq regardless of plan, so naming a model here would wrongly imply the
        // user's chat-model choice (or paid tier) affects this output.
        const modelLblEl = g('clGenModelLabel');
        if (modelLblEl) modelLblEl.textContent = `KIE is crafting your letter`;

        try {
          // Build resume payload
          let resumeData  = null;
          let resumeText  = null;

          if (clSource === 'existing' && clResume) {
            resumeData = clResume.resumeData || null;
          } else if (clSource === 'upload' && clUploadFile) {
            // Use already-extracted text if available, else send file name as fallback
            resumeText = clUploadedText || clUploadFile.name;
          }

          const body = {
            resumeSource: clSource,
            resumeId:    clResume?.id || null,
            resumeData,
            resumeText,
            template:    clTemplate,
            jobTitle,
            companyName,
            model:       kieModel,
          };

          const resp = await fetch('/api/cover-letter', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body:    JSON.stringify(body),
          });

          clearInterval(statusInterval);

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.error || 'Generation failed');
          }

          const data = await resp.json();
          const letter = data.letter || '';
          const usedModel = data.model || kieModel;
          logEvent('cover_letter', { model: kieModel });

          // Show result
          const metaEl   = g('clResultMeta');
          const tplNames = { classic:'Classic', modern:'Modern', executive:'Executive', minimal:'Minimal' };

          if (metaEl) {
            const rLabel = clSource === 'existing' && clResume
              ? (clResume.resumeName || clResume.resumeData?.fullName || 'Your Resume')
              : clSource === 'upload' ? (clUploadFile?.name || 'Uploaded Resume') : 'Scratch';
            metaEl.textContent = `${jobTitle} · ${companyName} · ${tplNames[clTemplate]}`;
          }

          // Store for PDF
          window._clCurrentLetter   = letter;
          window._clCurrentTemplate = clTemplate;
          window._clCurrentJobTitle = jobTitle;
          window._clCurrentCompany  = companyName;
          window._clCurrentResume   = clResume;

          // Render into the smaller A4-style template preview
          clRenderPreview(letter);

          if (loading) loading.style.display = 'none';
          if (result)  result.style.display  = 'block';
          if (back)    back.style.display    = '';
          if (regenBtn) regenBtn.disabled = false;

        } catch (err) {
          clearInterval(statusInterval);
          if (loading) loading.style.display = 'none';
          if (back)    back.style.display    = '';
          // Show error in result area
          if (result) {
            result.style.display = 'block';
            result.innerHTML = `<div style="text-align:center;padding:30px 20px">
              <div style="font-size:32px;margin-bottom:12px">⚠️</div>
              <div style="font-size:15px;font-weight:700;color:var(--txt);margin-bottom:8px">Generation failed</div>
              <div style="font-size:13px;color:var(--sub);margin-bottom:20px">${esc(err.message)}</div>
              <button onclick="clGoStep2()" style="padding:12px 28px;background:var(--g);color:#fff;border:none;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit">← Try Again</button>
            </div>`;
          }
        }
      }

      // ── Cover letter template "page" renderers ────────────────────────────
      // Mirrors the visual styles shown in the cl-tcard previews (Step 2), so the
      // result preview AND the downloaded PDF look like the actual chosen template.
      const CL_TPL_ACCENTS = {
        classic:   '#1e293b',
        modern:    '#7c3aed',
        executive: '#1e293b',
        minimal:   '#111827',
      };

      function clParasHTML(text) {
        const paras = (text || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);
        if (!paras.length) return '<p>&nbsp;</p>';
        return paras.map(p => `<p style="margin-bottom:12px;white-space:pre-wrap">${esc(p)}</p>`).join('');
      }

      function clBodyAttrs(editable) {
        return editable ? ' id="clLetterBody" contenteditable="true" spellcheck="true"' : '';
      }
      function clFieldAttrs(id, editable) {
        if (!editable) return '';
        return ' id="' + id + '" contenteditable="true" spellcheck="false"';
      }

      function clTplClassic(c, o, paras, contact, editable) {
        return `<div class="rf-serif" style="padding:46px 50px;font-size:11.5px;line-height:1.75;background:#fff;min-height:840px;color:#1e293b;box-sizing:border-box">
          <div style="border-bottom:3px solid ${c};padding-bottom:10px;margin-bottom:22px">
            <h1${clFieldAttrs('clHeaderName', editable)} style="font-size:19px;font-weight:800;color:${c};letter-spacing:-.3px;margin-bottom:3px">${esc(o.name || 'Your Name')}</h1>
            ${contact ? `<p${clFieldAttrs('clContactInfo', editable)} style="font-size:9.5px;color:#64748b">${esc(contact)}</p>` : ''}
          </div>
          <p${clFieldAttrs('clDate', editable)} style="font-size:10px;color:#94a3b8;margin-bottom:18px">${esc(o.date)}</p>
          <p${clFieldAttrs('clReTitle', editable)} style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:2px">${o.jobTitle ? `Re: Application for ${esc(o.jobTitle)}` : ''}</p>
          <p${clFieldAttrs('clCompanyLine', editable)} style="font-size:10px;color:#64748b;margin-bottom:18px">${esc(o.company || '')}</p>
          <p${clFieldAttrs('clSalutation', editable)} style="font-size:11.5px;font-weight:700;color:#1e293b;margin-bottom:14px">Dear Hiring Manager,</p>
          <div${clBodyAttrs(editable)}>${paras}</div>
          <p${clFieldAttrs('clClosing', editable)} style="margin-top:20px;font-size:10px;color:#64748b">Sincerely,</p>
          <p${clFieldAttrs('clSigName', editable)} style="font-size:11.5px;font-weight:700;color:#1e293b;margin-top:2px">${esc(o.name || '')}</p>
        </div>`;
      }

      function clTplModern(c, o, paras, contact, editable) {
        return `<div style="font-size:11.5px;background:#f8f7ff;min-height:840px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;box-sizing:border-box">
          <div style="background:${c};color:#fff;padding:32px 40px">
            <h1${clFieldAttrs('clHeaderName', editable)} style="font-size:19px;font-weight:800;margin-bottom:3px">${esc(o.name || 'Your Name')}</h1>
            ${o.resumeTitle ? `<p style="font-size:11px;opacity:.85">${esc(o.resumeTitle)}</p>` : ''}
            ${contact ? `<p${clFieldAttrs('clContactInfo', editable)} style="font-size:9.5px;opacity:.7;margin-top:6px">${esc(contact)}</p>` : ''}
          </div>
          <div style="padding:30px 40px;line-height:1.75">
            <p${clFieldAttrs('clDate', editable)} style="font-size:10px;color:#94a3b8;margin-bottom:4px">${esc(o.date)}</p>
            <p${clFieldAttrs('clReTitle', editable)} style="font-size:10px;color:#94a3b8;margin-bottom:18px">${[o.jobTitle ? `Re: ${o.jobTitle}` : '', o.company].filter(Boolean).join(' · ')}</p>
            <p${clFieldAttrs('clSalutation', editable)} style="font-size:11.5px;font-weight:700;color:#1e293b;margin-bottom:14px">Dear Hiring Manager,</p>
            <div${clBodyAttrs(editable)}>${paras}</div>
            <p${clFieldAttrs('clClosing', editable)} style="margin-top:20px;font-size:10px;color:#94a3b8">Yours sincerely,</p>
            <p${clFieldAttrs('clSigName', editable)} style="font-size:11.5px;font-weight:700;color:${c};margin-top:2px">${esc(o.name || '')}</p>
          </div>
        </div>`;
      }

      function clTplExecutive(c, o, paras, contact, editable) {
        return `<div class="rf-serif" style="display:flex;min-height:840px;background:#fff;font-size:11.5px;color:#1e293b;box-sizing:border-box">
          <div style="width:6px;background:${c};flex-shrink:0"></div>
          <div style="flex:1;padding:46px 50px;line-height:1.75">
            <h1${clFieldAttrs('clHeaderName', editable)} style="font-size:19px;font-weight:800;margin-bottom:3px">${esc(o.name || 'Your Name')}</h1>
            ${o.resumeTitle ? `<p style="font-size:10.5px;color:#64748b;margin-bottom:10px">${esc(o.resumeTitle)}</p>` : '<div style="margin-bottom:10px"></div>'}
            <div style="border-top:1px solid #1e293b"></div>
            <div style="border-top:1px solid #e2e8f0;margin-bottom:12px"></div>
            ${contact ? `<p${clFieldAttrs('clContactInfo', editable)} style="font-size:9.5px;color:#94a3b8;margin-bottom:8px">${esc(contact)}</p>` : ''}
            <p${clFieldAttrs('clDate', editable)} style="font-size:10px;color:#64748b;margin-bottom:18px">${esc(o.date)}</p>
            <p${clFieldAttrs('clReTitle', editable)} style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:2px">${o.jobTitle ? `Re: Application for ${esc(o.jobTitle)}` : ''}</p>
            <p${clFieldAttrs('clCompanyLine', editable)} style="font-size:10px;color:#64748b;margin-bottom:18px">${esc(o.company || '')}</p>
            <p${clFieldAttrs('clSalutation', editable)} style="font-size:11.5px;font-weight:700;margin-bottom:14px">Dear Hiring Manager,</p>
            <div${clBodyAttrs(editable)}>${paras}</div>
            <p${clFieldAttrs('clClosing', editable)} style="margin-top:20px;font-size:10px;color:#64748b">Respectfully yours,</p>
            <p${clFieldAttrs('clSigName', editable)} style="font-size:11.5px;font-weight:700;margin-top:2px">${esc(o.name || '')}</p>
          </div>
        </div>`;
      }

      function clTplMinimal(c, o, paras, contact, editable) {
        return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;padding:50px 54px;background:#fafafa;min-height:840px;font-size:11.5px;color:#111827;line-height:1.8;box-sizing:border-box">
          <h1${clFieldAttrs('clHeaderName', editable)} style="font-size:21px;font-weight:300;letter-spacing:-.5px;margin-bottom:4px">${esc(o.name || 'Your Name')}</h1>
          ${contact ? `<p${clFieldAttrs('clContactInfo', editable)} style="font-size:9.5px;color:#9ca3af">${esc(contact)}</p>` : ''}
          <div style="border-top:1px solid #f3f4f6;margin:18px 0"></div>
          <p${clFieldAttrs('clDate', editable)} style="font-size:10px;color:#9ca3af;margin-bottom:4px">${esc(o.date)}</p>
          <p${clFieldAttrs('clReTitle', editable)} style="font-size:10px;color:#9ca3af;margin-bottom:18px">${[o.jobTitle ? `Re: ${o.jobTitle}` : '', o.company].filter(Boolean).join(' · ')}</p>
          <p${clFieldAttrs('clSalutation', editable)} style="font-size:11.5px;font-weight:700;margin-bottom:14px">Dear Hiring Manager,</p>
          <div${clBodyAttrs(editable)}>${paras}</div>
          <p${clFieldAttrs('clClosing', editable)} style="margin-top:20px;font-size:10px;color:#9ca3af">Best regards,</p>
          <p${clFieldAttrs('clSigName', editable)} style="font-size:11.5px;font-weight:700;margin-top:2px">${esc(o.name || '')}</p>
        </div>`;
      }

      function clBuildPage(tpl, o, editable) {
        const c     = CL_TPL_ACCENTS[tpl] || CL_TPL_ACCENTS.classic;
        const paras = clParasHTML(o.letter);
        const contact = [o.email, o.phone, o.location].filter(Boolean).join('  ·  ');
        if (tpl === 'modern')    return clTplModern(c, o, paras, contact, editable);
        if (tpl === 'executive') return clTplExecutive(c, o, paras, contact, editable);
        if (tpl === 'minimal')   return clTplMinimal(c, o, paras, contact, editable);
        return clTplClassic(c, o, paras, contact, editable);
      }

      function clCurrentOpts(letter) {
        const resume = window._clCurrentResume;
        return {
          name:       resume?.resumeData?.fullName || '',
          email:      resume?.resumeData?.email    || '',
          phone:      resume?.resumeData?.phone    || '',
          location:   resume?.resumeData?.location || '',
          resumeTitle: resume?.resumeData?.jobTitle || '',
          jobTitle:   window._clCurrentJobTitle || '',
          company:    window._clCurrentCompany  || '',
          date:       new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          letter:     letter,
        };
      }

      // Render the generated letter as a smaller A4-style page, scaled to fit its card
      function clRenderPreview(letter) {
        const tpl    = window._clCurrentTemplate || 'classic';
        const scaler = g('clPrevScaler');
        if (!scaler) return;
        scaler.innerHTML = clBuildPage(tpl, clCurrentOpts(letter), true);
        scaleClPreview();
      }

      function scaleClPreview() {
        const wrap   = g('clPrevWrap');
        const scaler = g('clPrevScaler');
        if (!wrap || !scaler) return;
        const w = wrap.offsetWidth || 300;
        const scale = w / 600;
        scaler.style.transform = 'scale(' + scale + ')';
        wrap.style.height = Math.round(scale * 840) + 'px';
      }
      window.addEventListener('resize', () => {
        if (g('v-coverletter')?.classList.contains('active')) scaleClPreview();
      });

      window.clRegenerate = async function() {
        const jobTitle    = window._clCurrentJobTitle || (g('clJobTitle')?.value || '').trim();
        const companyName = window._clCurrentCompany  || (g('clCompanyName')?.value || '').trim();
        if (!jobTitle || !companyName) return;
        const result = g('clGenResult');
        if (result) result.style.display = 'none';
        await clGenerate(jobTitle, companyName);
      };

      window.clDownloadPDF = function() {
        // Use the live preview DOM directly — captures ALL user edits in every field
        const scaler = g('clPrevScaler');
        if (!scaler || !scaler.innerHTML.trim()) {
          toast('Generate a cover letter first', 'err');
          return;
        }

        // Clone and strip contenteditable/spellcheck so print is clean
        const clone = scaler.cloneNode(true);
        clone.querySelectorAll('[contenteditable]').forEach(el => {
          el.removeAttribute('contenteditable');
          el.removeAttribute('spellcheck');
        });
        // Remove any hover/focus inline background that may be stuck
        clone.querySelectorAll('[style*="background:rgba(124,58,237"]').forEach(el => {
          el.style.background = '';
          el.style.boxShadow = '';
          el.style.borderRadius = '';
        });

        // The design is built for a 600px virtual canvas (same one the on-screen
        // preview scales down to fit its card). Rather than always scaling up by
        // the same fixed amount (which is what caused a slightly longer letter to
        // spill onto an unwanted near-empty 2nd page), we compute the LARGEST
        // scale that still guarantees the whole letter fits on one page — short
        // letters get scaled up more to fill the page nicely, longer letters get
        // scaled up less so they still comfortably fit. Never shrunk below native
        // size; a letter would only ever fall back to normal pagination if it's
        // genuinely too long even at full native size, which shouldn't happen
        // for a real cover letter.
        const measureHost = document.createElement('div');
        measureHost.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px';
        measureHost.appendChild(clone);
        document.body.appendChild(measureHost);
        const naturalHeight = clone.scrollHeight || 840; // at 600px reference width
        document.body.removeChild(measureHost);

        const TARGET_WIDTH_PX    = 780;  // ideal max content width ≈8.1in, for short letters
        const MARGIN_IN          = 0.2;  // slim, even margin on every side
        const STD_PAGE_HEIGHT_IN = 11;   // US Letter height — our one-page ceiling
        const MIN_SCALE          = 1.0;  // never shrink below the design's native size

        const widthScale  = TARGET_WIDTH_PX / 600;
        const maxHeightPx = (STD_PAGE_HEIGHT_IN - MARGIN_IN * 2) * 96;
        const heightScale = maxHeightPx / naturalHeight;

        let scale = Math.min(widthScale, heightScale);
        const fitsOnePage = scale >= MIN_SCALE;
        if (!fitsOnePage) scale = MIN_SCALE;

        const scaledWidthPx  = Math.round(600 * scale);
        const scaledHeightPx = Math.ceil(naturalHeight * scale);
        const scaledWidthIn  = scaledWidthPx / 96;
        const scaledHeightIn = scaledHeightPx / 96;

        const pageSizeCSS = fitsOnePage
          ? (scaledWidthIn + MARGIN_IN * 2).toFixed(2) + 'in ' + (scaledHeightIn + MARGIN_IN * 2).toFixed(2) + 'in'
          : 'auto';

        const html = '<div style="width:' + scaledWidthPx + 'px;height:' + scaledHeightPx + 'px;margin:0 auto">'
          + '<div style="width:600px;transform:scale(' + scale + ');transform-origin:top left">' + clone.innerHTML + '</div>'
          + '</div>';

        const company = window._clCurrentCompany || '';
        const title = ('Cover Letter' + (company ? ' - ' + company : '')).replace(/[<>]/g, '');
        const fullDoc = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>' + title + '</title>'
          + '<link rel="preconnect" href="https://fonts.googleapis.com">'
          + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
          + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">'
          + '<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
          + 'html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0;width:100%}'
          + '.rf-sans{font-family:"Inter",system-ui,-apple-system,sans-serif}'
          + '.rf-serif{font-family:Georgia,"Times New Roman",serif}'
          + '@media print{@page{size:' + pageSizeCSS + ';margin:' + MARGIN_IN + 'in}html,body{margin:0;padding:0;width:100%}}</style>'
          + '</head><body>' + html + '</body></html>';

        _kieShowDownloadOverlay('Preparing your cover letter PDF…');

        // PRIMARY: hidden iframe
        try {
          const ifrEl = document.createElement('iframe');
          ifrEl.style.cssText = 'position:fixed;width:0;height:0;border:0;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
          document.body.appendChild(ifrEl);
          const iDoc = ifrEl.contentDocument || ifrEl.contentWindow.document;
          iDoc.open(); iDoc.write(fullDoc); iDoc.close();
          setTimeout(function() {
            try { ifrEl.contentWindow.focus(); ifrEl.contentWindow.print(); } catch(pe) {}
            _kieHideDownloadOverlay();
            setTimeout(function() { try { document.body.removeChild(ifrEl); } catch(e) {} }, 60000);
          }, 600);
          toast('Print dialog opening — choose "Save as PDF"');
          return;
        } catch(e) { _kieHideDownloadOverlay(); /* fall through */ }

        // FALLBACK
        const blob = new Blob([fullDoc], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        const printWin = window.open(url, '_blank');
        if (!printWin) {
          _kieHideDownloadOverlay();
          const a = document.createElement('a');
          a.href = url; a.download = title + '.html';
          a.style.display = 'none'; document.body.appendChild(a);
          a.click(); document.body.removeChild(a);
          toast('Cover letter saved to Downloads — open it and print as PDF');
          return;
        }
        printWin.onload = function() { setTimeout(function() { printWin.focus(); printWin.print(); _kieHideDownloadOverlay(); }, 600); };
        toast('Choose "Save as PDF" in the print dialog');
      };

      // Init cover letter view
      function initCoverLetter(fromResumeId) {
        // Reset state
        clSource = null; clResume = null; clUploadFile = null; clTemplate = null;
        window._clCurrentLetter = null; window._clCurrentTemplate = null;
        window._clCurrentJobTitle = null; window._clCurrentCompany = null;
        document.querySelectorAll('.cl-src-card').forEach(c => c.classList.remove('sel'));
        document.querySelectorAll('.cl-tcard').forEach(c => c.classList.remove('sel'));
        const rp = g('clResPicker');   if (rp) rp.className = 'cl-res-picker';
        const uz = g('clUploadZone');  if (uz) { uz.className = 'cl-upload-zone'; uz.style.opacity = ''; }
        const ur = g('clUploadReady'); if (ur) ur.classList.remove('show');
        const fi = g('clFileInput');   if (fi) fi.value = '';
        const jt = g('clJobTitle');    if (jt) jt.value = '';
        const cn = g('clCompanyName'); if (cn) cn.value = '';
        const gl = g('clGenLoading'); if (gl) gl.style.display = 'none';
        const gr = g('clGenResult');  if (gr) gr.style.display = 'none';
        const ps = g('clPrevScaler'); if (ps) ps.innerHTML = '';
        const b1 = g('clNextBtn1');    if (b1) b1.disabled = true;
        const b2 = g('clNextBtn2');    if (b2) b2.disabled = true;
        clUpdateSteps(1);

        // If coming from a specific resume, pre-select it
        if (fromResumeId) {
          clFromSuccessId = fromResumeId;
          const r = resumes.find(r => r.id === fromResumeId);
          if (r) {
            setTimeout(() => {
              clSelectSource('existing');
              clSelectResume(fromResumeId);
            }, 80);
          }
        } else {
          clFromSuccessId = null;
        }
      }

      // Back button for cover letter
      const clBackBtnEl = g('clBackBtn');
      if (clBackBtnEl) clBackBtnEl.onclick = () => showView('home');

      // From success screen
      window.startCoverLetterFromResume = function() {
        if (!isFeatureUnlocked('coverLetterFromResume')) {
          lockTapped('coverLetter');
          return;
        }
        const rid = editId || null;
        loadResumes().then(() => {
          showView('coverletter');
          initCoverLetter(rid);
        });
      };

      // Register in showView hook — init when navigating directly to cover letter
      const _clOrigShowView = window.showView;
      window.showView = function(v) {
        _clOrigShowView?.apply(this, arguments);
        if (v === 'coverletter') {
          loadResumes().then(() => initCoverLetter(clFromSuccessId));
        }
      };

      // ── END COVER LETTER LOGIC ────────────────────────────────────────────────

      // ── JOB MATCH ANALYZER ────────────────────────────────────────────────────
      let rsLetterTone = 'professional';
      window.rsSetTone = function(el) {
        rsLetterTone = el.dataset.rst;
        document.querySelectorAll('[data-rst]').forEach(b => b.classList.remove('active'));
        el.classList.add('active');
      };

      populateResumePicker('jmResumePicker');

      window.runJobMatch = async function() {
        const jd = (g('jmJobDesc')?.value || '').trim();
        if (!jd || jd.length < 50) { toast('Please paste a job description (at least 50 characters).', 'err'); return; }
        ctoolLoading('jobmatchLoading', 'jobmatchBtn', true);
        ctoolResult('jobmatchResult', false);
        const rid = g('jmResumePicker')?.value || '';
        const resume = rid ? getResumeById(rid) : null;
        const statMsgs = ['Scanning job requirements…', 'Comparing against your profile…', 'Calculating match score…', 'Identifying skill gaps…'];
        let si = 0;
        const si_int = setInterval(() => { const s = g('jobmatchStatus'); if(s) s.textContent = statMsgs[++si % statMsgs.length]; }, 1800);
        try {
          const r = await fetch('/api/job-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({ jobDescription: jd, resumeData: resume?.resumeData || null, model: kieModel })
          });
          clearInterval(si_int);
          if (!r.ok) throw new Error((await r.json()).error || 'Failed');
          const data = await r.json();
          renderJobMatch(data);
          ctoolLoading('jobmatchLoading', 'jobmatchBtn', false);
          ctoolResult('jobmatchResult', true);
        } catch(err) {
          clearInterval(si_int);
          ctoolLoading('jobmatchLoading', 'jobmatchBtn', false);
          toast('Error: ' + err.message, 'err');
        }
      };

      function renderJobMatch(d) {
        const el = g('jobmatchResult'); if (!el) return;
        window._kieToolData.jobmatch = d;
        const score = d.matchScore || 0;
        const sc = scoreColor(score);
        const circum = 2 * Math.PI * 52;
        const dash = circum - (score / 100) * circum;
        el.innerHTML = `
          <div class="ctool-card">
            <div class="score-ring-wrap">
              <svg class="score-ring-svg" width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" stroke-width="10"/>
                <circle cx="60" cy="60" r="52" fill="none" stroke="${sc}" stroke-width="10" stroke-dasharray="${circum}" stroke-dashoffset="${dash}" stroke-linecap="round"/>
              </svg>
              <div style="margin-top:-88px;text-align:center;z-index:1;position:relative">
                <div class="score-ring-val" style="color:${sc}">${score}</div>
                <div style="font-size:11px;color:var(--sub)">${esc(d.matchLevel || 'Match Score')}</div>
              </div>
              <div style="margin-top:72px;text-align:center;padding:0 16px"><div style="font-size:13px;color:var(--sub);line-height:1.5">${esc(d.summary || '')}</div></div>
            </div>
          </div>
          ${mkTakeaway(d.youTakeaway)}
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#059669;margin-bottom:8px">✅ Matching Strengths</div>${mkListItems(d.matchingSkills)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:8px">⚠️ Missing Skills / Gaps</div>${mkListItems(d.missingSkills)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--p);margin-bottom:6px">🔑 Key Keywords to Add</div>${mkTags(d.keywordsToAdd)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">📌 Application Tips</div>${mkListItems(d.tips)}</div>
          ${mkDownloadBtn('jobmatch')}`;
      }

      // ── RESIGNATION LETTER ─────────────────────────────────────────────────────
      window.runResignation = async function() {
        const role = (g('rsCurrentRole')?.value || '').trim();
        const company = (g('rsCompany')?.value || '').trim();
        if (!role || !company) { toast('Please enter your role and company name.', 'err'); return; }
        ctoolLoading('resignationLoading', 'resignationBtn', true);
        ctoolResult('resignationResult', false);
        try {
          const r = await fetch('/api/resignation-letter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
            body: JSON.stringify({
              currentRole: role,
              company,
              noticePeriod: g('rsNotice')?.value || '2 weeks',
              reason: g('rsReason')?.value || '',
              tone: rsLetterTone,
              model: kieModel
            })
          });
          if (!r.ok) throw new Error((await r.json()).error || 'Failed');
          const data = await r.json();
          renderResignation(data);
          ctoolLoading('resignationLoading', 'resignationBtn', false);
          ctoolResult('resignationResult', true);
        } catch(err) {
          ctoolLoading('resignationLoading', 'resignationBtn', false);
          toast('Error: ' + err.message, 'err');
        }
      };

      function renderResignation(d) {
        const el = g('resignationResult'); if (!el) return;
        window._kieToolData.resignation = d;
        // Text lives in a data-* attribute (HTML-escaped by esc()) rather than
        // inlined into the onclick JS string — so quotes/apostrophes/newlines
        // in AI-generated content can never break out of the attribute and
        // render as raw visible text (the "Copied!').catch(()=>{})" bug).
        const copyAll = (txt) => `<button data-copy="${esc(txt)}" data-label="Copy Letter" onclick="kieCopyBtnClick(this)" style="font-size:10px;font-weight:700;color:var(--p);background:#f5f3ff;border:1px solid var(--p2);border-radius:99px;padding:3px 10px;cursor:pointer;font-family:inherit">Copy Letter</button>`;
        el.innerHTML = `
          <div class="ctool-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <div style="font-size:13px;font-weight:800;color:var(--txt)">📄 Your Resignation Letter</div>
              ${copyAll(d.letter || '')}
            </div>
            <div style="font-size:13px;color:var(--txt);line-height:1.75;white-space:pre-line;background:#faf9ff;border:1.5px solid var(--border2);border-radius:12px;padding:18px">${esc(d.letter || '')}</div>
          </div>
          ${mkTakeaway(d.youTakeaway)}
          ${d.tips ? `<div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">💡 Tips for a Smooth Exit</div>${mkListItems(d.tips)}</div>` : ''}
          ${mkDownloadBtn('resignation','Download PDF Copy')}`;
      }

      // ── REGISTER NEW TOOLS IN toolBars ─────────────────────────────────────────
      // (These wire up the KIE action bars for the new tools)
      // Done via the watchToolResults loop already — see toolBars array below in sidebar script

      // ── Tool-quality "switch model" nudges — removed ───────────────────────────
      // These used to claim that switching your KIE chat model would improve
      // output quality on a given tool (e.g. "KIE Nova creates richer resumes").
      // That's no longer true: every tool endpoint always runs on Groq Spark
      // regardless of which model is selected for chat. Keeping that messaging
      // around would mislead paying users into thinking their plan/model choice
      // changes tool output when it doesn't. Stubs kept so existing call sites
      // below don't need to be touched one by one.
      function showModelSuggestion() {}
      function refreshModelSuggestionBanners() {}

      // ── SHARED HELPERS ─────────────────────────────────────────────────────────
      function ctoolLoading(loadId, btnId, show) {
        const l = g(loadId), b = g(btnId);
        if (l) l.style.display = show ? 'block' : 'none';
        if (b) b.disabled = show;
      }
      function ctoolResult(resultId, show) {
        const r = g(resultId);
        if (r) r.style.display = show ? 'block' : 'none';
      }
      function fmtUSD(n) { return '$' + Number(n).toLocaleString(); }
      function scoreBg(s) { return s>=85?'#d1fae5':s>=70?'#dbeafe':s>=50?'#fef3c7':'#fee2e2'; }
      function scoreColor(s) { return s>=85?'#059669':s>=70?'#1d4ed8':s>=50?'#d97706':'#dc2626'; }
      function mkListItems(arr) { return (arr||[]).map(i=>`<div class="ctool-list-item"><div class="ctool-list-dot"></div><div class="ctool-list-txt">${esc(String(i))}</div></div>`).join(''); }
      function mkTags(arr, bg='#f5f3ff', color='#7c3aed') { return (arr||[]).map(t=>`<span class="ctool-tag" style="background:${bg};color:${color};margin:2px 4px 2px 0">${esc(String(t))}</span>`).join(''); }
      window.mkListItems = mkListItems;
      window.mkTags = mkTags;

      // ── "WHAT THIS MEANS FOR YOU" TAKEAWAY BANNER ──────────────────────────────
      function mkTakeaway(text, icon='💡') {
        if(!text) return '';
        return `<div class="ctool-card" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:1.5px solid var(--p2)">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <div style="font-size:20px;line-height:1.2">${icon}</div>
            <div>
              <div style="font-size:10px;font-weight:800;color:var(--p);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">What This Means For You</div>
              <div style="font-size:13px;color:var(--txt);line-height:1.6">${esc(text)}</div>
            </div>
          </div>
        </div>`;
      }
      window.mkTakeaway = mkTakeaway;

      // ── BRANDED PDF REPORTS — shared shell + builders for the 9 report tools ──
      function mkDownloadBtn(key, label='Download PDF Report') {
        return `<button class="ctool-btn" style="margin-top:2px" onclick="downloadToolPDF('${key}')">⬇️ ${label}</button>`;
      }
      window.mkDownloadBtn = mkDownloadBtn;

      function repCard(html, accent) { return `<div class="rep-card${accent?' rep-card-accent':''}">${html}</div>`; }
      function repTitle(text, color) { return `<div class="rep-sec-title"${color?` style="color:${color}"`:''}>${esc(text)}</div>`; }
      function repList(arr) { return `<ul class="rep-list">${(arr||[]).map(i=>`<li>${esc(String(i))}</li>`).join('')}</ul>`; }
      function repTags(arr, bg='#f5f3ff', color='#6d28d9') { return `<div class="rep-tags">${(arr||[]).map(t=>`<span class="rep-tag" style="background:${bg};color:${color}">${esc(String(t))}</span>`).join('')}</div>`; }
      function repScoreRow(score, label) {
        const c = scoreColor(score||0);
        return `<div class="rep-score-row"><div class="rep-score-num" style="color:${c}">${score||0}</div><div class="rep-score-bar-wrap"><div class="rep-score-bar" style="width:${score||0}%;background:${c}"></div></div>${label?`<div class="rep-score-label">${esc(label)}</div>`:''}</div>`;
      }
      function repTakeaway(text) {
        if(!text) return '';
        return `<div class="rep-takeaway"><div class="rep-takeaway-label">What This Means For You</div><div class="rep-takeaway-txt">${esc(text)}</div></div>`;
      }
      function repQuote(text) { return `<div class="rep-quote">${esc(text||'')}</div>`; }

      const REP_CSS = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:#f8f7ff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:'Inter',system-ui,-apple-system,sans-serif;color:#0f0e17}
.rep-page{max-width:760px;margin:0 auto;background:#fff}
.rep-header{background:linear-gradient(135deg,#7c3aed,#a855f7);padding:36px 40px 28px;color:#fff}
.rep-logo{font-size:21px;font-weight:900;letter-spacing:-.5px}
.rep-logo-tag{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:.75;margin:2px 0 22px}
.rep-title{font-size:26px;font-weight:900;letter-spacing:-.5px;line-height:1.2}
.rep-subtitle{font-size:13px;opacity:.85;margin-top:6px}
.rep-body{padding:28px 40px 10px}
.rep-card{background:#fff;border:1.5px solid #ede9fe;border-radius:14px;padding:18px 20px;margin-bottom:16px;page-break-inside:avoid}
.rep-card-accent{background:linear-gradient(135deg,#1e0845,#3b1a7a);color:#fff;border:none}
.rep-card-accent .rep-sec-title{color:#fff}
.rep-sec-title{font-size:13px;font-weight:800;color:#0f0e17;margin-bottom:10px}
.rep-list{list-style:none}
.rep-list li{font-size:12.5px;line-height:1.6;color:#1f2937;padding:6px 0 6px 18px;position:relative;border-bottom:1px solid #f5f3ff}
.rep-list li:last-child{border-bottom:none}
.rep-list li::before{content:'';position:absolute;left:0;top:13px;width:6px;height:6px;border-radius:50%;background:#7c3aed}
.rep-tags{display:flex;flex-wrap:wrap;gap:6px}
.rep-tag{display:inline-flex;padding:4px 11px;border-radius:99px;font-size:11px;font-weight:700}
.rep-score-row{display:flex;align-items:center;gap:12px;margin:6px 0}
.rep-score-num{font-size:20px;font-weight:900;width:38px;text-align:right;flex-shrink:0}
.rep-score-bar-wrap{flex:1;height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden}
.rep-score-bar{height:100%;border-radius:99px}
.rep-score-label{font-size:11.5px;color:#64748b;width:140px;flex-shrink:0}
.rep-takeaway{background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:1.5px solid #c4b5fd;border-radius:14px;padding:18px 20px;margin-bottom:16px}
.rep-takeaway-label{font-size:10px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px}
.rep-takeaway-txt{font-size:13px;line-height:1.65;color:#1f2937}
.rep-quote{font-size:13px;color:#4b5563;line-height:1.7;font-style:italic;border-left:3px solid #7c3aed;padding-left:14px}
.rep-footer{padding:24px 40px 40px;border-top:1px solid #ede9fe;margin-top:8px}
.rep-footer-brand{font-size:11px;font-weight:800;color:#7c3aed;margin-bottom:6px}
.rep-footer-note{font-size:10.5px;color:#94a3b8;line-height:1.6}
@media print{
  @page{size:auto;margin:10mm 8mm}
  html,body{background:#fff;width:100%}
  .rep-page{max-width:100%;width:100%;margin:0;box-shadow:none}
  .rep-header{padding:24px 28px 20px}
  .rep-body{padding:20px 28px 8px}
  .rep-footer{padding:16px 28px 24px}
  .rep-card{box-shadow:none;border-radius:8px}
}`;

      function kieReportShell(title, subtitle, bodyHtml) {
        const today = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
        return `<div class="rep-page">
          <div class="rep-header">
            <div class="rep-logo">Kievora</div>
            <div class="rep-logo-tag">AI Career Platform</div>
            <div class="rep-title">${esc(title)}</div>
            ${subtitle?`<div class="rep-subtitle">${esc(subtitle)}</div>`:''}
          </div>
          <div class="rep-body">${bodyHtml}</div>
          <div class="rep-footer">
            <div class="rep-footer-brand">Generated by Kievora — ${today}</div>
            <div class="rep-footer-note">This report is AI-generated guidance based on the information you provided. Use it as a starting point alongside your own judgment.</div>
          </div>
        </div>`;
      }

      window.downloadKieReport = function(title, subtitle, bodyHtml) {
        const fullTitle = (title + ' — Kievora').replace(/[<>]/g,'');
        const html = kieReportShell(title, subtitle, bodyHtml);
        const fullDoc = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>'+fullTitle+'</title>'
          + '<link rel="preconnect" href="https://fonts.googleapis.com">'
          + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
          + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
          + '<style>'+REP_CSS+'</style>'
          + '</head><body>'+html+'</body></html>';

        _kieShowDownloadOverlay('Preparing your ' + title + ' report…');

        // PRIMARY: hidden iframe — no popup blocker on mobile
        try {
          const ifrEl = document.createElement('iframe');
          ifrEl.style.cssText = 'position:fixed;width:0;height:0;border:0;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
          document.body.appendChild(ifrEl);
          const iDoc = ifrEl.contentDocument || ifrEl.contentWindow.document;
          iDoc.open(); iDoc.write(fullDoc); iDoc.close();
          setTimeout(function() {
            try { ifrEl.contentWindow.focus(); ifrEl.contentWindow.print(); } catch(pe) {}
            _kieHideDownloadOverlay();
            setTimeout(function() { try { document.body.removeChild(ifrEl); } catch(e) {} }, 60000);
          }, 700);
          toast('Print dialog opening — choose "Save as PDF"');
          return;
        } catch(e) { _kieHideDownloadOverlay(); /* fall through */ }

        // FALLBACK: blob URL new tab
        const blob = new Blob([fullDoc], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        const printWin = window.open(url, '_blank');
        if (!printWin) {
          _kieHideDownloadOverlay();
          const a = document.createElement('a');
          a.href = url; a.download = fullTitle + '.html';
          a.style.display = 'none'; document.body.appendChild(a);
          a.click(); document.body.removeChild(a);
          toast('Report saved to Downloads — open it and print as PDF');
          return;
        }
        printWin.onload = function() { setTimeout(function(){ printWin.focus(); printWin.print(); _kieHideDownloadOverlay(); }, 600); };
        toast('Choose "Save as PDF" in the print dialog');
      };

      // ── Per-tool report bodies ──────────────────────────────────────────────
      function buildCareerHealthReport(d) {
        const bd = d.breakdown||{};
        const bdKeys = ['resumeQuality','skillRelevance','marketDemand','interviewReadiness','brandStrength','salaryPositioning'];
        const bdLabels = ['Resume Quality','Skill Relevance','Market Demand','Interview Readiness','Brand Strength','Salary Positioning'];
        return repCard(`${repTitle('Overall Career Health')}
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px"><div style="font-size:44px;font-weight:900">${d.overallScore||0}</div><div style="font-size:14px;opacity:.85">/ 100 · Grade ${esc(d.grade||'')}</div></div>
          <div style="font-size:14px;font-weight:700;opacity:.92">${esc(d.headline||'')}</div>`, true)
          + repTakeaway(d.youTakeaway)
          + repCard(`${repTitle('Score Breakdown')}${bdKeys.map((k,i)=>{const item=bd[k]||{}; return repScoreRow(item.score, bdLabels[i]) + (item.feedback?`<div style="font-size:11.5px;color:#64748b;margin:-2px 0 12px 50px">${esc(item.feedback)}</div>`:'');}).join('')}`)
          + repCard(`${repTitle('Top Strengths','#059669')}${repList(d.topStrengths)}`)
          + repCard(`${repTitle('Critical Gaps','#dc2626')}${repList(d.criticalGaps)}`)
          + repCard(`${repTitle('Quick Wins This Week','#d97706')}${repList(d.quickWins)}`)
          + repCard(`${repTitle('Strategic Actions','#7c3aed')}${repList(d.strategicActions)}`)
          + repCard(`${repTitle('Verdict')}${repQuote(d.verdict)}`);
      }

      function buildRoadmapReport(rm) {
        return repCard(`${repTitle(rm.title||'Your Career Roadmap')}
          <div style="font-size:12px;opacity:.8;margin-bottom:8px">${esc(rm.timeframe||'')} · ${rm.totalPhases||(rm.phases||[]).length} phases</div>
          <div style="font-size:13px;opacity:.9;line-height:1.6">${esc(rm.summary||'')}</div>`, true)
          + repTakeaway(rm.youTakeaway)
          + (rm.phases||[]).map(p=>repCard(`
              <div class="rep-sec-title">Phase ${p.id||''}: ${esc(p.label||'')} <span style="font-size:11px;color:#64748b;font-weight:600">— ${esc(p.duration||'')}</span></div>
              <div style="font-size:12px;color:#7c3aed;font-weight:700;margin-bottom:10px">${esc(p.focus||'')}</div>
              <div style="font-size:10.5px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Goals</div>${repList(p.goals)}
              <div style="font-size:10.5px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 4px">Actions</div>${repList(p.actions)}
              ${p.milestones?.length?`<div style="font-size:10.5px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 4px">Milestones</div>${repList(p.milestones)}`:''}
              ${p.resources?.length?`<div style="margin-top:10px">${repTags(p.resources,'#f0fdf4','#059669')}</div>`:''}`)).join('');
      }

      function buildSalaryReport(d) {
        const range = d.salaryRange||{};
        return repCard(`${repTitle(`${d.jobTitle||''} — ${d.location||''}`)}
          <div style="font-size:36px;font-weight:900">${fmtUSD(range.mid||0)}<span style="font-size:14px;font-weight:600;opacity:.8"> / yr median</span></div>
          <div style="font-size:12px;opacity:.85;margin-top:6px">Range: ${fmtUSD(range.min||0)} – ${fmtUSD(range.max||0)} · ${esc(d.demandLevel||'')} Demand · ${esc(d.demandTrend||'')}</div>`, true)
          + repTakeaway(d.youTakeaway)
          + repCard(`${repTitle('Forecast')}<div style="display:flex;gap:28px">
              <div style="margin-right:28px"><div style="font-size:20px;font-weight:900;color:#7c3aed">${fmtUSD(d.forecast?.oneYear||0)}</div><div style="font-size:11px;color:#64748b">In 1 Year</div></div>
              <div><div style="font-size:20px;font-weight:900;color:#7c3aed">${fmtUSD(d.forecast?.threeYear||0)}</div><div style="font-size:11px;color:#64748b">In 3 Years</div></div>
            </div>`)
          + repCard(`${repTitle('Top Paying Industries')}${repTags(d.topPayingIndustries)}`)
          + repCard(`${repTitle('Top Paying Locations')}${repTags(d.topPayingLocations,'#dbeafe','#1d4ed8')}`)
          + repCard(`${repTitle('Negotiation Script')}${repQuote(d.negotiationScript)}`)
          + repCard(`${repTitle('Key Salary Factors')}${repList(d.keyFactors)}`)
          + repCard(`${repTitle('Market Insights')}<div style="font-size:12.5px;color:#1f2937;line-height:1.65">${esc(d.insights||'')}</div>${d.remoteImpact?`<div style="font-size:11.5px;color:#64748b;margin-top:8px"><strong>Remote work impact:</strong> ${esc(d.remoteImpact)}</div>`:''}`);
      }

      function buildIndustryReport(d) {
        return repCard(`${repTitle(`${d.industry||''} Industry`)}
          <div style="font-size:12px;opacity:.85;margin-bottom:8px">${esc(d.outlook||'')} Outlook · ${esc(d.growthRate||'')} growth · ${esc(d.marketSize||'')}</div>
          <div style="font-size:13px;opacity:.9;line-height:1.6">${esc(d.summary||'')}</div>`, true)
          + repTakeaway(d.youTakeaway)
          + repCard(`${repTitle('Top Trends')}${repList(d.topTrends)}`)
          + repCard(`${repTitle('Growing Roles','#059669')}${repTags(d.growingRoles,'#f0fdf4','#059669')}`)
          + repCard(`${repTitle('Declining Roles','#dc2626')}${repTags(d.decliningRoles,'#fee2e2','#dc2626')}`)
          + repCard(`${repTitle('Hot Skills')}${repTags(d.hotSkills)}`)
          + repCard(`${repTitle('Emerging Technologies')}${repTags(d.emergingTechnologies,'#dbeafe','#1d4ed8')}`)
          + repCard(`${repTitle('Predictions')}${repList(d.predictions)}`)
          + repCard(`${repTitle('Opportunities','#059669')}${repList(d.opportunities)}`)
          + repCard(`${repTitle('Threats','#dc2626')}${repList(d.threats)}`)
          + repCard(`${repTitle('Top Companies Hiring')}${repTags(d.topCompanies,'#fef3c7','#d97706')}`);
      }

      function buildLinkedInReport(d) {
        return repCard(`${repTitle('LinkedIn Profile Scorecard')}
          <div style="display:flex;gap:28px;margin-top:8px">
            <div style="margin-right:28px"><div style="font-size:28px;font-weight:900">${d.visibilityScore||0}</div><div style="font-size:11px;opacity:.8">Visibility Score</div></div>
            <div><div style="font-size:28px;font-weight:900">${d.recruiterScore||0}</div><div style="font-size:11px;opacity:.8">Recruiter Score</div></div>
          </div>`, true)
          + repTakeaway(d.youTakeaway)
          + repCard(`${repTitle('Optimized Headline')}<div style="font-size:14px;font-weight:700;color:#7c3aed;line-height:1.5;margin-bottom:6px">${esc(d.optimizedHeadline||'')}</div><div style="font-size:11.5px;color:#64748b">${esc(d.headlineFeedback||'')}</div>`)
          + repCard(`${repTitle('Optimized About')}<div style="font-size:12.5px;color:#1f2937;line-height:1.7;white-space:pre-line">${esc(d.optimizedAbout||'')}</div><div style="font-size:11.5px;color:#64748b;margin-top:8px">${esc(d.aboutFeedback||'')}</div>`)
          + repCard(`${repTitle('Missing Keywords','#dc2626')}${repTags(d.keywordGaps,'#fee2e2','#dc2626')}`)
          + repCard(`${repTitle('Skills to Add')}${repTags(d.skillsToAdd)}`)
          + repCard(`${repTitle('Profile Improvement Tips')}${repList(d.profileTips)}`);
      }

      function buildBrandingReport(d) {
        return repCard(`<div style="text-align:center"><div style="font-size:20px;font-weight:900;margin-bottom:6px">${esc(d.tagline||'')}</div><div style="font-size:12px;opacity:.8">${esc(d.brandVoice||'')}</div></div>`, true)
          + repTakeaway(d.youTakeaway)
          + repCard(`${repTitle('Professional Bio')}<div style="font-size:12.5px;color:#1f2937;line-height:1.75">${esc(d.bio||'')}</div>`)
          + repCard(`${repTitle('LinkedIn Summary')}<div style="font-size:12.5px;color:#1f2937;line-height:1.7">${esc(d.linkedinSummary||'')}</div>`)
          + repCard(`${repTitle('Elevator Pitch')}${repQuote(d.elevatorPitch)}`)
          + repCard(`${repTitle('Twitter / X Bio')}<div style="font-size:12.5px;color:#1f2937">${esc(d.twitterBio||'')}</div>`)
          + repCard(`${repTitle('Brand Keywords')}${repTags(d.brandKeywords)}`)
          + repCard(`${repTitle('Brand Tips')}${repList(d.tips)}`);
      }

      function buildPromotionReport(d) {
        return repCard(`${repTitle('Promotion Readiness')}<div style="display:flex;align-items:baseline;gap:10px"><div style="font-size:44px;font-weight:900">${d.readinessScore||0}</div><div style="font-size:13px;opacity:.85">/ 100 · ${esc(d.readinessLevel||'')}</div></div>`, true)
          + repTakeaway(d.youTakeaway)
          + repCard(`${repTitle('Verdict')}<div style="font-size:12.5px;color:#1f2937;line-height:1.65">${esc(d.verdict||'')}</div>`)
          + repCard(`${repTitle('Current Strengths','#059669')}${repList(d.strengths)}`)
          + repCard(`${repTitle('Gaps to Close','#dc2626')}${repList(d.gapsToClose)}`)
          + repCard(`${repTitle('Skills to Develop')}${repTags(d.skillsNeeded)}`)
          + repCard(`${repTitle('Visibility Actions')}${repList(d.visibilityActions)}`)
          + (d.roadmap||[]).map(p=>repCard(`
              <div class="rep-sec-title">${esc(p.month||'')} — ${esc(p.theme||'')}</div>
              ${p.milestones?.length?`<div style="font-size:10.5px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Milestones</div>${repList(p.milestones)}`:''}
              <div style="font-size:10.5px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 4px">Actions</div>${repList(p.actions)}`)).join('')
          + repCard(`${repTitle('Timeline Assessment')}<div style="font-size:12.5px;color:#1f2937;line-height:1.65">${esc(d.timelineAssessment||'')}</div>`)
          + repCard(`${repTitle('Leadership Tips')}${repList(d.leadershipTips)}`);
      }

      function buildJobMatchReport(d) {
        return repCard(`${repTitle('Job Match Analysis')}
          <div style="display:flex;align-items:baseline;gap:10px"><div style="font-size:44px;font-weight:900">${d.matchScore||0}</div><div style="font-size:13px;opacity:.85">/ 100 · ${esc(d.matchLevel||'')}</div></div>
          <div style="font-size:13px;opacity:.9;line-height:1.6;margin-top:6px">${esc(d.summary||'')}</div>`, true)
          + repTakeaway(d.youTakeaway)
          + repCard(`${repTitle('Matching Strengths','#059669')}${repList(d.matchingSkills)}`)
          + repCard(`${repTitle('Missing Skills / Gaps','#dc2626')}${repList(d.missingSkills)}`)
          + repCard(`${repTitle('Keywords to Add')}${repTags(d.keywordsToAdd)}`)
          + repCard(`${repTitle('Experience & Education Fit')}<div style="font-size:12.5px;color:#1f2937;line-height:1.6">${esc(d.experienceMatch||'')}</div><div style="font-size:12.5px;color:#1f2937;line-height:1.6;margin-top:6px">${esc(d.educationMatch||'')}</div>`)
          + repCard(`${repTitle('Application Tips')}${repList(d.tips)}`);
      }

      function buildResignationReport(d) {
        return repCard(`${repTitle('Your Resignation Letter')}<div style="font-size:13px;color:#1f2937;line-height:1.85;white-space:pre-line;background:#faf9ff;border:1px solid #ede9fe;border-radius:10px;padding:18px">${esc(d.letter||'')}</div>`)
          + repTakeaway(d.youTakeaway)
          + (d.tips?.length?repCard(`${repTitle('Tips for a Smooth Exit')}${repList(d.tips)}`):'');
      }

      const KIE_REPORTS = {
        careerhealth: { title:'Career Health Report', subtitle:d=>`Score ${d.overallScore||0}/100 · Grade ${d.grade||''}`, build:buildCareerHealthReport },
        roadmap:      { title:'Career Roadmap',        subtitle:d=>`${d.timeframe||''} plan · ${d.totalPhases||(d.phases||[]).length} phases`, build:buildRoadmapReport },
        salary:       { title:'Salary Intelligence Report', subtitle:d=>`${d.jobTitle||''} · ${d.location||''}`, build:buildSalaryReport },
        industry:     { title:'Industry Intelligence Report', subtitle:d=>`${d.industry||''} · ${d.outlook||''} Outlook`, build:buildIndustryReport },
        linkedin:     { title:'LinkedIn Optimization Report', subtitle:d=>`Visibility ${d.visibilityScore||0} · Recruiter ${d.recruiterScore||0}`, build:buildLinkedInReport },
        branding:     { title:'Personal Brand Kit', subtitle:d=>d.tagline||'', build:buildBrandingReport },
        promotion:    { title:'Promotion Readiness Report', subtitle:d=>`Score ${d.readinessScore||0}/100 · ${d.readinessLevel||''}`, build:buildPromotionReport },
        jobmatch:     { title:'Job Match Report', subtitle:d=>`Match Score ${d.matchScore||0}/100 · ${d.matchLevel||''}`, build:buildJobMatchReport },
        resignation:  { title:'Resignation Letter', subtitle:d=>'', build:buildResignationReport },
      };
      window._kieToolData = {};
      window.downloadToolPDF = function(key) {
        const cfg = KIE_REPORTS[key];
        const d = window._kieToolData[key];
        if (!cfg || !d) return;
        const title    = cfg.title;
        const subtitle = cfg.subtitle(d);
        const bodyHtml = cfg.build(d);
        // Store so "send in file form" / SEND_RESUME can re-deliver this report
        window._kieLastReportData = { title, subtitle, bodyHtml, ts: Date.now() };
        downloadKieReport(title, subtitle, bodyHtml);
      };
      function populateResumePicker(selId) {
        const sel = g(selId); if(!sel) return;
        const first = sel.options[0];
        sel.innerHTML = '';
        sel.appendChild(first);
        (resumes||[]).forEach(r => {
          const o = document.createElement('option');
          o.value = r.id;
          o.textContent = r.resumeName || r.resumeData?.fullName || r.id;
          sel.appendChild(o);
        });
      }
      function getResumeById(id) { return (resumes||[]).find(r=>r.id===id)||null; }

      // ── AI RESUME BUILDER ──────────────────────────────────────────────────────
      window._aibuildData = null;
      window.runAiBuild = async function() {
        const prompt = (g('aibuildPrompt')?.value||'').trim();
        if (!prompt || prompt.length < 8) { toast('Please describe the resume you want to create.', 'err'); return; }
        showModelSuggestion('aibuild','aibuildSuggest');
        ctoolLoading('aibuildLoading','aibuildBtn',true);
        ctoolResult('aibuildResult',false);
        const statEl = g('aibuildStatus');
        const msgs = ['Building your resume…','Crafting the experience section…','Adding skills & education…','Polishing the final details…'];
        let si=0; const si_int = setInterval(()=>{ if(statEl) statEl.textContent=msgs[++si%msgs.length]; },2000);
        try {
          const r = await fetch('/api/prompt-resume',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({prompt,model:kieModel})});
          clearInterval(si_int);
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          window._aibuildData = data.resumeData;
          renderAiBuildResult(data.resumeData);
          ctoolLoading('aibuildLoading','aibuildBtn',false);
          ctoolResult('aibuildResult',true);
        } catch(err) {
          clearInterval(si_int);
          ctoolLoading('aibuildLoading','aibuildBtn',false);
          toast('Error: '+err.message, 'err');
        }
      };
      function renderAiBuildResult(d) {
        const meta = g('aibuildResultMeta');
        if(meta) meta.textContent = `${d.jobTitle||''} · Template suggestion: ${d.templateSuggestion||'classic'}`;
        const prev = g('aibuildPreview');
        if(!prev) return;
        prev.innerHTML = `
          <div class="pr-field"><div class="pr-field-label">Name</div><div class="pr-field-val" style="font-weight:800">${esc(d.fullName||'')}</div></div>
          <div class="pr-field"><div class="pr-field-label">Role</div><div class="pr-field-val">${esc(d.jobTitle||'')}</div></div>
          <div class="pr-field"><div class="pr-field-label">Summary</div><div class="pr-field-val" style="color:var(--sub)">${esc((d.summary||'').slice(0,180))}…</div></div>
          <div class="ctool-divider"></div>
          <div class="pr-field"><div class="pr-field-label">Experience (${(d.workExperience||[]).length} entries)</div><div class="pr-field-val">${(d.workExperience||[]).slice(0,2).map(e=>`<div style="margin-bottom:4px"><strong>${esc(e.position)}</strong> at ${esc(e.company)}</div>`).join('')}</div></div>
          <div class="pr-field"><div class="pr-field-label">Skills</div><div>${mkTags(d.skills)}</div></div>`;
      }
      window.useAiBuiltResume = function() {
        if(!window._aibuildData) return;
        window._prebuiltResume = window._aibuildData;
        showView('tpick');
        setTimeout(()=>{ const notice = document.createElement('div'); notice.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e0845;color:#fff;padding:10px 20px;border-radius:99px;font-size:13px;font-weight:700;z-index:999;box-shadow:0 4px 18px rgba(0,0,0,.3)'; notice.textContent='AI resume ready — pick a template to continue'; document.body.appendChild(notice); setTimeout(()=>notice.remove(),3500); },300);
      };

      // ── CAREER HEALTH SCORE ────────────────────────────────────────────────────
      window.runCareerHealth = async function() {
        const sel = g('chResumePicker'); const rid = sel?.value||'';
        const resume = rid ? getResumeById(rid) : null;
        if(!resume) { toast('Please select a resume to analyze.', 'err'); return; }
        showModelSuggestion('careerhealth','careerhealthSuggest');
        ctoolLoading('careerhealthLoading','careerhealthBtn',true);
        ctoolResult('careerhealthResult',false);
        try {
          const r = await fetch('/api/career-health',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({resumeData:resume.resumeData,model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderCareerHealth(data);
          logEvent('career_health', { model: kieModel });
          ctoolLoading('careerhealthLoading','careerhealthBtn',false);
          ctoolResult('careerhealthResult',true);
        } catch(err) { ctoolLoading('careerhealthLoading','careerhealthBtn',false); toast('Error: '+err.message, 'err'); }
      };
      function renderCareerHealth(d) {
        const el = g('careerhealthResult'); if(!el) return;
        window._kieToolData.careerhealth = d;
        const score = d.overallScore||0;
        const bd = d.breakdown||{};
        const bdKeys = ['resumeQuality','skillRelevance','marketDemand','interviewReadiness','brandStrength','salaryPositioning'];
        const bdLabels = ['Resume Quality','Skill Relevance','Market Demand','Interview Readiness','Brand Strength','Salary Position'];
        const circumference = 2*Math.PI*52;
        const dash = circumference - (score/100)*circumference;
        el.innerHTML = `
          <div class="ctool-card">
            <div class="score-ring-wrap">
              <svg class="score-ring-svg" width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" stroke-width="10"/>
                <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor(score)}" stroke-width="10" stroke-dasharray="${circumference}" stroke-dashoffset="${dash}" stroke-linecap="round" style="transition:stroke-dashoffset 1s ease"/>
              </svg>
              <div style="margin-top:-88px;text-align:center;z-index:1;position:relative">
                <div class="score-ring-val" style="color:${scoreColor(score)}">${score}</div>
                <div style="font-size:13px;font-weight:700;color:var(--sub)">${d.grade||''}</div>
              </div>
              <div style="margin-top:72px;text-align:center">
                <div style="font-size:14px;font-weight:800;color:var(--txt)">${esc(d.headline||'Career Health Score')}</div>
              </div>
            </div>
            <div class="ctool-divider"></div>
            ${bdKeys.map((k,i)=>{ const item=bd[k]||{}; const s=item.score||0; return `<div class="score-breakdown-row"><div class="score-breakdown-label">${bdLabels[i]}</div><div class="score-breakdown-bar-wrap"><div class="score-breakdown-bar" style="width:${s}%;background:${scoreColor(s)}"></div></div><div class="score-breakdown-num">${s}</div></div>`; }).join('')}
          </div>
          ${mkTakeaway(d.youTakeaway)}
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">💪 Top Strengths</div>${mkListItems(d.topStrengths)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:10px">⚠️ Critical Gaps</div>${mkListItems(d.criticalGaps)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#d97706;margin-bottom:10px">⚡ Quick Wins This Week</div>${mkListItems(d.quickWins)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--p);margin-bottom:10px">🎯 Strategic Actions</div>${mkListItems(d.strategicActions)}</div>
          <div class="ctool-card" style="background:#f9fafb"><div style="font-size:12px;color:var(--sub);line-height:1.6;font-style:italic">"${esc(d.verdict||'')}"</div></div>
          ${mkDownloadBtn('careerhealth')}`;
      }

      // ── CAREER ROADMAP ─────────────────────────────────────────────────────────
      let rmTimeframe = '30days';
      window.rmSetTf = function(el) {
        rmTimeframe = el.dataset.tf;
        document.querySelectorAll('[data-tf]').forEach(b=>b.classList.remove('active'));
        el.classList.add('active');
      };
      window.runRoadmap = async function() {
        const curr=(g('rmCurrentRole')?.value||'').trim(), tgt=(g('rmTargetRole')?.value||'').trim();
        if(!curr||!tgt) { toast('Enter your current and target role.', 'err'); return; }
        showModelSuggestion('roadmap','roadmapSuggest');
        ctoolLoading('roadmapLoading','roadmapBtn',true);
        ctoolResult('roadmapResult',false);
        try {
          const r = await fetch('/api/career-roadmap',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({currentRole:curr,targetRole:tgt,timeframe:rmTimeframe,model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderRoadmap(data.roadmap);
          logEvent('career_roadmap', { model: kieModel });
          ctoolLoading('roadmapLoading','roadmapBtn',false);
          ctoolResult('roadmapResult',true);
        } catch(err) { ctoolLoading('roadmapLoading','roadmapBtn',false); toast('Error: '+err.message, 'err'); }
      };
      function renderRoadmap(rm) {
        const el = g('roadmapResult'); if(!el) return;
        window._kieToolData.roadmap = rm;
        el.innerHTML = `
          <div class="ctool-card" style="background:linear-gradient(135deg,#1e0845,#3b1a7a);color:#fff;margin-bottom:14px">
            <div style="font-size:15px;font-weight:900;color:#fff;margin-bottom:4px">${esc(rm.title||'Your Roadmap')}</div>
            <div style="font-size:12px;color:#c4b5fd;margin-bottom:8px">${esc(rm.timeframe||'')} · ${rm.totalPhases||''} phases</div>
            <div style="font-size:12px;color:#e9d5ff;line-height:1.5">${esc(rm.summary||'')}</div>
          </div>
          ${mkTakeaway(rm.youTakeaway)}
          ${(rm.phases||[]).map(p=>`
            <div class="roadmap-phase">
              <div class="roadmap-phase-hdr"><span class="roadmap-phase-label">Phase ${p.id}: ${esc(p.label||'')}</span><span class="roadmap-phase-dur">${esc(p.duration||'')}</span></div>
              <div class="roadmap-phase-focus">${esc(p.focus||'')}</div>
              <div style="font-size:11px;font-weight:800;color:var(--mute);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Goals</div>
              <ul class="roadmap-mini-list">${(p.goals||[]).map(g=>`<li>${esc(String(g))}</li>`).join('')}</ul>
              <div style="font-size:11px;font-weight:800;color:var(--mute);text-transform:uppercase;letter-spacing:.4px;margin:10px 0 4px">Actions</div>
              <ul class="roadmap-mini-list">${(p.actions||[]).map(a=>`<li>${esc(String(a))}</li>`).join('')}</ul>
              ${p.resources?.length?`<div style="margin-top:10px">${mkTags(p.resources,'#f0fdf4','#059669')}</div>`:''}
            </div>`).join('')}
          ${mkDownloadBtn('roadmap')}`;
      }

      // ── SALARY INTELLIGENCE ────────────────────────────────────────────────────
      window.runSalaryIntel = async function() {
        const jt=(g('salJobTitle')?.value||'').trim();
        if(!jt) { toast('Enter a job title.', 'err'); return; }
        showModelSuggestion('salary','salarySuggest');
        ctoolLoading('salaryLoading','salaryBtn',true);
        ctoolResult('salaryResult',false);
        try {
          const r = await fetch('/api/salary-intel',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({jobTitle:jt,location:g('salLocation')?.value||'',yearsExp:g('salExp')?.value||'1-3',education:g('salEdu')?.value||"Bachelor's",model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderSalary(data);
          logEvent('salary_intel', { model: kieModel });
          ctoolLoading('salaryLoading','salaryBtn',false);
          ctoolResult('salaryResult',true);
        } catch(err) { ctoolLoading('salaryLoading','salaryBtn',false); toast('Error: '+err.message, 'err'); }
      };
      function renderSalary(d) {
        const el = g('salaryResult'); if(!el) return;
        window._kieToolData.salary = d;
        const range = d.salaryRange||{}; const min=range.min||0,mid=range.mid||0,max=range.max||0;
        const midPct = max>min ? Math.round((mid-min)/(max-min)*100) : 50;
        const dColor = d.demandLevel==='High'?'#059669':d.demandLevel==='Medium'?'#d97706':'#dc2626';
        const tColor = d.demandTrend==='Growing'?'#059669':d.demandTrend==='Stable'?'#1d4ed8':'#dc2626';
        el.innerHTML = `
          <div class="ctool-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="font-size:22px;font-weight:900;color:var(--txt)">${fmtUSD(mid)}<span style="font-size:13px;font-weight:600;color:var(--sub)">/yr</span></div>
              <div style="display:flex;gap:6px">
                <span class="ctool-tag" style="background:${dColor}22;color:${dColor}">${d.demandLevel||''} Demand</span>
                <span class="ctool-tag" style="background:${tColor}22;color:${tColor}">${d.demandTrend||''}</span>
              </div>
            </div>
            <div style="font-size:11px;color:var(--sub);margin-bottom:16px">${esc(d.jobTitle||'')} · ${esc(d.location||'')}</div>
            <div class="salary-range-track">
              <div class="salary-range-fill" style="left:0;right:0"></div>
              <div class="salary-range-mid" style="left:${midPct}%"></div>
            </div>
            <div class="salary-range-labels"><span class="salary-label">Min: ${fmtUSD(min)}</span><span class="salary-label">Median: ${fmtUSD(mid)}</span><span class="salary-label">Max: ${fmtUSD(max)}</span></div>
          </div>
          ${mkTakeaway(d.youTakeaway)}
          <div class="ctool-card">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center">
              <div style="background:#f8fafc;border-radius:10px;padding:12px"><div style="font-size:18px;font-weight:900;color:var(--p)">${fmtUSD(d.forecast?.oneYear||0)}</div><div style="font-size:10px;color:var(--sub);margin-top:2px">In 1 Year</div></div>
              <div style="background:#f8fafc;border-radius:10px;padding:12px"><div style="font-size:18px;font-weight:900;color:var(--p)">${fmtUSD(d.forecast?.threeYear||0)}</div><div style="font-size:10px;color:var(--sub);margin-top:2px">In 3 Years</div></div>
            </div>
          </div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">🏭 Top Paying Industries</div>${mkTags(d.topPayingIndustries)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">💬 Negotiation Script</div><div style="font-size:13px;color:var(--txt);line-height:1.65;font-style:italic;border-left:3px solid var(--p);padding-left:12px">"${esc(d.negotiationScript||'')}"</div></div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">📌 Key Salary Factors</div>${mkListItems(d.keyFactors)}</div>
          <div class="ctool-card" style="background:#f9fafb"><div style="font-size:12px;color:var(--sub);line-height:1.6">${esc(d.insights||'')}</div></div>
          ${mkDownloadBtn('salary')}`;
      }

      // ── INDUSTRY INTELLIGENCE ──────────────────────────────────────────────────
      window.runIndustryIntel = async function() {
        const ind=(g('indIndustry')?.value||'').trim();
        if(!ind) { toast('Enter an industry.', 'err'); return; }
        showModelSuggestion('industry','industrySuggest');
        ctoolLoading('industryLoading','industryBtn',true);
        ctoolResult('industryResult',false);
        try {
          const r = await fetch('/api/industry-intel',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({industry:ind,role:g('indRole')?.value||'',model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderIndustry(data);
          logEvent('industry_intel', { model: kieModel });
          ctoolLoading('industryLoading','industryBtn',false);
          ctoolResult('industryResult',true);
        } catch(err) { ctoolLoading('industryLoading','industryBtn',false); toast('Error: '+err.message, 'err'); }
      };
      function renderIndustry(d) {
        const el = g('industryResult'); if(!el) return;
        window._kieToolData.industry = d;
        const outColors = {Excellent:'#059669',Good:'#1d4ed8',Fair:'#d97706',Challenging:'#dc2626'};
        const oc = outColors[d.outlook]||'#7c3aed';
        el.innerHTML = `
          <div class="ctool-card" style="background:linear-gradient(135deg,#1e0845,#3b1a7a)">
            <div style="font-size:15px;font-weight:900;color:#fff;margin-bottom:4px">${esc(d.industry||'')} Industry</div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><span class="ctool-tag" style="background:${oc}33;color:${oc}">${d.outlook||''} Outlook</span><span style="font-size:12px;color:#c4b5fd">${esc(d.growthRate||'')} growth · ${esc(d.marketSize||'')}</span></div>
            <div style="font-size:12px;color:#e9d5ff;line-height:1.5">${esc(d.summary||'')}</div>
          </div>
          ${mkTakeaway(d.youTakeaway)}
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">🔥 Top Trends</div>${mkListItems(d.topTrends)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#059669;margin-bottom:8px">📈 Growing Roles</div>${mkTags(d.growingRoles,'#f0fdf4','#059669')}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">🛠️ Hot Skills</div>${mkTags(d.hotSkills)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">⚙️ Emerging Technologies</div>${mkTags(d.emergingTechnologies,'#dbeafe','#1d4ed8')}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">🔮 Predictions</div>${mkListItems(d.predictions)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#059669;margin-bottom:10px">💡 Opportunities</div>${mkListItems(d.opportunities)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">🏢 Top Companies Hiring</div>${mkTags(d.topCompanies,'#fef3c7','#d97706')}</div>
          ${mkDownloadBtn('industry')}`;
      }

      // ── LINKEDIN OPTIMIZER ─────────────────────────────────────────────────────
      window.runLinkedIn = async function() {
        const hl=(g('liHeadline')?.value||'').trim();
        if(!hl) { toast('Enter your current LinkedIn headline.', 'err'); return; }
        showModelSuggestion('linkedin','linkedinSuggest');
        ctoolLoading('linkedinLoading','linkedinBtn',true);
        ctoolResult('linkedinResult',false);
        try {
          const r = await fetch('/api/linkedin-optimize',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({headline:hl,about:g('liAbout')?.value||'',currentRole:g('liCurrentRole')?.value||'',targetRole:g('liTargetRole')?.value||'',model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderLinkedIn(data);
          logEvent('linkedin_optimize', { model: kieModel });
          ctoolLoading('linkedinLoading','linkedinBtn',false);
          ctoolResult('linkedinResult',true);
        } catch(err) { ctoolLoading('linkedinLoading','linkedinBtn',false); toast('Error: '+err.message, 'err'); }
      };
      function renderLinkedIn(d) {
        const el = g('linkedinResult'); if(!el) return;
        window._kieToolData.linkedin = d;
        el.innerHTML = `
          <div class="ctool-card"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;margin-bottom:14px">
            <div style="background:#f5f3ff;border-radius:10px;padding:12px"><div style="font-size:22px;font-weight:900;color:var(--p)">${d.visibilityScore||0}</div><div style="font-size:10px;color:var(--sub)">Visibility Score</div></div>
            <div style="background:#f0fdf4;border-radius:10px;padding:12px"><div style="font-size:22px;font-weight:900;color:#059669">${d.recruiterScore||0}</div><div style="font-size:10px;color:var(--sub)">Recruiter Score</div></div>
          </div></div>
          ${mkTakeaway(d.youTakeaway)}
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:6px">✨ Optimized Headline</div><div style="font-size:14px;font-weight:700;color:var(--p);line-height:1.4;margin-bottom:8px">${esc(d.optimizedHeadline||'')}</div><div style="font-size:11px;color:var(--sub)">${esc(d.headlineFeedback||'')}</div></div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">📝 Optimized About <button data-copy="${esc(d.optimizedAbout||'')}" data-label="Copy" onclick="kieCopyBtnClick(this)" style="float:right;font-size:10px;font-weight:700;color:#059669;background:none;border:none;cursor:pointer;font-family:inherit">Copy</button></div><div style="font-size:13px;color:var(--txt);line-height:1.65;white-space:pre-line">${esc(d.optimizedAbout||'')}</div></div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">🎯 Missing Keywords</div>${mkTags(d.keywordGaps,'#fee2e2','#dc2626')}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">➕ Skills to Add</div>${mkTags(d.skillsToAdd)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">📋 Profile Tips</div>${mkListItems(d.profileTips)}</div>
          ${mkDownloadBtn('linkedin')}`;
      }

      // ── MOCK INTERVIEW ─────────────────────────────────────────────────────────
      let ivType='behavioral', ivPrevQs=[], ivCurrentQ=null;
      window.ivSetType = function(el) {
        ivType=el.dataset.iv;
        document.querySelectorAll('[data-iv]').forEach(b=>b.classList.remove('active'));
        el.classList.add('active');
      };
      window.runGetQuestion = async function() {
        const jt=(g('ivJobTitle')?.value||'').trim();
        if(!jt) { toast('Enter the job title you are interviewing for.', 'err'); return; }
        showModelSuggestion('interview','interviewSuggest');
        ctoolLoading('ivLoading','ivStartBtn',true);
        const loadTxt=g('ivLoadingTxt'); if(loadTxt) loadTxt.textContent='Getting your question…';
        if(g('ivLoading')) g('ivLoading').style.display='block';
        if(g('ivSession')) g('ivSession').style.display='none';
        ctoolResult('ivFeedback',false);
        if(g('ivAnswer')) g('ivAnswer').value='';
        try {
          const r = await fetch('/api/mock-interview-q',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({type:ivType,jobTitle:jt,previousQuestions:ivPrevQs,model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          ivCurrentQ = data; ivPrevQs.push(data.question);
          renderIvQuestion(data);
          logEvent('mock_interview_q', { model: kieModel });
          if(g('ivLoading')) g('ivLoading').style.display='none';
          if(g('ivSetup')) g('ivSetup').style.display='none';
          if(g('ivSession')) g('ivSession').style.display='block';
          if(g('ivStartBtn')) g('ivStartBtn').disabled=false;
        } catch(err) { if(g('ivLoading')) g('ivLoading').style.display='none'; if(g('ivStartBtn')) g('ivStartBtn').disabled=false; toast('Error: '+err.message, 'err'); }
      };
      function renderIvQuestion(q) {
        const card=g('ivQuestionCard'); if(!card) return;
        const diffColors={Easy:'#059669',Medium:'#d97706',Hard:'#dc2626'};
        const dc=diffColors[q.difficulty]||'#7c3aed';
        card.innerHTML=`<div class="iv-question-type">${esc(q.type||'')} · <span style="color:${dc}">${esc(q.difficulty||'')}</span></div><div class="iv-question-txt">${esc(q.question||'')}</div><div style="font-size:11px;color:#c4b5fd;margin-bottom:8px">${esc(q.context||'')}</div><div class="iv-tips-row">${(q.tips||[]).slice(0,3).map(t=>`<span class="iv-tip">${esc(t)}</span>`).join('')}</div><div style="margin-top:10px;font-size:10px;font-weight:700;color:#a78bfa">Framework: ${esc(q.framework||'STAR Method')}</div>`;
      }
      window.runGetFeedback = async function() {
        if(!ivCurrentQ) return;
        const jt=(g('ivJobTitle')?.value||'').trim(), ans=(g('ivAnswer')?.value||'').trim();
        if(!ans||ans.length<20) { toast('Write a more complete answer before getting feedback.', 'err'); return; }
        const loadTxt=g('ivLoadingTxt'); if(loadTxt) loadTxt.textContent='Analyzing your answer…';
        if(g('ivLoading')) g('ivLoading').style.display='block';
        ctoolResult('ivFeedback',false);
        try {
          const r = await fetch('/api/mock-interview-fb',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({question:ivCurrentQ.question,answer:ans,jobTitle:jt,type:ivType,model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderIvFeedback(data);
          logEvent('mock_interview_fb', { model: kieModel });
          if(g('ivLoading')) g('ivLoading').style.display='none';
          ctoolResult('ivFeedback',true);
        } catch(err) { if(g('ivLoading')) g('ivLoading').style.display='none'; toast('Error: '+err.message, 'err'); }
      };
      function renderIvFeedback(fb) {
        const el=g('ivFeedback'); if(!el) return;
        const score=fb.score||0; const sbg=scoreColor(score);
        el.innerHTML=`
          <div class="ctool-card">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <div class="iv-score-badge" style="background:${sbg}">${score}</div>
              <div><div style="font-size:15px;font-weight:900;color:var(--txt)">${fb.grade||''} · ${fb.wouldAdvance?'<span style="color:#059669">Would Advance ✓</span>':'<span style="color:#dc2626">Would Not Advance ✗</span>'}</div><div style="font-size:12px;color:var(--sub);margin-top:2px">${esc(fb.verdict||'')}</div></div>
            </div>
            <div style="font-size:11px;color:var(--sub)">${esc(fb.structureFeedback||'')}</div>
          </div>
          ${mkTakeaway(fb.youTakeaway)}
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#059669;margin-bottom:8px">✅ Strengths</div>${mkListItems(fb.strengths)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:8px">🔧 Improvements</div>${mkListItems(fb.improvements)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--p);margin-bottom:8px">💡 Sample Strong Answer</div><div style="font-size:13px;color:var(--txt);line-height:1.65;border-left:3px solid var(--p);padding-left:12px">${esc(fb.sampleAnswer||'')}</div></div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">🎯 Confidence Tips</div>${mkListItems(fb.confidenceTips)}</div>
          <button class="ctool-btn" onclick="runGetQuestion()" style="margin-top:4px">Next Question →</button>`;
      }

      // ── PERSONAL BRANDING ──────────────────────────────────────────────────────
      let bdBioType='professional';
      window.bdSetType = function(el) {
        bdBioType=el.dataset.bt;
        document.querySelectorAll('[data-bt]').forEach(b=>b.classList.remove('active'));
        el.classList.add('active');
      };
      window.runBranding = async function() {
        showModelSuggestion('branding','brandingSuggest');
        ctoolLoading('brandingLoading','brandingBtn',true);
        ctoolResult('brandingResult',false);
        const rid=g('bdResumePicker')?.value||'';
        const resume=rid?getResumeById(rid):null;
        try {
          const r = await fetch('/api/personal-brand',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({resumeData:resume?.resumeData||null,bioType:bdBioType,targetAudience:g('bdAudience')?.value||'recruiters',model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderBranding(data);
          logEvent('personal_brand', { model: kieModel });
          ctoolLoading('brandingLoading','brandingBtn',false);
          ctoolResult('brandingResult',true);
        } catch(err) { ctoolLoading('brandingLoading','brandingBtn',false); toast('Error: '+err.message, 'err'); }
      };
      function renderBranding(d) {
        const el=g('brandingResult'); if(!el) return;
        window._kieToolData.branding = d;
        const copyBtn = (txt,label)=>`<button data-copy="${esc(txt)}" data-label="${esc(label)}" onclick="kieCopyBtnClick(this)" style="font-size:10px;font-weight:700;color:var(--p);background:#f5f3ff;border:1px solid var(--p2);border-radius:99px;padding:3px 10px;cursor:pointer;font-family:inherit;float:right;margin-top:-2px">${label}</button>`;
        el.innerHTML=`
          <div class="ctool-card" style="background:linear-gradient(135deg,#1e0845,#3b1a7a)"><div style="font-size:20px;font-weight:900;color:#fff;text-align:center;padding:6px 0">✨ ${esc(d.tagline||'')}</div><div style="font-size:11px;color:#c4b5fd;text-align:center;margin-top:4px">${esc(d.brandVoice||'')}</div></div>
          ${mkTakeaway(d.youTakeaway)}
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">📝 Professional Bio ${copyBtn(d.bio||'','Copy')}</div><div style="font-size:13px;color:var(--txt);line-height:1.7">${esc(d.bio||'')}</div></div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">🔵 LinkedIn Summary ${copyBtn(d.linkedinSummary||'','Copy')}</div><div style="font-size:13px;color:var(--txt);line-height:1.65">${esc(d.linkedinSummary||'')}</div></div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">🎙️ Elevator Pitch ${copyBtn(d.elevatorPitch||'','Copy')}</div><div style="font-size:13px;color:var(--txt);line-height:1.65;font-style:italic;border-left:3px solid var(--p);padding-left:12px">"${esc(d.elevatorPitch||'')}"</div></div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:6px">🐦 Twitter/X Bio ${copyBtn(d.twitterBio||'','Copy')}</div><div style="font-size:13px;color:var(--txt)">${esc(d.twitterBio||'')}</div></div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">🏷️ Brand Keywords</div>${mkTags(d.brandKeywords)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">🚀 Brand Tips</div>${mkListItems(d.tips)}</div>
          ${mkDownloadBtn('branding')}`;
      }

      // ── PROFESSIONAL MESSAGING ─────────────────────────────────────────────────
      let msgType='application';
      window.msgSetType = function(el) {
        msgType=el.dataset.mt;
        document.querySelectorAll('[data-mt]').forEach(b=>b.classList.remove('active'));
        el.classList.add('active');
      };
      window.runMessaging = async function() {
        const jt=(g('msgJobTitle')?.value||'').trim(), co=(g('msgCompany')?.value||'').trim();
        if(!jt||!co) { toast('Enter the job title and company name.', 'err'); return; }
        showModelSuggestion('messaging','messagingSuggest');
        ctoolLoading('messagingLoading','messagingBtn',true);
        ctoolResult('messagingResult',false);
        const rid=g('msgResumePicker')?.value||'';
        const resume=rid?getResumeById(rid):null;
        try {
          const r = await fetch('/api/professional-msg',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({msgType,resumeData:resume?.resumeData||null,targetJob:jt,targetCompany:co,recruiterName:g('msgRecruiter')?.value||'',model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderMessaging(data);
          logEvent('professional_msg', { model: kieModel });
          ctoolLoading('messagingLoading','messagingBtn',false);
          ctoolResult('messagingResult',true);
        } catch(err) { ctoolLoading('messagingLoading','messagingBtn',false); toast('Error: '+err.message, 'err'); }
      };
      function renderMessaging(d) {
        const el=g('messagingResult'); if(!el) return;
        const mkMsgCard=(subj,msg,label)=>`
          <div class="ctool-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:12px;font-weight:800;color:var(--p)">${label}</div><button data-copy="${esc(msg)}" data-label="Copy" onclick="kieCopyBtnClick(this)" style="font-size:10px;font-weight:700;color:var(--p);background:#f5f3ff;border:1px solid var(--p2);border-radius:99px;padding:3px 10px;cursor:pointer;font-family:inherit">Copy</button></div>
            ${subj?`<div style="font-size:11px;font-weight:800;color:var(--mute);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Subject</div><div style="font-size:13px;font-weight:700;color:var(--txt);margin-bottom:10px">${esc(subj)}</div>`:''}
            <div style="font-size:13px;color:var(--txt);line-height:1.65;white-space:pre-line">${esc(msg)}</div>
          </div>`;
        el.innerHTML=mkMsgCard(d.subject,d.message,'Version 1 — Standard')+mkMsgCard(d.subject2,d.message2,'Version 2 — Bold')+
          mkTakeaway(d.youTakeaway)+
          `<div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">📌 Sending Tips</div>${mkListItems(d.tips)}</div>
           <div class="ctool-card" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
             <div><div style="font-size:12px;font-weight:800;color:#059669;margin-bottom:8px">✅ Do</div>${mkListItems(d.doList)}</div>
             <div><div style="font-size:12px;font-weight:800;color:#dc2626;margin-bottom:8px">❌ Don't</div>${mkListItems(d.dontList)}</div>
           </div>`;
      }

      // ── PROMOTION READINESS ────────────────────────────────────────────────────
      window.runPromotion = async function() {
        const curr=(g('prCurrentRole')?.value||'').trim(), tgt=(g('prTargetRole')?.value||'').trim();
        if(!curr||!tgt) { toast('Enter your current and target role.', 'err'); return; }
        showModelSuggestion('promotion','promotionSuggest');
        ctoolLoading('promotionLoading','promotionBtn',true);
        ctoolResult('promotionResult',false);
        const rid=g('prResumePicker')?.value||'';
        const resume=rid?getResumeById(rid):null;
        try {
          const r = await fetch('/api/promotion-readiness',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify({resumeData:resume?.resumeData||null,currentRole:curr,targetRole:tgt,timeline:g('prTimeline')?.value||'6 months',model:kieModel})});
          if(!r.ok) throw new Error((await r.json()).error||'Failed');
          const data = await r.json();
          renderPromotion(data);
          logEvent('promotion_readiness', { model: kieModel });
          ctoolLoading('promotionLoading','promotionBtn',false);
          ctoolResult('promotionResult',true);
        } catch(err) { ctoolLoading('promotionLoading','promotionBtn',false); toast('Error: '+err.message, 'err'); }
      };
      function renderPromotion(d) {
        const el=g('promotionResult'); if(!el) return;
        window._kieToolData.promotion = d;
        const score=d.readinessScore||0; const sc=scoreColor(score);
        const circumference=2*Math.PI*52; const dash=circumference-(score/100)*circumference;
        el.innerHTML=`
          <div class="ctool-card">
            <div class="score-ring-wrap">
              <svg class="score-ring-svg" width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" stroke-width="10"/><circle cx="60" cy="60" r="52" fill="none" stroke="${sc}" stroke-width="10" stroke-dasharray="${circumference}" stroke-dashoffset="${dash}" stroke-linecap="round"/></svg>
              <div style="margin-top:-88px;text-align:center;z-index:1;position:relative"><div class="score-ring-val" style="color:${sc}">${score}</div><div style="font-size:11px;color:var(--sub)">${esc(d.readinessLevel||'')}</div></div>
              <div style="margin-top:72px;text-align:center;padding:0 16px"><div style="font-size:13px;color:var(--sub);line-height:1.5">${esc(d.verdict||'')}</div></div>
            </div>
          </div>
          ${mkTakeaway(d.youTakeaway)}
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#059669;margin-bottom:8px">💪 Current Strengths</div>${mkListItems(d.strengths)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:#dc2626;margin-bottom:8px">🎯 Gaps to Close</div>${mkListItems(d.gapsToClose)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--p);margin-bottom:8px">📚 Skills to Develop</div>${mkTags(d.skillsNeeded)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px">👁️ Visibility Actions</div>${mkListItems(d.visibilityActions)}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">🗓️ Your Promotion Roadmap</div>${(d.roadmap||[]).map(p=>`<div class="roadmap-phase"><div class="roadmap-phase-hdr"><span class="roadmap-phase-label">${esc(p.month||'')}</span></div><div class="roadmap-phase-focus">${esc(p.theme||'')}</div><ul class="roadmap-mini-list">${(p.actions||[]).map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div>`).join('')}</div>
          <div class="ctool-card"><div style="font-size:13px;font-weight:800;color:var(--txt);margin-bottom:10px">🧭 Leadership Tips</div>${mkListItems(d.leadershipTips)}</div>
          ${mkDownloadBtn('promotion')}`;
      }

      // ── INIT CAREER TOOLS ON VIEW SHOW ─────────────────────────────────────────
      const origShowView = window.showView;
      window.showView = function(v) {
        if (typeof origShowView === 'function') origShowView(v);
        if(v==='careerhealth') populateResumePicker('chResumePicker');
        if(v==='branding') populateResumePicker('bdResumePicker');
        if(v==='messaging') populateResumePicker('msgResumePicker');
        if(v==='promotion') populateResumePicker('prResumePicker');
        // Reset interview session when navigating away and back
        if(v==='interview') { ivPrevQs=[]; ivCurrentQ=null; if(g('ivSession')) g('ivSession').style.display='none'; if(g('ivFeedback')) g('ivFeedback').style.display='none'; if(g('ivSetup')) g('ivSetup').style.display='block'; }
      };

      // Analyze button
      g('analyzeBtn').onclick = runAnalysis;
    });
