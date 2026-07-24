// ═══════════════════════════════════════════════════════════════════════════
// server/tools.js — Resume CRUD + every one-shot AI career tool: analyze-resume,
// find-jobs, prompt-resume, career-roadmap, salary-intel, industry-intel,
// linkedin-optimize, mock-interview (q/fb), personal-brand, career-health,
// promotion-readiness, professional-msg, recruiter-intel, job-match,
// resignation-letter, kie-support, and resume PDF export.
// ═══════════════════════════════════════════════════════════════════════════
module.exports = function registerToolsRoutes(app) {
  const {
    admin, db, authenticate,
    RESUMES, USERS, PLANS, getPlanConfig, getUserPlanKey, UPGRADE_MESSAGES, FREE_RESUME_UPSELL_CHANCE,
    callKieAI, callKieAIJson, parseAIJson, callKieAIStream, KIE_MODELS,
  } = require('./lib');

  app.get('/api/resumes', authenticate, async (req, res) => {
    console.log('GET /api/resumes — uid:', req.user.uid);
    try {
      const snapshot = await db
        .collection(RESUMES)
        .where('userId', '==', req.user.uid)
        .get();

      const resumes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          const ta = a.updatedAt?._seconds ?? 0;
          const tb = b.updatedAt?._seconds ?? 0;
          return tb - ta;
        });

      console.log('GET /api/resumes — returned', resumes.length, 'docs');
      res.json(resumes);
    } catch (err) {
      console.error('GET /api/resumes ERROR:', err.code, err.message);
      res.status(500).json({ error: 'Failed to fetch resumes: ' + err.message });
    }
  });

  // ─── GET /api/resumes/:id ─────────────────────────────────────────────────────
  app.get('/api/resumes/:id', authenticate, async (req, res) => {
    try {
      const doc = await db.collection(RESUMES).doc(req.params.id).get();
      if (!doc.exists)                       return res.status(404).json({ error: 'Resume not found.' });
      if (doc.data().userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });
      res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
      console.error('GET /api/resumes/:id ERROR:', err.code, err.message);
      res.status(500).json({ error: 'Failed to fetch resume: ' + err.message });
    }
  });

  // ─── POST /api/resumes ─────────────────────────────────────────────────────────
  app.post('/api/resumes', authenticate, async (req, res) => {
    console.log('POST /api/resumes — uid:', req.user.uid, '| body keys:', Object.keys(req.body));
    try {
      const { resumeName, templateType, primaryColor, fontFamily, resumeData, atsScore, grade } = req.body;

      if (!resumeName || !templateType || !resumeData) {
        const missing = [!resumeName&&'resumeName', !templateType&&'templateType', !resumeData&&'resumeData'].filter(Boolean);
        console.error('POST /api/resumes — missing fields:', missing);
        return res.status(400).json({ error: 'Missing required fields: ' + missing.join(', ') });
      }

      const now    = admin.firestore.FieldValue.serverTimestamp();
      const docData = {
        userId:       req.user.uid,
        resumeName:   resumeName   || 'Untitled Resume',
        templateType: templateType || 'classic',
        primaryColor: primaryColor || '#7c3aed',
        fontFamily:   fontFamily   || 'sans',
        resumeData,
        createdAt: now,
        updatedAt: now,
      };
      // BUG FIX: ATS score used to be recomputed independently by up to three
      // completely different methods (AI-judged /api/analyze-resume, AI-judged
      // /api/career-health, and a client-side field-completeness heuristic) —
      // none of them shared, none of them persisted — so the same unchanged
      // resume could show a different "ATS Score" on every screen. Now the
      // real, AI-judged score gets stored ONCE on the resume record itself
      // and treated as the source of truth until content actually changes.
      if (typeof atsScore === 'number') docData.atsScore = Math.min(100, Math.max(0, atsScore));
      if (grade) docData.grade = grade;
      const docRef = await db.collection(RESUMES).add(docData);

      const created = await docRef.get();
      console.log('POST /api/resumes — created doc:', docRef.id);
      res.status(201).json({ id: docRef.id, ...created.data() });
    } catch (err) {
      console.error('POST /api/resumes ERROR:', err.code, err.message);
      res.status(500).json({ error: 'Failed to create resume: ' + err.message });
    }
  });

  // ─── PUT /api/resumes/:id ─────────────────────────────────────────────────────
  app.put('/api/resumes/:id', authenticate, async (req, res) => {
    try {
      const docRef = db.collection(RESUMES).doc(req.params.id);
      const doc    = await docRef.get();
      if (!doc.exists)                        return res.status(404).json({ error: 'Resume not found.' });
      if (doc.data().userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });

      const { resumeName, templateType, primaryColor, fontFamily, resumeData, atsScore, grade } = req.body;
      const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (resumeName   !== undefined) updates.resumeName   = resumeName;
      if (templateType !== undefined) updates.templateType = templateType;
      if (primaryColor !== undefined) updates.primaryColor = primaryColor;
      if (fontFamily   !== undefined) updates.fontFamily   = fontFamily;
      if (resumeData   !== undefined) updates.resumeData   = resumeData;

      // BUG FIX: same fix as POST — accept an explicit fresh score from a real
      // analysis, but if the content itself is changing in this same request
      // and nobody supplied a new score alongside it, the OLD stored score no
      // longer describes the new content — clear it instead of silently
      // leaving a stale number that no longer matches what's on the page.
      // Content-only saves (template swap, name change, no resumeData in the
      // request) leave the existing score untouched, which is the actual fix
      // for "I didn't change anything but the score changed" — it now simply
      // doesn't get touched at all unless content or a fresh score is present.
      if (typeof atsScore === 'number') {
        updates.atsScore = Math.min(100, Math.max(0, atsScore));
        if (grade) updates.grade = grade;
      } else if (resumeData !== undefined) {
        updates.atsScore = admin.firestore.FieldValue.delete();
        updates.grade    = admin.firestore.FieldValue.delete();
      }

      await docRef.update(updates);
      const updated = await docRef.get();
      res.json({ id: docRef.id, ...updated.data() });
    } catch (err) {
      console.error('PUT /api/resumes/:id ERROR:', err.code, err.message);
      res.status(500).json({ error: 'Failed to update resume: ' + err.message });
    }
  });

  // ─── DELETE /api/resumes/:id ──────────────────────────────────────────────────
  app.delete('/api/resumes/:id', authenticate, async (req, res) => {
    try {
      const docRef = db.collection(RESUMES).doc(req.params.id);
      const doc    = await docRef.get();
      if (!doc.exists)                        return res.status(404).json({ error: 'Resume not found.' });
      if (doc.data().userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden.' });
      await docRef.delete();
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE /api/resumes/:id ERROR:', err.code, err.message);
      res.status(500).json({ error: 'Failed to delete resume: ' + err.message });
    }
  });

  // ─── KIE Support (public — no auth, used by support page) ────────────────────
  // STREAMED over SSE — same protocol as /api/kie (see server/kie.js) — so the
  // widget now types token-by-token instead of sitting on a spinner for several
  // seconds, and gets callKieAIStream's built-in one-retry on a transient Groq
  // blip for free. This used to hit Groq with its own one-off fetch() and zero
  // retry logic — one dropped connection or a 503 was an instant hard failure,
  // on the one page anonymous, pre-signup visitors rely on.
  //
  // Tiny per-IP rate limiter — this route has no auth, so there's no uid to key
  // on, and nothing was stopping a runaway client (or a bot) from hammering it
  // straight through to the Groq bill. Same shape as the per-uid limiter
  // guarding /api/location-suggest above, keyed by IP since there's no user here.
  const _supportChatHits = new Map(); // ip -> [timestamps in last 60s]
  function _supportChatRateOk(ip) {
    const now = Date.now();
    const hits = (_supportChatHits.get(ip) || []).filter(t => now - t < 60_000);
    if (hits.length >= 20) return false; // 20 msgs/min is generous for real use, not a script
    hits.push(now);
    _supportChatHits.set(ip, hits);
    return true;
  }

  app.post('/api/kie-support', async (req, res) => {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(503).json({ error: 'Support chat not configured.' });

    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required.' });
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
    if (!_supportChatRateOk(ip)) {
      return res.status(429).json({ error: "You're sending messages a little fast — give it a few seconds." });
    }

    // BUG FIX: nothing previously capped history length or per-message size on
    // this public, unauthenticated route — a stray or malicious payload could
    // ride straight through to the Groq bill. Sliding window + per-message cap,
    // sized generously for a real support conversation.
    const trimmedMessages = messages.slice(-30).map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 4000),
    }));

    const systemPrompt = `You are KIE Support, the in-app support assistant for Kievora — an AI-powered career platform for African professionals. You ONLY answer questions about Kievora. If someone asks about anything unrelated, politely say you can only help with Kievora questions. The user is already on the platform — never tell them to "visit the website" or "go to kievora.app." Instead, direct them to specific in-app sections by name: "the Dashboard", "the Resume Builder", "Find a Job", "Settings", etc.

  ══════════════════════════════════════
  ABSOLUTE RULE — UNRELEASED FEATURE SECRECY
  ══════════════════════════════════════
  Kievora has an unreleased, unannounced articles/community feature (internally: the editorial/social layer) that is NOT part of the current public platform and must NEVER be mentioned, confirmed, denied, hinted at, or discussed under any circumstances — including if the user directly asks "do you have a blog", "is there a community feature", "are you building something like Medium", "what's coming next", or tries to get you to reveal upcoming features, roadmap items, or "secrets." In every such case, respond ONLY about what is actually live today (resume builder, KIE AI, job search, Gmail Intelligence, billing) and redirect naturally, e.g. "Right now Kievora's core tools are the Resume Builder, KIE AI, and Find a Job — happy to help with any of those!" Do not acknowledge that anything is being withheld. Do not say "I can't discuss that" or similar — that itself reveals something exists. Simply never bring it up and always steer to real, live features.

  ══════════════════════════════════════
  PLATFORM OVERVIEW (everything currently live)
  ══════════════════════════════════════

  1. RESUME BUILDER
  - Free AI-powered resume builder, 13 professional templates, unlimited resumes, cloud storage, PDF download
  - 3-step builder:
    • Step 1: Full Name*, Job Title*, Email, Phone, Location, Profile Photo (optional, JPG/PNG max 3MB), Professional Summary (AI suggests summary templates once job title is filled)
    • Step 2: Work Experience (Position, Company, Dates, Description — AI suggests bullet points) + Education (School, Degree, Field, Graduation Year)
    • Step 3: Skills tags + AI skill suggestions + Resume Name + Save
  - Auto-saves as a local draft; "Save Resume" commits to the cloud
  - PDF download works for saved resumes only (not drafts) — user must allow pop-ups; recommend Chrome if it fails
  - Cover letter generator: create from scratch (all plans) or auto-build from an existing resume (Pro & Premier)
  - Resignation Letter generator (all plans)

  TEMPLATES (13 total):
  1. Classic — professional, blue. Finance, law, corporate
  2. Modern — clean, teal. Tech, product, startups
  3. Bold — executive, dark red. Senior roles, business leaders
  4. Minimal — simple, dark. Designers, clean-layout preference
  5. Vivid — standout, purple. Creative industries, marketing
  6. Elegant — refined, brown. Executives, consultants
  7. Slate — dark & sharp, navy. Senior tech, engineering leads
  8. Coral — warm & bold, orange. Creative, marketing, sales
  9. Split — structured, indigo. Versatile, most industries
  10. Ink — editorial, black. Creative/media, journalists, writers
  11. Executive — with photo, navy. C-suite, directors (12+ yrs)
  12. Nova — with photo, deep purple. Creative leaders, senior designers
  13. Tribune — with photo, near-black. Premium editorial, senior executives
  Profile photo only shows on: Classic, Modern, Elegant, Slate, Split, Executive, Nova, Tribune.
  Free plan unlocks 5 templates; Pro & Premier unlock all 13.
  TEMPLATE MATCH QUIZ: 3 questions (industry, experience level, style preference) → AI recommends the best template. Found on the Dashboard.

  2. SCORING & ANALYSIS
  - ATS SCORE: badge shown on every saved resume; tap it for a checklist of exactly what's missing
  - RESUME ANALYZER: deep AI analysis — score, letter grade (A+ to D), strengths, weaknesses, suggestions. Free gets the basic score; Pro & Premier get the full breakdown with specifics on what to fix and why
  - JOB MATCH ANALYZER: paste any job description and get a fit score against your resume (available on all plans, including Free)

  3. KIE AI — the assistant woven through the app
  - Two ways users experience KIE: (a) inline assist — quiet in-context help while building (summary suggestions, bullet rewrites, skill suggestions, no chat window), and (b) full KIE chat — open conversation via "Ask KIE AI," for anything from rewriting a bullet to career decisions
  - 5 chat modes: Default, Deep Think, Web Search, Quick Answer, Creative — user picks per conversation
  - Message tiers by plan: Free = KIE Spark only; Pro = Spark + Core (more messages/month); Premier = Spark + Core + Nova (highest allocation)
  - Supports resume upload for personalized coaching
  - 10 AI Career Tools (gated by plan): Health Score, Roadmap, LinkedIn AI, Pro Message, AI Resume Builder (Pro & up); Salary Intel, Mock Interview, Promotion Ready, Personal Brand, Recruiter View (Premier only)

  4. FIND A JOB
  - Job board with search (title, skill, keyword) and filters: All, Remote Only, Full-time, Part-time, Contract
  - Free plan: can browse and view listings but has limited applying; Pro & Premier: open and apply to every listing
  - Each listing has an "Apply for this role" action that opens the employer's real application page

  5. GMAIL INTELLIGENCE (KIE × Gmail)
  - User connects their Gmail account from the Gmail AI page
  - KIE scans the inbox and auto-tracks job applications, interviews, offers, and recruiter emails — no manual entry
  - The Dashboard updates itself as new relevant emails arrive
  - KIE also tailors its coaching advice using this inbox context (e.g. "I see you have an interview with X — want to prep?")
  - Fully optional and disconnectable at any time from Settings

  6. ONBOARDING
  - New users pick one professional category (e.g. Software & Tech, Design & Creative, Marketing & Growth, Finance & Banking, etc.) and enter their current or target job title (required)
  - This personalizes KIE's suggestions, job matches, and the content the user sees — can be changed anytime from the profile
  - Onboarding can be skipped and completed later

  7. BILLING & PLANS
  - Free ($0): 5 templates, AI bullet/skill suggestions in the builder, ATS score, cover letter from scratch, 50 KIE (Spark) messages/month, Job Match Analyzer, Resignation Letter generator, 50MB storage
  - Pro ($7/mo): everything in Free + all 13 templates, AI Image Analyzer + Upload & Analyze, full ATS breakdown, auto-build cover letter from resume, 5 AI Career Tools, Spark + Core messages, apply to every job listing, priority support, 5GB storage
  - Premier ($15/mo): everything in Pro + all 10 AI Tools, highest KIE message allocation (Spark, Core & Nova), full Recruiter View report, instant priority support, unlimited storage
  - Users can also buy one-off message top-ups if they run out mid-cycle
  - Payments are processed securely (card payments supported); billing/usage is managed from the Billing page

  8. ACCOUNT & PROFILE
  - Users can view/edit their profile, share a public profile link, manage connected sign-in method (Google or email/password), and sign out from Settings
  - Support page (this one) has FAQs, this chat, and a way to reach the team directly

  ══════════════════════════════════════
  TROUBLESHOOTING
  ══════════════════════════════════════
  - PDF won't download: save the resume first, allow pop-ups, try Chrome
  - Photo not on resume: switch to a photo-supported template (Classic, Modern, Elegant, Slate, Split, Executive, Nova, Tribune)
  - Resume not saving: check internet connection, confirm logged in
  - App not loading: refresh, clear cache, try a different browser
  - Gmail not tracking emails: confirm it's connected in Settings, and that Gmail permissions weren't revoked
  - Job applying is locked: user is on Free — applying to every listing requires Pro or Premier
  - Newsletter/billing/payment issue: suggest checking the Billing page first, then contacting support@kievora.app if it persists

  ══════════════════════════════════════
  RESPONSE FORMAT
  ══════════════════════════════════════
  Concise, friendly, conversational. Max 3-4 sentences unless a step-by-step is genuinely needed.
  After every reply (except when refusing an off-topic question), end your message on its own final line with up to 3 short natural follow-up questions the user might ask next, in this exact hidden format and nothing else on that line:
  <<SUGGESTIONS: question one? | question two? | question three?>>
  Keep each suggestion under 6 words, phrased as something the USER would ask (not you). Only suggest things directly relevant to what was just discussed. Never include a suggestion related to the unreleased feature covered by the Absolute Rule above.`;

    // ── SSE headers — identical protocol to /api/kie ──────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const sendSSE = (data) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };

    let fullReply = '';
    try {
      await callKieAIStream('spark', systemPrompt, trimmedMessages, { max_tokens: 600, temperature: 0.6 }, (token) => {
        fullReply += token;
        sendSSE({ t: 'd', v: token });
      });

      if (!fullReply.trim()) {
        fullReply = "Sorry, I couldn't get a response right now. Try emailing support@kievora.app";
        sendSSE({ t: 'd', v: fullReply });
      }
      sendSSE({ t: 'done' });
      res.end();

      // ── Admin logging (fire-and-forget) ──────────────────────────────────────
      db.collection('supportChats').add({
        messages:  [...trimmedMessages, { role: 'assistant', content: fullReply }],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    } catch (err) {
      console.error('POST /api/kie-support stream error:', err.message);
      sendSSE({ t: 'err', v: 'KIE is unavailable right now. Please try again, or email support@kievora.app.' });
      res.end();
    }
  });

  // ─── Lightweight few-shot grounding for resume analysis ───────────────────────
  // Real RAG (embeddings + vector search) is overkill for a curated set this
  // small — this is a simple category detector + static example bank. Same
  // grounding benefit, zero new infra, zero added latency from a retrieval call.
  const RESUME_FEWSHOT = {
    swe: {
      label: 'Software / Engineering',
      keywords: ['engineer', 'developer', 'software', 'backend', 'frontend', 'full stack', 'fullstack', 'devops', 'programmer', 'api', 'sde', 'sre'],
      examples: `- Weak bullet: "Responsible for building features for the company website."
  Strong rewrite: "Built and shipped 12 customer-facing features on a React/Node stack, cutting average page load time by 40% and reducing support tickets by 25%."
- Weak bullet: "Worked on backend systems and databases."
  Strong rewrite: "Redesigned the order-processing service, reducing p99 latency from 800ms to 120ms and eliminating a recurring outage that had cost ~6 hours/month of downtime."
- Common ATS failure for this field: listing only tech-stack nouns ("Python, AWS, Docker") with no evidence of what was built or the scale/impact — recruiters and ATS scoring both weight "did X, resulting in Y" far higher than a bare skills list.`,
    },
    product: {
      label: 'Product / PM',
      keywords: ['product manager', 'product owner', 'roadmap', 'product strategy', 'pm ', ' pm', 'product lead'],
      examples: `- Weak bullet: "Managed the product roadmap and worked with engineering."
  Strong rewrite: "Owned the roadmap for a 3-team product line, shipping a redesigned onboarding flow that raised activation rate from 34% to 51% within one quarter."
- Weak bullet: "Gathered requirements from stakeholders."
  Strong rewrite: "Ran discovery across 20+ customer interviews to identify the top churn driver, then led a cross-functional team to ship a fix that cut 90-day churn by 18%."
- Common ATS failure for this field: describing process ("ran standups," "wrote PRDs") instead of outcomes — a PM resume needs metrics tied to user or business impact, not process ownership alone.`,
    },
    design: {
      label: 'Design / UX',
      keywords: ['designer', 'ux', 'ui', 'product design', 'visual design', 'figma', 'user research'],
      examples: `- Weak bullet: "Designed user interfaces for mobile and web products."
  Strong rewrite: "Redesigned the checkout flow across iOS/web, reducing drop-off by 22% and cutting average completion time from 90s to 35s, validated through 3 rounds of usability testing."
- Weak bullet: "Collaborated with product and engineering teams."
  Strong rewrite: "Partnered with PM and 4 engineers to ship a design system used across 15+ screens, cutting new-feature design time by roughly a third."
- Common ATS failure for this field: leaning entirely on a portfolio link with no bullet content at all — a portfolio link should support a resume's claims, not replace them, since ATS and recruiters skim text first.`,
    },
    sales_marketing: {
      label: 'Sales / Marketing',
      keywords: ['sales', 'account executive', 'marketing', 'seo', 'campaign', 'growth', 'quota', 'revenue', 'demand gen'],
      examples: `- Weak bullet: "Responsible for meeting sales targets and managing client relationships."
  Strong rewrite: "Closed $1.2M in new ARR across 40 enterprise accounts, exceeding quota by 118% for 3 consecutive quarters."
- Weak bullet: "Ran marketing campaigns to increase brand awareness."
  Strong rewrite: "Launched a paid + organic campaign that grew qualified leads by 65% quarter-over-quarter while cutting cost-per-lead by 30%."
- Common ATS failure for this field: vague ownership language ("helped drive growth," "supported sales efforts") with no attached number — this category is scored almost entirely on quantified revenue/growth/conversion metrics.`,
    },
    finance: {
      label: 'Finance / Accounting',
      keywords: ['financial analyst', 'accounting', 'accountant', 'finance', 'audit', 'controller', 'fp&a', 'investment'],
      examples: `- Weak bullet: "Prepared financial reports and assisted with budgeting."
  Strong rewrite: "Built a rolling 13-week cash flow model that flagged a liquidity shortfall 6 weeks early, giving leadership time to renegotiate a credit line before it became urgent."
- Weak bullet: "Performed financial analysis for the team."
  Strong rewrite: "Identified $340K in annual vendor overspend through a cost-audit model, leading to renegotiated contracts that cut the line item by 22%."
- Common ATS failure for this field: describing tools used (Excel, SAP) instead of the financial outcome those tools produced — the tool is assumed, the insight/decision it enabled is what differentiates a candidate.`,
    },
    general: {
      label: 'General / Other',
      keywords: [],
      examples: `- Weak bullet: "Responsible for daily operations and team coordination."
  Strong rewrite: "Coordinated a team of 8 across 3 shifts, cutting scheduling conflicts by 60% and reducing overtime costs by $15K/year."
- Weak bullet: "Helped improve processes at the company."
  Strong rewrite: "Redesigned the intake process for customer requests, cutting average resolution time from 4 days to 36 hours."
- Common ATS failure across all fields: bullets that describe a responsibility instead of a result — "did X" scores lower than "did X, which caused Y," even when X is genuinely impressive work.`,
    },
  };

  function detectResumeCategory(text) {
    const lower = text.toLowerCase();
    let best = 'general', bestScore = 0;
    for (const [key, cat] of Object.entries(RESUME_FEWSHOT)) {
      if (key === 'general') continue;
      const score = cat.keywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = key; }
    }
    return best;
  }

  // ─── POST /api/analyze-resume ──────────────────────────────────────────────────
  app.post('/api/analyze-resume', authenticate, async (req, res) => {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(503).json({ error: 'AI analysis not configured.' });

    // Gate: free users get basic analysis back but the response is flagged so
    // the frontend can show the "upgrade to see your score" prompt.
    const planKey = await getUserPlanKey(req.user.uid);
    const planCfg = getPlanConfig(planKey);
    const isFreePlan = planKey === 'free';

    const { resumeText, forceResume } = req.body;
    if (!resumeText || resumeText.trim().length < 30) {
      return res.status(400).json({ error: 'Resume content is too short to analyze.' });
    }

    // forceResume=true is sent by the dedicated "Upload & Analyze" tool and the
    // job-matching upload flow — the user explicitly opened those specifically
    // to analyze a resume, so there's nothing to classify, treat it as one.
    // Plain KIE chat attachments (forceResume unset) get honestly classified
    // first, since a random PDF dropped into chat is often NOT a resume —
    // forcing an ATS score onto a biography, book excerpt, or roadmap request
    // is actively wrong and confusing.
    const classificationInstruction = forceResume
      ? `The user uploaded this through the resume-analysis tool, so treat it as a resume/CV and analyze it fully even if formatting is unusual. Set "isResume": true.`
      : `First, honestly judge whether this document actually IS a resume/CV. Plenty of uploads are not — a personal biography, a book or article excerpt, notes for a career roadmap, a cover letter, a legal or business document (contract, agreement, invoice), or something with nothing to do with careers at all. Set "isResume" to true only if it genuinely is a resume or CV. If it is not: set "isResume": false, fill "docType" with one short label (e.g. "personal biography", "book excerpt", "career roadmap notes", "cover letter", "legal agreement", "unrelated document"), fill "docNote" with one warm, specific sentence telling the user what you actually see in it, and set "couldBeResume" — true only if there's a REALISTIC chance the user actually meant this as a resume attempt (e.g. it lists some work history or skills but is poorly formatted, or it's genuinely ambiguous), false if it's obviously and entirely unrelated to a resume (a legal contract, an invoice, a novel, an unrelated article — nothing a reasonable person would mistake for a CV). When isResume is false you may leave every resume-scoring field (atsScore, grade, strengths, weaknesses, suggestions, missingItems, workExperience, education, skills, certifications, projects, languages) empty or zero — do NOT invent a fake ATS score or fake resume content for something that isn't a resume.`;

    const category = detectResumeCategory(resumeText);
    const fewshot  = RESUME_FEWSHOT[category];

    const prompt = `You are an expert ATS resume analyst and career coach. Analyze the document text below and return ONLY a valid JSON object — no markdown, no code fences, no explanation before or after.

  ${classificationInstruction}

  Return this exact JSON structure (fill every field, never leave arrays empty if data exists):
  {
    "isResume": true,
    "docType": "",
    "docNote": "",
    "couldBeResume": false,
    "fullName": "",
    "jobTitle": "",
    "email": "",
    "phone": "",
    "location": "",
    "summary": "",
    "workExperience": [{"position":"","company":"","startDate":"","endDate":"","description":""}],
    "education": [{"degree":"","field":"","school":"","graduationDate":""}],
    "skills": [],
    "certifications": [{"name":"","issuer":"","date":""}],
    "projects": [{"name":"","url":"","description":""}],
    "languages": [{"language":"","proficiency":""}],
    "atsScore": 0,
    "grade": "",
    "strengths": [],
    "weaknesses": [],
    "suggestions": [],
    "missingItems": []
  }

  Scoring rules — atsScore must be an integer 0–100, only meaningful when isResume is true:
  - Contact info (15 pts): name(5) + email(5) + phone(3) + location(2)
  - Professional summary (15 pts): present(8) + 40+ words(4) + role-specific(3)
  - Work experience (30 pts): has entries(10) + descriptions present(8) + quantified result/metric(8) + action verbs(4)
  - Education (15 pts): has entries(10) + degree and field present(5)
  - Skills (15 pts): has skills(5) + 5 or more skills(5) + mix technical and soft(5)
  - certifications: extract EVERY certification/license mentioned anywhere in the document (name, issuing org, date if present) — do not skip these even if listed briefly in a single line
  - projects: extract EVERY named project (personal, academic, or professional side-projects distinct from work history), with a URL if one is given and a short description
  - languages: extract EVERY spoken/written language listed with its proficiency level if stated (e.g. "Fluent", "Native", "Conversational")
  - Formatting signals (10 pts): LinkedIn/website present(3) + consistent dates(3) + no obvious errors(4)
  - Grade: "A+" ≥90, "A" 80–89, "B+" 75–79, "B" 65–74, "C+" 55–64, "C" 45–54, "D" <45
  - strengths: 2–4 SPECIFIC things done well — reference actual content, not generic praise
  - weaknesses: 2–3 SPECIFIC problems (e.g. "No summary", "Bullets lack metrics", "Only 2 skills listed")
  - suggestions: 3–5 CONCRETE fixes with exact guidance (e.g. "Turn 'managed team' into 'Managed a team of [X], delivering [result]'")
  - missingItems: only genuinely absent sections that would strengthen the resume

  This resume reads as ${fewshot.label} — use these real weak→strong rewrite examples from that exact field as your calibration for what "specific" and "concrete" mean in your suggestions and weaknesses (do NOT copy these examples verbatim into your output, they're reference calibration only, your suggestions must come from the actual document below):
  ${fewshot.examples}

  DOCUMENT TEXT:
  ${resumeText.slice(0, 7000)}`;

    try {
      const { data: analysis, retried } = await callKieAIJson(
        'spark',
        'You are an expert resume analyst. Always respond with valid JSON only — no extra text, no markdown.',
        [{ role: 'user', content: prompt }],
        { max_tokens: 2500, temperature: 0.15 }
      );
      if (retried) console.log('POST /api/analyze-resume — needed one self-correction retry');

      console.log(`POST /api/analyze-resume — isResume:${analysis.isResume !== false} score:${analysis.atsScore} grade:${analysis.grade} category:${category} plan:${planKey} uid:${req.user.uid}`);

      // Not a resume — nothing to score or gate. Hand back the classification
      // so the frontend can respond naturally about the actual content instead
      // of forcing a fake ATS report onto a biography, book, or random file.
      if (!forceResume && analysis.isResume === false) {
        return res.json({
          isResume: false,
          docType:  analysis.docType || 'document',
          docNote:  analysis.docNote || "This doesn't look like a resume.",
          couldBeResume: analysis.couldBeResume === true,
          fullName: analysis.fullName || null,
        });
      }

      // Free plan used to get the analysis stripped down to just a "your
      // resume has been analyzed, upgrade to see it" tease — the real score,
      // strengths, weaknesses, and suggestions were computed above either
      // way (same AI call, same cost) and then thrown away. Now everyone
      // gets the full breakdown; only an occasional (not every-time) soft
      // upgrade line rides along for free users, toward the things that are
      // still genuinely paid (templates, real file exports, cover letters) —
      // see FREE_RESUME_UPSELL_CHANCE.
      if (isFreePlan && Math.random() < FREE_RESUME_UPSELL_CHANCE) {
        analysis.upgradeMessage = UPGRADE_MESSAGES.resumeUpload();
      }
      res.json(analysis);
    } catch (err) {
      console.error('POST /api/analyze-resume ERROR:', err.message);
      res.status(500).json({ error: 'Analysis failed: ' + err.message });
    }
  });

  // ─── POST /api/find-jobs — Merges JSearch + Adzuna + Remotive + Jooble ────────
  // Env vars: JSEARCH_API_KEY (rapidapi.com), ADZUNA_APP_ID, ADZUNA_APP_KEY (adzuna.com/developers),
  //           JOOBLE_API_KEY (jooble.org/api/about — free tier, default 500 req limit)
  // Remotive is always on (free, no key needed)

  // ─── Country → Adzuna country code map ───────────────────────────────────────
  // Adzuna supports a fixed set of country codes. If the user's selected country
  // isn't on this list, we skip Adzuna entirely for that request rather than
  // fall back to an unrelated country — falling back would silently show jobs
  // from the wrong country, which defeats the point of country filtering.
  const ADZUNA_COUNTRIES = {
    us:'us', gb:'gb', uk:'gb', au:'au', ca:'ca', za:'za',
    de:'de', fr:'fr', br:'br', in:'in', nl:'nl', sg:'sg',
    nz:'nz', at:'at', be:'be', it:'it', mx:'mx', pl:'pl', ru:'ru',
  };
  // Only used when the user hasn't picked a country at all ("worldwide" mode).
  const ADZUNA_FALLBACK = ['us','gb','za'];

  // Full country names, keyed by the same lowercase codes used across the app
  // (find-jobs.html's country selector, /api/user-country, etc). Used to (a)
  // embed a real location phrase in the JSearch query and (b) match Remotive's
  // free-text "candidate_required_location" field against the selected country.
  const COUNTRY_NAMES = {
    ng: 'Nigeria', gh: 'Ghana', ke: 'Kenya', za: 'South Africa', eg: 'Egypt',
    us: 'United States', gb: 'United Kingdom', uk: 'United Kingdom', ca: 'Canada',
    au: 'Australia', de: 'Germany', fr: 'France', in: 'India', sg: 'Singapore',
    ae: 'United Arab Emirates', br: 'Brazil', nl: 'Netherlands',
  };

  // Maps IP → {country, countryCode} via ip-api.com (free, no key, 45 req/min).
  // Returns null gracefully on any failure — job search still works, just without
  // the country personalisation.
  const _ipCountryCache = new Map(); // in-memory per server lifetime, avoids hammering ip-api
  async function detectCountryFromIp(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1') return null;
    const clean = ip.replace(/^::ffff:/, '');
    if (_ipCountryCache.has(clean)) return _ipCountryCache.get(clean);
    try {
      const r = await fetch(`http://ip-api.com/json/${clean}?fields=status,country,countryCode`, { signal: AbortSignal.timeout(2500) });
      if (!r.ok) return null;
      const d = await r.json();
      if (d.status !== 'success') return null;
      const result = { country: d.country, countryCode: d.countryCode?.toLowerCase() };
      _ipCountryCache.set(clean, result);
      return result;
    } catch { return null; }
  }

  async function _fetchJSearch(query, limit, countryCode, locationOverride) {
    const KEY = process.env.JSEARCH_API_KEY;
    if (!KEY) return [];
    const isLocal = countryCode && countryCode !== 'worldwide';
    // JSearch strictly filters by the `country` param, but also recommends
    // including the location in the query text for best matching — so we do both.
    // A specific city/region from the location-suggestion dropdown beats the
    // generic country name for match quality.
    const countryName = isLocal ? (COUNTRY_NAMES[countryCode] || countryCode.toUpperCase()) : '';
    const locText = (locationOverride && locationOverride.trim()) || countryName;
    const q = isLocal ? `${query} in ${locText}` : query;
    const countryParam = isLocal ? `&country=${encodeURIComponent(countryCode)}` : '';
    try {
      const res = await fetch(
        `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(q)}${countryParam}&page=1&num_pages=1&date_posted=month`,
        { headers: { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).slice(0, limit).map(j => ({
        id:       j.job_id,
        title:    j.job_title,
        company:  j.employer_name,
        logo:     j.employer_logo || '',
        location: j.job_city ? `${j.job_city}${j.job_state ? ', '+j.job_state : ''}` : (j.job_is_remote ? 'Remote' : j.job_country || ''),
        country:  j.job_country || '',
        remote:   !!j.job_is_remote,
        salary:   j.job_min_salary && j.job_max_salary ? `$${Math.round(j.job_min_salary/1000)}k–$${Math.round(j.job_max_salary/1000)}k` : '',
        type:     j.job_employment_type || '',
        url:      j.job_apply_link,
        source:   'JSearch',
        posted:   j.job_posted_at_datetime_utc || '',
        snippet:  (j.job_description || '').replace(/\n/g, ' ').replace(/<[^>]+>/g,'').slice(0,200) + '…',
        description: (j.job_description || '').replace(/<[^>]+>/g,'').slice(0, 3000),
        requirements: (j.job_required_skills || []).join(', ') || '',
      }));
    } catch { return []; }
  }

  async function _fetchAdzuna(query, limit, countryCode) {
    const APP_ID  = process.env.ADZUNA_APP_ID;
    const APP_KEY = process.env.ADZUNA_APP_KEY;
    if (!APP_ID || !APP_KEY) return [];
    // Resolve which Adzuna country codes to query
    let countries;
    if (!countryCode || countryCode === 'worldwide') {
      countries = ADZUNA_FALLBACK;
    } else {
      const mapped = ADZUNA_COUNTRIES[countryCode];
      // Strict mode: if the user picked a specific country and Adzuna doesn't
      // cover it, skip Adzuna for this request instead of showing jobs from
      // an unrelated country — JSearch/Remotive still carry that country's coverage.
      if (!mapped) return [];
      countries = [mapped];
    }
    const perCountry = Math.ceil(limit / countries.length);
    const results    = [];
    await Promise.allSettled(countries.map(async country => {
      try {
        const res = await fetch(
          `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${APP_ID}&app_key=${APP_KEY}&results_per_page=${perCountry}&what=${encodeURIComponent(query)}&content-type=application/json`
        );
        if (!res.ok) return;
        const data = await res.json();
        (data.results || []).forEach(j => results.push({
          id:       String(j.id),
          title:    j.title,
          company:  j.company?.display_name || '',
          logo:     '',
          location: j.location?.display_name || '',
          country:  country.toUpperCase(),
          remote:   /remote/i.test(j.title + ' ' + (j.description||'')),
          salary:   j.salary_min && j.salary_max ? `$${Math.round(j.salary_min/1000)}k–$${Math.round(j.salary_max/1000)}k` : '',
          type:     j.contract_time || '',
          url:      j.redirect_url,
          source:   'Adzuna',
          posted:   j.created || '',
          snippet:  (j.description || '').replace(/<[^>]+>/g,'').slice(0,200) + '…',
          description: (j.description || '').replace(/<[^>]+>/g,'').slice(0, 3000),
          requirements: '',
        }));
      } catch { /* skip this country */ }
    }));
    return results;
  }

  // Remotive's "candidate_required_location" is free text (e.g. "Worldwide",
  // "USA Only", "UK, Europe"). There's no country filter param, so we filter
  // client-side: keep roles open to anyone, plus ones that name the selected
  // country; drop roles that are clearly restricted to somewhere else.
  const GLOBAL_LOCATION_HINTS = ['worldwide', 'anywhere', 'global', 'remote'];
  function _remotiveMatchesCountry(locationStr, countryCode, countryName) {
    const loc = (locationStr || '').toLowerCase();
    if (!loc) return true; // no restriction stated — assume open
    if (GLOBAL_LOCATION_HINTS.some(hint => loc.includes(hint))) return true;
    if (countryName && loc.includes(countryName.toLowerCase())) return true;
    if (countryCode && loc.includes(countryCode.toLowerCase())) return true;
    return false;
  }

  async function _fetchRemotive(query, limit, countryCode) {
    try {
      const res = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      const isLocal = countryCode && countryCode !== 'worldwide';
      const countryName = isLocal ? (COUNTRY_NAMES[countryCode] || '') : '';
      let jobs = data.jobs || [];
      if (isLocal) {
        jobs = jobs.filter(j => _remotiveMatchesCountry(j.candidate_required_location, countryCode, countryName));
      }
      return jobs.slice(0, limit).map(j => ({
        id:       String(j.id),
        title:    j.title,
        company:  j.company_name,
        logo:     j.company_logo_url || j.company_logo || '',
        location: j.candidate_required_location || 'Remote',
        country:  '',
        remote:   true,
        salary:   j.salary || '',
        type:     j.job_type || '',
        url:      j.url,
        source:   'Remotive',
        posted:   j.publication_date || '',
        snippet:  (j.description || '').replace(/<[^>]+>/g,'').slice(0,200) + '…',
        description: (j.description || '').replace(/<[^>]+>/g,'').slice(0, 3000),
        requirements: '',
      }));
    } catch { return []; }
  }

  // ─── Jooble — POST https://jooble.org/api/{key}, real local-board coverage ────
  // (Jobberman/MyJobMag-style listings) for markets Adzuna doesn't support, e.g.
  // Nigeria, Ghana, Kenya. Free tier default limit is 500 requests — the client
  // already caches results (session cache on find-jobs, 10-min cache on the
  // dashboard swiper) so normal usage should stay well under that.
  async function _fetchJooble(query, limit, countryCode, countryName, locationOverride) {
    const KEY = process.env.JOOBLE_API_KEY;
    if (!KEY) {
      console.warn('_fetchJooble — JOOBLE_API_KEY is not set in env vars, skipping Jooble.');
      return [];
    }
    const isLocal  = countryCode && countryCode !== 'worldwide';
    // A specific city/region picked from the location-suggestion dropdown beats
    // the generic country name — Jooble matches much better on "Lekki, Lagos"
    // than on just "Nigeria". BUT a bare street/area name alone is ambiguous
    // globally (e.g. "Allen Avenue" in Lagos vs. Jooble resolving "Allen" to
    // Allen, TX, USA) — always append the country name to disambiguate.
    const rawOverride = locationOverride && locationOverride.trim();
    const location = rawOverride
      ? (isLocal && countryName && !rawOverride.toLowerCase().includes(countryName.toLowerCase()) ? `${rawOverride}, ${countryName}` : rawOverride)
      : (isLocal ? countryName : '');
    try {
      const res = await fetch(`https://jooble.org/api/${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: query,
          location,
          page: '1',
        }),
      });
      if (!res.ok) {
        // Previously this failed completely silently, so a bad/expired key or a
        // malformed request looked identical to "no jobs" from the outside.
        const bodyText = await res.text().catch(() => '');
        console.error(`_fetchJooble — Jooble API returned ${res.status} ${res.statusText} for query:"${query}" location:"${location}" — body: ${bodyText.slice(0, 300)}`);
        return [];
      }
      const data = await res.json();
      console.log(`_fetchJooble — "${query}" location:"${location}" → ${(data.jobs||[]).length} jobs (totalCount:${data.totalCount ?? 'n/a'})`);
      return (data.jobs || []).slice(0, limit).map(j => ({
        id:       String(j.id),
        title:    j.title,
        company:  j.company || '',
        logo:     '',
        location: j.location || location || '',
        country:  isLocal ? countryCode.toUpperCase() : '',
        remote:   /remote/i.test((j.title||'') + ' ' + (j.snippet||'')),
        salary:   j.salary || '',
        type:     j.type || '',
        url:      j.link,
        source:   'Jooble',
        posted:   j.updated || '',
        snippet:  (j.snippet || '').replace(/<[^>]+>/g,'').slice(0,200) + '…',
        description: (j.snippet || '').replace(/<[^>]+>/g,'').slice(0, 3000),
        requirements: '',
      }));
    } catch (err) {
      console.error(`_fetchJooble — request threw for query:"${query}":`, err.message);
      return [];
    }
  }

  // ─── Careerjet — v4 API, real Nigeria-indexed coverage (careerjet.com.ng) ─────
  // Added specifically because Adzuna doesn't support Nigeria at all (see
  // ADZUNA_COUNTRIES above), which left Nigeria search leaning on JSearch +
  // Remotive + Jooble alone. Careerjet runs a dedicated Nigeria site
  // (careerjet.com.ng), so locale_code=en_NG searches that index directly —
  // real Nigerian listings, not global/worldwide postings passed off as local.
  // Env var: CAREERJET_API_KEY — free, sign up as a publisher at
  // careerjet.com/partners/register/as-publisher, no approval wait for the
  // v4 API. Auth is HTTP Basic: the API key as username, empty password.
  // Only wired in for countries confirmed to have a Careerjet locale below —
  // add more once you've verified the locale exists (an unsupported locale
  // returns a 400, which is caught and just skips this source for that request).
  const CAREERJET_LOCALES = { ng: 'en_NG', za: 'en_ZA' };
  async function _fetchCareerjet(query, limit, countryCode, countryName, locationOverride, userIp) {
    const KEY = process.env.CAREERJET_API_KEY;
    if (!KEY) return [];
    const isLocal = countryCode && countryCode !== 'worldwide';
    if (!isLocal) return []; // supplemental local source only — worldwide already has enough supply
    const locale = CAREERJET_LOCALES[countryCode];
    if (!locale) return [];
    const rawOverride = locationOverride && locationOverride.trim();
    // Same ambiguity risk as Jooble — a bare street/area name needs the country
    // attached or Careerjet's location resolver may fail to match it at all.
    const location = rawOverride
      ? (countryName && !rawOverride.toLowerCase().includes(countryName.toLowerCase()) ? `${rawOverride}, ${countryName}` : rawOverride)
      : countryName;
    const auth = Buffer.from(`${KEY}:`).toString('base64');
    try {
      const params = new URLSearchParams({
        locale_code: locale,
        keywords:    query,
        location,
        page_size:   String(Math.min(limit, 100)),
        user_ip:     userIp || '105.112.0.1',
        user_agent:  'Mozilla/5.0 (compatible; KievoraJobsBot/1.0)',
      });
      const res = await fetch(`https://search.api.careerjet.net/v4/query?${params.toString()}`, {
        headers: {
          Authorization: `Basic ${auth}`,
          Referer: 'https://kievora.app/',
        },
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        console.error(`_fetchCareerjet — ${res.status} for query:"${query}" locale:"${locale}" — ${bodyText.slice(0, 300)}`);
        return [];
      }
      const data = await res.json();
      console.log(`_fetchCareerjet — "${query}" locale:"${locale}" → ${data.type === 'JOBS' ? (data.jobs||[]).length : 0} jobs (type:${data.type})`);
      if (data.type !== 'JOBS') return []; // LOCATIONS response = no confident location match, not real "0 jobs"
      return (data.jobs || []).slice(0, limit).map(j => ({
        id:       (j.url || `${j.title}${j.company}`).slice(0, 80),
        title:    j.title,
        company:  j.company || '',
        logo:     '',
        location: j.locations || location,
        country:  countryCode.toUpperCase(),
        remote:   /remote/i.test((j.title||'') + ' ' + (j.description||'')),
        salary:   j.salary || '',
        type:     '',
        url:      j.url,
        source:   'Careerjet',
        posted:   j.date || '',
        snippet:  (j.description || '').replace(/<[^>]+>/g,'').slice(0,200) + '…',
        description: (j.description || '').replace(/<[^>]+>/g,'').slice(0, 3000),
        requirements: '',
      }));
    } catch (err) {
      console.error(`_fetchCareerjet — request threw for query:"${query}":`, err.message);
      return [];
    }
  }

  // Detects the user's country from their IP and saves it to Firestore — called
  // once on first job search (or anytime the Firestore field is missing). Cached
  // in-memory so repeat requests don't hit ip-api.com.
  app.get('/api/user-country', authenticate, async (req, res) => {
    try {
      const uSnap = await db.collection('users').doc(req.user.uid).get();
      const saved  = uSnap.data()?.detectedCountry;
      if (saved) return res.json({ countryCode: saved.code, country: saved.name, cached: true });
      const ip = (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.ip || '';
      const geo = await detectCountryFromIp(ip);
      if (geo) {
        await db.collection('users').doc(req.user.uid).set({ detectedCountry:{ code:geo.countryCode, name:geo.country } }, { merge:true });
        res.json({ countryCode: geo.countryCode, country: geo.country, cached: false });
      } else {
        res.json({ countryCode: 'worldwide', country: 'Worldwide', cached: false });
      }
    } catch(e) { res.json({ countryCode: 'worldwide', country: 'Worldwide' }); }
  }); // end /api/user-country

  // ─── GET /api/location-suggest — live street/city autocomplete via LocationIQ ──
  // Env var: LOCATIONIQ_API_KEY (locationiq.com — free tier: 5,000 req/day, no card
  // required). Scoped to the selected country via `countrycodes` when provided, so
  // "Lekki" only surfaces Nigerian results, "Lekki" + worldwide surfaces everywhere.
  // A tiny per-uid rate limiter guards the shared free daily quota from a runaway
  // client (e.g. a debounce bug re-firing on every keystroke).
  const _locSuggestHits = new Map(); // uid -> [timestamps in last 10s]
  function _locSuggestRateOk(uid) {
    const now = Date.now();
    const hits = (_locSuggestHits.get(uid) || []).filter(t => now - t < 10_000);
    if (hits.length >= 12) return false; // >12 requests/10s from one user is almost certainly a bug, not typing
    hits.push(now);
    _locSuggestHits.set(uid, hits);
    return true;
  }

  app.get('/api/location-suggest', authenticate, async (req, res) => {
    const KEY = process.env.LOCATIONIQ_API_KEY;
    if (!KEY) {
      console.warn('/api/location-suggest — LOCATIONIQ_API_KEY is not set in env vars.');
      return res.json({ suggestions: [] });
    }
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ suggestions: [] }); // avoid burning quota on 1-char queries

    if (!_locSuggestRateOk(req.user.uid)) {
      return res.status(429).json({ suggestions: [], error: 'Slow down a little.' });
    }

    const rawCountry = String(req.query.countryCode || '').toLowerCase();
    const isLocal = rawCountry && rawCountry !== 'worldwide';
    const cc = isLocal ? (rawCountry === 'uk' ? 'gb' : rawCountry) : '';

    try {
      const url = `https://api.locationiq.com/v1/autocomplete?key=${KEY}&q=${encodeURIComponent(q)}&format=json&limit=8&normalizecity=1${cc ? `&countrycodes=${cc}` : ''}`;
      const r = await fetch(url);
      if (!r.ok) {
        // 404 just means "no matches" — not an error worth logging loudly.
        if (r.status !== 404) {
          const bodyText = await r.text().catch(() => '');
          console.error(`/api/location-suggest — LocationIQ returned ${r.status} for q:"${q}" cc:"${cc}" — ${bodyText.slice(0,200)}`);
        }
        return res.json({ suggestions: [] });
      }
      const data = await r.json();
      const suggestions = (Array.isArray(data) ? data : []).map(p => ({
        label: p.display_place
          ? `${p.display_place}${p.display_address ? ', ' + p.display_address : ''}`
          : (p.display_name || ''),
        value: p.display_place || (p.display_name || '').split(',')[0],
        full:  p.display_name || '',
        lat:   p.lat, lon: p.lon,
      })).filter(s => s.label);
      res.json({ suggestions });
    } catch (err) {
      console.error(`/api/location-suggest — request threw for q:"${q}":`, err.message);
      res.json({ suggestions: [] });
    }
  });

  app.post('/api/find-jobs', authenticate, async (req, res) => {
    // Plan gate: free users can see the listing cards but can't open/apply to jobs.
    const planKey = await getUserPlanKey(req.user.uid);
    const canClick = getPlanConfig(planKey).findJobsClick;

    const { query, limit = 20, countryCode = 'worldwide', location = '' } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const isLocal = countryCode && countryCode !== 'worldwide';
    const countryName = isLocal ? (COUNTRY_NAMES[countryCode] || countryCode.toUpperCase()) : '';

    const [r1, r2, r3, r4, r5] = await Promise.allSettled([
      _fetchJSearch(query, limit, countryCode, location),
      _fetchAdzuna(query, limit, countryCode),
      _fetchRemotive(query, 10, countryCode),
      _fetchJooble(query, limit, countryCode, countryName, location),
      _fetchCareerjet(query, limit, countryCode, countryName, location, req.ip),
    ]);

    let jobs = [
      ...(r1.status === 'fulfilled' ? r1.value : []),
      ...(r2.status === 'fulfilled' ? r2.value : []),
      ...(r3.status === 'fulfilled' ? r3.value : []),
      ...(r4.status === 'fulfilled' ? r4.value : []),
      ...(r5.status === 'fulfilled' ? r5.value : []),
    ];

    // Deduplicate by normalized title + company
    const seen = new Set();
    jobs = jobs.filter(j => {
      const key = (j.title + (j.company||'')).toLowerCase().replace(/[^a-z0-9]/g,'');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    // Relevance guard: some sources (Remotive especially) fall back to loosely
    // related "category" matches when there are few exact hits — e.g. a
    // "Remote Office Assistant" posting showing up for a "pharmacist" search.
    // Keep a job only if the title contains at least one significant query word,
    // or the query word appears in the snippet (covers valid title-phrasing
    // differences like "Pharmacy Technician" vs "Pharmacist"). Skipped for very
    // short/ambiguous queries where this would be too aggressive.
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length) {
      const relevant = jobs.filter(j => {
        const hay = `${j.title||''} ${j.snippet||''}`.toLowerCase();
        return queryWords.some(w => hay.includes(w) || hay.includes(w.slice(0, -1))); // light stem match (e.g. "pharmacist" ~ "pharmacy")
      });
      // Only fall back to the unfiltered list for worldwide searches, where
      // supply is broad enough that "loosely related" still beats an empty
      // page. For a country-scoped search (e.g. Nigeria, where Adzuna isn't
      // in the mix — see ADZUNA_COUNTRIES above — so supply is thinner),
      // silently discarding the filter meant the user saw jobs that didn't
      // match what they searched for at all. Better to honestly show fewer
      // (or zero) relevant results than unrelated ones for a specific country.
      if (isLocal || relevant.length) jobs = relevant;
    }

    jobs = jobs.slice(0, limit);

    console.log(`POST /api/find-jobs — "${query}" [${countryCode}${location ? ' / ' + location : ''}] → ${jobs.length} jobs (JSearch:${r1.status==='fulfilled'?r1.value.length:'err'} Adzuna:${r2.status==='fulfilled'?r2.value.length:'err'} Remotive:${r3.status==='fulfilled'?r3.value.length:'err'} Jooble:${r4.status==='fulfilled'?r4.value.length:'err'} Careerjet:${r5.status==='fulfilled'?r5.value.length:'err'})`);

    if (!canClick) {
      const gatedJobs = jobs.map(({ url, description, ...rest }) => rest);
      return res.json({ jobs: gatedJobs, gateLocked: true, upgradeMessage: UPGRADE_MESSAGES.findJobs() });
    }
    res.json({ jobs, source: 'merged', countryCode });
  });

  // ─── POST /api/prompt-resume ──────────────────────────────────────────────────
  app.post('/api/prompt-resume', authenticate, async (req, res) => {
    const { prompt, mode } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('aibuild')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!prompt || prompt.trim().length < 8)
      return res.status(400).json({ error: 'Please describe the resume you want to create.' });

    // 'rebuild' = an existing resume's real text is being restructured/
    // retemplated (upload → Kievora resume, "recreate"/"refurbish" asks).
    // 'scratch' (default) = a brand-new resume invented from a role/brief
    // with no real source document behind it. These need OPPOSITE instincts:
    // scratch wants confident invented specifics; rebuild must never invent
    // a fact the source didn't contain — a rebuilt resume with a fabricated
    // employer or graduation date is worse than useless, it's a lie with the
    // user's name on it.
    const isRebuild = mode === 'rebuild';

    const sharedStructure = `Return this exact structure:
  {"fullName":"","jobTitle":"","email":"","phone":"","location":"","summary":"","workExperience":[{"position":"","company":"","startDate":"","endDate":"","description":""}],"education":[{"degree":"","field":"","school":"","graduationDate":""}],"skills":[],"templateSuggestion":""}
  templateSuggestion: one of [classic,modern,bold,minimal,vivid,elegant,slate,coral,split,ink,executive,nova,tribune]. Match: executive/senior → executive or nova; creative → vivid or coral; tech → modern or slate; default → classic or split`;

    const system = isRebuild
      ? `You are a resume editor restructuring a REAL person's existing resume into clean, professional JSON. This is NOT a creative-writing task — it is formatting and light polish of content that already exists. No markdown, no explanation, only the JSON object.

  ${sharedStructure}

  GROUNDING RULES — these override everything else:
  - Every factual entity — full name, employer/company names, job titles, employment dates, degree names, school names, certifications — MUST come directly from the input text. NEVER invent, guess, substitute, or "improve" a name/date/employer/school that isn't literally present in the input.
  - If a field genuinely isn't present anywhere in the input (e.g. no phone number given, no education section at all), leave it as an empty string, or omit that array entry — do NOT fill it with a plausible-sounding placeholder. An empty field is honest; a fabricated one is not.
  - You MAY and SHOULD: fix grammar, tighten weak phrasing, convert flat descriptions into stronger action-verb bullet points, and reorganize messy formatting into the structure above — as long as the underlying facts (who, where, when, what) are unchanged from the source.
  - Do not add metrics/numbers that aren't in the source just to sound impressive. You may rephrase a metric that IS present to read better, but never invent one that isn't there.
  - summary: base it only on roles/skills actually present in the input — no generic filler that could describe anyone.
  - skills: extract/consolidate skills actually mentioned or clearly implied by the described work — don't pad with unrelated buzzwords.`
      : `You are a world-class resume writer. Given a description, create a complete professional resume as pure JSON. No markdown, no explanation, only the JSON object.

  ${sharedStructure}

  Rules:
  - fullName/email: if a REAL full name and/or email is given in the input (e.g. "Full name: ..." / "Email: ..."), use it EXACTLY — never invent a different one when a real one is provided. Only invent a realistic placeholder (e.g. "Alex Johnson") when truly nothing was given.
  - phone/location: use real ones if given; otherwise realistic examples (e.g. "+1 (555) 234-5678", "San Francisco, CA")
  - summary: compelling 2-3 sentences, achievement-focused, tailored to the role
  - workExperience: 2-3 entries with realistic companies, strong bullet points with action verbs and real metrics, separated by newlines. Most recent first.
  - education: 1-2 entries appropriate to the seniority level requested
  - skills: 10-14 relevant skills mixing technical and soft skills
  - SPEED OVER INTERROGATION: the person asking for this resume wants it built now, not a back-and-forth. Never leave a field blank or generic waiting for "more details" — where something concrete (years of experience, past employers, specific skills) wasn't given, generate strong, industry-standard content that fits the stated role convincingly. Confident, specific invented content beats a hedge every time.`;

    // Rebuild wants faithful reformatting, not creative variance — lower
    // temperature reduces the chance of the model drifting into invented
    // specifics. Scratch-build keeps its original higher temperature since
    // there's no source to be unfaithful to.
    const cfg = { max_tokens: 2000, temperature: isRebuild ? 0.3 : 0.78, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';

    try {
      const { data: resumeData } = await callKieAIJson(m, system, [{ role: 'user', content: `${isRebuild ? 'Restructure this existing resume' : 'Create a complete professional resume for'}: ${prompt}` }], cfg);

      // Safety net for rebuild mode: contact details are objectively
      // verifiable against the source text (unlike names/dates/companies,
      // which need real judgement to check). If the input plainly contains
      // an email or phone number the model's output doesn't match, trust
      // the source text over the model — a wrong contact detail is the
      // single most damaging kind of error a rebuilt resume could contain.
      if (isRebuild) {
        const emailMatch = prompt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch && resumeData.email !== emailMatch[0]) {
          console.log(`[prompt-resume:rebuild] email mismatch — using source email over model output`);
          resumeData.email = emailMatch[0];
        }
        const phoneMatch = prompt.match(/(\+?\d[\d\s().-]{7,}\d)/);
        if (phoneMatch && resumeData.phone && !prompt.includes(resumeData.phone)) {
          console.log(`[prompt-resume:rebuild] phone mismatch — using source phone over model output`);
          resumeData.phone = phoneMatch[0].trim();
        }
      }

      console.log(`POST /api/prompt-resume — mode:${isRebuild ? 'rebuild' : 'scratch'} model:${m} job:"${resumeData.jobTitle}"`);
      res.json({ resumeData, model: m });
    } catch (err) {
      console.error('POST /api/prompt-resume:', err.message);
      res.status(500).json({ error: 'Resume generation failed. Try a more specific description.' });
    }
  });

  // ─── POST /api/career-roadmap ─────────────────────────────────────────────────
  app.post('/api/career-roadmap', authenticate, async (req, res) => {
    const { currentRole, targetRole, timeframe = '90days', skills = [] } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('roadmap')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!currentRole || !targetRole)
      return res.status(400).json({ error: 'currentRole and targetRole are required.' });

    const tfMap = { '30days':'30 days','60days':'60 days','90days':'90 days','6months':'6 months','1year':'1 year','5years':'5 years' };
    const tf = tfMap[timeframe] || timeframe;

    const system = `You are an expert career strategist who builds roadmaps people actually follow. Create detailed, actionable career roadmaps as pure JSON only.

  Return exactly:
  {"title":"","summary":"","youTakeaway":"","timeframe":"","totalPhases":0,"phases":[{"id":1,"label":"","duration":"","focus":"","goals":[],"actions":[],"milestones":[],"resources":[]}]}

  Rules:
  - 3-5 phases covering the full timeframe proportionally
  - goals: 2-3 specific measurable goals per phase
  - actions: 4-5 concrete daily/weekly tasks per phase
  - milestones: 1-2 checkpoints with clear completion criteria per phase
  - resources: 1-2 specific courses, books, or certifications (with real names)
  - focus: 1 phrase summarizing each phase's theme
  - summary: 2 sentences on the overall strategy and why this path makes sense for getting from the start role to the target role
  - youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them, in plain terms, what this roadmap is really asking of them, which single phase matters most for getting unstuck, and what their career will look like if they follow it through — make it feel like a realistic, motivating plan rather than a wall of tasks
  - Everything must be specific to the actual roles — no generic advice

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 2000, temperature: 0.65, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';
    const skillStr = skills.length ? `\nCurrent skills: ${skills.join(', ')}` : '';

    try {
      const { data: roadmap } = await callKieAIJson(m, system, [{ role: 'user', content: `Create a ${tf} career roadmap.\nFrom: ${currentRole}\nTo: ${targetRole}${skillStr}` }], cfg);
      console.log(`POST /api/career-roadmap — ${currentRole}→${targetRole} model:${m}`);
      res.json({ roadmap, model: m });
    } catch (err) {
      console.error('POST /api/career-roadmap:', err.message);
      res.status(500).json({ error: 'Roadmap generation failed. Please try again.' });
    }
  });

  // ─── POST /api/salary-intel ───────────────────────────────────────────────────
  app.post('/api/salary-intel', authenticate, async (req, res) => {
    const { jobTitle, location = 'United States', yearsExp = '1-3', education = "Bachelor's", skills = [], industry = '' } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('salary')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!jobTitle) return res.status(400).json({ error: 'jobTitle is required.' });

    const system = `You are a senior compensation analyst who translates pay data into real leverage for the person asking. Return only pure JSON, no markdown.

  Return exactly:
  {"jobTitle":"","location":"","currency":"USD","salaryRange":{"min":0,"mid":0,"max":0},"percentile":{"p25":0,"p50":0,"p75":0,"p90":0},"demandLevel":"High","demandTrend":"Growing","yearsToSenior":"","forecast":{"oneYear":0,"threeYear":0},"topPayingIndustries":[],"topPayingLocations":[],"negotiationScript":"","keyFactors":[],"insights":"","remoteImpact":"","youTakeaway":""}

  Rules:
  - All salary values: annual USD integers
  - demandLevel: "High", "Medium", or "Low"
  - demandTrend: "Growing", "Stable", or "Declining"
  - negotiationScript: 3-4 natural sentences the user can say in a negotiation conversation
  - keyFactors: 4-5 specific factors affecting this exact role's salary
  - insights: 2-3 sentence sharp market analysis
  - remoteImpact: 1 sentence on how remote work affects this role's salary
  - topPayingIndustries: 4-5 industries that pay most for this role
  - topPayingLocations: 4-5 cities/regions with highest pay
  - youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them where they likely sit in this range given their experience level, the ONE factor most likely to move them toward the top of the range, and a concrete next step (e.g. a number to anchor on, a skill to highlight, or a location/remote angle to consider) — make it feel like advice from a friend who has their back in a negotiation

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1200, temperature: 0.45, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';
    const skillStr = skills.length ? `, skills: ${skills.slice(0, 6).join(', ')}` : '';

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Salary analysis for: ${jobTitle}\nLocation: ${location}\nExperience: ${yearsExp} years\nEducation: ${education}${skillStr}${industry ? '\nIndustry: ' + industry : ''}` }], cfg);
      console.log(`POST /api/salary-intel — "${jobTitle}" ${location} model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/salary-intel:', err.message);
      res.status(500).json({ error: 'Salary analysis failed. Please try again.' });
    }
  });

  // ─── POST /api/industry-intel ─────────────────────────────────────────────────
  app.post('/api/industry-intel', authenticate, async (req, res) => {
    const { industry, role = '' } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('industry')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!industry) return res.status(400).json({ error: 'industry is required.' });

    const system = `You are a top industry research analyst who helps individuals, not just companies, see where they fit. Return only pure JSON, no markdown.

  Return exactly:
  {"industry":"","outlook":"Excellent","growthRate":"","marketSize":"","topTrends":[],"growingRoles":[],"decliningRoles":[],"hotSkills":[],"emergingTechnologies":[],"topCompanies":[],"predictions":[],"opportunities":[],"threats":[],"summary":"","youTakeaway":""}

  Rules:
  - outlook: "Excellent", "Good", "Fair", or "Challenging"
  - topTrends: 5 major trends happening right now with brief explanation each
  - growingRoles: 6 roles with highest demand (role name + reason)
  - decliningRoles: 4 roles being automated or reduced
  - hotSkills: 8 most in-demand skills right now
  - emergingTechnologies: 5 technologies reshaping the industry
  - topCompanies: 6 leading/high-hiring companies with brief note
  - predictions: 4 specific 3-5 year predictions
  - opportunities: 4 clear opportunities for professionals
  - threats: 3 threats professionals should be aware of
  - summary: 3-4 sharp sentences on the state of this industry
  - youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Translate this industry snapshot into what it means for SOMEONE BUILDING A CAREER here right now — name the single skill or move that would position them best given where this industry is heading, and what that could mean for their job security or growth

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1800, temperature: 0.6, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Comprehensive industry intelligence for: ${industry}${role ? '\nProfessional role focus: ' + role : ''}` }], cfg);
      console.log(`POST /api/industry-intel — "${industry}" model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/industry-intel:', err.message);
      res.status(500).json({ error: 'Industry analysis failed. Please try again.' });
    }
  });

  // ─── POST /api/linkedin-optimize ──────────────────────────────────────────────
  app.post('/api/linkedin-optimize', authenticate, async (req, res) => {
    const { headline, about = '', currentRole = '', targetRole = '', skills = [] } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('linkedin')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!headline) return res.status(400).json({ error: 'headline is required.' });

    const system = `You are a LinkedIn optimization expert and professional branding specialist. Return only pure JSON, no markdown.

  Return exactly:
  {"optimizedHeadline":"","optimizedAbout":"","headlineScore":0,"aboutScore":0,"visibilityScore":0,"recruiterScore":0,"skillsToAdd":[],"keywordGaps":[],"profileTips":[],"headlineFeedback":"","aboutFeedback":"","summary":"","youTakeaway":""}

  Rules:
  - optimizedHeadline: max 220 chars, keyword-rich, role-specific, value-driven
  - optimizedAbout: 3-4 paragraphs, first-person, story-driven, specific achievements, keyword-dense, ends with a clear CTA
  - headlineScore/aboutScore: current quality score 0-100
  - visibilityScore: estimated LinkedIn search visibility 0-100
  - recruiterScore: how attractive to recruiters 0-100
  - skillsToAdd: 5-6 high-demand skills missing from their profile
  - keywordGaps: 4-5 specific terms recruiters search for this role
  - profileTips: 5 specific actionable improvements with priority order
  - headlineFeedback: 1-2 sentence critique of current headline
  - aboutFeedback: 1-2 sentence critique of current about
  - summary: 2-sentence overall LinkedIn profile assessment
  - youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them, compared to their current headline/about, what changing to the optimized version will actually do for them (e.g. how it changes who finds them and what recruiters assume about them at a glance), and the ONE edit to make first if they only do one thing today

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1800, temperature: 0.72, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'core';
    const skillStr = skills.length ? `\nCurrent skills: ${skills.join(', ')}` : '';

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Optimize my LinkedIn profile.\nCurrent headline: "${headline}"\nAbout section: "${about || 'Not provided'}"\nCurrent role: ${currentRole || 'Not specified'}\nTarget role: ${targetRole || 'Same field'}${skillStr}` }], cfg);
      console.log(`POST /api/linkedin-optimize — model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/linkedin-optimize:', err.message);
      res.status(500).json({ error: 'LinkedIn optimization failed. Please try again.' });
    }
  });

  // ─── POST /api/mock-interview-q ───────────────────────────────────────────────
  app.post('/api/mock-interview-q', authenticate, async (req, res) => {
    const _miqPlanKey = await getUserPlanKey(req.user.uid);
    if (!getPlanConfig(_miqPlanKey).tools.includes('interview')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_miqPlanKey) });
    }
    const { type = 'behavioral', jobTitle, level = 'mid', previousQuestions = [] } = req.body;
    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!jobTitle) return res.status(400).json({ error: 'jobTitle is required.' });

    const system = `You are a senior hiring manager conducting real interviews. Return only pure JSON, no markdown.

  Return exactly:
  {"question":"","type":"","difficulty":"Medium","context":"","tips":[],"whatWeAreLooking":"","framework":""}

  Rules:
  - question: a real, specific, non-generic interview question for this exact role
  - difficulty: "Easy", "Medium", or "Hard"
  - context: 1-2 sentences explaining why interviewers ask this specific question
  - tips: 3-4 specific tips for answering this exact question well
  - whatWeAreLooking: what a great answer includes (2-3 sentences)
  - framework: recommended answer framework (e.g. "STAR Method", "Past-Present-Future", "Problem-Action-Result")

STRICTNESS RULES:
- The question must be specific enough that it could only apply to this exact role/level — reject anything so generic it could be asked in any interview for any job.
- context and whatWeAreLooking must reference the actual skills/seniority implied by the job title given, not boilerplate interview advice.`;

    const prev = previousQuestions.length ? `\nDo NOT repeat or closely paraphrase these: ${previousQuestions.slice(-5).join(' | ')}` : '';
    const cfg = { max_tokens: 800, temperature: 0.85, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Generate a ${type} interview question for: ${jobTitle} (${level} level)${prev}` }], cfg);
      console.log(`POST /api/mock-interview-q — ${type} for "${jobTitle}" model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/mock-interview-q:', err.message);
      res.status(500).json({ error: 'Failed to generate question. Please try again.' });
    }
  });

  // ─── POST /api/mock-interview-fb ──────────────────────────────────────────────
  app.post('/api/mock-interview-fb', authenticate, async (req, res) => {
    const _mifbPlanKey = await getUserPlanKey(req.user.uid);
    if (!getPlanConfig(_mifbPlanKey).tools.includes('interview')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_mifbPlanKey) });
    }
    const { question, answer, jobTitle, type = 'behavioral' } = req.body;
    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!question || !answer || !jobTitle)
      return res.status(400).json({ error: 'question, answer, and jobTitle are required.' });
    if (answer.trim().length < 20)
      return res.status(400).json({ error: 'Answer is too short for meaningful feedback.' });

    const system = `You are a senior hiring manager giving real, honest interview feedback. Return only pure JSON, no markdown.

  Return exactly:
  {"score":0,"grade":"","verdict":"","strengths":[],"improvements":[],"sampleAnswer":"","structureFeedback":"","confidenceTips":[],"wouldAdvance":false,"youTakeaway":""}

  Rules:
  - score: integer 0-100 (realistic — most candidates score 55-75)
  - grade: "A+" (90+), "A" (80-89), "B" (70-79), "C" (60-69), "D" (<60)
  - verdict: 1 honest sentence (would they advance to next round?)
  - wouldAdvance: true if score >= 72
  - strengths: 2-3 specific things they did well in their actual answer
  - improvements: 3 specific things to fix, with how to fix each
  - sampleAnswer: a strong model answer in the recommended framework (150-200 words)
  - structureFeedback: 2 sentences on the answer's logical structure
  - confidenceTips: 2-3 delivery tips for this specific answer
  - youTakeaway: 2-3 sentences written DIRECTLY to the candidate ("You..."/"Your..."). Reference something specific they actually said, tell them honestly how that would land in a real interview, and give them ONE thing to fix before the next question that would make the biggest difference

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1400, temperature: 0.55, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Evaluate this ${type} interview answer for ${jobTitle}.\n\nQuestion: ${question}\n\nCandidate's Answer: ${answer}` }], cfg);
      console.log(`POST /api/mock-interview-fb — score:${data.score} model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/mock-interview-fb:', err.message);
      res.status(500).json({ error: 'Feedback generation failed. Please try again.' });
    }
  });

  // ─── POST /api/personal-brand ─────────────────────────────────────────────────
  app.post('/api/personal-brand', authenticate, async (req, res) => {
    const { resumeData, bioType = 'professional', targetAudience = 'recruiters and hiring managers' } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('branding')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent

    const system = `You are a world-class personal branding expert and professional writer. Return only pure JSON, no markdown.

  Return exactly:
  {"bio":"","tagline":"","linkedinSummary":"","twitterBio":"","elevatorPitch":"","brandKeywords":[],"brandVoice":"","tips":[],"youTakeaway":""}

  Rules:
  - bio: 190-220 word compelling professional bio in third person, story-driven, achievement-focused
  - tagline: powerful 8-12 word personal tagline that captures their unique value
  - linkedinSummary: 130-160 word first-person About section, story arc, ends with CTA
  - twitterBio: under 160 chars, punchy, personality-forward
  - elevatorPitch: 80-100 word 45-second spoken pitch, first-person, natural, confident
  - brandKeywords: 7-9 keywords that define their professional brand
  - brandVoice: 1 sentence describing their brand voice/personality
  - tips: 5 specific, actionable personal branding tips for their situation
  - youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them what makes this brand package distinctly THEIRS (referencing something specific from their background if provided), where to use it first for the biggest impact, and the one habit that will keep this brand consistent across their profiles

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1800, temperature: 0.82, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';
    let context = resumeData
      ? `Name: ${resumeData.fullName || ''}\nRole: ${resumeData.jobTitle || ''}\nSummary: ${(resumeData.summary || '').slice(0, 250)}\nTop skills: ${(resumeData.skills || []).slice(0, 8).join(', ')}\nExperience: ${(resumeData.workExperience || []).slice(0, 2).map(e => `${e.position} at ${e.company}`).join(', ')}`
      : 'No resume provided — create a generic but compelling template.';

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Create a ${bioType} personal brand package targeted at ${targetAudience}.\n${context}` }], cfg);
      console.log(`POST /api/personal-brand — type:${bioType} model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/personal-brand:', err.message);
      res.status(500).json({ error: 'Brand generation failed. Please try again.' });
    }
  });

  // ─── POST /api/career-health ──────────────────────────────────────────────────
  app.post('/api/career-health', authenticate, async (req, res) => {
    const { resumeData, jobTitle = '', yearsExp = '' } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('careerhealth')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!resumeData) return res.status(400).json({ error: 'resumeData is required.' });

    const system = `You are a career health analyst with the warmth and directness of a trusted mentor. Assess someone's overall career health from their resume and explain it in a way they can immediately understand and act on. Return only pure JSON, no markdown.

  Return exactly:
  {"overallScore":0,"grade":"","headline":"","youTakeaway":"","breakdown":{"resumeQuality":{"score":0,"label":"","feedback":""},"skillRelevance":{"score":0,"label":"","feedback":""},"marketDemand":{"score":0,"label":"","feedback":""},"interviewReadiness":{"score":0,"label":"","feedback":""},"brandStrength":{"score":0,"label":"","feedback":""},"salaryPositioning":{"score":0,"label":"","feedback":""}},"topStrengths":[],"criticalGaps":[],"quickWins":[],"strategicActions":[],"verdict":""}

  Rules:
  - All scores: integer 0-100. Be honest — most people score 45-75, not 90+
  - labels: "Excellent" (85+), "Good" (70-84), "Fair" (50-69), "Needs Work" (<50)
  - overallScore: weighted average (resumeQuality 25%, skillRelevance 20%, marketDemand 20%, interviewReadiness 15%, brandStrength 10%, salaryPositioning 10%)
  - grade: "A" (85+), "B" (70-84), "C" (55-69), "D" (<55)
  - headline: 5-7 word summary (e.g. "Strong foundation, gaps in visibility")
  - youTakeaway: 3-4 sentences written DIRECTLY to the person ("You..."/"Your..."). Open by naming where they stand right now in plain language (not just repeating the score). Reference at least one concrete detail from their actual resume (a role, skill, or achievement) so it feels personal, not generic. Then name the SINGLE thing that would move their score up the most, and what fixing it would unlock for them in practical terms (e.g. more interview callbacks, stronger salary leverage, faster path to their next role). End on an encouraging, motivating note — this should feel like genuinely useful advice from someone who wants them to succeed.
  - breakdown.*.feedback: 1-2 sentences per category, each referencing something specific from their resume — never generic boilerplate
  - topStrengths: 3 specific career strengths drawn from their actual resume data (name the role/skill/achievement, not vague traits)
  - criticalGaps: 3 most important issues to fix, each with the specific reason it's holding them back
  - quickWins: 3 things they can do THIS WEEK for immediate impact — concrete and doable in under an hour each
  - strategicActions: 3 longer-term moves (1-3 months) that compound into real career progress
  - verdict: 2-3 sentence honest, big-picture career health verdict — the "bottom line" if they only read one thing

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1800, temperature: 0.45, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';
    const d   = resumeData;
    const ctx = `Name: ${d.fullName || 'N/A'}\nRole: ${d.jobTitle || jobTitle || 'N/A'}\nYears exp: ${yearsExp || 'unknown'}\nSummary length: ${(d.summary || '').length} chars\nSummary: ${(d.summary || '').slice(0, 200)}\nSkills: ${(d.skills || []).join(', ')}\nWork experience entries: ${(d.workExperience || []).length}\nExperience: ${(d.workExperience || []).slice(0, 3).map(e => `${e.position} at ${e.company}`).join(', ')}\nEducation: ${(d.education || []).map(e => `${e.degree} in ${e.field}`).join(', ') || 'N/A'}`;

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Comprehensive career health analysis:\n${ctx}` }], cfg);
      console.log(`POST /api/career-health — score:${data.overallScore} model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/career-health:', err.message);
      res.status(500).json({ error: 'Career health analysis failed. Please try again.' });
    }
  });

  // ─── POST /api/promotion-readiness ────────────────────────────────────────────
  app.post('/api/promotion-readiness', authenticate, async (req, res) => {
    const { resumeData, currentRole, targetRole, timeline = '6 months' } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('promotion')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!currentRole || !targetRole)
      return res.status(400).json({ error: 'currentRole and targetRole are required.' });

    const system = `You are a senior leadership development coach. Assess promotion readiness honestly. Return only pure JSON, no markdown.

  Return exactly:
  {"readinessScore":0,"readinessLevel":"","verdict":"","youTakeaway":"","strengths":[],"gapsToClose":[],"skillsNeeded":[],"visibilityActions":[],"roadmap":[{"month":"","theme":"","milestones":[],"actions":[]}],"timelineAssessment":"","leadershipTips":[]}

  Rules:
  - readinessScore: integer 0-100 (be honest — not inflated)
  - readinessLevel: "Ready Now" (80+), "Nearly Ready" (65-79), "6-12 Months Away" (45-64), "1-2 Years Away" (<45)
  - verdict: 2-sentence honest assessment of their promotion prospects
  - youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them plainly where they really stand for this specific promotion, the ONE gap that's most likely holding them back right now, and what closing it would mean for their timeline — be encouraging but straight with them, like a mentor who wants them to actually get promoted
  - strengths: 3-4 specific strengths that support the promotion case
  - gapsToClose: 4-5 specific gaps between current and target role
  - skillsNeeded: 4-5 specific skills/competencies to develop
  - visibilityActions: 4 things to become more visible to decision-makers
  - roadmap: 3-4 monthly phases with specific milestones and actions (realistic, role-specific)
  - timelineAssessment: 2 sentences on whether their timeline is realistic
  - leadershipTips: 4 leadership-specific tips for this exact transition

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1800, temperature: 0.6, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';
    let ctx = `From: ${currentRole}\nTo: ${targetRole}\nTimeline: ${timeline}`;
    if (resumeData) {
      ctx += `\nSkills: ${(resumeData.skills || []).slice(0, 10).join(', ')}\nExperience: ${(resumeData.workExperience || []).map(e => `${e.position} at ${e.company}`).join(', ')}\nSummary: ${(resumeData.summary || '').slice(0, 200)}`;
    }

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Assess promotion readiness:\n${ctx}` }], cfg);
      console.log(`POST /api/promotion-readiness — ${currentRole}→${targetRole} score:${data.readinessScore} model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/promotion-readiness:', err.message);
      res.status(500).json({ error: 'Promotion analysis failed. Please try again.' });
    }
  });

  // ─── POST /api/professional-msg ───────────────────────────────────────────────
  app.post('/api/professional-msg', authenticate, async (req, res) => {
    const { msgType = 'application', resumeData, targetJob, targetCompany, recruiterName = '', tone = 'professional' } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('messaging')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!targetJob || !targetCompany)
      return res.status(400).json({ error: 'targetJob and targetCompany are required.' });

    const system = `You are an expert in professional communication and job application messaging. Return only pure JSON, no markdown.

  Return exactly:
  {"subject":"","message":"","subject2":"","message2":"","tips":[],"doList":[],"dontList":[],"youTakeaway":""}

  Rules:
  - Provide 2 ready-to-send message variants: message is polished standard, message2 is bolder/more direct
  - No placeholder brackets except [Your Name] at the end
  - subject/subject2: compelling, specific, non-generic email subject lines
  - message/message2: complete messages, properly formatted, tone-matched
  - tips: 4 specific sending and follow-up tips
  - doList: 3 things to do when sending
  - dontList: 3 common mistakes to avoid
  - youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them which of the two versions fits their situation best and why, plus the single most important thing to do AFTER sending (timing of follow-up, what to prep for, etc.)

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1400, temperature: 0.78, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'core';
    let ctx = `Message type: ${msgType}\nTarget job: ${targetJob}\nCompany: ${targetCompany}\nTone: ${tone}${recruiterName ? '\nRecruiter name: ' + recruiterName : ''}`;
    if (resumeData) {
      ctx += `\nApplicant: ${resumeData.fullName || ''}, ${resumeData.jobTitle || ''}\nTop skills: ${(resumeData.skills || []).slice(0, 6).join(', ')}`;
    }

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Generate a ${msgType} message:\n${ctx}` }], cfg);
      console.log(`POST /api/professional-msg — type:${msgType} company:"${targetCompany}" model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/professional-msg:', err.message);
      res.status(500).json({ error: 'Message generation failed. Please try again.' });
    }
  });

  // ─── POST /api/recruiter-intel ────────────────────────────────────────────────
  app.post('/api/recruiter-intel', authenticate, async (req, res) => {
    // Plan gate: free → blocked entirely (no upload/analyze), paid7 → blocked here
    // (they can upload/analyze in /api/analyze-resume but Recruiter View itself is $15 only).
    const planKey = await getUserPlanKey(req.user.uid);
    const planCfg = getPlanConfig(planKey);
    if (!planCfg.uploadAnalyze) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.uploadAnalyze() });
    }
    if (!planCfg.recruiterView) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.recruiterView(planKey) });
    }

    const { resumeData, targetRole = '' } = req.body;
    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!resumeData) return res.status(400).json({ error: 'resumeData is required.' });

    const system = `You are a senior technical recruiter with 15 years of experience reviewing thousands of resumes. Give brutally honest, specific feedback. Return only pure JSON, no markdown.

  Return exactly:
  {"recruiterScore":0,"passRate":"","firstImpression":"","timeToRead":"","strengths":[],"redFlags":[],"missingElements":[],"atsRisks":[],"standoutMoves":[],"interviewLikelihood":"Medium","improvements":[],"verdict":""}

  Rules:
  - recruiterScore: 0-100 (70+ = strong interview candidate, 55-69 = possible, <55 = likely rejected)
  - passRate: realistic estimate like "~25% chance of interview call"
  - firstImpression: what a recruiter thinks in first 6 seconds (1 specific sentence)
  - timeToRead: realistic time ("8 seconds", "20 seconds") — most resumes get 7-15 seconds
  - interviewLikelihood: "High" (75+), "Medium" (55-74), "Low" (<55)
  - redFlags: 4 specific things that could get it rejected
  - missingElements: 4 things recruiters want to see that are missing
  - atsRisks: 4 specific ATS keyword/format issues
  - standoutMoves: 4 high-impact things to stand out from 200 other applicants
  - improvements: 5 ranked improvements from most to least impactful
  - verdict: 2-3 sentence recruiter's blunt assessment

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1500, temperature: 0.5, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';
    const d   = resumeData;
    const ctx = `Target role: ${targetRole || d.jobTitle || 'N/A'}\nName: ${d.fullName || 'N/A'}\nSummary: ${(d.summary || '').slice(0, 200)}\nWork: ${(d.workExperience || []).map(e => `${e.position} at ${e.company}`).join(', ')}\nSkills: ${(d.skills || []).join(', ')}\nEducation: ${(d.education || []).map(e => e.degree).join(', ') || 'N/A'}`;

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: `Review this resume as a recruiter:\n${ctx}` }], cfg);
      console.log(`POST /api/recruiter-intel — score:${data.recruiterScore} model:${m}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/recruiter-intel:', err.message);
      res.status(500).json({ error: 'Recruiter analysis failed. Please try again.' });
    }
  });

  // ─── POST /api/job-match ──────────────────────────────────────────────────────
  app.post('/api/job-match', authenticate, async (req, res) => {
    const { jobDescription, resumeData } = req.body;
    // Plan gate: tool hub — check the user's plan allows this tool
    const _planKey = await getUserPlanKey(req.user.uid);
    const _planCfg = getPlanConfig(_planKey);
    if (!_planCfg.tools.includes('aibuild')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
    }

    const model = 'spark'; // ALL tools always use Groq Spark — permanent
    if (!jobDescription || jobDescription.trim().length < 50)
      return res.status(400).json({ error: 'jobDescription is required (min 50 chars).' });

    const system = `You are an expert ATS specialist and job matching consultant. Analyze how well a candidate matches a job description. Return only pure JSON, no markdown.

  Return exactly:
  {"matchScore":0,"matchLevel":"","summary":"","matchingSkills":[],"missingSkills":[],"keywordsToAdd":[],"experienceMatch":"","educationMatch":"","tips":[],"youTakeaway":""}

  Rules:
  - matchScore: 0-100 integer (90+ = excellent, 70-89 = strong, 50-69 = moderate, <50 = weak)
  - matchLevel: "Excellent Match" | "Strong Match" | "Moderate Match" | "Weak Match"
  - summary: 2 sentences — honest assessment of fit
  - matchingSkills: 4-6 specific skills/experiences the candidate has that the JD needs
  - missingSkills: 3-5 specific skills or requirements the candidate lacks
  - keywordsToAdd: 6-8 exact keywords from the JD to weave into the resume
  - experienceMatch: 1 sentence on how their experience level matches
  - educationMatch: 1 sentence on education/qualification fit
  - tips: 4 specific actions to improve this application (tailor resume, cover letter angle, etc.)
  - youTakeaway: 2-3 sentences written DIRECTLY to the candidate ("You..."/"Your..."). Tell them honestly whether this is worth applying to and why, the ONE change to their resume that would raise this score the most before they hit submit, and what to lean on in a cover letter or interview given this specific match

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 1200, temperature: 0.4, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'nova';

    // Build candidate context
    let candidateCtx = 'No resume provided — analyze the JD only and provide general guidance.';
    if (resumeData) {
      const d = resumeData;
      candidateCtx = `Candidate: ${d.fullName || 'N/A'} — ${d.jobTitle || 'N/A'}
  Summary: ${(d.summary || '').slice(0, 300)}
  Skills: ${(d.skills || []).join(', ')}
  Experience: ${(d.workExperience || []).map(e => `${e.position} at ${e.company}`).join(' | ')}
  Education: ${(d.education || []).map(e => `${e.degree} in ${e.field} from ${e.school}`).join(' | ')}`;
    }

    const jdSlice = jobDescription.slice(0, 4000);

    try {
      const { data } = await callKieAIJson(m, system, [{
        role: 'user',
        content: `Job Description:\n${jdSlice}\n\n---\n${candidateCtx}`,
      }], cfg);
      console.log(`POST /api/job-match — score:${data.matchScore} model:${m} uid:${req.user.uid}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/job-match:', err.message);
      res.status(500).json({ error: 'Job match analysis failed. Please try again.' });
    }
  });

  // ─── POST /api/resignation-letter ────────────────────────────────────────────
  app.post('/api/resignation-letter', authenticate, async (req, res) => {
    // Plan gate: tool hub — same unlock tier as the other "More Tools" entries
    const _rlPlanKey = await getUserPlanKey(req.user.uid);
    if (!getPlanConfig(_rlPlanKey).tools.includes('aibuild')) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_rlPlanKey) });
    }

    const {
      currentRole,
      company,
      noticePeriod = '2 weeks',
      reason       = '',
      tone         = 'professional',
      model        = 'spark',
    } = req.body;

    if (!currentRole || !currentRole.trim())
      return res.status(400).json({ error: 'currentRole is required.' });
    if (!company || !company.trim())
      return res.status(400).json({ error: 'company is required.' });

    const toneGuide = {
      professional: 'formal and professional — respectful, clear, no oversharing',
      warm:         'warm and genuinely grateful — personal, appreciative, bridge-keeping',
      brief:        'brief and direct — 3 short paragraphs, no embellishment, courteous',
    };
    const selectedTone = toneGuide[tone] || toneGuide.professional;

    const system = `You are an expert professional writer specializing in career transitions. Write resignation letters that are respectful, clear, and leave a positive lasting impression. Return only pure JSON, no markdown.

  Return exactly:
  {"letter":"","tips":[],"youTakeaway":""}

  Rules:
  - letter: the full resignation letter as a single string with \\n for line breaks. Include: today's date (use "June 2026"), manager salutation, opening paragraph confirming resignation + notice period, brief appreciation paragraph (genuine, not sycophantic), offer to assist with transition, professional closing + candidate's name placeholder [Your Name]
  - Keep it under 220 words — tight and professional
  - tone: ${selectedTone}
  - NEVER mention the specific reason for leaving unless it is something positive like "an exciting new opportunity"
  - tips: 4 practical tips for a smooth exit (what to do in the notice period, how to handle handover, etc.)
  - youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Reassure them this letter strikes the right tone for leaving on good terms, and tell them the ONE thing to handle carefully in the days right after sending it (e.g. the conversation with their manager, timing of the announcement, or protecting references)

STRICTNESS RULES — apply to every field, not just the summary ones:
- Ground every claim in the ACTUAL input given (resume text, job title, answer, etc.) — never generic filler that could apply to anyone. If you cannot point to something specific in the input that justifies a strength/weakness/score, don't state it.
- Never praise something vague ("good experience", "solid background", "well written") without naming the specific line, number, or detail that earns it.
- If a number, metric, or quantified result is missing where one should exist, say so explicitly rather than skipping it — silence is itself misleading feedback.
- Do not soften a real weakness to be polite. State it plainly, then immediately follow with the concrete fix — never leave a criticism without an actionable next step.
- Prefer exact rewrites over abstract advice: instead of "add more detail," write the actual improved line the user could paste in.
- Never hedge with "it depends" or "could vary" unless you also state the single most likely case given what's in front of you.`;

    const cfg = { max_tokens: 800, temperature: 0.65, jsonMode: true };
    const m   = KIE_MODELS[model] ? model : 'spark';

    // Build context — only pass reason if it's positive/neutral so the AI can reference it
    const positiveReasons = ['new opportunity', 'new role', 'promotion', 'career growth', 'relocation', 'further study', 'education'];
    const reasonIsPositive = reason && positiveReasons.some(r => reason.toLowerCase().includes(r));
    const reasonCtx = reasonIsPositive ? `\nReason (can mention positively): ${reason}` : '';

    const userPrompt = `Write a resignation letter.\nRole: ${currentRole}\nCompany: ${company}\nNotice period: ${noticePeriod}${reasonCtx}`;

    try {
      const { data } = await callKieAIJson(m, system, [{ role: 'user', content: userPrompt }], cfg);
      console.log(`POST /api/resignation-letter — role:"${currentRole}" company:"${company}" model:${m} uid:${req.user.uid}`);
      res.json({ ...data, model: m });
    } catch (err) {
      console.error('POST /api/resignation-letter:', err.message);
      res.status(500).json({ error: 'Letter generation failed. Please try again.' });
    }
  });

  // ─── POST /api/quick-edit ─────────────────────────────────────────────────
  // Powers the KIE canvas quick-action pills (Make it shorter / More
  // professional / More casual / etc.) on any generated [CODEBLOCK] document
  // — cover letters, resignation letters, messages, bios. One instruction
  // applied per call; the canvas sends back the CURRENT text each time (not
  // the original), so repeated actions stack on top of each other and undo/
  // redo is handled entirely client-side against its own history stack.
  // No plan gate here deliberately — whatever tier already let the user
  // generate the document in chat is enough to also refine it.
  const QUICK_EDIT_ACTIONS = {
    shorter:      'Make it noticeably shorter and tighter — cut filler and repetition, keep every concrete fact, name, and number. Do not pad it back out to a similar length.',
    professional: 'Make the tone more professional and polished — formal register, precise word choice — without becoming stiff or robotic.',
    casual:       'Make the tone warmer and more conversational — natural and human, while staying clearly appropriate for the context.',
    confident:    'Make it read more confident and assertive — stronger, more direct verbs, remove hedging or apologetic phrasing — without becoming arrogant.',
    formal:       'Make the tone noticeably more formal and traditional, appropriate for a conservative or senior audience.',
    punchier:     'Make it punchier and more results-focused — lead with concrete impact and outcomes, cut vague or soft phrasing.',
  };
  app.post('/api/quick-edit', authenticate, async (req, res) => {
    const { content, action, label = '' } = req.body;
    if (!content || !action)
      return res.status(400).json({ error: 'content and action are required.' });
    const instruction = QUICK_EDIT_ACTIONS[action];
    if (!instruction)
      return res.status(400).json({ error: 'Unknown action.' });

    const m = 'spark'; // ALL tools always use Groq Spark — permanent
    const system = `You revise an already-written document on request. Return only pure JSON, no markdown: {"text":""}

Rules:
- Apply ONLY this one instruction: ${instruction}
- Preserve every fact, name, number, and placeholder bracket (like [Your Name]) exactly as given — never invent or drop content.
- Preserve the original structure (a greeting stays a greeting, a sign-off stays a sign-off, existing paragraph breaks stay put) unless the instruction is specifically about length.
- Return the COMPLETE revised document in "text" — never a partial excerpt, summary, or preamble about what you changed.`;
    const cfg = { max_tokens: 1300, temperature: 0.6, jsonMode: true };

    try {
      const { data } = await callKieAIJson(m, system, [
        { role: 'user', content: `Document type: ${label || 'document'}\n\nCurrent content:\n${content}` },
      ], cfg);
      if (!data.text) throw new Error('Model returned no text.');
      res.json({ text: data.text });
    } catch (err) {
      console.error('POST /api/quick-edit:', err.message);
      res.status(500).json({ error: 'Edit failed. Please try again.' });
    }
  });

  // ─── POST /api/resume/pdf — Puppeteer HTML-to-PDF (WYSIWYG) ──────────────────
  // Renders the exact same HTML as the on-screen template preview → pixel-perfect PDF.
  // Run:  npm install puppeteer   (one-time — ~300MB Chromium download)
  let _puppeteer = null;
  function getPuppeteer() {
    if (!_puppeteer) {
      try { _puppeteer = require('puppeteer'); }
      catch (e) {
        console.error('❌ puppeteer not installed. Run: npm install puppeteer');
      }
    }
    return _puppeteer;
  }

  app.post('/api/resume/pdf', authenticate, async (req, res) => {
    const pp = getPuppeteer();
    if (!pp) return res.status(503).json({ error: 'PDF service unavailable — run: npm install puppeteer on the server.' });

    const { html, resumeName } = req.body;
    if (!html || typeof html !== 'string' || html.length < 20)
      return res.status(400).json({ error: 'html is required' });

    const safeName = (resumeName || 'resume')
      .replace(/[^a-z0-9\s\-]/gi, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'resume';

    let browser;
    try {
      browser = await pp.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();

      // Wrap the template HTML in a complete, print-ready document.
      // Google Inter font loaded inline — same font the preview uses on-screen.
      const fullHtml = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=794px">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body {
        width: 794px;            /* A4 width at 96 dpi */
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      /* Match dashboard font classes exactly */
      .rf-sans { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
      .rf-serif { font-family: Georgia, 'Times New Roman', serif; }
      .rf-mono  { font-family: 'Courier New', Courier, monospace; }
      img { display: block; }
    </style>
  </head>
  <body>${html}</body>
  </html>`;

      await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 10000 });

      // Wait for fonts — graceful timeout so PDF still renders if CDN is slow
      try { await page.waitForFunction(() => document.fonts.ready, { timeout: 5000 }); } catch (_) {}

      const pdfBuffer = await page.pdf({
        format:          'A4',
        printBackground: true,
        margin:          { top: '0', right: '0', bottom: '0', left: '0' },
      });

      console.log(`POST /api/resume/pdf — uid:${req.user.uid} name:"${safeName}" bytes:${pdfBuffer.length}`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer);

    } catch (err) {
      console.error('POST /api/resume/pdf ERROR:', err.message);
      res.status(500).json({ error: 'PDF generation failed. Please try again.' });
    } finally {
      if (browser) { try { await browser.close(); } catch (_) {} }
    }
  });
}; // end registerToolsRoutes
