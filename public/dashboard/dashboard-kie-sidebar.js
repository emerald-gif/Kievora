// ═══════════════════════════════════════════════════════════════════════════
// KIE SIDEBAR · HISTORY · TOOL ROUTER  — Kievora Platform
// ═══════════════════════════════════════════════════════════════════════════

(function() {

  // ── STORAGE KEYS ─────────────────────────────────────────────────────────
  function uid() {
    return window._currentUid || 'guest';
  }
  const CONV_KEY  = () => `kievora_kie_convs_${uid()}`;
  const ACTV_KEY  = () => `kievora_kie_active_${uid()}`;

  // ── CONVERSATION STATE ────────────────────────────────────────────────────
  let _convs      = [];        // all conversations
  let _activeId   = null;      // active conv id
  let _ctxTarget  = null;      // conv targeted by 3-dot menu
  let _sidebar    = false;     // sidebar open state

  // ── LOAD / SAVE ───────────────────────────────────────────────────────────
  function loadConvs() {
    try { _convs = JSON.parse(localStorage.getItem(CONV_KEY()) || '[]'); } catch(e) { _convs = []; }
    _activeId = localStorage.getItem(ACTV_KEY()) || null;
  }
  function saveConvs() {
    try { localStorage.setItem(CONV_KEY(), JSON.stringify(_convs)); } catch(e) {}
  }
  function saveActive(id) {
    _activeId = id;
    if (id) localStorage.setItem(ACTV_KEY(), id);
    else localStorage.removeItem(ACTV_KEY());
  }

  // ── AUTH TOKEN HELPER — for the server-side conversation sync calls below ──
  function _kieSidebarToken() {
    return window.__kieAuth?.currentUser?.getIdToken().catch(() => null) || Promise.resolve(null);
  }

  // ── SYNC CONVERSATION LIST FROM SERVER ────────────────────────────────────
  // localStorage alone can't survive a new device, a cleared cache, or a
  // reinstall — but kie.js now upserts a real per-conversation doc on every
  // turn (users/{uid}/kieConversations/{convId}), so this pulls that list
  // down and merges it into the local sidebar. Merge, not replace: a
  // brand-new conversation with no reply yet exists locally before the
  // server has ever heard of it, and local updatedAt from an in-flight send
  // can be a beat ahead of the server's (doLogging runs after the stream
  // finishes) — so server data only overwrites a local entry when it's
  // actually newer, never blindly.
  function syncConvsFromServer() {
    _kieSidebarToken().then(tok => {
      if (!tok) return;
      return fetch('/api/kie/conversations', { headers: { Authorization: 'Bearer ' + tok } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.conversations?.length) return;
          loadConvs(); // re-read in case something changed while the request was in flight
          let changed = false;
          data.conversations.forEach(sc => {
            const local = _convs.find(c => c.id === sc.id);
            if (!local) {
              _convs.push({ id: sc.id, title: sc.title, titleSource: 'auto', createdAt: sc.createdAt || Date.now(), updatedAt: sc.updatedAt || Date.now(), preview: sc.preview || '' });
              changed = true;
            } else if (sc.updatedAt && sc.updatedAt > (local.updatedAt || 0)) {
              // BUG FIX: this used to be `local.title || sc.title`, which — since
              // local.title is set immediately from the raw first message and is
              // never empty — meant the server's title NEVER won, even once the
              // background summarizer (server: saveConvSummary → real topic-based
              // title) produced something far better than "how do i prepare for
              // a job". Now: any title the user hasn't manually renamed
              // (titleSource !== 'user') stays open to being upgraded by the
              // server's summary-based title as soon as one exists.
              if (local.titleSource !== 'user' && sc.title) {
                local.title = sc.title;
                local.titleSource = 'auto';
              }
              local.updatedAt = sc.updatedAt;
              local.preview    = sc.preview || local.preview;
              changed = true;
            }
          });
          if (changed) {
            _convs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            saveConvs();
            renderHistory();
          }
        });
    }).catch(() => {});
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function genId() { return 'c' + Date.now() + Math.random().toString(36).slice(2,6); }

  function autoTitle(firstMsg) {
    if (!firstMsg) return 'New conversation';
    const clean = firstMsg.replace(/[^\w\s]/g,'').trim();
    const words = clean.split(/\s+/).slice(0,7);
    return words.join(' ').slice(0,55) || 'New conversation';
  }

  function timeCat(ts) {
    const now  = Date.now();
    const diff = now - ts;
    const day  = 86400000;
    if (diff <   day)          return 'Today';
    if (diff < 2*day)          return 'Yesterday';
    if (diff < 4*day)          return '3 Days Ago';
    if (diff < 8*day)          return 'This Week';
    if (diff < 31*day)         return 'This Month';
    return 'Older';
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    }
    return d.toLocaleDateString([],{month:'short',day:'numeric'});
  }

  // ── CURRENT CONVERSATION OPS ──────────────────────────────────────────────
  function getCurrentConv() {
    return _convs.find(c => c.id === _activeId) || null;
  }

  // Called when KIE sends the FIRST message + gets a reply — save to history
  window._kieRegisterConvEntry = function(userMsg, aiReply) {
    loadConvs();
    let conv = _convs.find(c => c.id === _activeId);
    if (!conv) {
      // Create new entry
      conv = {
        id:        _activeId || genId(),
        title:     autoTitle(userMsg),
        titleSource: 'auto', // bootstrap title from the first message — upgraded
                             // to a real summary once the background
                             // summarizer produces one (see syncConvsFromServer)
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preview:   aiReply ? aiReply.slice(0,80) : userMsg.slice(0,80),
      };
      _convs.unshift(conv);
      saveActive(conv.id);
    } else {
      conv.updatedAt = Date.now();
      conv.preview   = aiReply ? aiReply.slice(0,80) : userMsg.slice(0,80);
      // Move to top
      _convs = [conv, ..._convs.filter(c=>c.id!==conv.id)];
    }
    saveConvs();
    renderHistory();
    showPlusFab(true);
  };

  // ── NEW CHAT ──────────────────────────────────────────────────────────────
  window.startNewKieChat = function() {
    closeSidebar();
    const newId = genId();
    saveActive(newId);
    if (typeof window._kieInternalClear === 'function') {
      window._kieInternalClear();
    } else {
      const welcome = document.getElementById('kieWelcome');
      const msgs    = document.getElementById('kieMsgs');
      if (welcome) welcome.style.display = 'flex';
      if (msgs)    msgs.style.display    = 'none';
    }
    showPlusFab(false);
    if (typeof showView === 'function') showView('kie');
    setTimeout(()=>{ if(typeof ensureGmailFreshAndAlert==='function') ensureGmailFreshAndAlert().catch(()=>{}); }, 200);
  };

  // ── NEW CHAT BUTTON (header pencil icon) ────────────────────────────────
  window.showPlusFab = function(show) {
    const fab = document.getElementById('kieNewChatBtn');
    if (fab) fab.classList.toggle('show', !!show);
  };

  // ── TOOL ROUTER ───────────────────────────────────────────────────────────
  let _ctoolSource = 'kie'; // tracks where the user entered the tool from

  window.openKieTool = function(toolId) {
    _ctoolSource = 'moretools'; // always opened via More Tools cards
    if (toolId === 'coverletter') {
      if (typeof showView === 'function') showView('coverletter');
      return;
    }
    if (typeof showView === 'function') showView(toolId);
    if (toolId === 'jobmatch') {
      if (typeof populateResumePicker === 'function') populateResumePicker('jmResumePicker');
    }
  };

  // Back button handler for all tool views
  window.ctoolBack = function() {
    if (_ctoolSource === 'moretools') {
      _ctoolSource = 'kie';
      if (typeof showView === 'function') showView('kie');
      if (typeof window.openMoreTools === 'function') window.openMoreTools();
    } else {
      _ctoolSource = 'kie';
      if (typeof showView === 'function') showView('kie');
    }
  };

  // ── MORE TOOLS OVERLAY ────────────────────────────────────────────────────
  window.openMoreTools = function() {
    const overlay = document.getElementById('moreToolsOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    overlay.scrollTop = 0;
    // Always land back on "All" — don't leave the user stuck on a filtered
    // view from their last visit with no visible way back to the full grid.
    if (typeof window.filterMoreTools === 'function') window.filterMoreTools('all');
  };
  window.closeMoreTools = function() {
    const overlay = document.getElementById('moreToolsOverlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  };

  // Category filter tabs on the More Tools overlay — collapses the 13 tools
  // down to whatever's relevant to the tapped category instead of forcing a
  // full scroll-and-scan every time.
  window.filterMoreTools = function(cat) {
    const grid = document.getElementById('mtoTileGrid');
    const tabs = document.getElementById('mtoTabs');
    if (!grid || !tabs) return;
    let visible = 0;
    grid.querySelectorAll('.mto-tile').forEach(function (tile) {
      const match = cat === 'all' || tile.getAttribute('data-cat') === cat;
      tile.classList.toggle('mto-hide', !match);
      if (match) visible++;
    });
    tabs.querySelectorAll('.mto-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-cat') === cat);
    });
    const empty = document.getElementById('mtoEmpty');
    if (empty) empty.style.display = visible ? 'none' : 'block';
  };

  // Open KIE chat and pre-fill prompt
  window.openKieWithPrompt = function(prompt) {
    if (typeof showView === 'function') showView('kie');
    setTimeout(() => {
      const inp = document.getElementById('kieInp');
      if (inp) {
        inp.value = prompt;
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
        inp.focus();
      }
    }, 200);
  };

  // ── SIDEBAR OPEN / CLOSE ──────────────────────────────────────────────────
  window.openSidebar = function() {
    loadConvs();
    renderHistory();
    populateSettingsProfile();
    document.getElementById('kieSidebar').classList.add('open');
    document.getElementById('kieSidebarOverlay').classList.add('open');
    _sidebar = true;
    // Close 3-dot menu if open
    closeCtxMenu();
  };

  window.closeSidebar = function() {
    document.getElementById('kieSidebar').classList.remove('open');
    document.getElementById('kieSidebarOverlay').classList.remove('open');
    closeSidebarSettings();
    _sidebar = false;
    closeCtxMenu();
  };

  // ── SETTINGS PANEL ────────────────────────────────────────────────────────
  window.openSidebarSettings = function() {
    closeSidebar();
    populateSettingsProfile();
    document.getElementById('ksbSettingsPanel').classList.add('open');
  };
  window.closeSidebarSettings = function() {
    document.getElementById('ksbSettingsPanel').classList.remove('open');
  };

  function populateSettingsProfile() {
    try {
      const user = window._currentUser;
      if (!user) return;
      const nameEl  = document.getElementById('ksbProfName');
      const emailEl = document.getElementById('ksbProfEmail');
      const avEl    = document.getElementById('ksbProfAv');
      if (nameEl)  nameEl.textContent  = user.displayName || user.email?.split('@')[0] || 'User';
      if (emailEl) emailEl.textContent = user.email || '';
      if (avEl) {
        if (user.photoURL) {
          avEl.style.backgroundImage = `url(${user.photoURL})`;
          avEl.textContent = '';
        } else {
          const initials = (user.displayName || user.email || 'U').slice(0,1).toUpperCase();
          avEl.textContent = initials;
          avEl.style.backgroundImage = '';
        }
      }
    } catch(e) {}
  }

  // ── CLEAR ALL HISTORY ─────────────────────────────────────────────────────
  window.confirmClearAllHistory = function() {
    if (confirm('Delete all conversation history? This cannot be undone.')) {
      const idsToDelete = _convs.map(c => c.id);
      _convs = [];
      saveConvs();
      saveActive(null);
      renderHistory();
      closeSidebarSettings();
      closeSidebar();
      if (typeof window._showToast === 'function') window._showToast('History cleared');
      else if (typeof toast === 'function') toast('History cleared');
      // Same reasoning as ksbDeleteConv — without this, reopening the
      // sidebar would just re-download everything from the server again.
      // No bulk-delete endpoint exists yet, so this fires one DELETE per
      // conversation; fire-and-forget since the local UI is already cleared
      // and doesn't need to wait on any of these.
      _kieSidebarToken().then(tok => {
        if (!tok) return;
        idsToDelete.forEach(id => {
          fetch(`/api/kie/conversations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } }).catch(() => {});
        });
      }).catch(() => {});
    }
  };

  // ── HISTORY RENDER ────────────────────────────────────────────────────────
  function renderHistory() {
    const body  = document.getElementById('ksbHistoryBody');
    const empty = document.getElementById('ksbHistoryEmpty');
    if (!body) return;

    const visible = _convs.filter(c => c);
    if (!visible.length) {
      if (empty) empty.style.display = 'block';
      // Remove all items
      body.querySelectorAll('.ksb-cat,.ksb-item').forEach(el => el.remove());
      return;
    }
    if (empty) empty.style.display = 'none';

    // Group by time category
    const groups = {};
    const ORDER  = ['Today','Yesterday','3 Days Ago','This Week','This Month','Older'];
    visible.forEach(c => {
      const cat = timeCat(c.updatedAt || c.createdAt || Date.now());
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });

    // Build HTML
    let html = '';
    ORDER.forEach(cat => {
      if (!groups[cat]?.length) return;
      html += `<span class="ksb-cat">${cat}</span>`;
      groups[cat].forEach(c => {
        const isActive = c.id === _activeId;
        html += `
          <div class="ksb-item${isActive?' active':''}" data-id="${c.id}">
            <div class="ksb-item-ico"><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.192 0-2.328-.208-3.362-.587L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg></div>
            <div class="ksb-item-inner" onclick="loadConversation('${c.id}')">
              <div class="ksb-item-title">${escHtml(c.title||'Conversation')}</div>
              <div class="ksb-item-meta">${fmtTime(c.updatedAt||c.createdAt||Date.now())}${c.preview?` · ${escHtml(c.preview.slice(0,30))}…`:''}</div>
            </div>
            <button class="ksb-item-dot" onclick="openCtxMenu(event,'${c.id}')" title="Options">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
          </div>`;
      });
    });

    // Replace contents
    body.querySelectorAll('.ksb-cat,.ksb-item').forEach(el => el.remove());
    body.insertAdjacentHTML('afterbegin', html);
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── LOAD A PAST CONVERSATION ──────────────────────────────────────────────
  window.loadConversation = function(id) {
    closeSidebar();
    loadConvs();
    const conv = _convs.find(c => c.id === id);
    if (!conv) return;
    saveActive(id);

    // Restore KIE history from localStorage if available
    const histKey = `kieHistory_${id}`;
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem(histKey)||'[]'); } catch(e){}

    // Navigate to KIE
    if (typeof showView === 'function') showView('kie');

    setTimeout(() => {
      if (hist && hist.length) {
        if (typeof window._restoreKieMsgs === 'function') {
          window._restoreKieMsgs(hist);
        } else {
          if (typeof window._kieInternalClear === 'function') window._kieInternalClear();
        }
      } else {
        // No local copy of this conversation — it exists in the sidebar list
        // (server sync put it there) but this device has never actually
        // opened it, so there's nothing in localStorage to restore from yet.
        // Pull the real messages from the server instead of showing an
        // empty chat for a conversation that visibly has a title and preview.
        if (typeof window._kieInternalClear === 'function') window._kieInternalClear();
        _kieSidebarToken().then(tok => {
          if (!tok) return;
          return fetch(`/api/kie/conversations/${encodeURIComponent(id)}`, { headers: { Authorization: 'Bearer ' + tok } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (!data?.messages?.length) return;
              // Only apply if the user is still looking at this same
              // conversation — they may have tapped into a different one
              // (or a new chat) while this request was in flight.
              if (_activeId !== id) return;
              if (typeof window._restoreKieMsgs === 'function') window._restoreKieMsgs(data.messages);
              try { localStorage.setItem(histKey, JSON.stringify(data.messages)); } catch(e){}
            });
        }).catch(() => {});
      }
      renderHistory();
      setTimeout(()=>{ if(typeof ensureGmailFreshAndAlert==='function') ensureGmailFreshAndAlert().catch(()=>{}); }, 150);
    }, 100);
  };

  // ── 3-DOT CONTEXT MENU ───────────────────────────────────────────────────
  window.openCtxMenu = function(e, id) {
    e.stopPropagation();
    _ctxTarget = id;
    const menu = document.getElementById('ksbCtxMenu');
    if (!menu) return;
    const rect = (e.currentTarget||e.target).getBoundingClientRect();
    menu.style.top  = (rect.bottom + 6) + 'px';
    menu.style.left = Math.min(rect.left, window.innerWidth - 175) + 'px';
    menu.classList.add('open');
  };

  function closeCtxMenu() {
    const menu = document.getElementById('ksbCtxMenu');
    if (menu) menu.classList.remove('open');
    _ctxTarget = null;
  }

  // Close menu on outside click
  document.addEventListener('click', function(e) {
    if (_ctxTarget && !e.target.closest('#ksbCtxMenu')) closeCtxMenu();
  });

  // ── RENAME ────────────────────────────────────────────────────────────────
  window.ksbRenameConv = function() {
    const conv = _convs.find(c => c.id === _ctxTarget);
    closeCtxMenu();
    if (!conv) return;
    const modal = document.getElementById('ksbRenameModal');
    const inp   = document.getElementById('ksbRenameInput');
    if (!modal || !inp) return;
    inp.value = conv.title || '';
    modal.classList.add('open');
    setTimeout(() => inp.focus(), 100);
  };

  window.closeRenameModal = function() {
    const modal = document.getElementById('ksbRenameModal');
    if (modal) modal.classList.remove('open');
  };

  window.saveRename = function() {
    const inp = document.getElementById('ksbRenameInput');
    const val = inp?.value?.trim();
    if (!val) return;
    loadConvs();
    const conv = _convs.find(c => c.id === _activeId) || _convs[0];
    // We need to know which conv was being renamed — use last _ctxTarget before it was cleared
    const target = _convs.find(c => c.title === (inp._targetTitle||'') ) || conv;
    // Simpler: store id on modal
    const modal = document.getElementById('ksbRenameModal');
    const tid   = modal?.dataset?.convId;
    const tc    = _convs.find(c => c.id === tid);
    if (tc) { tc.title = val; saveConvs(); renderHistory(); }
    closeRenameModal();
  };

  // Better rename — store target id on modal when opening
  const _origRename = window.ksbRenameConv;
  window.ksbRenameConv = function() {
    const modal = document.getElementById('ksbRenameModal');
    if (modal) modal.dataset.convId = _ctxTarget || '';
    const conv = _convs.find(c => c.id === _ctxTarget);
    closeCtxMenu();
    if (!conv || !modal) return;
    const inp = document.getElementById('ksbRenameInput');
    if (inp) inp.value = conv.title || '';
    modal.classList.add('open');
    setTimeout(() => { if(inp) inp.focus(); }, 100);
  };

  window.saveRename = function() {
    const modal = document.getElementById('ksbRenameModal');
    const inp   = document.getElementById('ksbRenameInput');
    const val   = inp?.value?.trim();
    if (!val) return;
    const tid = modal?.dataset?.convId;
    loadConvs();
    const tc = _convs.find(c => c.id === tid);
    // titleSource:'user' locks this title in — syncConvsFromServer (below)
    // never overwrites a user-chosen title with an auto-generated one.
    if (tc) { tc.title = val; tc.titleSource = 'user'; saveConvs(); renderHistory(); }
    closeRenameModal();
  };

  // ── DELETE ────────────────────────────────────────────────────────────────
  window.ksbDeleteConv = function() {
    const id = _ctxTarget;
    closeCtxMenu();
    if (!id) return;
    loadConvs();
    _convs = _convs.filter(c => c.id !== id);
    saveConvs();
    // Also remove stored messages
    try { localStorage.removeItem(`kieHistory_${id}`); } catch(e){}
    if (_activeId === id) {
      saveActive(null);
      startNewKieChat();
    }
    renderHistory();
    // Delete server-side too — otherwise the next syncConvsFromServer() call
    // (e.g. reopening the sidebar) would just bring it right back, since as
    // far as the server's concerned nothing happened to it.
    _kieSidebarToken().then(tok => {
      if (!tok) return;
      return fetch(`/api/kie/conversations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } });
    }).catch(() => {});
  };

  // ── HISTORY-RESTORE GUARD ───────────────────────────────────────────────
  // watchKieMsgs() below reacts to AI bubbles appearing in #kieMsgs to bump
  // a conversation's updatedAt/preview and move it to the top — that's
  // correct for a genuine new reply, but _restoreKieMsgs() (just below)
  // rebuilds those exact same bubbles when you simply OPEN an old
  // conversation to look at it. Without this guard, opening a 2-day-old
  // chat made it jump to the top of the list as if it had just been
  // updated, even though nothing new was sent. While this flag is set, the
  // observer callback below treats bubble mutations as a restore, not a
  // real new turn, and leaves updatedAt/order untouched.
  let _kieRestoringHistory = false;

  // ── HOOK INTO KIE SEND TO TRACK CONVERSATIONS ─────────────────────────────
  // We intercept after a successful AI response to register the conversation
  function hookKieSend() {
    const origSend = window.sendKie;
    if (!origSend || window._kieSendHooked) return;
    window._kieSendHooked = true;
    window.sendKie = async function() {
      const inp = document.getElementById('kieInp');
      const userMsg = inp?.value?.trim() || '';
      // Ensure we have an active conv id
      if (!_activeId) { loadConvs(); saveActive(genId()); }
      await origSend.apply(this, arguments);
      // After sending, mark for history inclusion (AI reply triggers registration)
    };
  }

  // Watch for AI replies by observing kieMsgs — when KIE responds, register conv
  function watchKieMsgs() {
    const msgs = document.getElementById('kieMsgs');
    if (!msgs) { setTimeout(watchKieMsgs, 500); return; }

    const observer = new MutationObserver(() => {
      if (_kieRestoringHistory) return; // bubbles are being rebuilt from a
                                         // past conversation, not a live reply
      // Count assistant bubbles (km-ai is the actual class used in appendKMsg)
      const aiBubbles = msgs.querySelectorAll('.km-ai, .kie-msg-ai, .kie-msg-kie, .kie-msg.kie-msg-ai');
      if (aiBubbles.length > 0) {
        loadConvs();
        if (!_activeId) saveActive(genId());
        const existing = _convs.find(c => c.id === _activeId);
        if (!existing) {
          // Get first user message for title (km-user is the actual class)
          const firstUser = msgs.querySelector('.km-user .km-bubble, .kie-msg-user .kie-msg-text, .kie-msg-u');
          const firstAi   = aiBubbles[aiBubbles.length - 1];
          const userTxt   = firstUser?.textContent?.trim() || '';
          const aiTxt     = (firstAi?.querySelector('.km-bubble')?.textContent || firstAi?.textContent || '').trim();
          window._kieRegisterConvEntry(userTxt, aiTxt);
        } else {
          // Update preview
          const lastAi = aiBubbles[aiBubbles.length-1];
          if (lastAi) {
            existing.updatedAt = Date.now();
            existing.preview   = (lastAi.querySelector('.km-bubble')?.textContent || lastAi.textContent || '').trim().slice(0,80);
            _convs = [existing, ..._convs.filter(c=>c.id!==existing.id)];
            saveConvs();
          }
          showPlusFab(true);
          renderHistory();
        }
        if (typeof kieHist!=='undefined' && kieHist.length>=2 && _activeId) {
          window.__kieAuth?.currentUser?.getIdToken().then(t2=>{
            if(!t2) return;
            fetch('/api/kie/summarize',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t2}`},body:JSON.stringify({messages:kieHist.slice(-10),convId:_activeId})}).catch(()=>{});
          }).catch(()=>{});
        }
      }
    });
    observer.observe(msgs, { childList: true, subtree: true });
  }

  // ── RESTORE MSGS HELPER ───────────────────────────────────────────────────
  window._restoreKieMsgs = function(hist) {
    const msgs    = document.getElementById('kieMsgs');
    const welcome = document.getElementById('kieWelcome');
    const kieTyp  = document.getElementById('kieTyp');
    if (!msgs || !hist || !hist.length) return;

    // See _kieRestoringHistory comment above — every bubble this function
    // (re)creates below must NOT be mistaken by watchKieMsgs()'s observer
    // for a fresh reply. Cleared on a macrotask (setTimeout 0), not a
    // microtask, so it's guaranteed to still be set when the observer's own
    // microtask callback fires for these mutations.
    _kieRestoringHistory = true;

    // ── Sync the in-memory history ─────────────────────────────────────────
    if (typeof window.kieHist !== 'undefined') window.kieHist = hist;

    // ── Clear existing chat messages (keep typing indicator) ───────────────
    Array.from(msgs.children).forEach(c => {
      if (c.id !== 'kieTyp') c.remove();
    });

    // ── Rebuild using the real appendKMsg so styling is identical to live chat
    if (typeof window.appendKMsg === 'function') {
      hist.forEach(m => {
        window.appendKMsg(m.role === 'user' ? 'user' : 'ai', m.content, false);
      });
    } else {
      // Safety fallback — mirrors the real km/km-ai/km-user structure
      const SEND_SVG = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
      hist.forEach(m => {
        const isUser = m.role === 'user';
        const formatted = isUser
          ? m.content.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
          : (typeof window._formatKieLive === 'function' ? window._formatKieLive(m.content, true)
             : typeof window.formatKieText === 'function' ? window.formatKieText(m.content)
             : m.content.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>'));
        const div = document.createElement('div');
        if (isUser) {
          div.className = 'km km-user';
          div.innerHTML = `<div class="km-bubble">${formatted}</div>`;
        } else {
          const msgId = 'kb-r-' + Date.now() + Math.random().toString(36).slice(2,6);
          div.className = 'km km-ai';
          div.innerHTML = `
            <div class="km-ai-body">
              <div class="km-bubble" id="${msgId}">${formatted}</div>
              <div class="km-actions visible" id="kact-${msgId}">
                <button class="km-act-btn" onclick="kieyCopy(this)" title="Copy response">${SEND_SVG}</button>
              </div>
            </div>`;
        }
        msgs.insertBefore(div, kieTyp);
      });
    }

    msgs.style.display = 'flex';
    if (welcome) welcome.style.display = 'none';
    msgs.scrollTop = msgs.scrollHeight;
    if (typeof showPlusFab === 'function') showPlusFab(true);
    // Release the guard on the next macrotask, after the mutation observer's
    // own callback (a microtask) has already run and been skipped.
    setTimeout(() => { _kieRestoringHistory = false; }, 0);
  };

  // ── SHOW KIE ACTION BARS AFTER RESULTS ────────────────────────────────────
  // Watch for result containers becoming visible and reveal their action bars
  const toolBars = [
    ['aibuildResult','aibuildKieBar'],
    ['careerhealthResult','careerhealthKieBar'],
    ['roadmapResult','roadmapKieBar'],
    ['salaryResult','salaryKieBar'],
    ['industryResult','industryKieBar'],
    ['linkedinResult','linkedinKieBar'],
    ['ivFeedback','interviewKieBar'],
    ['brandingResult','brandingKieBar'],
    ['messagingResult','messagingKieBar'],
    ['promotionResult','promotionKieBar'],
    ['jobmatchResult','jobmatchKieBar'],
    ['resignationResult','resignationKieBar'],
  ];

  function watchToolResults() {
    toolBars.forEach(([resultId, barId]) => {
      const resultEl = document.getElementById(resultId);
      const barEl    = document.getElementById(barId);
      if (!resultEl || !barEl) return;
      const obs = new MutationObserver(() => {
        const visible = resultEl.style.display !== 'none' && resultEl.offsetParent !== null;
        barEl.style.display = visible ? 'flex' : 'none';
      });
      obs.observe(resultEl, { attributes: true, attributeFilter: ['style'] });
    });
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init() {
    loadConvs();
    if (!_activeId) saveActive(genId());
    watchKieMsgs();
    watchToolResults();
    setTimeout(hookKieSend, 800);
    syncConvsFromServer();

    // Escape key closes sidebar
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeSidebar(); closeCtxMenu(); closeRenameModal(); }
    });

    // If we have history, show plus fab when already on KIE with messages
    const msgs = document.getElementById('kieMsgs');
    if (msgs && msgs.style.display !== 'none' && msgs.querySelectorAll('.kie-msg').length) {
      showPlusFab(true);
    }
  }

  // Run after DOM is ready AND after we know which account is signed in
  function startInit() {
    if (window._currentUid) { init(); return; }
    window.addEventListener('kievora-uid-ready', init, { once: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startInit);
  } else {
    startInit();
  }

})();
