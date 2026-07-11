// ═══════════════════════════════════════════════════════════════════════════
// server/index.js — App entry point. Wires up middleware in the exact order
// that matters (webhook raw-body route BEFORE express.json()), mounts every
// route module, and starts listening. All actual route logic lives in the
// sibling files (lib, gmail, billing, kie, tools, articles).
// ═══════════════════════════════════════════════════════════════════════════
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto'); // Paystack webhook signature verification

const {
  admin, db, authenticate, upload, cloudinary,
  callKieAI, getUserPlanKey, getPlanConfig, UPGRADE_MESSAGES,
  KIE_MODELS, USERS, sendWelcomeEmail, applyPaystackMetadata, PLANS,
} = require('./lib');

// ─── Articles / Community module toggle ────────────────────────────────────────
// The social side (following, feed, article submissions/review, profile pages) is
// built but not launching yet — nav to it is already hidden on the dashboard.
// Flip this to true (and nothing else) whenever it's ready to go live.
const ENABLE_ARTICLES = false;

// ─── Express Setup ─────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // so req.protocol correctly reports https behind Render's proxy (needed for Paystack callback_url)
app.use(cors());

// ─── Paystack Webhook — MUST be registered before express.json() below ────────
// We need the exact raw bytes Paystack sent to verify the signature. If this
// route is ever moved below the global express.json() line, the body will
// already be parsed/consumed and signature verification will start failing.
app.post('/api/billing/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const secret    = process.env.PAYSTACK_SECRET_KEY || '';
    const signature = req.headers['x-paystack-signature'] || '';
    const expected   = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
    if (!secret || signature !== expected) {
      console.error('🚫 Paystack webhook: signature mismatch or missing secret');
      return res.sendStatus(401);
    }
    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'charge.success') {
      await applyPaystackMetadata(event.data.metadata, event.data.reference);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Paystack webhook error:', e.message);
    res.sendStatus(500);
  }
});

app.use(express.json({ limit: '10mb' }));          // raised for base64 photo payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));


// ─── Route Modules ───────────────────────────────────────────────────────────
require('./gmail')(app);
require('./billing')(app);
require('./kie')(app);
require('./tools')(app);
if (ENABLE_ARTICLES) {
  require('./articles')(app, { admin, db, authenticate });
}

// ─── Account / Misc (upload-image, test-email, username, register-user) ──────
app.post('/api/upload-image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    // Stream the buffer to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'kievora', resource_type: 'image', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
        (err, result) => { if (err) reject(err); else resolve(result); }
      );
      stream.end(req.file.buffer);
    });

    res.json({ url: result.secure_url });
  } catch (e) {
    console.error('Cloudinary upload error:', e.message);
    res.status(500).json({ error: 'Image upload failed: ' + e.message });
  }
});

// ─── Test Brevo email endpoint ────────────────────────────────────────────────
app.post('/api/test-email', async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  console.log(`🧪 Test email request for: ${email}`);
  await sendWelcomeEmail(email, name || 'Test User');
  res.json({ message: 'Test email triggered, check server logs' });
});

// ─── GET /api/check-username ─────────────────────────────────────────────────
// Public — no auth needed. Returns { available: true/false }.
app.get('/api/check-username', async (req, res) => {
  const raw = (req.query.username || '').toLowerCase().trim();
  if (!raw) return res.json({ available: false });
  if (!/^[a-z0-9_]{3,20}$/.test(raw))
    return res.json({ available: false, error: 'Username must be 3–20 chars, letters/numbers/underscores only' });
  try {
    const snap = await db.collection('usernames').doc(raw).get();
    res.json({ available: !snap.exists });
  } catch (err) {
    console.error('GET /api/check-username ERROR:', err.message);
    res.status(500).json({ available: false, error: 'Check failed' });
  }
});

