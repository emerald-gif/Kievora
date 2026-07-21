// ════════════════════════════════════════════════════════════════
// GMAIL INTELLIGENCE — all functions at global scope
// ════════════════════════════════════════════════════════════════

let _gmailConnected   = false;
let _gmailAlertAction = null;

async function _gmailTok() {
  return window.__kieGetIdToken();
}

// ── Gmail Panel ──────────────────────────────────────────────────
window.openGmailPanel = function() {
  const p = document.getElementById('gmailIntPanel');
  if (p) p.style.transform = 'translateX(0)';
  _gmailLoadStatus();
};
window.closeGmailPanel = function() {
  const p = document.getElementById('gmailIntPanel');
  if (p) p.style.transform = 'translateX(100%)';
  _gpipeGapLoaded = false; // reset so resume-gap re-checks next time panel opens
};

async function _gmailLoadStatus() {
  try {
    const tok  = await _gmailTok();
    const data = await fetch('/api/gmail/status',{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json());
    _gmailConnected = !!data.connected;
    _gmailRenderPanel(data);
  } catch(e){ console.warn('[gmail]',e); }
}

function _gmailRenderPanel(data) {
  const disc        = document.getElementById('gmailDisconnectedPanel');
  const conn        = document.getElementById('gmailConnectedPanel');
  const sub         = document.getElementById('gmailSettingsSub');
  const settingsBdg = document.getElementById('gmailSettingsBadge');
  const headerBdg   = document.getElementById('gmailHeaderBadge');
  if (!data.connected) {
    if(disc)        disc.style.display        = 'block';
    if(conn)        conn.style.display        = 'none';
    if(sub)         sub.textContent           = 'Connect to track your job search';
    if(settingsBdg) settingsBdg.style.display = 'none';
    if(headerBdg)   headerBdg.style.display   = 'none';
    return;
  }
  if(disc)        disc.style.display        = 'none';
  if(conn)        conn.style.display        = 'block';
  if(sub)         sub.textContent           = data.gmailEmail||'Connected';
  if(settingsBdg) settingsBdg.style.display = 'block';
  if(headerBdg)   headerBdg.style.display   = 'block';

  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setEl('gmailEmailLabel', data.gmailEmail||'Connected');
  setEl('gmailStatEmails', data.emailsScanned||0);
  setEl('gmailStatApps',  (data.applications||[]).length);
  setEl('gmailStatActions',(data.insights||[]).length);

  if (data.lastSynced) {
    const ago = Math.round((Date.now()-new Date(data.lastSynced))/60000);
    setEl('gmailLastSynced', ago<2?'Just synced':ago<60?`${ago}m ago`:Math.round(ago/60)+'h ago');
  }

  _gpipeRenderMismatch(data.nameMismatch, data.gmailName, data.gmailEmail);
  _gpipeRenderUrgent(data.applications||[]);
  _gpipeRenderFunnel(data.stats);
  _gpipeRenderTrend(data.stats, data.trend);
  _gpipeRenderPatterns(data.patterns||[]);
  _gpipeRenderApps(data.applications||[]);
  _gpipeRenderResumeGap();
  _gpipeRenderOptOut(data.digestOptOut);

  const iEl = document.getElementById('gmailInsightsList');
  if (iEl && data.insights?.length) {
    iEl.innerHTML = `<div class="gpipe-section-head" style="margin-top:4px">KIE Actions<span class="gpipe-section-count">${data.insights.length}</span></div><div style="display:flex;flex-direction:column;gap:8px">${data.insights.map(i=>`<div style="background:#fff;border:1.5px solid #ede9fe;border-radius:14px;padding:13px 15px;font-size:12px;color:#374151;line-height:1.55;font-weight:500">${i}</div>`).join('')}</div>`;
  } else if(iEl) { iEl.innerHTML=''; }
}

// ── Gmail Pipeline Intelligence (rendering + actions) — namespaced "gpipe", ──
// ── extends the panel above only, never touches resume/cover-letter code   ──
let _gpipeApps = [];

function _gpipeEsc(s) {
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function _gpipeRenderFunnel(stats) {
  const el = document.getElementById('gpipeFunnel');
  if (!el) return;
  if (!stats || !stats.total) { el.innerHTML=''; return; }
  const segs = [
    { lbl:'Interview Rate', pct: stats.interviewRate||0 },
    { lbl:'Offer Rate',     pct: stats.offerRate||0 },
  ];
  el.innerHTML = segs.map(s=>`<div class="gpipe-funnel-seg"><div class="gpipe-funnel-pct">${s.pct}%</div><div class="gpipe-funnel-lbl">${s.lbl}</div><div class="gpipe-funnel-bar"><i style="width:${s.pct}%"></i></div></div>`).join('');
}

// Trend badge — compares current interview/offer rate against the oldest
// snapshot on file. Stays hidden until there's at least 2 weeks of history.
function _gpipeRenderTrend(stats, trend) {
  const el = document.getElementById('gpipeTrendBadge');
  if (!el) return;
  if (!trend || trend.sinceWeeks < 2) { el.innerHTML=''; return; }
  const fmt = n => (n>0?'+':'')+n+'%';
  const ir  = trend.interviewRateChange;
  const or_ = trend.offerRateChange;
  const badges = [];
  if (ir !== 0) {
    const cls = ir>0?'gpipe-trend-up':ir<0?'gpipe-trend-dn':'gpipe-trend-flat';
    badges.push(`<span class="gpipe-trend ${cls}">${ir>0?'↑':'↓'} Interview rate ${fmt(ir)} vs ${trend.sinceWeeks}wk ago</span>`);
  }
  if (or_ !== 0) {
    const cls = or_>0?'gpipe-trend-up':or_<0?'gpipe-trend-dn':'gpipe-trend-flat';
    badges.push(`<span class="gpipe-trend ${cls}">${or_>0?'↑':'↓'} Offer rate ${fmt(or_)} vs ${trend.sinceWeeks}wk ago</span>`);
  }
  el.innerHTML = badges.join('');
}

// Resume gap — one-time fetch per panel open, keyed on whether the user has
// actually advanced past applying anywhere. Stays empty and silent if there
// isn't enough data rather than inventing a false positive.
let _gpipeGapLoaded = false;
async function _gpipeRenderResumeGap() {
  const el = document.getElementById('gpipeResumeGap');
  if (!el || _gpipeGapLoaded) return;
  _gpipeGapLoaded = true;
  el.innerHTML='';
  try {
    const tok = await _gmailTok();
    const r   = await fetch('/api/gmail/resume-gap', { headers:{ Authorization:`Bearer ${tok}` } }).then(r=>r.json());
    if (!r.success) return;
    if (r.needsResumeChoice && r.resumes?.length) {
      el.innerHTML = `<div class="gpipe-gap">📄 <b>Check your resume against your pipeline?</b><br>You have ${r.resumes.length} resumes — which one should KIE compare?<br><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${r.resumes.map(rv=>`<button class="gpipe-btn gpipe-btn-prep" style="flex:none" onclick="gpipeLoadResumeGap('${rv.id}')">${_gpipeEsc(rv.resumeName)}</button>`).join('')}</div></div>`;
      return;
    }
    if (r.gap && r.gap.skill) {
      const cos = (r.gap.companies||[]).map(c=>`<b>${_gpipeEsc(c)}</b>`).join(', ');
      el.innerHTML = `<div class="gpipe-gap">💡 <b>Worth checking:</b> ${cos} ${r.gap.companies.length===1?'mentions':'mention'} "<b>${_gpipeEsc(r.gap.skill)}</b>" — that keyword doesn't appear in your "${_gpipeEsc(r.resumeUsed||'resume')}" right now. Want to add it? <span style="font-size:10.5px;color:#0369a1">(This is a pattern, not a verdict — verify it yourself first)</span></div>`;
    }
  } catch(e) { /* non-critical — gap card just stays empty */ }
}

window.gpipeLoadResumeGap = async function(resumeId) {
  const el = document.getElementById('gpipeResumeGap');
  if (!el) return;
  el.innerHTML = '<div class="gpipe-gap" style="color:#94a3b8">Comparing…</div>';
  try {
    const tok = await _gmailTok();
    const r   = await fetch(`/api/gmail/resume-gap?resumeId=${encodeURIComponent(resumeId)}`, { headers:{ Authorization:`Bearer ${tok}` } }).then(r=>r.json());
    if (!r.success || !r.gap?.skill) { el.innerHTML=''; return; }
    const cos = (r.gap.companies||[]).map(c=>`<b>${_gpipeEsc(c)}</b>`).join(', ');
    el.innerHTML = `<div class="gpipe-gap">💡 <b>Worth checking:</b> ${cos} ${r.gap.companies.length===1?'mentions':'mention'} "<b>${_gpipeEsc(r.gap.skill)}</b>" — that keyword doesn't appear in your "${_gpipeEsc(r.resumeUsed||'resume')}" right now. <span style="font-size:10.5px;color:#0369a1">(Pattern, not a verdict — verify first)</span></div>`;
  } catch(e) { el.innerHTML=''; }
};

// Digest opt-out toggle — on/off is persisted server-side and read back from
// the status endpoint each time the panel opens, so it always reflects reality.
let _gpipeCurrentOptOut = false;
function _gpipeRenderOptOut(optOut) {
  _gpipeCurrentOptOut = !!optOut;
  const el = document.getElementById('gpipeOptOut');
  if (!el) return;
  el.innerHTML = `Weekly digest emails are <b>${optOut?'off':'on'}</b> · <button onclick="gpipeToggleDigest()">${optOut?'Turn on':'Turn off'}</button>`;
}

window.gpipeToggleDigest = async function() {
  const newVal = !_gpipeCurrentOptOut;
  try {
    const tok = await _gmailTok();
    await fetch('/api/gmail/digest-optout', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`}, body:JSON.stringify({ optOut:newVal }) });
    _gpipeRenderOptOut(newVal);
  } catch(e) { if(typeof window.toast==='function') window.toast('Could not update setting. Try again.','err'); }
};

// Contextual reply handler — fetches full email body server-side and drafts
// a reply that references what was actually said. Same copy-only pattern as
// follow-up drafts — Kievora never sends.
window.gpipeDraftReply = async function(idx) {
  const a = _gpipeApps[idx]; if (!a) return;
  const box = document.getElementById('gpipeDraft_'+idx);
  if (!box) return;
  box.style.display='block';
  box.innerHTML='<div style="font-size:11px;color:#94a3b8">Reading email and drafting reply…</div>';
  try {
    const tok = await _gmailTok();
    const r   = await fetch('/api/gmail/draft-reply', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`}, body:JSON.stringify({ company:a.company }) }).then(r=>r.json());
    if (!r.success) throw new Error(r.error||'failed');
    const { subject, body } = r.draft;
    box.innerHTML = `<div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px">Subject</div>
      <div style="font-size:12px;font-weight:700;color:#0f0e17;margin:3px 0 6px">${_gpipeEsc(subject)}</div>
      <textarea rows="5" id="gpipeDraftBody_${idx}">${_gpipeEsc(body)}</textarea>
      <button class="gpipe-draft-copy" onclick="gpipeCopyDraft(${idx})">Copy to clipboard</button>`;
    box.dataset.subject = subject;
    box.dataset.company = a.company;
  } catch(e) {
    const msg = e.message.includes('try syncing') ? 'No email found for this yet — try a Sync first.' : "Couldn't generate a reply. Try again.";
    box.innerHTML = `<div style="font-size:11px;color:#e11d48">${msg}</div>`;
  }
};

