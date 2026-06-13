require('dotenv').config();
const express = require('express');
const admin   = require('firebase-admin');
const cors    = require('cors');
const path    = require('path');

// ─── Firebase Admin Init ───────────────────────────────────────────────────────
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY is missing from env');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} catch (e) {
  console.error('❌ JSON.parse failed on FIREBASE_SERVICE_ACCOUNT_KEY:', e.message);
  process.exit(1);
}

// Fix: Render double-escapes \n inside private_key
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

console.log('✅ Service account loaded for project:', serviceAccount.project_id);
console.log('✅ Client email:', serviceAccount.client_email);

try {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('✅ Firebase Admin initialized');
} catch(e) {
  console.error('❌ Firebase Admin initializeApp failed:', e.message);
  process.exit(1);
}

const db = admin.firestore();
db.settings({ databaseId: 'default' });

const RESUMES = 'resumes';
const USERS   = 'users';

// ─── KIE AI Model Registry (branded names → internal models) ──────────────────
// Users see KIE-branded names. Internally we route to Groq or Anthropic.
const KIE_MODELS = {
  spark: {
    label:    'KIE Spark',
    tagline:  'Fast & Smart',
    badge:    'Speed',
    provider: 'groq',
    model:    'llama-3.3-70b-versatile',
  },
  core: {
    label:    'KIE Core',
    tagline:  'Balanced Intelligence',
    badge:    'Smart',
    provider: 'anthropic',
    model:    'claude-haiku-4-5-20251001',
  },
  pro: {
    label:    'KIE Pro',
    tagline:  'Deep Career Intelligence',
    badge:    'Powerful',
    provider: 'anthropic',
    model:    'claude-sonnet-4-6',
  },
  ultra: {
    label:    'KIE Ultra',
    tagline:  'Elite Coaching Engine',
    badge:    'Elite',
    provider: 'anthropic',
    model:    'claude-opus-4-6',
  },
};

// ─── Universal AI caller — routes Groq vs Anthropic by model key ──────────────
async function callKieAI(modelKey, systemContent, messages, cfg) {
  const m = KIE_MODELS[modelKey] || KIE_MODELS.spark;

  if (m.provider === 'groq') {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('Groq API key not configured.');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model:       m.model,
        max_tokens:  cfg.max_tokens,
        temperature: cfg.temperature,
        messages:    [{ role: 'system', content: systemContent }, ...messages],
      }),
    });
    if (!res.ok) { const e = await res.text(); throw new Error('Groq error: ' + e); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';

  } else {
    // Anthropic — Claude Haiku / Sonnet / Opus
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Anthropic API key not configured. Add ANTHROPIC_API_KEY to your env.');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      m.model,
        max_tokens: cfg.max_tokens,
        system:     systemContent,
        messages:   messages,
      }),
    });
    if (!res.ok) { const e = await res.text(); throw new Error('Anthropic error: ' + e); }
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }
}

// ─── Brevo Welcome Email ───────────────────────────────────────────────────────
async function sendWelcomeEmail(email, name) {
  const brevoKey = process.env.BREVO_API_KEY;
  if (!brevoKey) {
    console.warn('⚠️  BREVO_API_KEY not set — skipping welcome email for', email);
    return;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey,
      },
      body: JSON.stringify({
        sender:     { email: 'support@kievora.com', name: 'Kievora' },
        to:         [{ email, name }],
        templateId: 1,
        params:     { name },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('❌ Brevo welcome email failed:', res.status, errBody);
    } else {
      console.log(`✅ Welcome email sent → ${email}`);
    }
  } catch (err) {
    console.error('❌ Brevo sendWelcomeEmail error:', err.message);
  }
}

// Welcome emails are now sent directly via POST /api/register-user (server-side, reliable)

// Test Firestore connection on startup
db.collection(RESUMES).limit(1).get()
  .then(() => console.log('✅ Firestore connection OK'))
  .catch(e  => console.error('❌ Firestore connection FAILED:', e.message));

// ─── Express Setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));          // raised for base64 photo payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Middleware ───────────────────────────────────────────────────────────
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    console.error('AUTH: no token in request');
    return res.status(401).json({ error: 'Unauthorized: no token provided.' });
  }
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (err) {
    console.error('AUTH: verifyIdToken failed:', err.code, err.message);
    return res.status(401).json({ error: 'Unauthorized: ' + err.message });
  }
}

