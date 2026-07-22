// ═══════════════════════════════════════════════════════════════════════════
// server/gmail.js — Gmail Career Intelligence routes (connect/callback/sync/
// status/draft-followup/digest-optout/pipeline actions/interview-prep/
// draft-reply/resume-gap/disconnect).
// ═══════════════════════════════════════════════════════════════════════════

const { google } = require('googleapis'); // ✅ FIXED: google is now defined

module.exports = function registerGmailRoutes(app) {
  const {
    admin, db, authenticate, getOAuthClient,
    GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
    classifyCareerEmail, extractEmailEntities, extractInterviewDateTime,
    syncUserGmail, buildApplicationList, generateInsights, computeNextAction,
    attachStaleFlags, computePipelineStats, getWeekKey, recordPipelineTrend,
    getTrendComparison, detectGhostingPattern, buildKieBrainBlock,
    getGmailCareerBrainRaw, getGmailCareerBrain, getValidTokens, syncGmailForUser,
    RESUMES, normaliseStr, isSameApplication, getUserPlanKey, getPlanConfig, UPGRADE_MESSAGES,
  } = require('./lib');

  // ─── Gmail Routes ────────────────────────────────────────────────────────────
  app.post('/api/gmail/connect', authenticate, async (req,res) => {
    if (!GMAIL_CLIENT_ID||!GMAIL_CLIENT_SECRET) return res.status(503).json({ error:'Gmail not configured' });
    // Plan gate: Gmail AI is Premier-exclusive (see support.html). Enforced
    // here server-side — the UI hiding/locking the button is just a nicety,
    // this is what actually stops a Free/Pro user from connecting via a
    // direct call or an unlocked UI path (e.g. Settings) that skips the gate.
    const planKey = await getUserPlanKey(req.user.uid);
    if (!getPlanConfig(planKey).gmail) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.gmail() });
    }
    const url = getOAuthClient().generateAuthUrl({ access_type:'offline', prompt:'consent',
      scope:['https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/userinfo.profile'],
      state: req.user.uid });
    res.json({ url });
  });

  // Fuzzy on purpose — different middle names, nicknames, or one account having a
  // fuller name than the other shouldn't trigger a false "wrong account" warning.
  // Only flags a mismatch when there's truly zero meaningful word overlap.
  function namesLikelyMatch(nameA, nameB) {
    if (!nameA || !nameB) return true; // can't compare — don't warn on insufficient data
    const norm = s => s.toLowerCase().replace(/[^a-z\s]/g,'').split(/\s+/).filter(w=>w.length>=3);
    const wordsA = norm(nameA), wordsB = norm(nameB);
    if (!wordsA.length || !wordsB.length) return true;
    return wordsA.some(w => wordsB.includes(w));
  }

  app.get('/api/gmail/callback', async (req,res) => {
    const { code, state:uid, error } = req.query;
    if (error||!code||!uid) return res.redirect('/dashboard?gmail=denied');
    try {
      const oauth2         = getOAuthClient();
      const { tokens }     = await oauth2.getToken(code);
      oauth2.setCredentials(tokens);
      const oaApi          = google.oauth2({ version:'v2', auth:oauth2 });
      const { data }       = await oaApi.userinfo.get();
      const gmailEmail     = data.email||'';
      const gmailName      = data.name||'';
      const uSnap          = await db.collection('users').doc(uid).get();
      const kievoraName    = uSnap.data()?.name || uSnap.data()?.displayName || '';
      const nameMismatch   = !namesLikelyMatch(gmailName, kievoraName);
      await db.collection('users').doc(uid).collection('gmailBrain').doc('tokens')
        .set({ tokens, gmailEmail, gmailName, connectedAt:admin.firestore.FieldValue.serverTimestamp(), updatedAt:admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('users').doc(uid).set({ gmailConnected:true, gmailEmail, gmailName, gmailNameMismatch:nameMismatch, gmailConnectedAt:admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
      syncGmailForUser(uid).catch(e=>console.error('[gmail] initial sync:',e.message));
      res.redirect(`/dashboard?gmail=connected${nameMismatch?'&mismatch=1':''}`);
    } catch(e) { console.error('[gmail] callback:',e.message); res.redirect('/dashboard?gmail=error'); }
  });

  app.post('/api/gmail/sync', authenticate, async (req,res) => {
    try { const result = await syncGmailForUser(req.user.uid); res.json({ success:true, ...result }); }
    catch(e) { res.status(500).json({ error:e.message }); }
  });

  app.get('/api/gmail/status', authenticate, async (req,res) => {
    try {
      const [uSnap, sSnap] = await Promise.all([
        db.collection('users').doc(req.user.uid).get(),
        db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('summary').get()
      ]);
      if (!uSnap.data()?.gmailConnected) return res.json({ connected:false });
      const sum   = sSnap.exists ? sSnap.data() : {};
      const apps  = await attachStaleFlags(sum.applications || [], req.user.uid);
      const stats = computePipelineStats(apps);
      // Regenerate insights from the dismissed-aware list, not sum.insights
      // (stored at last sync from raw, un-corrected apps) — otherwise a
      // company the user just corrected in chat could still show up here
      // even though KIE has already stopped mentioning it. One source of
      // truth for "what's actually still worth surfacing."
      const insights = generateInsights(apps.filter(a => !a.dismissed));
      res.json({ connected:true, gmailEmail:uSnap.data().gmailEmail||'', emailsScanned:sum.emailsScanned||0,
        applications: apps.slice(0,40), insights,
        stats,
        trend: await getTrendComparison(req.user.uid, stats),
        patterns: detectGhostingPattern(apps),
        nameMismatch: !!uSnap.data()?.gmailNameMismatch, gmailName: uSnap.data()?.gmailName||'',
        digestOptOut: !!uSnap.data()?.gmailDigestOptOut,
        lastSynced:sum.lastSynced?.toDate?.()?.toISOString()||null });
    } catch(e) { res.status(500).json({ error:e.message }); }
  });

  // AI replies are supposed to be pure JSON, but a model occasionally wraps it
  // in a sentence or leaves a trailing comment — this salvages the {...} block
  // instead of the whole request dying on a strict JSON.parse. Every route
  // below also now console.errors the REAL failure reason before responding,
  // since "Couldn't generate a reply. Try again." told nobody — including us
  // in the server logs — what actually broke.
  function _gpipeSafeParseJson(text) {
    const cleaned = (text||'').trim().replace(/```json|```/g,'').trim();
    try { return JSON.parse(cleaned); } catch(e) {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch(e) {} }
    return null;
  }

  // Best-effort "who do I actually send this to" lookup — pulls the From
  // address off the most recent tracked email for this company so the
  // Gmail-compose link can be pre-addressed, not just pre-filled with text.
  async function _gpipeRecipientForCompany(uid, tokens, company) {
    try {
      const sSnap = await db.collection('users').doc(uid).collection('gmailBrain').doc('summary').get();
      if (!sSnap.exists) return null;
      const apps = sSnap.data().applications || [];
      const a = apps.find(a => normaliseStr(a.company) === normaliseStr(company));
      const lastEvent = a ? [...(a.timeline||[])].reverse().find(e=>e.threadId) : null;
      if (!lastEvent) return null;
      const oauth2 = getOAuthClient(); oauth2.setCredentials(tokens);
      const gmail  = google.gmail({ version:'v1', auth:oauth2 });
      const thread = await gmail.users.threads.get({ userId:'me', id:lastEvent.threadId, format:'metadata', metadataHeaders:['From'] });
      const lastMsg = thread.data.messages?.[thread.data.messages.length-1];
      const fromHdr = lastMsg?.payload?.headers?.find(h=>h.name.toLowerCase()==='from')?.value || '';
      const m = fromHdr.match(/<([^>]+)>/);
      return m ? m[1] : (/^[^\s<>]+@[^\s<>]+$/.test(fromHdr) ? fromHdr : null);
    } catch(e) { return null; }
  }

  // One-tap AI follow-up draft — text only, the user copies & sends it themselves.
  // Kievora never sends mail on a user's behalf (matches the "read-only access" promise
  // already shown on the Gmail panel).
  app.post('/api/gmail/draft-followup', authenticate, async (req,res) => {
    try {
      const { company, role, isRepeat } = req.body || {};
      if (!company) return res.status(400).json({ error:'company required' });
      const groqKey = (process.env.GROQ_API_KEY||'').split(',')[0].trim();
      if (!groqKey) return res.status(503).json({ error:'AI not configured' });
      const repeatNote = isRepeat
        ? ' This is a SECOND follow-up — they already sent one follow-up that went unanswered. Acknowledge that lightly without sounding annoyed, and keep it even shorter than a first follow-up would be.'
        : '';
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${groqKey}`},
        body: JSON.stringify({ model:'llama-3.1-8b-instant', max_tokens:260, temperature:0.6,
          messages:[{ role:'user', content:`Write a short, warm, professional follow-up email a job applicant can send to check on the status of their application. Company: ${company}. Role: ${role||'the role they applied for'}.${repeatNote} Keep it under 120 words, confident but not pushy, no generic filler, no placeholder brackets. Return ONLY valid JSON: {"subject":"...","body":"..."}` }]
        })
      });
      const d = await r.json();
      const draft = _gpipeSafeParseJson(d.choices?.[0]?.message?.content);
      if (!draft || !draft.body) { console.error('[gmail] draft-followup: no usable AI response —', JSON.stringify(d).slice(0,400)); return res.status(502).json({ error:'ai_response_invalid' }); }
      let to = null;
      try {
        const tokenDoc = await db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('tokens').get();
        if (tokenDoc.exists) { const tokens = await getValidTokens(req.user.uid, tokenDoc.data().tokens); to = await _gpipeRecipientForCompany(req.user.uid, tokens, company); }
      } catch(e) { /* non-critical — compose link just opens unaddressed */ }
      res.json({ success:true, draft, to });
    } catch(e) { console.error('[gmail] draft-followup:', e.message); res.status(500).json({ error:e.message }); }
  });

  // Records what the user actually did about a nudge, so the same suggestion
  // doesn't fire forever. Keyed by a normalised company id, one doc per company,
  // merged back into the pipeline on every /api/gmail/status read.
  app.post('/api/gmail/digest-optout', authenticate, async (req,res) => {
    try {
      const optOut = !!(req.body || {}).optOut;
      await db.collection('users').doc(req.user.uid).set({ gmailDigestOptOut: optOut }, { merge:true });
      res.json({ success:true, optOut });
    } catch(e) { res.status(500).json({ error:e.message }); }
  });

  app.post('/api/gmail/pipeline/mark-action', authenticate, async (req,res) => {
    try {
      const { company, action } = req.body || {};
      if (!company || !['followup','calendar','resume'].includes(action))
        return res.status(400).json({ error:'company and a valid action are required' });
      const appId = normaliseStr(company);
      const ref = db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('actions').collection('apps').doc(appId);
      const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (action === 'followup') {
        updates.followUpCount  = admin.firestore.FieldValue.increment(1);
        updates.lastFollowUpAt = admin.firestore.FieldValue.serverTimestamp();
        // This click means "user opened/copied a draft" — NOT "email was
        // sent". Stash what we'd need to actually check: who it should have
        // gone to, and when the click happened. The next background sync
        // reads this and checks the real Sent folder (see
        // _gpipeVerifyFollowUps in lib.js) — if nothing was actually sent
        // within the grace window, the credit gets reverted so the pipeline
        // reflects what really happened, not just what was clicked.
        let recipientEmail = null;
        try {
          const tokenDoc = await db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('tokens').get();
          if (tokenDoc.exists) {
            const tokens = await getValidTokens(req.user.uid, tokenDoc.data().tokens);
            recipientEmail = await _gpipeRecipientForCompany(req.user.uid, tokens, company);
          }
        } catch(e) { /* non-critical — verification just can't run for this one without an address */ }
        updates.pendingVerify = { email: recipientEmail, sinceTs: Date.now(), verified: false };
        updates.unverifiedFollowUp = admin.firestore.FieldValue.delete();
      } else if (action === 'calendar') {
        updates.calendarAdded = true;
      } else if (action === 'resume') {
        updates.resumeTailored = true;
      }
      await ref.set(updates, { merge:true });
      res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
  });

  // Called when KIE's [GMAIL_CORRECTION] tag fires — the user explicitly
  // denied/corrected/dismissed something Gmail-derived mid-conversation
  // ("that's not right", "I already declined that", "I was just testing").
  // Masks that specific fact so the pipeline stops re-asserting it, WITHOUT
  // touching the underlying synced data — the inbox stays the source of
  // truth. dismissedAtEventTs snapshots the app's current lastActivityTs, so
  // attachStaleFlags can tell a real newer email (lastActivityTs moves past
  // it) apart from the same old email resyncing (stays masked).
  app.post('/api/gmail/pipeline/correct', authenticate, async (req,res) => {
    try {
      const { company } = req.body || {};
      if (!company) return res.status(400).json({ error:'company required' });
      const appId = normaliseStr(company);
      const summarySnap = await db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('summary').get();
      const apps  = summarySnap.exists ? (summarySnap.data().applications || []) : [];
      const match = apps.find(a => isSameApplication(a, { company }));
      const eventTs = match ? match.lastActivityTs : Date.now();
      const ref = db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('actions').collection('apps').doc(appId);
      await ref.set({
        dismissed: true,
        dismissedAtEventTs: eventTs,
        dismissedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge:true });
      res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
  });

  // Generates interview prep — read-only. Pulls the user's most recently updated
  // resume for context using the exact same Firestore read GET /api/resumes
  // already does; never writes to resumes, never imports resume route logic.
  // Works fine with no resume on file too — just keeps talking points generic.
  app.post('/api/gmail/interview-prep', authenticate, async (req,res) => {
    try {
      const { company, role } = req.body || {};
      if (!company) return res.status(400).json({ error:'company required' });
      const groqKey = (process.env.GROQ_API_KEY||'').split(',')[0].trim();
      if (!groqKey) return res.status(503).json({ error:'AI not configured' });

      let resumeContext = '';
      try {
        const snap = await db.collection(RESUMES).where('userId','==',req.user.uid).get();
        const docs = snap.docs.map(d=>d.data()).sort((a,b)=>(b.updatedAt?._seconds||0)-(a.updatedAt?._seconds||0));
        const rd   = docs[0]?.resumeData;
        if (rd) {
          const skills = (rd.skills||[]).slice(0,12).join(', ');
          const exp    = (rd.workExperience||[]).slice(0,3).map(w=>`${w.title||w.role||''} at ${w.company||''}`).filter(s=>s.trim()!=='at').join('; ');
          resumeContext = ` Candidate background — current/target title: ${rd.jobTitle||'n/a'}. Skills: ${skills||'n/a'}. Recent experience: ${exp||'n/a'}. Summary: ${(rd.summary||'').slice(0,300)}`;
        }
      } catch(e) { /* no resume yet — prep proceeds without it */ }

      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${groqKey}`},
        body: JSON.stringify({ model:'llama-3.1-8b-instant', max_tokens:500, temperature:0.6,
          messages:[{ role:'user', content:`Generate interview prep for a candidate interviewing at ${company}${role?' for the role of '+role:''}.${resumeContext||' No resume on file — keep talking points generic but still genuinely useful.'}
  Return ONLY valid JSON in this exact shape, nothing else:
  {"questions":["q1","q2","q3","q4","q5"],"talkingPoints":["p1","p2","p3"]}
  - questions: 5 likely interview questions specific to this company and role — mix behavioral with role-specific/technical or situational, no generic filler like "tell me about yourself"
  - talkingPoints: 3 short, specific things the candidate should be ready to bring up, grounded in their actual background when provided — not generic career advice` }]
        })
      });
      const d = await r.json();
      const prep = _gpipeSafeParseJson(d.choices?.[0]?.message?.content);
      if (!prep || !prep.questions) { console.error('[gmail] interview-prep: no usable AI response —', JSON.stringify(d).slice(0,400)); return res.status(502).json({ error:'ai_response_invalid' }); }
      res.json({ success:true, prep });
    } catch(e) { console.error('[gmail] interview-prep:', e.message); res.status(500).json({ error:e.message }); }
  });

  // Decodes a Gmail message payload into plain text, walking nested MIME parts.
  // Gmail base64url-encodes body data (- and _ instead of + and /).
  function extractPlainTextBody(payload) {
    function decode(data) { return Buffer.from((data||'').replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf-8'); }
    function walk(part) {
      if (!part) return '';
      if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
      if (part.parts) { for (const p of part.parts) { const r = walk(p); if (r) return r; } }
      return '';
    }
    let text = walk(payload);
    if (!text && payload?.body?.data) text = decode(payload.body.data);
    if (text.includes('<html') || /<div|<p>|<br/.test(text)) text = text.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
    return text;
  }

  // One-tap AI reply that actually references what the recruiter/employer said —
  // fetches the REAL full email body on-demand (the regular sync only ever stores
  // short snippets, kept that way to stay fast and cheap). Read-only: fetches the
  // thread, never sends, same "Kievora never sends mail for you" promise as the
  // follow-up drafts.
  app.post('/api/gmail/draft-reply', authenticate, async (req,res) => {
    try {
      const { company } = req.body || {};
      if (!company) return res.status(400).json({ error:'company required' });
      const sSnap = await db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('summary').get();
      const apps  = sSnap.exists ? (sSnap.data().applications||[]) : [];
      const a     = apps.find(a => normaliseStr(a.company) === normaliseStr(company));
      if (!a) return res.status(404).json({ error:'application not found' });
      const lastEvent = [...(a.timeline||[])].reverse().find(e=>e.threadId);
      if (!lastEvent) return res.status(404).json({ error:'no email on file for this yet — try syncing first' });
      const tokenDoc = await db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('tokens').get();
      if (!tokenDoc.exists) return res.status(401).json({ error:'Gmail not connected' });
      const tokens = await getValidTokens(req.user.uid, tokenDoc.data().tokens);
      const oauth2 = getOAuthClient(); oauth2.setCredentials(tokens);
      const gmail  = google.gmail({ version:'v1', auth:oauth2 });
      const thread = await gmail.users.threads.get({ userId:'me', id:lastEvent.threadId, format:'full' });
      const lastMsg = thread.data.messages?.[thread.data.messages.length-1];
      const body   = extractPlainTextBody(lastMsg?.payload).slice(0,1500);
      if (!body) return res.status(404).json({ error:"couldn't read that email's content" });
      const groqKey = (process.env.GROQ_API_KEY||'').split(',')[0].trim();
      if (!groqKey) return res.status(503).json({ error:'AI not configured' });
      const rr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${groqKey}`},
        body: JSON.stringify({ model:'llama-3.1-8b-instant', max_tokens:300, temperature:0.6,
          messages:[{ role:'user', content:`Write a reply to this email from someone at ${company}. Reference what they actually said specifically — quote or paraphrase a real detail from it, don't write something generic that could apply to any email. Keep it under 130 words, warm, professional, confident.\n\nTheir email:\n${body}\n\nReturn ONLY valid JSON: {"subject":"Re: ...","body":"..."}` }]
        })
      });
      const dd    = await rr.json();
      const draft = _gpipeSafeParseJson(dd.choices?.[0]?.message?.content);
      if (!draft || !draft.body) { console.error('[gmail] draft-reply: no usable AI response —', JSON.stringify(dd).slice(0,400)); return res.status(502).json({ error:'ai_response_invalid' }); }
      const fromHdr = lastMsg?.payload?.headers?.find(h=>h.name.toLowerCase()==='from')?.value || '';
      const toMatch = fromHdr.match(/<([^>]+)>/);
      const to = toMatch ? toMatch[1] : (/^[^\s<>]+@[^\s<>]+$/.test(fromHdr) ? fromHdr : null);
      res.json({ success:true, draft, to });
    } catch(e) { console.error('[gmail] draft-reply:', e.message); res.status(500).json({ error:e.message }); }
  });

  // Cross-references Gmail signal with resume content — but talks like a
  // hypothesis, never a verdict. Names the actual companies so the user can
  // verify it themselves rather than just trusting the AI. If there's more than
  // one resume, asks which one instead of silently guessing.
  app.get('/api/gmail/resume-gap', authenticate, async (req,res) => {
    try {
      const resumesSnap = await db.collection(RESUMES).where('userId','==',req.user.uid).get();
      const resumes = resumesSnap.docs.map(d=>({ id:d.id, ...d.data() }));
      if (!resumes.length) return res.json({ success:true, gap:null, reason:'no_resume' });

      if (resumes.length > 1 && !req.query.resumeId) {
        return res.json({ success:true, needsResumeChoice:true, resumes: resumes.map(r=>({ id:r.id, resumeName:r.resumeName||'Untitled' })) });
      }
      const chosen = req.query.resumeId ? resumes.find(r=>r.id===req.query.resumeId) : resumes[0];
      if (!chosen) return res.status(404).json({ error:'resume not found' });

      const sSnap = await db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('summary').get();
      if (!sSnap.exists) return res.json({ success:true, gap:null, reason:'no_gmail_data' });
      const apps = sSnap.data().applications || [];
      const advanced = apps.filter(a => ['interview_invite','assessment','offer','post_offer'].includes(a.status));
      if (advanced.length < 2) return res.json({ success:true, gap:null, reason:'not_enough_data' });

      const groqKey = (process.env.GROQ_API_KEY||'').split(',')[0].trim();
      if (!groqKey) return res.status(503).json({ error:'AI not configured' });
      const skills = (chosen.resumeData?.skills||[]).join(', ') || 'none listed';
      const emailContext = advanced.map(a => `${a.company}: ${(a.timeline||[]).map(t=>t.subject).join(' | ')}`).join('\n');

      const r2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${groqKey}`},
        body: JSON.stringify({ model:'llama-3.1-8b-instant', max_tokens:250, temperature:0.3,
          messages:[{ role:'user', content:`Resume skills listed: ${skills}.
  Email subject lines from companies that advanced this candidate to interview/assessment/offer stage:
  ${emailContext}

  Look for ONE specific skill or keyword that's clearly related to at least 2 of these companies' emails but is NOT in the resume skills list. Be conservative — only report something if there's a genuinely specific, real signal, not a vague guess. If nothing clear stands out, say so honestly rather than forcing a finding.
  Return ONLY valid JSON: {"found":true or false,"skill":"name or null","companies":["Company A","Company B"]}` }]
        })
      });
      const d2 = await r2.json();
      const result = _gpipeSafeParseJson(d2.choices?.[0]?.message?.content);
      if (!result) { console.error('[gmail] resume-gap: no usable AI response —', JSON.stringify(d2).slice(0,400)); return res.json({ success:true, gap:null, reason:'ai_response_invalid' }); }
      res.json({ success:true, gap: result.found ? { skill:result.skill, companies:result.companies||[] } : null, resumeUsed: chosen.resumeName||'Untitled' });
    } catch(e) { console.error('[gmail] resume-gap:', e.message); res.status(500).json({ error:e.message }); }
  });


  app.delete('/api/gmail/disconnect', authenticate, async (req,res) => {
    try {
      const tDoc = await db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('tokens').get();
      if (tDoc.exists) { const o=getOAuthClient(); o.setCredentials(tDoc.data().tokens); await o.revokeCredentials().catch(()=>{}); }
      const batch = db.batch();
      batch.delete(db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('tokens'));
      batch.delete(db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('summary'));
      batch.update(db.collection('users').doc(req.user.uid), { gmailConnected:false, gmailEmail:admin.firestore.FieldValue.delete(), gmailName:admin.firestore.FieldValue.delete(), gmailNameMismatch:admin.firestore.FieldValue.delete() });
      await batch.commit();
      res.json({ success:true });
    } catch(e) { res.status(500).json({ error:e.message }); }
  });
}; // end registerGmailRoutes