// Flags when the connected Gmail's name doesn't match the Kievora profile name
// — catches the "wrong Google account in the picker" mistake. Fuzzy-matched
// server-side, so this only fires on genuinely zero name overlap, not minor
// nickname/middle-name differences.
function _gpipeRenderMismatch(mismatch, gmailName, gmailEmail) {
  const el = document.getElementById('gpipeMismatchWarning');
  if (!el) return;
  if (!mismatch) { el.style.display='none'; el.innerHTML=''; return; }
  el.style.display = 'block';
  el.innerHTML = `⚠️ <b>This Gmail's name doesn't match your Kievora profile.</b><br>Connected as ${_gpipeEsc(gmailName||gmailEmail)} — wrong account?
    <button onclick="disconnectGmail()" style="margin-top:8px;display:block;width:100%;background:#fff;border:1.5px solid #fecaca;color:#dc2626;border-radius:9px;padding:7px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit">Disconnect & reconnect with the right account</button>`;
}

function _gpipeRenderUrgent(apps) {
  const el = document.getElementById('gpipeUrgentBanner');
  if (!el) return;
  const offer     = apps.find(a=>a.status==='offer');
  const interview = apps.find(a=>a.status==='interview_invite');
  if (offer) {
    el.style.display='block';
    el.innerHTML = `🎉 <b>Offer from ${_gpipeEsc(offer.company)}</b>${offer.role?` (${_gpipeEsc(offer.role)})`:''} — time to evaluate &amp; respond.`;
  } else if (interview) {
    el.style.display='block';
    el.innerHTML = `⚡ <b>Interview stage with ${_gpipeEsc(interview.company)}</b>${interview.role?` (${_gpipeEsc(interview.role)})`:''} — prep time.`;
  } else {
    el.style.display='none'; el.innerHTML='';
  }
}