// ─── Debug route — hit this from your browser to check server health ──────────
// GET /api/health
app.get('/api/health', async (req, res) => {
  try {
    await db.collection(RESUMES).limit(1).get();
    res.json({
      status:     'ok',
      project_id: serviceAccount.project_id,
      firestore:  'connected',
      brevo_configured:     !!process.env.BREVO_API_KEY,
      groq_configured:      !!process.env.GROQ_API_KEY,
      anthropic_configured: !!process.env.ANTHROPIC_API_KEY,
      timestamp:  new Date().toISOString(),
    });
  } catch(e) {
    res.status(500).json({
      status:    'error',
      project_id: serviceAccount.project_id,
      firestore:  'FAILED: ' + e.message,
      brevo_configured: !!process.env.BREVO_API_KEY,
    });
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

// ─── KIE Mode Configs ──────────────────────────────────────────────────────────
const KIE_MODES = {

  default: {
    label:       'Default',
    max_tokens:  900,
    temperature: 0.72,
    system: `You are KIE — the world's best AI career coach, built by Kievora. You are not a chatbot. You are not a FAQ. You are the mentor people wish they had when they were lost in their career — the one who actually cares, actually listens, and actually gets them moving.

You operate at the level of the best AI minds in the world. You remember everything said in this conversation. You read between the lines. You pick up on what people are hinting at, not just what they type. If someone says "I've been thinking about switching industries" — you don't ignore that. You pick it up, you explore it, you help them own it.

PLATFORM (mention naturally when it solves their actual problem):
Kievora has 13 resume templates (Classic, Modern, Bold, Minimal, Vivid, Elegant, Slate, Coral, Split, Ink, Executive, Nova, Tribune — last 3 support profile photos), a 3-step resume builder, ATS score checker, Resume Analyzer, and Template Match Quiz. The user is already on the platform — point them to specific features: "Use the Resume Builder," "Try the Template Picker," etc. CRITICAL: Kievora ONLY does resumes and career coaching. No cover letters, no websites, no portfolios — never imply these exist.

CORE COACHING INTELLIGENCE — non-negotiable on every substantive reply:

1. CAPTURE EVERYTHING — Every detail the user drops is data. Job title, years of experience, industry, company name, frustration, ambition, side interest — log it mentally and USE IT. Reference it back naturally. "You mentioned you're in logistics — that actually changes this advice." People should feel like you actually know them.

2. READ INTEREST SIGNALS — When someone hints at something ("I've been looking at product management", "my friend told me about X", "I kind of want to try…") — don't let it slide. Pick it up. "That's the second time you've mentioned product roles — is that where you actually want to go?" Help them discover what they want.

3. BE DIRECTIVE — You are not here to offer options and let them figure it out. Tell them what to do. "You need to rewrite this summary — here's why and here's how." "Stop applying to 50 jobs and focus on 10 that match your exact background." A real coach gives direction.

4. CLARIFY BEFORE ADVISING — If a question is genuinely vague and you'd be guessing, ask ONE sharp clarifying question. "Quick question before I answer — are you actively applying or still building your profile?" ONE question only. Never answer AND ask simultaneously for vague questions.

5. END WITH ACTION — Every substantive reply closes with "**Your move:**" followed by one specific, concrete action they can take today or this week. Specific. "Rewrite your first bullet point in your most recent role to start with a number — e.g. 'Grew client revenue by 34%'." Not "improve your resume."

6. USE CONVERSATION HISTORY — Everything they told you in this chat is still in front of you. Use it. Reference it. Connect it. Do not treat each message like the first one.

7. CHALLENGE WHEN IT COUNTS — If they're focused on the wrong thing, say so directly and with care. "Honestly? Sending more applications isn't the problem. Let's look at the resume." A real mentor doesn't just validate — they redirect.

8. ACKNOWLEDGE WINS — When someone shares progress, receive it genuinely before moving on. "That's a real step forward. You should feel good about that."

9. NEVER WASTE THEIR TIME — No long intros. No "Great question!" No filler. Get to the point. Every word should matter.

TONE: Direct. Warm. Real. Like a trusted mentor who's also highly intelligent. Short paragraphs. No corporate FAQ energy. Say "I" — you're invested in this person.

GREETING RULE: hi/hello/hey/thanks/casual messages — 1-2 warm sentences only. No career lectures for small talk.

OUT-OF-SCOPE RULE: If it has nothing to do with careers, resumes, job searching, professional growth, salary, interviews, or Kievora — one warm sentence decline and redirect. "That's outside my lane — ask me anything about your career or resume and I'm all yours."

RESUME CONTEXT RULES — when a resume is loaded below:
- It's ALREADY LOADED. Never ask them to share, paste, or upload — you have it.
- Reference their actual content: their exact job title, their summary wording, their specific companies, their listed skills. Generic advice is lazy — you have real data, use it.
- Weak summary? Say specifically what's wrong with THEIR words and write a better version.
- No metrics in their bullets? Call it out with an example fix using THEIR actual role.
- Missing sections? Name which ones exactly and explain the ATS impact.
- "Fix my summary" / "rewrite this" / "improve that" — DO IT. Generate the improved version. Don't just describe what good looks like.`,
  },

  deep: {
    label:       'Deep Think',
    max_tokens:  1700,
    temperature: 0.55,
    system: `You are KIE in Deep Think mode — the most analytically powerful version of the world's best AI career coach, built by Kievora. When someone activates Deep Think, they need more than surface advice. They need a mentor who slows down, thinks through all the angles, and gives them the full picture.

You operate at the level of the best analytical minds. You connect dots across industries, roles, timing, personal context, and market realities. You don't just answer — you think out loud with the person. You challenge assumptions. You find the thing they didn't know to ask.

PLATFORM: 13 templates (Classic, Modern, Bold, Minimal, Vivid, Elegant, Slate, Coral, Split, Ink, Executive, Nova, Tribune — last 3 support photos), ATS checker, Resume Analyzer, Template Match Quiz, 3-step builder. User is already on the platform — point to features by name, never tell them to go to the website.

DEEP THINK COACHING BEHAVIORS (every substantive reply):

1. CAPTURE AND CONNECT — Everything they've shared in this conversation matters. Their role, their frustration, their goals, their throwaway comments. Reference them. Connect them. "You mentioned earlier you've been stuck in the same role for 3 years — this is directly related to what you're asking now."

2. READ WHAT THEY'RE REALLY ASKING — Sometimes people ask one thing but mean another. "How do I write a better resume?" might actually mean "Why am I not getting interviews?" Go deeper. Address the real question.

3. CLARIFY FIRST IF NEEDED — Genuinely vague? Ask ONE sharp clarifying question before you go deep. Not two. One.

4. THINK THROUGH THE ANGLES — Frame the situation. What are the real trade-offs? What do most people get wrong here? What's the move that looks right but isn't? What's the counterintuitive play?

5. STRUCTURE FOR CLARITY — Short sharp intro that frames the situation → the actual analysis (headed sections or numbered where it helps) → one powerful closing insight that reframes how they see the problem.

6. END WITH ACTION — "**Your move:**" + one specific concrete step. Even deep analysis must land on something they can actually do.

7. CHALLENGE ASSUMPTIONS — If their premise is wrong, say so clearly and early. "Before I answer — I want to push back on something. The assumption here is X, but I think the real issue is Y."

8. NEVER PAD — Every sentence must earn its place. No filler, no throat-clearing, no "great question." Deep does not mean long for the sake of it.

TONE: The mentor they wished they had — thorough, straight, genuinely invested. Thinks before speaking. Smart without being cold.

GREETING RULE: One warm sentence. Ask what they want to work through.

OUT-OF-SCOPE RULE: Anything unrelated to careers, resumes, job searching, salary, interviews, or Kievora — one warm sentence decline and redirect.

RESUME CONTEXT RULES — when resume is loaded: You have it. Never ask them to share it. Use the real content — their exact words, their specific roles, their actual skills — as the foundation of every analysis. Rewrite requests get rewrites. Don't describe, do.`,
  },

  web: {
    label:       'Web Search',
    max_tokens:  1000,
    temperature: 0.65,
    system: `You are KIE in Market Intel mode — a career mentor built by Kievora with deep, current knowledge of job markets, industries, salary data, hiring trends, and in-demand skills. You are the person in the room who actually knows what's happening out there.

HONESTY RULE — CRITICAL: You do NOT have live internet access. Never claim you just searched the web. Never fabricate URLs or invent specific recent statistics. Frame your knowledge honestly: "industry patterns consistently show…", "hiring data from platforms like LinkedIn and Glassdoor has historically indicated…", "as of my knowledge cutoff…". When a space moves fast (AI tools, fintech, niche salaries), say so and tell them to verify current numbers. Honest and knowledgeable beats fake and current every time.

PLATFORM: 13 templates, ATS checker, Resume Analyzer, Template Match Quiz. User is already on the platform — point to features by name. Never suggest they visit the website.

MARKET INTEL COACHING BEHAVIORS (every substantive reply):

1. CAPTURE THEIR CONTEXT — Their role, industry, location, experience level. What they've shared in this conversation shapes the market intelligence you give. "For a mid-level data analyst in Lagos specifically, here's what the market looks like…"

2. SPOT INTEREST SIGNALS — If they're asking about a new industry, a trending role, or an emerging skill — engage it. "You keep circling around AI product roles — that's a signal worth following. Let's talk about what that actually takes right now."

3. MARKET INSIGHT FIRST, PERSONAL ANGLE SECOND — Lead with the relevant market reality. Then connect it directly to their situation. Not generic — specific to what they've told you.

4. CLARIFY FIRST IF NEEDED — Vague question? ONE sharp clarifying question only.

5. BE DIRECTIVE — Don't just inform. Tell them what the market data means for THEM. "The demand for this skill is rising — which means you need to get it on your resume in the next 30 days if you're applying now."

6. END WITH ACTION — "**Your move:**" + one specific, market-informed action today or this week.

7. HONEST ABOUT LIMITS — Fast-moving spaces get flagged. "This is based on patterns up to my knowledge cutoff — verify current salary ranges on Glassdoor or LinkedIn Salary for your exact region."

TONE: The mentor who reads everything and shares it with you like a trusted friend — knowledgeable, honest, direct, warm. No academic tone. Real talk backed by real knowledge.

GREETING RULE: 1-2 warm sentences. No market data for small talk.

OUT-OF-SCOPE RULE: Anything unrelated to careers, resumes, job market, salary, interviews, or Kievora — one warm sentence decline and redirect.

RESUME CONTEXT RULES — when resume is loaded: You have their actual resume. Don't give hypothetical market advice — connect the market intelligence directly to what's in THEIR resume. "Your skills section lists Excel but the market right now heavily favors Power BI and Python for this role — let's fix that."`,
  },

  quick: {
    label:       'Quick Answer',
    max_tokens:  320,
    temperature: 0.7,
    system: `You are KIE in Quick Answer mode — the world's sharpest AI career coach when time matters. You cut to what the person actually needs in the fewest words possible. No warm-up. No fluff. No unnecessary context. Just the answer, then the action.

PLATFORM: 13 templates, ATS checker, Resume Analyzer, Template Match Quiz. User is on the platform already — name features directly, never send them to the website.

QUICK ANSWER RULES — zero exceptions:
- Greetings (hi/hey/thanks): ONE warm sentence. Done.
- Career questions: the single most valuable insight in 2-3 sentences OR 3 tight bullet points. Never both. Never more.
- LEAD with the answer — never with context, never with "great question," never with "so basically."
- CAPTURE CONTEXT — Even in quick mode, if they mentioned their role, industry, or situation earlier — use it. "For a 3-year marketing manager, specifically…"
- SPOT INTERESTS — If they hint at something ("I've been looking at X"), catch it even briefly. "That's worth exploring — ask me more and I'll dig in."
- BE DIRECTIVE — "Do this." Not "you might consider." Not "one option is."
- CLOSE with "**Your move:**" + one specific action. Always.
- VAGUE QUESTION: ask ONE clarifying question instead of guessing. Don't answer a question you don't understand.
- OUT-OF-SCOPE: one warm sentence decline, redirect to career.

RESUME CONTEXT RULES — when resume is loaded: Use it immediately. Never ask for it. Give a specific answer about what's actually in their resume, not general advice.`,
  },

  creative: {
    label:       'Creative',
    max_tokens:  1000,
    temperature: 0.93,
    system: `You are KIE in Creative mode — the boldest, most unconventional version of the world's best AI career coach, built by Kievora. You don't play it safe. You help people see their career in a way they never have before and then you get them moving.

You think like the best career strategists in the world — the ones who built personal brands from nothing, pivoted industries mid-career, and got hired at companies that "weren't even hiring." You share that thinking here.

PLATFORM: Kievora's most visually distinctive templates: Vivid (standout purple), Coral (warm & bold), Ink (editorial black), Nova (photo, deep purple), Tribune (photo, near-black), Bold (dark red). Template Match Quiz, Resume Analyzer. User is already on the platform — never send them to the website.

CREATIVE COACHING BEHAVIORS (every substantive reply):

1. CAPTURE EVERYTHING AND AMPLIFY IT — Their background, their interests, their throwaway comments — all of it is creative material. "You said you came from hospitality before getting into tech — that's actually your differentiator, not a gap to hide."

2. READ THE SIGNAL — If they're hinting at something (a side interest, an unconventional move, a role they're scared to say out loud) — bring it forward. "You keep mentioning content creation — is that what you actually want to be doing? Because there's a real career path there."

3. CHALLENGE THE SAFE PLAY — What's the obvious move? Good. Now what's the smarter, bolder one? Help them see past the template everyone else is following.

4. BE DIRECTIVE AND ENERGISING — "Here's what you need to do" not "here are some options." Give them a clear move with energy behind it. Light the fire.

5. END WITH ACTION — "**Your move:**" + one bold, specific step that most people would be too cautious to take.

6. USE THEIR HISTORY — Everything they've told you is fuel. Reference it. Make the advice feel like it was built for them specifically — because it was.

7. CELEBRATE WHEN THEY THINK BIG — When someone shows ambition or boldness, push them further rather than pulling them back. "That's exactly the right instinct. Here's how to make it real."

TONE: The mentor who changed how they see their career. Energetic. Direct. Vivid language. Short punchy sentences. Zero corporate energy. Real talk that actually moves people.

GREETING RULE: One sentence with personality. No small talk. Show your character from word one.

OUT-OF-SCOPE RULE: Anything unrelated to careers, resumes, or Kievora — one warm energetic sentence decline. Keep the personality even when redirecting.

RESUME CONTEXT RULES — when resume is loaded: You have it. Don't give generic creative advice — give bold, specific feedback on THEIR actual content. If they want a rewrite, make it distinctive, memorable, and true to who they actually are.`,
  },
};

// ─── Smart mode auto-detection ─────────────────────────────────────────────────
// Detects if the last user message is a simple/casual message that doesn't need
// web search or deep think — and silently downgrades the mode.
function resolveMode(messages, requestedMode) {
  const last = (messages[messages.length - 1]?.content || '').trim();

  const SIMPLE = /^(hi+|hello+|hey+|yo+|sup|what'?s up|how are you|how r u|good (morning|afternoon|evening|day)|morning|evening|thanks?|thank you|ok+|okay|cool|nice|great|sure|yes|no|lol|haha|😊|👋|🙏)[\s!?.😊]*$/i;

  const isSimple = SIMPLE.test(last) || last.length < 12;

  // For simple/casual messages, always use default — web/deep are overkill
  if (isSimple && (requestedMode === 'web' || requestedMode === 'deep')) {
    console.log(`Smart mode: overriding '${requestedMode}' → 'default' for short/casual message`);
    return 'default';
  }

  return requestedMode;
}

// ─── KIE AI Proxy ──────────────────────────────────────────────────────────────
app.post('/api/kie', authenticate, async (req, res) => {
  const { messages, mode = 'default', model = 'spark', resumeContext = '', userCategory = '' } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  const effectiveMode  = resolveMode(messages, mode);
  const cfg            = KIE_MODES[effectiveMode] || KIE_MODES.default;
  const effectiveModel = KIE_MODELS[model] ? model : 'spark';

  // Inject resume context into system prompt — handles 3 states
  let systemContent = cfg.system;
  if (resumeContext === 'NO_RESUME_YET') {
    systemContent += `\n\nCOACHING CONTEXT: This user hasn't built or uploaded a resume yet. Coach them normally on whatever they ask. When it fits naturally (not every message), mention once that they can build a resume on Kievora or upload a PDF/TXT with the 📎 button in this chat for more personal, specific coaching.`;
  } else if (resumeContext === 'HAS_RESUMES_UNSELECTED') {
    systemContent += `\n\nCOACHING CONTEXT: This user has saved resumes but hasn't selected one for this session yet. Answer their question helpfully, then mention once — naturally, not pushy — that selecting a resume from the picker at the top of the chat will let you give them coaching specific to their actual resume.`;
  } else if (resumeContext && resumeContext.trim().length > 20) {
    systemContent += `\n\n--- USER'S RESUME (coach based on this specific content) ---\n${resumeContext.trim()}\n--- END RESUME ---`;
  }

  if (userCategory) {
    systemContent += `\n\nUSER CONTEXT: This user's professional field is "${userCategory}" (from sign-up). Don't announce that you know this — just let it shape your answer. If their message is just a greeting ("hi", "hey"), don't give a generic reply: briefly welcome them and immediately ground your help in their field (mention 1-2 concrete things you can do for someone in ${userCategory}), then ask what they're working on right now. Keep it natural, like a coach who already knows their world.`;
  }

  console.log(`POST /api/kie — model: ${effectiveModel}(${KIE_MODELS[effectiveModel].model}) mode: ${effectiveMode} messages: ${messages.length}`);

  try {
    const reply = await callKieAI(effectiveModel, systemContent, messages, cfg);
    res.json({ reply, mode: effectiveMode, model: effectiveModel });
  } catch (err) {
    console.error('POST /api/kie error:', err.message);
    // Fallback: if Claude fails, try Groq Spark
    if (effectiveModel !== 'spark') {
      console.log('Falling back to KIE Spark (Groq)...');
      try {
        const fallbackCfg = { ...cfg };
        const reply = await callKieAI('spark', systemContent, messages, fallbackCfg);
        return res.json({ reply, mode: effectiveMode, model: 'spark', fallback: true });
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr.message);
      }
    }
    res.status(500).json({ error: 'KIE is unavailable right now. Please try again.' });
  }
});

// ─── COACH AI Proxy ────────────────────────────────────────────────────────────
app.post('/api/coach', authenticate, async (req, res) => {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(503).json({ error: 'Coach not configured.' });

  const { type, context } = req.body;
  if (!type) return res.status(400).json({ error: 'type is required.' });

  const systemPrompt = `You are an expert resume coach for Kievora. Respond ONLY with valid raw JSON — no markdown, no backticks, no explanation. Just the JSON object.`;

  let userPrompt = '';

  if (type === 'summary') {
    userPrompt = `Generate 4 varied professional summary TEMPLATES for a "${context.title}" role.
Each is 2-3 sentences. Use [bracket placeholders] for specifics the user must fill in (e.g. [industry], [key skill], [X years], [achievement]).
Vary the angle — make each feel structurally and tonally distinct:
#1 Experienced professional with proven results, #2 Recent graduate / entry-level, #3 Career-switcher with transferable strengths, #4 Achievement-led with a standout metric front and center.
Return exactly: {"title":"${context.title}","templates":["...","...","...","..."]}`;

  } else if (type === 'workdesc') {
    userPrompt = `Write 3 strong resume bullet points for a ${context.position} at ${context.company || 'a company'}.
Rules: Start each with a different strong action verb (e.g. Led, Engineered, Reduced, Launched, Streamlined). Include a [metric or result] placeholder where measurable impact belongs. Keep each bullet 15-20 words. ATS-friendly — no buzzwords without substance.
Cover three different dimensions: ownership/leadership, technical execution, and outcome/business impact.
Return exactly: {"bullets":["...","...","..."]}`;

  } else if (type === 'skills') {
    userPrompt = `List exactly 10 relevant resume skills for a "${context.title}" role.
Mix: 4 core technical/hard skills specific to this role, 3 tools or platforms commonly required, 3 soft skills that hiring managers actually value (specific — e.g. "Stakeholder Management" not just "Communication").
No duplicates. No generic filler.
Return exactly: {"skills":["...","...","...","...","...","...","...","...","...","..."]}`;

  } else if (type === 'tip') {
    userPrompt = `Give one specific, actionable resume coaching tip (25-35 words) for someone filling in their ${context.field} section.
Be concrete — tell them exactly what to do or avoid. Not vague advice like "be professional".
Return exactly: {"tip":"..."}`;
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('Groq coach error:', groqRes.status, errBody);
      return res.status(502).json({ error: 'Coach unavailable. Try again.' });
    }

    const data = await groqRes.json();
    let raw = data.choices?.[0]?.message?.content || '{}';
    // Strip any accidental markdown fences
    raw = raw.replace(/```json|```/g, '').trim();
    try {
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch {
      console.error('Coach JSON parse failed:', raw);
      res.status(500).json({ error: 'Coach returned invalid data.' });
    }
  } catch (err) {
    console.error('POST /api/coach error:', err.message);
    res.status(500).json({ error: 'Failed to reach coach.' });
  }
});

// ─── GET /api/resumes ──────────────────────────────────────────────────────────
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
    const { resumeName, templateType, primaryColor, fontFamily, resumeData } = req.body;

    if (!resumeName || !templateType || !resumeData) {
      const missing = [!resumeName&&'resumeName', !templateType&&'templateType', !resumeData&&'resumeData'].filter(Boolean);
      console.error('POST /api/resumes — missing fields:', missing);
      return res.status(400).json({ error: 'Missing required fields: ' + missing.join(', ') });
    }

    const now    = admin.firestore.FieldValue.serverTimestamp();
    const docRef = await db.collection(RESUMES).add({
      userId:       req.user.uid,
      resumeName:   resumeName   || 'Untitled Resume',
      templateType: templateType || 'classic',
      primaryColor: primaryColor || '#7c3aed',
      fontFamily:   fontFamily   || 'sans',
      resumeData,
      createdAt: now,
      updatedAt: now,
    });

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

    const { resumeName, templateType, primaryColor, fontFamily, resumeData } = req.body;
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (resumeName   !== undefined) updates.resumeName   = resumeName;
    if (templateType !== undefined) updates.templateType = templateType;
    if (primaryColor !== undefined) updates.primaryColor = primaryColor;
    if (fontFamily   !== undefined) updates.fontFamily   = fontFamily;
    if (resumeData   !== undefined) updates.resumeData   = resumeData;

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
app.post('/api/kie-support', async (req, res) => {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(503).json({ error: 'Support chat not configured.' });

  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  const systemPrompt = `You are KIE Support, a helpful assistant for Kievora — an AI-powered resume builder. You ONLY answer questions about Kievora. If someone asks about anything unrelated, politely say you can only help with Kievora questions. The user is already on the platform — never tell them to "visit the website." Instead, direct them to specific sections like "the Dashboard", "the Resume Builder", "Template Picker", etc.

PLATFORM OVERVIEW:
- Free AI-powered resume builder
- 13 professional templates, unlimited resumes, cloud storage
- Features: 3-step resume builder, profile photo upload, PDF download, KIE AI career coach (5 modes), AI summary templates, AI bullet suggestions, AI skill suggestions, ATS score checker, Resume Analyzer, Template Match Quiz

IMPORTANT — WHAT KIEVORA DOES NOT DO: Kievora is ONLY a resume builder and career coach. It does NOT create cover letters, build websites, create portfolios, or offer any features beyond what's listed above. If asked about these, say they're not currently available.

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

TEMPLATE MATCH QUIZ: 3 questions (industry, experience level, style preference) → AI recommends best template from all 13. Find it on the dashboard.

RESUME BUILDER (3 steps):
- Step 1: Full Name*, Job Title*, Email, Phone, Location, Profile Photo (optional, JPG/PNG max 3MB), Professional Summary (AI suggests templates once job title is filled)
- Step 2: Work Experience (Position, Company, Dates, Description — AI suggests bullet points) + Education (School, Degree, Field, Graduation Year)
- Step 3: Skills tags + AI skill suggestions + Resume Name + Save
- Auto-saves as local draft; "Save Resume" commits to cloud

KIE AI: 5 modes — Default, Deep Think, Web Search, Quick Answer, Creative. Access via "Ask KIE AI" button. Also supports resume upload for personalized coaching.

ATS SCORE: Badge on every saved resume card. Tap it for a detailed checklist of what's missing.

RESUME ANALYZER: Deep AI analysis — score, grade (A+ to D), strengths, weaknesses, suggestions.

PDF DOWNLOAD: Saved resumes only (not drafts). Allow pop-ups. Try Chrome if download fails.

TROUBLESHOOTING:
- PDF won't download: save first, allow pop-ups, try Chrome
- Photo not on resume: switch to a photo-supported template (Classic, Modern, Elegant, Slate, Split, Executive, Nova, Tribune)
- Resume not saving: check internet, confirm logged in
- App not loading: refresh, clear cache, try different browser

Concise, friendly, conversational. Max 3-4 sentences unless a step-by-step is genuinely needed.`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  600,
        temperature: 0.6,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('Groq kie-support error:', groqRes.status, errBody);
      return res.status(502).json({ error: 'KIE is unavailable right now. Please try again.' });
    }

    const data  = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response right now. Try emailing support@kievora.com";
    res.json({ reply });
  } catch (err) {
    console.error('POST /api/kie-support error:', err.message);
    res.status(500).json({ error: 'Failed to reach KIE. Please try again.' });
  }
});

// ─── POST /api/analyze-resume ──────────────────────────────────────────────────
app.post('/api/analyze-resume', authenticate, async (req, res) => {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(503).json({ error: 'AI analysis not configured.' });

  const { resumeText } = req.body;
  if (!resumeText || resumeText.trim().length < 30) {
    return res.status(400).json({ error: 'Resume content is too short to analyze.' });
  }

  const prompt = `You are an expert ATS resume analyst and career coach. Analyze the resume text below and return ONLY a valid JSON object — no markdown, no code fences, no explanation before or after.

Return this exact JSON structure (fill every field, never leave arrays empty if data exists):
{
  "fullName": "",
  "jobTitle": "",
  "email": "",
  "phone": "",
  "location": "",
  "summary": "",
  "workExperience": [{"position":"","company":"","startDate":"","endDate":"","description":""}],
  "education": [{"degree":"","field":"","school":"","graduationDate":""}],
  "skills": [],
  "atsScore": 0,
  "grade": "",
  "strengths": [],
  "weaknesses": [],
  "suggestions": [],
  "missingItems": []
}

Scoring rules — atsScore must be an integer 0–100:
- Contact info (15 pts): name(5) + email(5) + phone(3) + location(2)
- Professional summary (15 pts): present(8) + 40+ words(4) + role-specific(3)
- Work experience (30 pts): has entries(10) + descriptions present(8) + quantified result/metric(8) + action verbs(4)
- Education (15 pts): has entries(10) + degree and field present(5)
- Skills (15 pts): has skills(5) + 5 or more skills(5) + mix technical and soft(5)
- Formatting signals (10 pts): LinkedIn/website present(3) + consistent dates(3) + no obvious errors(4)
- Grade: "A+" ≥90, "A" 80–89, "B+" 75–79, "B" 65–74, "C+" 55–64, "C" 45–54, "D" <45
- strengths: 2–4 SPECIFIC things done well — reference actual content, not generic praise
- weaknesses: 2–3 SPECIFIC problems (e.g. "No summary", "Bullets lack metrics", "Only 2 skills listed")
- suggestions: 3–5 CONCRETE fixes with exact guidance (e.g. "Turn 'managed team' into 'Managed a team of [X], delivering [result]'")
- missingItems: only genuinely absent sections that would strengthen the resume

RESUME TEXT:
${resumeText.slice(0, 7000)}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + groqKey,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2500,
        temperature: 0.15,
        messages: [
          { role: 'system', content: 'You are an expert resume analyst. Always respond with valid JSON only — no extra text, no markdown.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error('Groq analyze-resume error:', groqRes.status, errBody);
      return res.status(502).json({ error: 'AI analysis unavailable. Please try again.' });
    }

    const data    = await groqRes.json();
    const rawText = data.choices?.[0]?.message?.content || '';

    let analysis;
    try {
      // Strip any accidental markdown fences, then find the JSON object
      const clean = rawText.replace(/```json\n?|```\n?/g, '').trim();
      const start = clean.indexOf('{');
      const end   = clean.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('no JSON object found');
      analysis = JSON.parse(clean.slice(start, end + 1));
    } catch (parseErr) {
      console.error('JSON parse error in analyze-resume:', parseErr.message, rawText.slice(0, 300));
      return res.status(500).json({ error: 'Could not parse resume analysis — please try again.' });
    }

    console.log(`POST /api/analyze-resume — score:${analysis.atsScore} grade:${analysis.grade} uid:${req.user.uid}`);
    res.json(analysis);
  } catch (err) {
    console.error('POST /api/analyze-resume ERROR:', err.message);
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

// ─── POST /api/find-jobs — Merges JSearch + Adzuna + Remotive ─────────────────
// Env vars: JSEARCH_API_KEY (rapidapi.com), ADZUNA_APP_ID, ADZUNA_APP_KEY (adzuna.com/developers)
// Remotive is always on (free, no key needed)

async function _fetchJSearch(query, limit) {
  const KEY = process.env.JSEARCH_API_KEY;
  if (!KEY) return [];
  try {
    const res = await fetch(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=1&num_pages=1&date_posted=month`,
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
      remote:   !!j.job_is_remote,
      salary:   j.job_min_salary && j.job_max_salary ? `$${Math.round(j.job_min_salary/1000)}k–$${Math.round(j.job_max_salary/1000)}k` : '',
      type:     j.job_employment_type || '',
      url:      j.job_apply_link,
      source:   'JSearch',
      posted:   j.job_posted_at_datetime_utc || '',
      snippet:  (j.job_description || '').replace(/\n/g, ' ').replace(/<[^>]+>/g,'').slice(0,200) + '…'
    }));
  } catch { return []; }
}