// ─── POST /api/claim-username ────────────────────────────────────────────────
// Atomically reserves a new username & releases the old one. Admin SDK only.
app.post('/api/claim-username', authenticate, async (req, res) => {
  const { newUsername, oldUsername } = req.body;
  const uid   = req.user.uid;
  const clean = (newUsername || '').toLowerCase().trim();
  if (!clean || !/^[a-z0-9_]{3,20}$/.test(clean))
    return res.status(400).json({ error: 'Invalid username format' });
  try {
    const snap = await db.collection('usernames').doc(clean).get();
    if (snap.exists && snap.data().uid !== uid)
      return res.status(409).json({ error: 'Username already taken' });
    const batch = db.batch();
    batch.set(db.collection('usernames').doc(clean), { uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    if (oldUsername && oldUsername.toLowerCase() !== clean)
      batch.delete(db.collection('usernames').doc(oldUsername.toLowerCase()));
    batch.update(db.collection(USERS).doc(uid), { username: clean });
    await batch.commit();
    res.json({ success: true, username: clean });
  } catch (err) {
    console.error('POST /api/claim-username ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/register-user ───────────────────────────────────────────────────
// Called by signup.html after Firebase Auth creates the user.
// Writes the users doc server-side (Admin SDK bypasses rules) and sends welcome email.
app.post('/api/register-user', authenticate, async (req, res) => {
  const { name, email, username } = req.body;
  const uid      = req.user.uid;
  const cleanUn  = (username || '').toLowerCase().trim();
  try {
    // Reserve username if provided
    if (cleanUn && /^[a-z0-9_]{3,20}$/.test(cleanUn)) {
      const snap = await db.collection('usernames').doc(cleanUn).get();
      if (!snap.exists || snap.data().uid === uid) {
        await db.collection('usernames').doc(cleanUn).set({ uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    await db.collection(USERS).doc(uid).set({
      uid,
      name:        name || '',
      displayName: name || '',
      email:       email || req.user.email || '',
      username:    cleanUn || '',
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`👤 User doc created for ${email}${cleanUn ? ' (@' + cleanUn + ')' : ''}`);
    await sendWelcomeEmail(email || req.user.email, name || 'there');
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/register-user ERROR:', err.message);
    res.status(500).json({ error: 'Failed to register user: ' + err.message });
  }
});



// ─── Page Routes ───────────────────────────────────────────────────────────────
app.get('/',          (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/index',     (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
// ─── POST /api/cover-letter — Full AI generation ──────────────────────────────
app.post('/api/cover-letter', authenticate, async (req, res) => {
  const uid = req.user.uid;
  const { resumeSource, resumeId, resumeData, resumeText, template, jobTitle, companyName } = req.body;
  const model = 'spark'; // ALL tools always use Groq Spark — permanent

  // Plan gate: "from scratch" (no resume context) is free for everyone.
  // Using an existing resume (resumeId or resumeData) is a paid feature.
  const fromResume = !!(resumeId || resumeData || resumeText);
  if (fromResume) {
    const planKey = await getUserPlanKey(uid);
    if (!getPlanConfig(planKey).coverLetterFromResume) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.coverLetter() });
    }
  }

  if (!template) return res.status(400).json({ error: 'template is required' });
  if (!['classic','modern','executive','minimal'].includes(template)) {
    return res.status(400).json({ error: 'Invalid template' });
  }
  if (!jobTitle || !jobTitle.trim()) return res.status(400).json({ error: 'jobTitle is required' });
  if (!companyName || !companyName.trim()) return res.status(400).json({ error: 'companyName is required' });

  // Build resume context string from available data
  let resumeCtx = '';
  if (resumeData) {
    const d = resumeData;
    const name   = d.fullName || '';
    const title  = d.jobTitle || '';
    const email  = d.email    || '';
    const phone  = d.phone    || '';
    const loc    = d.location || '';
    const summ   = d.summary  || '';
    const skills = (d.skills  || []).join(', ');
    const exp    = (d.workExperience || []).map(e =>
      `${e.position} at ${e.company} (${e.startDate}–${e.endDate}): ${e.description}`
    ).join('\n');
    const edu = (d.education || []).map(e =>
      `${e.degree} in ${e.field} — ${e.school} (${e.graduationDate})`
    ).join('\n');
    resumeCtx = `Name: ${name}\nJob Title: ${title}\nEmail: ${email}\nPhone: ${phone}\nLocation: ${loc}\nSummary: ${summ}\nSkills: ${skills}\nExperience:\n${exp}\nEducation:\n${edu}`;
  } else if (resumeText) {
    resumeCtx = resumeText.slice(0, 3000);
  }

  // Template tone guide
  const toneGuide = {
    classic:   'formal, traditional corporate tone — respectful and professional',
    modern:    'confident and forward-thinking, modern professional tone',
    executive: 'authoritative, polished executive tone — leadership-focused',
    minimal:   'clean, concise, direct — no fluff, every word earns its place',
  };

  const systemPrompt = `You are an expert cover letter writer. You write compelling, personalized cover letters that sound like a thoughtful human wrote them — never generic, never templated. Return ONLY the cover letter text with no extra commentary, no subject line, no date, no address block. Just 3 paragraphs: (1) strong opening with the role and a hook, (2) relevant experience and skills matched to the company, (3) confident closing with a call to action. Keep it under 280 words.`;

  const hasResume = resumeCtx.trim().length > 20;
  const userPrompt = hasResume
    ? `Write a cover letter for ${jobTitle} at ${companyName}. Tone: ${toneGuide[template]}.\n\nCandidate's resume:\n${resumeCtx}\n\nUse their actual experience and skills. Make it specific, compelling, and authentic.`
    : `Write a cover letter for ${jobTitle} at ${companyName}. Tone: ${toneGuide[template]}. No resume provided — write a strong general letter showcasing enthusiasm and professional approach for this role.`;

  const cfg = { max_tokens: 700, temperature: 0.75 };
  const effectiveModel = KIE_MODELS[model] ? model : 'spark';

  try {
    console.log(`POST /api/cover-letter — uid:${uid} model:${effectiveModel} tpl:${template} job:"${jobTitle}" company:"${companyName}"`);
    const letter = await callKieAI(effectiveModel, systemPrompt, [{ role: 'user', content: userPrompt }], cfg);

    // Save to Firestore for history
    await db.collection('coverLetterQueue').add({
      uid,
      resumeSource: resumeSource || 'unknown',
      resumeId:     resumeId || null,
      template,
      jobTitle,
      companyName,
      model:        effectiveModel,
      status:       'generated',
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ letter: letter.trim(), template, model: effectiveModel });
  } catch (err) {
    console.error('POST /api/cover-letter ERROR:', err.message);
    // Fallback to Spark if Claude fails
    if (effectiveModel !== 'spark') {
      try {
        const letter = await callKieAI('spark', systemPrompt, [{ role: 'user', content: userPrompt }], cfg);
        return res.json({ letter: letter.trim(), template, model: 'spark', fallback: true });
      } catch (fe) { console.error('Cover letter fallback failed:', fe.message); }
    }
    res.status(500).json({ error: 'Cover letter generation failed. Please try again.' });
  }
});

app.get('/reset-password', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'reset-password.html')));
app.get('/login',     (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));
app.get('/signup',    (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'signup.html')));
app.get('/terms',     (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'terms.html')));
app.get('/privacy',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html')));
app.get('/onboarding', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'onboarding.html')));
app.get('/find-jobs', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'find-jobs.html')));
app.get('/support',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'support.html')));
app.get('/account',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'account.html')));
app.get('/settings',  (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'settings.html')));
app.get('/billing',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'billing.html')));


// ─── Articles / Community routes (follow, feed, submissions, profile/article pages) ──
if (ENABLE_ARTICLES) {
  require('./server-articles')(app, { admin, db, authenticate });
}

app.get('*',          (_req, res) => res.redirect('/'));

// ─── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Kievora running on port ${PORT}`);
  console.log(`📧 Brevo API Key configured: ${!!process.env.BREVO_API_KEY}`);
  console.log(`⚡ Groq API Key configured: ${!!process.env.GROQ_API_KEY}`);
  console.log(`🤖 Anthropic API Key configured: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`🔥 Firebase project: ${serviceAccount.project_id}`);
});