const GPIPE_GROUPS = [
  { key:'offer',                    label:'🎉 Offers' },
  { key:'interview_invite',         label:'⚡ Interviews' },
  { key:'recruiter_outreach',       label:'📩 Recruiter Outreach' },
  { key:'assessment',               label:'📝 Assessments' },
  { key:'application_confirmation', label:'✅ Applied' },
  { key:'post_offer',               label:'🚀 Post-Offer' },
  { key:'general_update',           label:'🔄 Updates' },
  { key:'rejection',                label:'Rejected' },
];

// Builds a Google Calendar "quick add" link — opens prefilled, user taps Save.
// Deliberately NOT calling the Calendar API server-side: that would need a new
// OAuth scope + extra Google verification on top of what Gmail already needs.
// This needs zero extra scope and zero extra verification burden.
function _gpipeGCalLink(a) {
  if (!a.interviewAt) return null;
  const start = new Date(a.interviewAt);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + (a.interviewDurationMin||60)*60000);
  const fmt = d => d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
  const text    = encodeURIComponent(`Interview — ${a.company}${a.role?' ('+a.role+')':''}`);
  const details = encodeURIComponent(`Interview with ${a.company} for ${a.role||'a role'} — tracked automatically by Kievora's Gmail Intelligence.`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${details}`;
}

function _gpipeFmtInterviewTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

function _gpipeRenderPatterns(patterns) {
  const el = document.getElementById('gpipePatterns');
  if (!el) return;
  if (!patterns || !patterns.length) { el.innerHTML=''; return; }
  el.innerHTML = patterns.map(p =>
    `<div class="gpipe-pattern">📊 You tend to go quiet ${p.label} — ${p.count} of your last ${p.total} applications that reached this stage went cold (${p.rate}%). Worth tightening follow-up here.</div>`
  ).join('');
}

function _gpipeCard(a, idx) {
  const days = a.daysSince!=null ? a.daysSince : Math.floor((Date.now()-a.lastActivityTs)/86400000);
  const state = a.nextState || 'active';
  const showFollowUpBtn = state==='needs_followup' || state==='needs_followup_again';
  const showTailorBtn   = ['application_confirmation','recruiter_outreach','assessment'].includes(a.status) && !a.resumeTailored;
  const showPrepBtn     = a.status==='interview_invite';
  const showReplyBtn    = a.status==='recruiter_outreach';
  const gcalLink        = state==='prep_interview' && !a.calendarAdded ? _gpipeGCalLink(a) : null;
  const interviewLabel  = a.status==='interview_invite' && a.interviewAt ? _gpipeFmtInterviewTime(a.interviewAt) : null;

  let metaLine = interviewLabel ? `📅 ${interviewLabel}` : (days<=0?'today':days+'d ago');
  if (state==='needs_followup')            metaLine += ' · <span style="color:#d97706;font-weight:700">needs a follow-up</span>';
  else if (state==='needs_followup_again') metaLine += ' · <span style="color:#dc2626;font-weight:700">2nd follow-up overdue</span>';
  else if (state==='waiting')              metaLine += ` · <span style="color:#0e7490;font-weight:600">${a.nextAction}</span>`;
  else if (state==='prep_interview' && a.calendarAdded) metaLine += ' · <span style="color:#15803d;font-weight:600">✓ added to calendar</span>';
  if (a.resumeTailored) metaLine += ' · <span style="color:#0e7490;font-weight:600">✓ resume tailored</span>';

  const hasActions = showPrepBtn||showReplyBtn||showFollowUpBtn||showTailorBtn||gcalLink;
  return `<div class="gpipe-card">
    <div class="gpipe-card-top">
      <div class="gpipe-card-co">${_gpipeEsc(a.company)}${a.role?` · <span class="gpipe-card-role">${_gpipeEsc(a.role)}</span>`:''}</div>
    </div>
    <div class="gpipe-card-meta">${metaLine}</div>
    ${hasActions ? `<div class="gpipe-card-actions">
      ${showPrepBtn  ? `<button class="gpipe-btn gpipe-btn-prep"  onclick="gpipeInterviewPrep(${idx})">🎯 Prep for interview</button>` : ''}
      ${showReplyBtn ? `<button class="gpipe-btn gpipe-btn-reply" onclick="gpipeDraftReply(${idx})">💬 Draft reply</button>` : ''}
      ${showFollowUpBtn ? `<button class="gpipe-btn gpipe-btn-draft" onclick="gpipeDraftFollowup(${idx})">${state==='needs_followup_again'?'Send another follow-up':'Draft follow-up'}</button>` : ''}
      ${showTailorBtn ? `<button class="gpipe-btn gpipe-btn-resume" onclick="gpipeTailorResume(${idx})">Tailor resume</button>` : ''}
      ${gcalLink ? `<button class="gpipe-btn gpipe-btn-cal" data-gcal="${_gpipeEsc(gcalLink)}" onclick="gpipeAddToCalendar(${idx},this.dataset.gcal)">📅 Add to Calendar</button>` : ''}
    </div>` : ''}
    <div class="gpipe-draft-box" id="gpipeDraft_${idx}"></div>
    <div class="gpipe-draft-box" id="gpipePrep_${idx}"></div>
  </div>`;
}

function _gpipeRenderApps(apps) {
  _gpipeApps = apps;
  const aEl = document.getElementById('gmailAppsList');
  if (!aEl) return;
  if (!apps.length) { aEl.innerHTML = '<div class="gpipe-empty">No career emails tracked yet — KIE will populate this as applications come in.</div>'; return; }
  let html = '';
  for (const g of GPIPE_GROUPS) {
    const items = apps.filter(a=>a.status===g.key);
    if (!items.length) continue;
    html += `<div class="gpipe-section"><div class="gpipe-section-head">${g.label}<span class="gpipe-section-count">${items.length}</span></div>`;
    html += items.map(a => _gpipeCard(a, apps.indexOf(a))).join('');
    html += `</div>`;
  }
  aEl.innerHTML = html;
}

// Tells the backend what the user actually did, so the same nudge doesn't
// keep firing once it's been handled. Fire-and-forget — UI already updated
// optimistically by the caller before this resolves.
async function _gpipeMarkAction(company, action) {
  try {
    const tok = await _gmailTok();
    await fetch('/api/gmail/pipeline/mark-action', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`}, body:JSON.stringify({company, action}) });
  } catch(e) { /* non-critical — worst case the nudge reappears next load */ }
}