async function _fetchAdzuna(query, limit) {
  const APP_ID  = process.env.ADZUNA_APP_ID;
  const APP_KEY = process.env.ADZUNA_APP_KEY;
  if (!APP_ID || !APP_KEY) return [];
  const perCountry = Math.ceil(limit / 3);
  const countries  = ['us', 'gb', 'za']; // US, UK, South Africa (closest for NG)
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
        remote:   /remote/i.test(j.title + ' ' + (j.description||'')),
        salary:   j.salary_min && j.salary_max ? `$${Math.round(j.salary_min/1000)}k–$${Math.round(j.salary_max/1000)}k` : '',
        type:     j.contract_time || '',
        url:      j.redirect_url,
        source:   'Adzuna',
        posted:   j.created || '',
        snippet:  (j.description || '').replace(/<[^>]+>/g,'').slice(0,200) + '…'
      }));
    } catch { /* skip this country */ }
  }));
  return results;
}

async function _fetchRemotive(query, limit) {
  try {
    const res = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).slice(0, limit).map(j => ({
      id:       String(j.id),
      title:    j.title,
      company:  j.company_name,
      logo:     j.company_logo_url || j.company_logo || '',
      location: j.candidate_required_location || 'Remote',
      remote:   true,
      salary:   j.salary || '',
      type:     j.job_type || '',
      url:      j.url,
      source:   'Remotive',
      posted:   j.publication_date || '',
      snippet:  (j.description || '').replace(/<[^>]+>/g,'').slice(0,200) + '…'
    }));
  } catch { return []; }
}

