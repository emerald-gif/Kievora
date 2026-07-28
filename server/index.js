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
  getCreditStatus, deductCredits, tokensToCredits,
  KIE_MODELS, USERS, sendWelcomeEmail, sendOtpEmail, sendTicketConfirmationEmail, sendNewsletterConfirmationEmail, applyPaystackMetadata, PLANS,
  serviceAccount,
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
require('./drive')(app);
require('./files')(app);
require('./billing')(app);
require('./kie')(app);
require('./tools')(app);
require('./job-alerts'); // starts the weekly job-alerts cron — needs tools.js's findJobsCore registered first, hence the order
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

// ─── POST /api/update-profile ──────────────────────────────────────────────────
// Writes name / jobTitle / category / jobAlert via the Admin SDK, server-side.
// Added because the CLIENT Firestore SDK's write connection was hanging
// indefinitely (no error, just never resolving) on some users' networks/VPNs —
// a known issue where a network blocks Firestore's own streaming channel
// while regular HTTPS to our own server works completely fine. Routing the
// write through here sidesteps that, the same way claim-username already
// does successfully for usernames.
app.post('/api/update-profile', authenticate, async (req, res) => {
  const uid = req.user.uid;
  const allowedFields = ['name', 'displayName', 'jobTitle', 'category', 'jobAlert'];
  const update = {};
  for (const f of allowedFields) {
    if (req.body[f] !== undefined) update[f] = req.body[f];
  }
  if (!Object.keys(update).length) return res.status(400).json({ error: 'No fields to update' });
  update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  try {
    await db.collection(USERS).doc(uid).set(update, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/update-profile ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/profile ───────────────────────────────────────────────────────────
// Reads the user's own doc via the Admin SDK. Added alongside /api/update-profile
// for the same reason — the client Firestore SDK's connection (reads included,
// not just writes) can hang indefinitely on some networks/VPNs with no error at
// all, which showed up as "username not set" even right after saving successfully.
app.get('/api/profile', authenticate, async (req, res) => {
  try {
    const snap = await db.collection(USERS).doc(req.user.uid).get();
    res.json({ exists: snap.exists, data: snap.exists ? snap.data() : null });
  } catch (err) {
    console.error('GET /api/profile ERROR:', err.message);
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
    // OAuth signups (Google, Microsoft, ...) never go through OTP, so welcome
    // them right away. Checking sign_in_provider directly — not just
    // email_verified — means this stays correct for Microsoft (and any future
    // provider) even if its emailVerified semantics ever differ from Google's.
    // Password signups aren't verified yet at this point (OTP hasn't run), so
    // hold the welcome email until /api/verify-otp succeeds instead. Firing
    // both emails back-to-back at signup was likely why the welcome email
    // wasn't reliably showing up for password signups — most ESPs are more
    // conservative with rapid multi-sends to a brand-new address.
    const signInProvider = req.user.firebase?.sign_in_provider;
    if (req.user.email_verified || signInProvider !== 'password') {
      await sendWelcomeEmail(email || req.user.email, name || 'there');
    }
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/register-user ERROR:', err.message);
    res.status(500).json({ error: 'Failed to register user: ' + err.message });
  }
});

// ─── POST /api/support-ticket-email ────────────────────────────────────────────
// Called by support.html right after it writes a ticket to Firestore
// (support_requests/{ticketId} has "allow create: if true" — visitors submit
// without being signed in, so this endpoint stays public too). It looks the
// ticket up server-side by ID rather than trusting the posted email/name, so
// it can't be used to spam arbitrary addresses. Idempotent: a ticket only
// ever gets one confirmation email even if the client calls this twice.
app.post('/api/support-ticket-email', async (req, res) => {
  const ticketId = String(req.body.ticketId || '').trim().toUpperCase();
  if (!/^KVR-\d{4}-[A-Z0-9]{5}$/.test(ticketId)) {
    return res.status(400).json({ error: 'Invalid ticket ID.' });
  }
  try {
    const ref  = db.collection('support_requests').doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Ticket not found.' });

    const data = snap.data();
    if (data.confirmationEmailSent) {
      return res.json({ success: true, alreadySent: true });
    }
    const sent = await sendTicketConfirmationEmail(data.email, data.name, ticketId, data.subject);
    if (!sent) return res.status(502).json({ error: 'Could not send confirmation email.' });

    await ref.update({ confirmationEmailSent: true });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/support-ticket-email ERROR:', err.message);
    res.status(500).json({ error: 'Failed to send confirmation email: ' + err.message });
  }
});


// ─── POST /api/newsletter-confirmation-email ───────────────────────────────────
// Called by about.html / index.html / pricing.html right after they write to
// newsletter_subscribers (Firestore). Recomputes the same deterministic doc ID
// from the email server-side rather than trusting a client-supplied ID, so this
// can only ever fire for an email that's already actually subscribed. Idempotent:
// a subscriber only ever gets one confirmation email even if called twice.
app.post('/api/newsletter-confirmation-email', async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required.' });
  }
  const docId = email.replace(/[.#$\[\]\/]/g, '_');
  try {
    const ref  = db.collection('newsletter_subscribers').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'No subscription found for this email.' });

    const data = snap.data();
    if (data.confirmationEmailSent) {
      return res.json({ success: true, alreadySent: true });
    }
    const sent = await sendNewsletterConfirmationEmail(data.email || email);
    if (!sent) return res.status(502).json({ error: 'Could not send confirmation email.' });

    await ref.update({ confirmationEmailSent: true });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/newsletter-confirmation-email ERROR:', err.message);
    res.status(500).json({ error: 'Failed to send confirmation email: ' + err.message });
  }
});

// Google signups already arrive with emailVerified:true from Firebase (Google
// already verified that email), so this whole flow is skipped for them —
// signup.html only calls these for the email/password path.
const OTP_TTL_MS      = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

// ─── POST /api/send-otp — generates + emails a 6-digit code ───────────────────
app.post('/api/send-otp', authenticate, async (req, res) => {
  const uid   = req.user.uid;
  const email = req.user.email || req.body.email;
  const name  = req.body.name || 'there';
  if (!email) return res.status(400).json({ error: 'No email on this account.' });
  try {
    const otp = String(crypto.randomInt(100000, 1000000)); // 6 digits, no leading-zero bias issue
    await db.collection('otps').doc(uid).set({
      code:      otp,
      email,
      attempts:  0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: Date.now() + OTP_TTL_MS,
    });
    const sent = await sendOtpEmail(email, name, otp);
    if (!sent) return res.status(502).json({ error: 'Could not send verification email. Try again in a moment.' });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/send-otp ERROR:', err.message);
    res.status(500).json({ error: 'Failed to send verification code: ' + err.message });
  }
});

// ─── POST /api/verify-otp — checks the code, marks the account verified ───────
app.post('/api/verify-otp', authenticate, async (req, res) => {
  const uid  = req.user.uid;
  const code = String(req.body.code || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code.' });
  try {
    const ref  = db.collection('otps').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return res.status(400).json({ error: 'No verification code found. Request a new one.' });

    const data = snap.data();
    if (Date.now() > data.expiresAt) {
      await ref.delete();
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }
    if (data.attempts >= OTP_MAX_ATTEMPTS) {
      await ref.delete();
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
    }
    if (code !== data.code) {
      await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
      return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    }

    // Correct — mark the real Firebase Auth record as verified. This is what
    // account.html (and everything else) reads to decide "Email Verified".
    await admin.auth().updateUser(uid, { emailVerified: true });
    await ref.delete();

    // Now that they've actually proven they own this inbox, send the welcome
    // email (held back at registration for password accounts — see register-user).
    try {
      const userSnap = await db.collection(USERS).doc(uid).get();
      const userName = userSnap.exists ? (userSnap.data().name || 'there') : 'there';
      await sendWelcomeEmail(data.email, userName);
    } catch (e) {
      console.warn('Could not send welcome email after OTP verify:', e.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/verify-otp ERROR:', err.message);
    res.status(500).json({ error: 'Failed to verify code: ' + err.message });
  }
});



// ─── Page Routes ───────────────────────────────────────────────────────────────
app.get('/',          (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/index',     (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
// ─── POST /api/cover-letter — Full AI generation ──────────────────────────────
app.post('/api/cover-letter', authenticate, async (req, res) => {
  const uid = req.user.uid;
  const { resumeSource, resumeId, resumeData, resumeText, template, jobTitle, companyName } = req.body;

  const planKey = await getUserPlanKey(uid);
  const model   = getPlanConfig(planKey).kieModel; // plan determines the model for every tool except KIE chat itself — never hardcode this

  // Plan gate: "from scratch" (no resume context) is free for everyone.
  // Using an existing resume (resumeId or resumeData) is a paid feature.
  const fromResume = !!(resumeId || resumeData || resumeText);
  if (fromResume) {
    if (!getPlanConfig(planKey).coverLetterFromResume) {
      return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.coverLetter() });
    }
  }

  const creditStatus = await getCreditStatus(uid, planKey);
  if (!creditStatus.allowed) {
    return res.status(403).json({ error: 'credits_exhausted', message: UPGRADE_MESSAGES.creditsExhausted(planKey), upsellType: creditStatus.upsellType });
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
  const billing = { uid, planKey };

  try {
    console.log(`POST /api/cover-letter — uid:${uid} model:${effectiveModel} tpl:${template} job:"${jobTitle}" company:"${companyName}"`);
    const letter = await callKieAI(effectiveModel, systemPrompt, [{ role: 'user', content: userPrompt }], cfg, billing);

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
    if (err.code === 'CREDITS_EXHAUSTED') {
      return res.status(403).json({ error: 'credits_exhausted', message: UPGRADE_MESSAGES.creditsExhausted(planKey), upsellType: err.status?.upsellType });
    }
    console.error('POST /api/cover-letter ERROR:', err.message);
    // Fallback to Spark if Claude fails
    if (effectiveModel !== 'spark') {
      try {
        const letter = await callKieAI('spark', systemPrompt, [{ role: 'user', content: userPrompt }], cfg, billing);
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
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'dashboard', 'dashboard.html')));
app.get('/onboarding', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'onboarding.html')));
app.get('/find-jobs', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'find-jobs.html')));
app.get('/support',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'support.html')));
app.get('/account',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'account.html')));
app.get('/settings',  (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'settings.html')));
app.get('/billing',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'billing.html')));
app.get('/pricing',   (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'pricing.html')));
app.get('/about',     (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'about.html')));
app.get('/gmail-ai',  (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'gmail-ai.html')));


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