window.gpipeInterviewPrep = async function(idx) {
  const a = _gpipeApps[idx]; if (!a) return;
  const box = document.getElementById('gpipePrep_'+idx);
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '<div style="font-size:11px;color:#94a3b8">Pulling this together…</div>';
  try {
    const tok = await _gmailTok();
    const r = await fetch('/api/gmail/interview-prep', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`}, body:JSON.stringify({company:a.company, role:a.role}) }).then(r=>r.json());
    if (!r.success) throw new Error(r.error||'failed');
    const { questions=[], talkingPoints=[] } = r.prep||{};
    box.innerHTML = `
      <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Likely questions</div>
      <ol style="margin:0 0 10px;padding-left:18px;font-size:12px;color:#374151;line-height:1.6">${questions.map(q=>`<li>${_gpipeEsc(q)}</li>`).join('')}</ol>
      <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Bring these up</div>
      <ul style="margin:0;padding-left:18px;font-size:12px;color:#374151;line-height:1.6">${talkingPoints.map(p=>`<li>${_gpipeEsc(p)}</li>`).join('')}</ul>`;
  } catch(e) {
    box.innerHTML = '<div style="font-size:11px;color:#e11d48">Couldn\'t generate prep. Try again.</div>';
  }
};

window.gpipeDraftFollowup = async function(idx) {
  const a = _gpipeApps[idx]; if (!a) return;
  const box = document.getElementById('gpipeDraft_'+idx);
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '<div style="font-size:11px;color:#94a3b8">Writing a draft…</div>';
  try {
    const tok = await _gmailTok();
    const isRepeat = a.nextState==='needs_followup_again';
    const r = await fetch('/api/gmail/draft-followup', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${tok}`}, body:JSON.stringify({company:a.company, role:a.role, isRepeat}) }).then(r=>r.json());
    if (!r.success) throw new Error(r.error||'failed');
    const { subject, body } = r.draft;
    box.innerHTML = `<div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.6px">Subject</div>
      <div style="font-size:12px;font-weight:700;color:#0f0e17;margin:3px 0 6px">${_gpipeEsc(subject)}</div>
      <textarea rows="5" id="gpipeDraftBody_${idx}">${_gpipeEsc(body)}</textarea>
      <button class="gpipe-draft-copy" onclick="gpipeCopyDraft(${idx})">Copy to clipboard</button>`;
    box.dataset.subject = subject;
    box.dataset.company = a.company;
  } catch(e) {
    box.innerHTML = '<div style="font-size:11px;color:#e11d48">Couldn\'t generate a draft. Try again.</div>';
  }
};