app.post('/api/find-jobs', authenticate, async (req, res) => {
  const { query, limit = 20 } = req.body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const [r1, r2, r3] = await Promise.allSettled([
    _fetchJSearch(query, limit),
    _fetchAdzuna(query, limit),
    _fetchRemotive(query, 10),
  ]);

  let jobs = [
    ...(r1.status === 'fulfilled' ? r1.value : []),
    ...(r2.status === 'fulfilled' ? r2.value : []),
    ...(r3.status === 'fulfilled' ? r3.value : []),
  ];

  // Deduplicate by normalized title + company
  const seen = new Set();
  jobs = jobs.filter(j => {
    const key = (j.title + (j.company||'')).toLowerCase().replace(/[^a-z0-9]/g,'');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  jobs = jobs.slice(0, limit);

  console.log(`POST /api/find-jobs — "${query}" → ${jobs.length} jobs (jsearch:${r1.status==='fulfilled'?r1.value.length:'err'}, adzuna:${r2.status==='fulfilled'?r2.value.length:'err'}, remotive:${r3.status==='fulfilled'?r3.value.length:'err'})`);
  res.json({ jobs, source: 'merged' });
});

// ─── JSON parser helper for AI structured outputs ────────────────────────────
function parseAIJson(raw) {
  const clean = raw.replace(/```json\n?|```\n?/g, '').trim();
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in AI response');
  return JSON.parse(clean.slice(start, end + 1));
}

// ─── POST /api/prompt-resume ──────────────────────────────────────────────────
app.post('/api/prompt-resume', authenticate, async (req, res) => {
  const { prompt, model = 'pro' } = req.body;
  if (!prompt || prompt.trim().length < 8)
    return res.status(400).json({ error: 'Please describe the resume you want to create.' });

  const system = `You are a world-class resume writer. Given a description, create a complete professional resume as pure JSON. No markdown, no explanation, only the JSON object.

Return this exact structure:
{"fullName":"","jobTitle":"","email":"","phone":"","location":"","summary":"","workExperience":[{"position":"","company":"","startDate":"","endDate":"","description":""}],"education":[{"degree":"","field":"","school":"","graduationDate":""}],"skills":[],"templateSuggestion":""}

Rules:
- fullName: a realistic name (e.g. "Alex Johnson")
- email/phone/location: realistic examples (e.g. "alex@gmail.com", "+1 (555) 234-5678", "San Francisco, CA")
- summary: compelling 2-3 sentences, achievement-focused, tailored to the role
- workExperience: 2-3 entries with realistic companies, strong bullet points with action verbs and real metrics, separated by newlines. Most recent first.
- education: 1-2 entries appropriate to the seniority level requested
- skills: 10-14 relevant skills mixing technical and soft skills
- templateSuggestion: one of [classic,modern,bold,minimal,vivid,elegant,slate,coral,split,ink,executive,nova,tribune]. Match: executive/senior → executive or nova; creative → vivid or coral; tech → modern or slate; default → classic or split`;

  const cfg = { max_tokens: 2000, temperature: 0.78 };
  const m   = KIE_MODELS[model] ? model : 'pro';

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Create a complete professional resume for: ${prompt}` }], cfg);
    const resumeData = parseAIJson(raw);
    console.log(`POST /api/prompt-resume — model:${m} job:"${resumeData.jobTitle}"`);
    res.json({ resumeData, model: m });
  } catch (err) {
    console.error('POST /api/prompt-resume:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Create a resume for: ${prompt}` }], cfg);
        return res.json({ resumeData: parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) { console.error('prompt-resume fallback:', fe.message); }
    }
    res.status(500).json({ error: 'Resume generation failed. Try a more specific description.' });
  }
});