window.gpipeCopyDraft = function(idx) {
  const box = document.getElementById('gpipeDraft_'+idx);
  const ta  = document.getElementById('gpipeDraftBody_'+idx);
  if (!ta || !box) return;
  const text = `Subject: ${box.dataset.subject||''}\n\n${ta.value}`;
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(()=>{
    const btn = box.querySelector('.gpipe-draft-copy');
    if (btn) { const orig = btn.textContent; btn.textContent = 'Copied ✓ — marked as followed up'; setTimeout(()=>{btn.textContent=orig;}, 2200); }
    // Mark it handled so this card moves to "waiting" instead of nagging again next load.
    _gpipeMarkAction(box.dataset.company, 'followup');
    const a = _gpipeApps[idx];
    if (a) { a.followUpCount = (a.followUpCount||0) + 1; a.nextState = 'waiting'; a.nextAction = 'Waiting on reply (followed up today)'; }
  }).catch(()=>{});
};

window.gpipeAddToCalendar = function(idx, link) {
  window.open(link, '_blank');
  const a = _gpipeApps[idx]; if (!a) return;
  a.calendarAdded = true;
  _gpipeMarkAction(a.company, 'calendar');
  _gpipeRenderApps(_gpipeApps); // re-render so the button becomes a checkmark immediately
};

// Stashes context for the resume builder — doesn't touch resume code directly.
// openBuilder() reads sessionStorage 'gpipeResumeTarget': {company, role} once,
// then clears it.
window.gpipeTailorResume = function(idx) {
  const a = _gpipeApps[idx]; if (!a) return;
  try { sessionStorage.setItem('gpipeResumeTarget', JSON.stringify({ company:a.company, role:a.role||'' })); } catch(e){}
  _gpipeMarkAction(a.company, 'resume');
  closeGmailPanel();
  if (typeof showView === 'function') showView('tpick');
};



window.connectGmail = async function() {
  const btn = document.getElementById('gmailConnectBtn');
  if (btn) { btn.textContent='Redirecting to Google…'; btn.disabled=true; btn.style.opacity='.8'; }
  try {
    const tok  = await _gmailTok();
    const res  = await fetch('/api/gmail/connect',{method:'POST',headers:{Authorization:`Bearer ${tok}`}});
    const data = await res.json();
    if (!res.ok) {
      if (btn) { btn.textContent='Connect Gmail →'; btn.disabled=false; btn.style.opacity='1'; }
      if (data.error === 'plan_locked') {
        if (typeof window.lockTapped === 'function') window.lockTapped('gmail');
        else if (typeof window.toast === 'function') window.toast(data.message || 'Gmail AI needs a Premier plan.', 'err');
        return;
      }
      throw new Error(data.message || 'Connection failed.');
    }
    window.location.href = data.url;
  } catch(e) {
    if (btn) { btn.textContent='Connect Gmail →'; btn.disabled=false; btn.style.opacity='1'; }
    if (typeof window.toast==='function') window.toast('Connection failed. Try again.','err');
    else alert('Connection failed. Try again.');
  }
};

window.syncGmailNow = async function() {
  const btn = document.getElementById('gmailSyncBtn');
  if (btn) { btn.innerHTML=`<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="animation:sping 1s linear infinite"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Syncing…`; btn.disabled=true; }
  try {
    const tok = await _gmailTok();
    await fetch('/api/gmail/sync',{method:'POST',headers:{Authorization:`Bearer ${tok}`}});
    await _gmailLoadStatus();
    await ensureGmailFreshAndAlert();
    if (typeof window.toast==='function') window.toast('Synced successfully','ok');
  } catch(e) { console.error('[gmail]',e); }
  finally {
    if (btn) { btn.innerHTML=`<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Sync now`; btn.disabled=false; }
  }
};