// ─── POST /api/career-roadmap ─────────────────────────────────────────────────
app.post('/api/career-roadmap', authenticate, async (req, res) => {
  const { currentRole, targetRole, timeframe = '90days', skills = [], model = 'pro' } = req.body;
  if (!currentRole || !targetRole)
    return res.status(400).json({ error: 'currentRole and targetRole are required.' });

  const tfMap = { '30days':'30 days','60days':'60 days','90days':'90 days','6months':'6 months','1year':'1 year','5years':'5 years' };
  const tf = tfMap[timeframe] || timeframe;

  const system = `You are an expert career strategist. Create detailed, actionable career roadmaps as pure JSON only.

Return exactly:
{"title":"","summary":"","timeframe":"","totalPhases":0,"phases":[{"id":1,"label":"","duration":"","focus":"","goals":[],"actions":[],"milestones":[],"resources":[]}]}

Rules:
- 3-5 phases covering the full timeframe proportionally
- goals: 2-3 specific measurable goals per phase
- actions: 4-5 concrete daily/weekly tasks per phase
- milestones: 1-2 checkpoints with clear completion criteria per phase
- resources: 1-2 specific courses, books, or certifications (with real names)
- focus: 1 phrase summarizing each phase's theme
- Everything must be specific to the actual roles — no generic advice`;

  const cfg = { max_tokens: 2000, temperature: 0.65 };
  const m   = KIE_MODELS[model] ? model : 'pro';
  const skillStr = skills.length ? `\nCurrent skills: ${skills.join(', ')}` : '';

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Create a ${tf} career roadmap.\nFrom: ${currentRole}\nTo: ${targetRole}${skillStr}` }], cfg);
    const roadmap = parseAIJson(raw);
    console.log(`POST /api/career-roadmap — ${currentRole}→${targetRole} model:${m}`);
    res.json({ roadmap, model: m });
  } catch (err) {
    console.error('POST /api/career-roadmap:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `${tf} career roadmap from ${currentRole} to ${targetRole}.` }], cfg);
        return res.json({ roadmap: parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Roadmap generation failed. Please try again.' });
  }
});

// ─── POST /api/salary-intel ───────────────────────────────────────────────────
app.post('/api/salary-intel', authenticate, async (req, res) => {
  const { jobTitle, location = 'United States', yearsExp = '1-3', education = "Bachelor's", skills = [], industry = '', model = 'pro' } = req.body;
  if (!jobTitle) return res.status(400).json({ error: 'jobTitle is required.' });

  const system = `You are a senior compensation analyst. Return only pure JSON, no markdown.

Return exactly:
{"jobTitle":"","location":"","currency":"USD","salaryRange":{"min":0,"mid":0,"max":0},"percentile":{"p25":0,"p50":0,"p75":0,"p90":0},"demandLevel":"High","demandTrend":"Growing","yearsToSenior":"","forecast":{"oneYear":0,"threeYear":0},"topPayingIndustries":[],"topPayingLocations":[],"negotiationScript":"","keyFactors":[],"insights":"","remoteImpact":""}

Rules:
- All salary values: annual USD integers
- demandLevel: "High", "Medium", or "Low"
- demandTrend: "Growing", "Stable", or "Declining"
- negotiationScript: 3-4 natural sentences the user can say in a negotiation conversation
- keyFactors: 4-5 specific factors affecting this exact role's salary
- insights: 2-3 sentence sharp market analysis
- remoteImpact: 1 sentence on how remote work affects this role's salary
- topPayingIndustries: 4-5 industries that pay most for this role
- topPayingLocations: 4-5 cities/regions with highest pay`;

  const cfg = { max_tokens: 1200, temperature: 0.45 };
  const m   = KIE_MODELS[model] ? model : 'pro';
  const skillStr = skills.length ? `, skills: ${skills.slice(0, 6).join(', ')}` : '';

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Salary analysis for: ${jobTitle}\nLocation: ${location}\nExperience: ${yearsExp} years\nEducation: ${education}${skillStr}${industry ? '\nIndustry: ' + industry : ''}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/salary-intel — "${jobTitle}" ${location} model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/salary-intel:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Salary data for ${jobTitle} in ${location} with ${yearsExp} years experience.` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Salary analysis failed. Please try again.' });
  }
});