window.disconnectGmail = async function() {
  if (!confirm('Remove Gmail connection and delete all stored email data? This cannot be undone.')) return;
  try {
    const tok = await _gmailTok();
    await fetch('/api/gmail/disconnect',{method:'DELETE',headers:{Authorization:`Bearer ${tok}`}});
    _gmailConnected = false;
    _gmailRenderPanel({connected:false});
    ['kieGmailAlert','kieFloatAlert'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
    const n = document.getElementById('kieGmailNudge'); if(n) n.style.display='block'; if(typeof window.renderKieGmailNudgeGate==='function') window.renderKieGmailNudgeGate();
    if (typeof window.toast==='function') window.toast('Gmail disconnected','ok');
  } catch(e) { if (typeof window.toast==='function') window.toast('Failed. Try again.','err'); else alert('Failed. Try again.'); }
};

// ── Alert system ─────────────────────────────────────────────────
// IMPORTANT: this reads `nextState` straight off each app — the exact same
// field the Gmail panel's cards use (computed once, server-side, in
// computeNextAction()). Before, this function recomputed its own staleness
// logic independently, which meant chat could ask "write a follow-up" for
// something the panel already knew had been followed up on. Now both
// surfaces can only ever agree, because they're reading the same fact.
function _buildAlert(apps) {
  const offer = apps.find(a=>a.status==='offer');
  if (offer) { const co=offer.company; return {label:'🎉 Offer received', msg:`${co} sent you an offer. Let's negotiate this right.`, chip:`I have an offer from ${co}. Help me evaluate and negotiate.`}; }

  const interview = apps.find(a=>a.status==='interview_invite');
  if (interview) { const co=interview.company, role=interview.role?` (${interview.role})`:''; return {label:'⚡ Interview stage', msg:`You're at interview stage with ${co}${role}. Ready to prep?`, chip:`I have an interview with ${co}${role}. Help me prepare.`}; }

  const assessment = apps.find(a=>a.status==='assessment' && a.nextState!=='waiting');
  if (assessment) { const co=assessment.company; return {label:'📝 Assessment pending', msg:`${co} sent an assessment. Complete it promptly.`, chip:`${co} sent me an assessment. Best strategy to approach it?`}; }

  const needsFollowUp = apps.find(a=>a.nextState==='needs_followup' || a.nextState==='needs_followup_again');
  if (needsFollowUp) {
    const co = needsFollowUp.company, isRepeat = needsFollowUp.nextState==='needs_followup_again', days = needsFollowUp.daysSince;
    return isRepeat
      ? { label:'👻 Still no response', msg:`${co} still hasn't responded since your last follow-up. Worth a second nudge.`, chip:`I already followed up with ${co} once but still no response. Help me write a second, brief follow-up.` }
      : { label:'📩 Needs a follow-up', msg:`${co} hasn't responded in ${days}d.`, chip:`I applied to ${co} ${days} days ago, no response. Write a follow-up.` };
  }

  if (apps.length) return { label:'📊 Job search update', msg:`${apps.length} companies tracked. Ask me how your search is going.`, chip:`Give me a full breakdown of my current job search.` };
  return null;
}

function _renderAlert(status) {
  const alert    = _buildAlert(status.applications||[]);
  const card     = document.getElementById('kieGmailAlert');
  const floatBar = document.getElementById('kieFloatAlert');
  const nudge    = document.getElementById('kieGmailNudge');
  const kieMsgs  = document.getElementById('kieMsgs');
  const chatOpen = kieMsgs&&kieMsgs.style.display!=='none'&&Array.from(kieMsgs.children).some(c=>!c.id||c.id!=='kieTyp');
  if(nudge) { nudge.style.display = _gmailConnected?'none':'block'; if(typeof window.renderKieGmailNudgeGate==='function') window.renderKieGmailNudgeGate(); }
  if(!alert){ if(card)card.style.display='none'; if(floatBar)floatBar.style.display='none'; _gmailAlertAction=null; return; }
  _gmailAlertAction = alert.chip;
  if(chatOpen){
    if(card)card.style.display='none';
    if(floatBar){const fl=document.getElementById('kieFloatAlertLabel'),fm=document.getElementById('kieFloatAlertMsg');if(fl)fl.textContent=alert.label;if(fm)fm.textContent=alert.msg;floatBar.style.display='block';}
  } else {
    if(floatBar)floatBar.style.display='none';
    if(card){const l=document.getElementById('kieAlertLabel'),m=document.getElementById('kieAlertMsg');if(l)l.textContent=alert.label;if(m)m.textContent=alert.msg;card.style.display='block';}
  }
}

window.kieGmailAlertTap = function() {
  if(!_gmailAlertAction) return;
  ['kieGmailAlert','kieFloatAlert'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  if(typeof sendChip==='function') sendChip(_gmailAlertAction);
};
window.kieFloatAlertTap  = window.kieGmailAlertTap;
window.dismissFloatAlert = function(){ const f=document.getElementById('kieFloatAlert');if(f)f.style.display='none';_gmailAlertAction=null; };

// ── Main trigger ─────────────────────────────────────────────────
window.ensureGmailFreshAndAlert = async function() {
  try {
    const tok  = await _gmailTok();
    const data = await fetch('/api/gmail/status',{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json());
    _gmailConnected = !!data.connected;
    if(!data.connected){ const n=document.getElementById('kieGmailNudge');if(n)n.style.display='block'; if(typeof window.renderKieGmailNudgeGate==='function') window.renderKieGmailNudgeGate(); return; }
    if(data.lastSynced&&(Date.now()-new Date(data.lastSynced))/60000>30){
      fetch('/api/gmail/sync',{method:'POST',headers:{Authorization:`Bearer ${tok}`}})
        .then(()=>fetch('/api/gmail/status',{headers:{Authorization:`Bearer ${tok}`}}).then(r=>r.json()))
        .then(fresh=>_renderAlert(fresh)).catch(()=>{});
    }
    _renderAlert(data);
  } catch(e){ console.warn('[gmail-alert]',e.message); }
};

// ── Point 3 — in-conversation trigger ────────────────────────────
window._checkGmailConvTrigger = async function(msg) {
  if(_gmailConnected) return;
  if(!/apply|applied|interview|offer|rejection|recruiter|job search|application|cv|resume|hiring|callback|ghosted|follow.?up|salary|role|position/i.test(msg)) return;
  if(sessionStorage.getItem('kievora_gmail_conv_nudged')) return;
  sessionStorage.setItem('kievora_gmail_conv_nudged','1');
  setTimeout(()=>{
    const msgs=document.getElementById('kieMsgs'); if(!msgs) return;
    const div=document.createElement('div');
    div.style.cssText='margin:10px 14px;background:#fff;border:1px solid #ece7fb;border-radius:16px;padding:13px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 8px 24px rgba(124,58,237,.08),0 2px 6px rgba(15,14,23,.04);animation:fadeInUp .3s ease;transition:box-shadow .15s,border-color .15s';
    div.onmouseenter=()=>{div.style.borderColor='#ddd0fb';div.style.boxShadow='0 10px 28px rgba(124,58,237,.13),0 2px 6px rgba(15,14,23,.05)';};
    div.onmouseleave=()=>{div.style.borderColor='#ece7fb';div.style.boxShadow='0 8px 24px rgba(124,58,237,.08),0 2px 6px rgba(15,14,23,.04)';};
    div.onclick=()=>{div.remove();openSidebarSettings();setTimeout(openGmailPanel,350);};
    div.innerHTML=`<div style="width:34px;height:34px;border-radius:11px;background:#fff;border:1px solid #f0eef7;display:flex;align-items:center;justify-content:center;flex-shrink:0"><img src="/gmail.jpg" alt="" style="width:19px;height:19px;object-fit:contain" onerror="this.outerHTML='<svg width=&quot;17&quot; height=&quot;17&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot;><path d=&quot;M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z&quot; fill=&quot;#ea4335&quot; opacity=&quot;.2&quot;/><path d=&quot;M20 4H4L12 13l8-9z&quot; fill=&quot;#ea4335&quot;/></svg>'"></div><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:800;color:#7c3aed;letter-spacing:.2px;margin-bottom:3px">TIP FROM KIE</div><div style="font-size:12.5px;color:#374151;line-height:1.45;font-weight:500">Connect your Gmail and I can track all of this automatically.</div></div><button onclick="event.stopPropagation();this.parentElement.remove();" aria-label="Dismiss" style="flex-shrink:0;width:22px;height:22px;border:none;background:none;color:#c4bcdb;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;padding:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg></button>`;
    msgs.appendChild(div);
  }, 2500);
};

// ── Onboarding drawer ─────────────────────────────────────────────
window.closeGmailOnboarding = function() {
  const d=document.getElementById('gmailOnboardingDrawer'); if(d)d.style.display='none';
  localStorage.setItem('kievora_gmail_onboard_seen','1');
};
window.maybeShowGmailOnboarding = function() {
  if(localStorage.getItem('kievora_gmail_onboard_seen')||_gmailConnected) return;
  setTimeout(()=>{ const d=document.getElementById('gmailOnboardingDrawer');if(d)d.style.display='flex'; },2000);
};

// ── OAuth callback handler ────────────────────────────────────────
(function(){
  const p=new URLSearchParams(window.location.search),st=p.get('gmail'),mismatch=p.get('mismatch')==='1';
  if(st==='connected'){
    history.replaceState({},'','/dashboard');localStorage.setItem('kievora_gmail_onboard_seen','1');
    setTimeout(()=>{
      openSidebarSettings();
      setTimeout(()=>{
        openGmailPanel();
        setTimeout(()=>{
          if (typeof window.toast === 'function') {
            window.toast(mismatch ? "Connected — but this Gmail's name doesn't match your profile. Check below." : 'Gmail connected — KIE will track job-search emails from this inbox.', mismatch ? 'err' : 'ok');
          }
        }, 400);
      },300);
    },800);
  }
  else if(st==='error'||st==='denied'){history.replaceState({},'','/dashboard');}
})();

// ── Auto-sync every 2 hours ───────────────────────────────────────
setInterval(async()=>{
  if(!_gmailConnected) return;
  try{const tok=await _gmailTok();await fetch('/api/gmail/sync',{method:'POST',headers:{Authorization:`Bearer ${tok}`}});}catch(e){}
},2*60*60*1000);