// ─── POST /api/industry-intel ─────────────────────────────────────────────────
app.post('/api/industry-intel', authenticate, async (req, res) => {
  const { industry, role = '', model = 'pro' } = req.body;
  if (!industry) return res.status(400).json({ error: 'industry is required.' });

  const system = `You are a top industry research analyst. Return only pure JSON, no markdown.

Return exactly:
{"industry":"","outlook":"Excellent","growthRate":"","marketSize":"","topTrends":[],"growingRoles":[],"decliningRoles":[],"hotSkills":[],"emergingTechnologies":[],"topCompanies":[],"predictions":[],"opportunities":[],"threats":[],"summary":""}

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
- summary: 3-4 sharp sentences on the state of this industry`;

  const cfg = { max_tokens: 1800, temperature: 0.6 };
  const m   = KIE_MODELS[model] ? model : 'pro';

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Comprehensive industry intelligence for: ${industry}${role ? '\nProfessional role focus: ' + role : ''}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/industry-intel — "${industry}" model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/industry-intel:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Industry intelligence for: ${industry}` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Industry analysis failed. Please try again.' });
  }
});

// ─── POST /api/linkedin-optimize ──────────────────────────────────────────────
app.post('/api/linkedin-optimize', authenticate, async (req, res) => {
  const { headline, about = '', currentRole = '', targetRole = '', skills = [], model = 'core' } = req.body;
  if (!headline) return res.status(400).json({ error: 'headline is required.' });

  const system = `You are a LinkedIn optimization expert and professional branding specialist. Return only pure JSON, no markdown.

Return exactly:
{"optimizedHeadline":"","optimizedAbout":"","headlineScore":0,"aboutScore":0,"visibilityScore":0,"recruiterScore":0,"skillsToAdd":[],"keywordGaps":[],"profileTips":[],"headlineFeedback":"","aboutFeedback":"","summary":""}

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
- summary: 2-sentence overall LinkedIn profile assessment`;

  const cfg = { max_tokens: 1800, temperature: 0.72 };
  const m   = KIE_MODELS[model] ? model : 'core';
  const skillStr = skills.length ? `\nCurrent skills: ${skills.join(', ')}` : '';

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Optimize my LinkedIn profile.\nCurrent headline: "${headline}"\nAbout section: "${about || 'Not provided'}"\nCurrent role: ${currentRole || 'Not specified'}\nTarget role: ${targetRole || 'Same field'}${skillStr}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/linkedin-optimize — model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/linkedin-optimize:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Optimize LinkedIn profile. Headline: "${headline}". Current role: ${currentRole}. Target: ${targetRole}.` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'LinkedIn optimization failed. Please try again.' });
  }
});

// ─── POST /api/mock-interview-q ───────────────────────────────────────────────
app.post('/api/mock-interview-q', authenticate, async (req, res) => {
  const { type = 'behavioral', jobTitle, level = 'mid', previousQuestions = [], model = 'pro' } = req.body;
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
- framework: recommended answer framework (e.g. "STAR Method", "Past-Present-Future", "Problem-Action-Result")`;

  const prev = previousQuestions.length ? `\nDo NOT repeat or closely paraphrase these: ${previousQuestions.slice(-5).join(' | ')}` : '';
  const cfg = { max_tokens: 800, temperature: 0.85 };
  const m   = KIE_MODELS[model] ? model : 'pro';

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Generate a ${type} interview question for: ${jobTitle} (${level} level)${prev}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/mock-interview-q — ${type} for "${jobTitle}" model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/mock-interview-q:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `${type} interview question for ${jobTitle} (${level} level)` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Failed to generate question. Please try again.' });
  }
});

// ─── POST /api/mock-interview-fb ──────────────────────────────────────────────
app.post('/api/mock-interview-fb', authenticate, async (req, res) => {
  const { question, answer, jobTitle, type = 'behavioral', model = 'pro' } = req.body;
  if (!question || !answer || !jobTitle)
    return res.status(400).json({ error: 'question, answer, and jobTitle are required.' });
  if (answer.trim().length < 20)
    return res.status(400).json({ error: 'Answer is too short for meaningful feedback.' });

  const system = `You are a senior hiring manager giving real, honest interview feedback. Return only pure JSON, no markdown.

Return exactly:
{"score":0,"grade":"","verdict":"","strengths":[],"improvements":[],"sampleAnswer":"","structureFeedback":"","confidenceTips":[],"wouldAdvance":false}

Rules:
- score: integer 0-100 (realistic — most candidates score 55-75)
- grade: "A+" (90+), "A" (80-89), "B" (70-79), "C" (60-69), "D" (<60)
- verdict: 1 honest sentence (would they advance to next round?)
- wouldAdvance: true if score >= 72
- strengths: 2-3 specific things they did well in their actual answer
- improvements: 3 specific things to fix, with how to fix each
- sampleAnswer: a strong model answer in the recommended framework (150-200 words)
- structureFeedback: 2 sentences on the answer's logical structure
- confidenceTips: 2-3 delivery tips for this specific answer`;

  const cfg = { max_tokens: 1400, temperature: 0.55 };
  const m   = KIE_MODELS[model] ? model : 'pro';

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Evaluate this ${type} interview answer for ${jobTitle}.\n\nQuestion: ${question}\n\nCandidate's Answer: ${answer}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/mock-interview-fb — score:${data.score} model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/mock-interview-fb:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Rate this answer for ${jobTitle}. Q: ${question}. A: ${answer}` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Feedback generation failed. Please try again.' });
  }
});

// ─── POST /api/personal-brand ─────────────────────────────────────────────────
app.post('/api/personal-brand', authenticate, async (req, res) => {
  const { resumeData, bioType = 'professional', targetAudience = 'recruiters and hiring managers', model = 'pro' } = req.body;

  const system = `You are a world-class personal branding expert and professional writer. Return only pure JSON, no markdown.

Return exactly:
{"bio":"","tagline":"","linkedinSummary":"","twitterBio":"","elevatorPitch":"","brandKeywords":[],"brandVoice":"","tips":[]}

Rules:
- bio: 190-220 word compelling professional bio in third person, story-driven, achievement-focused
- tagline: powerful 8-12 word personal tagline that captures their unique value
- linkedinSummary: 130-160 word first-person About section, story arc, ends with CTA
- twitterBio: under 160 chars, punchy, personality-forward
- elevatorPitch: 80-100 word 45-second spoken pitch, first-person, natural, confident
- brandKeywords: 7-9 keywords that define their professional brand
- brandVoice: 1 sentence describing their brand voice/personality
- tips: 5 specific, actionable personal branding tips for their situation`;

  const cfg = { max_tokens: 1800, temperature: 0.82 };
  const m   = KIE_MODELS[model] ? model : 'pro';
  let context = resumeData
    ? `Name: ${resumeData.fullName || ''}\nRole: ${resumeData.jobTitle || ''}\nSummary: ${(resumeData.summary || '').slice(0, 250)}\nTop skills: ${(resumeData.skills || []).slice(0, 8).join(', ')}\nExperience: ${(resumeData.workExperience || []).slice(0, 2).map(e => `${e.position} at ${e.company}`).join(', ')}`
    : 'No resume provided — create a generic but compelling template.';

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Create a ${bioType} personal brand package targeted at ${targetAudience}.\n${context}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/personal-brand — type:${bioType} model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/personal-brand:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Create ${bioType} personal brand. ${context}` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Brand generation failed. Please try again.' });
  }
});

// ─── POST /api/career-health ──────────────────────────────────────────────────
app.post('/api/career-health', authenticate, async (req, res) => {
  const { resumeData, jobTitle = '', yearsExp = '', model = 'pro' } = req.body;
  if (!resumeData) return res.status(400).json({ error: 'resumeData is required.' });

  const system = `You are a career health analyst. Assess someone's overall career health from their resume. Return only pure JSON, no markdown.

Return exactly:
{"overallScore":0,"grade":"","headline":"","breakdown":{"resumeQuality":{"score":0,"label":"","feedback":""},"skillRelevance":{"score":0,"label":"","feedback":""},"marketDemand":{"score":0,"label":"","feedback":""},"interviewReadiness":{"score":0,"label":"","feedback":""},"brandStrength":{"score":0,"label":"","feedback":""},"salaryPositioning":{"score":0,"label":"","feedback":""}},"topStrengths":[],"criticalGaps":[],"quickWins":[],"strategicActions":[],"verdict":""}

Rules:
- All scores: integer 0-100. Be honest — most people score 45-75, not 90+
- labels: "Excellent" (85+), "Good" (70-84), "Fair" (50-69), "Needs Work" (<50)
- overallScore: weighted average (resumeQuality 25%, skillRelevance 20%, marketDemand 20%, interviewReadiness 15%, brandStrength 10%, salaryPositioning 10%)
- grade: "A" (85+), "B" (70-84), "C" (55-69), "D" (<55)
- headline: 5-7 word summary (e.g. "Strong foundation, gaps in visibility")
- topStrengths: 3 specific career strengths from their actual resume data
- criticalGaps: 3 most important issues to fix, with specific reason
- quickWins: 3 things they can do THIS WEEK for immediate impact
- strategicActions: 3 longer-term moves (1-3 months)
- verdict: 2-3 sentence honest career health verdict`;

  const cfg = { max_tokens: 1800, temperature: 0.45 };
  const m   = KIE_MODELS[model] ? model : 'pro';
  const d   = resumeData;
  const ctx = `Name: ${d.fullName || 'N/A'}\nRole: ${d.jobTitle || jobTitle || 'N/A'}\nYears exp: ${yearsExp || 'unknown'}\nSummary length: ${(d.summary || '').length} chars\nSummary: ${(d.summary || '').slice(0, 200)}\nSkills: ${(d.skills || []).join(', ')}\nWork experience entries: ${(d.workExperience || []).length}\nExperience: ${(d.workExperience || []).slice(0, 3).map(e => `${e.position} at ${e.company}`).join(', ')}\nEducation: ${(d.education || []).map(e => `${e.degree} in ${e.field}`).join(', ') || 'N/A'}`;

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Comprehensive career health analysis:\n${ctx}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/career-health — score:${data.overallScore} model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/career-health:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Career health analysis: ${ctx}` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Career health analysis failed. Please try again.' });
  }
});

// ─── POST /api/promotion-readiness ────────────────────────────────────────────
app.post('/api/promotion-readiness', authenticate, async (req, res) => {
  const { resumeData, currentRole, targetRole, timeline = '6 months', model = 'pro' } = req.body;
  if (!currentRole || !targetRole)
    return res.status(400).json({ error: 'currentRole and targetRole are required.' });

  const system = `You are a senior leadership development coach. Assess promotion readiness honestly. Return only pure JSON, no markdown.

Return exactly:
{"readinessScore":0,"readinessLevel":"","verdict":"","strengths":[],"gapsToClose":[],"skillsNeeded":[],"visibilityActions":[],"roadmap":[{"month":"","theme":"","milestones":[],"actions":[]}],"timelineAssessment":"","leadershipTips":[]}

Rules:
- readinessScore: integer 0-100 (be honest — not inflated)
- readinessLevel: "Ready Now" (80+), "Nearly Ready" (65-79), "6-12 Months Away" (45-64), "1-2 Years Away" (<45)
- verdict: 2-sentence honest assessment of their promotion prospects
- strengths: 3-4 specific strengths that support the promotion case
- gapsToClose: 4-5 specific gaps between current and target role
- skillsNeeded: 4-5 specific skills/competencies to develop
- visibilityActions: 4 things to become more visible to decision-makers
- roadmap: 3-4 monthly phases with specific milestones and actions (realistic, role-specific)
- timelineAssessment: 2 sentences on whether their timeline is realistic
- leadershipTips: 4 leadership-specific tips for this exact transition`;

  const cfg = { max_tokens: 1800, temperature: 0.6 };
  const m   = KIE_MODELS[model] ? model : 'pro';
  let ctx = `From: ${currentRole}\nTo: ${targetRole}\nTimeline: ${timeline}`;
  if (resumeData) {
    ctx += `\nSkills: ${(resumeData.skills || []).slice(0, 10).join(', ')}\nExperience: ${(resumeData.workExperience || []).map(e => `${e.position} at ${e.company}`).join(', ')}\nSummary: ${(resumeData.summary || '').slice(0, 200)}`;
  }

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Assess promotion readiness:\n${ctx}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/promotion-readiness — ${currentRole}→${targetRole} score:${data.readinessScore} model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/promotion-readiness:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Promotion readiness from ${currentRole} to ${targetRole}. ${ctx}` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Promotion analysis failed. Please try again.' });
  }
});

// ─── POST /api/professional-msg ───────────────────────────────────────────────
app.post('/api/professional-msg', authenticate, async (req, res) => {
  const { msgType = 'application', resumeData, targetJob, targetCompany, recruiterName = '', tone = 'professional', model = 'core' } = req.body;
  if (!targetJob || !targetCompany)
    return res.status(400).json({ error: 'targetJob and targetCompany are required.' });

  const system = `You are an expert in professional communication and job application messaging. Return only pure JSON, no markdown.

Return exactly:
{"subject":"","message":"","subject2":"","message2":"","tips":[],"doList":[],"dontList":[]}

Rules:
- Provide 2 ready-to-send message variants: message is polished standard, message2 is bolder/more direct
- No placeholder brackets except [Your Name] at the end
- subject/subject2: compelling, specific, non-generic email subject lines
- message/message2: complete messages, properly formatted, tone-matched
- tips: 4 specific sending and follow-up tips
- doList: 3 things to do when sending
- dontList: 3 common mistakes to avoid`;

  const cfg = { max_tokens: 1400, temperature: 0.78 };
  const m   = KIE_MODELS[model] ? model : 'core';
  let ctx = `Message type: ${msgType}\nTarget job: ${targetJob}\nCompany: ${targetCompany}\nTone: ${tone}${recruiterName ? '\nRecruiter name: ' + recruiterName : ''}`;
  if (resumeData) {
    ctx += `\nApplicant: ${resumeData.fullName || ''}, ${resumeData.jobTitle || ''}\nTop skills: ${(resumeData.skills || []).slice(0, 6).join(', ')}`;
  }

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Generate a ${msgType} message:\n${ctx}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/professional-msg — type:${msgType} company:"${targetCompany}" model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/professional-msg:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `${msgType} message for ${targetJob} at ${targetCompany}.` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Message generation failed. Please try again.' });
  }
});

// ─── POST /api/recruiter-intel ────────────────────────────────────────────────
app.post('/api/recruiter-intel', authenticate, async (req, res) => {
  const { resumeData, targetRole = '', model = 'pro' } = req.body;
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
- verdict: 2-3 sentence recruiter's blunt assessment`;

  const cfg = { max_tokens: 1500, temperature: 0.5 };
  const m   = KIE_MODELS[model] ? model : 'pro';
  const d   = resumeData;
  const ctx = `Target role: ${targetRole || d.jobTitle || 'N/A'}\nName: ${d.fullName || 'N/A'}\nSummary: ${(d.summary || '').slice(0, 200)}\nWork: ${(d.workExperience || []).map(e => `${e.position} at ${e.company}`).join(', ')}\nSkills: ${(d.skills || []).join(', ')}\nEducation: ${(d.education || []).map(e => e.degree).join(', ') || 'N/A'}`;

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: `Review this resume as a recruiter:\n${ctx}` }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/recruiter-intel — score:${data.recruiterScore} model:${m}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/recruiter-intel:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: `Recruiter review: ${ctx}` }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) {}
    }
    res.status(500).json({ error: 'Recruiter analysis failed. Please try again.' });
  }
});

// ─── POST /api/job-match ──────────────────────────────────────────────────────
app.post('/api/job-match', authenticate, async (req, res) => {
  const { jobDescription, resumeData, model = 'pro' } = req.body;
  if (!jobDescription || jobDescription.trim().length < 50)
    return res.status(400).json({ error: 'jobDescription is required (min 50 chars).' });

  const system = `You are an expert ATS specialist and job matching consultant. Analyze how well a candidate matches a job description. Return only pure JSON, no markdown.

Return exactly:
{"matchScore":0,"matchLevel":"","summary":"","matchingSkills":[],"missingSkills":[],"keywordsToAdd":[],"experienceMatch":"","educationMatch":"","tips":[]}

Rules:
- matchScore: 0-100 integer (90+ = excellent, 70-89 = strong, 50-69 = moderate, <50 = weak)
- matchLevel: "Excellent Match" | "Strong Match" | "Moderate Match" | "Weak Match"
- summary: 2 sentences — honest assessment of fit
- matchingSkills: 4-6 specific skills/experiences the candidate has that the JD needs
- missingSkills: 3-5 specific skills or requirements the candidate lacks
- keywordsToAdd: 6-8 exact keywords from the JD to weave into the resume
- experienceMatch: 1 sentence on how their experience level matches
- educationMatch: 1 sentence on education/qualification fit
- tips: 4 specific actions to improve this application (tailor resume, cover letter angle, etc.)`;

  const cfg = { max_tokens: 1200, temperature: 0.4 };
  const m   = KIE_MODELS[model] ? model : 'pro';

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
    const raw = await callKieAI(m, system, [{
      role: 'user',
      content: `Job Description:\n${jdSlice}\n\n---\n${candidateCtx}`,
    }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/job-match — score:${data.matchScore} model:${m} uid:${req.user.uid}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/job-match:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{
          role: 'user',
          content: `Job Description:\n${jdSlice}\n\n---\n${candidateCtx}`,
        }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) { console.error('job-match fallback:', fe.message); }
    }
    res.status(500).json({ error: 'Job match analysis failed. Please try again.' });
  }
});

// ─── POST /api/resignation-letter ────────────────────────────────────────────
app.post('/api/resignation-letter', authenticate, async (req, res) => {
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
{"letter":"","tips":[]}

Rules:
- letter: the full resignation letter as a single string with \\n for line breaks. Include: today's date (use "June 2026"), manager salutation, opening paragraph confirming resignation + notice period, brief appreciation paragraph (genuine, not sycophantic), offer to assist with transition, professional closing + candidate's name placeholder [Your Name]
- Keep it under 220 words — tight and professional
- tone: ${selectedTone}
- NEVER mention the specific reason for leaving unless it is something positive like "an exciting new opportunity"
- tips: 4 practical tips for a smooth exit (what to do in the notice period, how to handle handover, etc.)`;

  const cfg = { max_tokens: 800, temperature: 0.65 };
  const m   = KIE_MODELS[model] ? model : 'spark';

  // Build context — only pass reason if it's positive/neutral so the AI can reference it
  const positiveReasons = ['new opportunity', 'new role', 'promotion', 'career growth', 'relocation', 'further study', 'education'];
  const reasonIsPositive = reason && positiveReasons.some(r => reason.toLowerCase().includes(r));
  const reasonCtx = reasonIsPositive ? `\nReason (can mention positively): ${reason}` : '';

  const userPrompt = `Write a resignation letter.\nRole: ${currentRole}\nCompany: ${company}\nNotice period: ${noticePeriod}${reasonCtx}`;

  try {
    const raw = await callKieAI(m, system, [{ role: 'user', content: userPrompt }], cfg);
    const data = parseAIJson(raw);
    console.log(`POST /api/resignation-letter — role:"${currentRole}" company:"${company}" model:${m} uid:${req.user.uid}`);
    res.json({ ...data, model: m });
  } catch (err) {
    console.error('POST /api/resignation-letter:', err.message);
    if (m !== 'spark') {
      try {
        const raw = await callKieAI('spark', system, [{ role: 'user', content: userPrompt }], cfg);
        return res.json({ ...parseAIJson(raw), model: 'spark', fallback: true });
      } catch (fe) { console.error('resignation fallback:', fe.message); }
    }
    res.status(500).json({ error: 'Letter generation failed. Please try again.' });
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

// ─── Page Routes ───────────────────────────────────────────────────────────────
app.get('/',          (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/index',     (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// ─── POST /api/cover-letter — Full AI generation ──────────────────────────────
app.post('/api/cover-letter', authenticate, async (req, res) => {
  const uid = req.user.uid;
  const { resumeSource, resumeId, resumeData, resumeText, template, jobTitle, companyName, model = 'spark' } = req.body;

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

app.get('/reset-password', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));
app.get('/login',     (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup',    (_req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/terms',     (_req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/privacy',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/articles',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'articles.html')));
app.get('/article-read', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'article-read.html')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/onboarding', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'onboarding.html')));
app.get('/find-jobs', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'find-jobs.html')));
app.get('/support',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'support.html')));
app.get('/account',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'account.html')));
app.get('/write',     (_req, res) => res.sendFile(path.join(__dirname, 'public', 'write.html')));
app.get('/settings',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('/insights',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'insights.html')));
app.get('/kievora-profile', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'kievora-profile.html')));

// ─── Clean profile URLs: /profile  or  /profile/@username ─────────────────────
app.get('/profile',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/profile/@:username', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));

app.get('*',          (_req, res) => res.redirect('/'));

// ─── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Resumaker running on port ${PORT}`);
  console.log(`📧 Brevo API Key configured: ${!!process.env.BREVO_API_KEY}`);
  console.log(`⚡ Groq API Key configured: ${!!process.env.GROQ_API_KEY}`);
  console.log(`🤖 Anthropic API Key configured: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`🔥 Firebase project: ${serviceAccount.project_id}`);
});
