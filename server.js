require('dotenv').config();
const express    = require('express');
const admin      = require('firebase-admin');
const cors       = require('cors');
const path       = require('path');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const crypto     = require('crypto'); // Paystack webhook signature verification
const { google } = require('googleapis'); // Gmail OAuth + Gmail API client

// ─── Cloudinary Config ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Gmail OAuth Config ────────────────────────────────────────────────────────
// Set these three in Render's env vars. GMAIL_REDIRECT_URI must be an EXACT
// match (scheme + host + path) of an "Authorized redirect URI" registered on
// the OAuth Client ID in Google Cloud Console — Google rejects anything else.
const GMAIL_CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REDIRECT_URI  = process.env.GMAIL_REDIRECT_URI; // e.g. https://kievora.com/api/gmail/callback

function getOAuthClient() {
  return new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI);
}

// multer: memory storage so we stream directly to Cloudinary (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

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
  nova: {
    label:    'KIE Nova',
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

// ─── KIE Intelligence Tiers — reasoning depth scales with engine power ────────
// Layered on TOP of whichever KIE_MODES persona is active. Same mode (Default,
// Deep Think, etc.) behaves differently depending on which engine answers it —
// Ultra reasons like a strategist running multiple angles at once, Spark answers
// like the sharpest person in the room, instantly. Every tier is built to feel
// elite for its level — Spark should never read as "the dumb one."
const KIE_TIERS = {

  spark: {
    tokenBonus: 0,
    system: `
INTELLIGENCE TIER — KIE SPARK (Fast & Smart):
You're the fastest engine here, not the shallowest. Skip visible deliberation — go straight to the single strongest answer. Never hedge with "it depends" unless it genuinely does; pick a side and say why in one line. Speak with the confidence of someone who's seen this exact situation a hundred times. Ground answers in real hiring and career patterns, not generic platitudes — specificity is what makes you feel sharp, not extra words.`,
  },

  core: {
    tokenBonus: 0,
    system: `
INTELLIGENCE TIER — KIE CORE (Balanced Intelligence):
Be decisive and exact. When one option is clearly stronger, name it and move on — don't lay out three choices and ask the user to pick for themselves. One precise insight beats three shallow ones. Every claim should trace back to something this specific person told you; generic advice is the one failure mode to avoid at this tier.`,
  },

  nova: {
    tokenBonus: 250,
    system: `
INTELLIGENCE TIER — KIE NOVA (Deep Career Intelligence):
Before answering, weigh it from two angles — what the person is actually trying to solve (not always what they typed), and what would genuinely move the needle from a hiring manager's or the market's point of view. Surface the trade-off or angle most people in this situation miss; that's the line that makes this worth more than a quick search. Ground claims in how hiring and careers actually play out, not textbook best practice. Precision over breadth — say less, mean more.`,
  },

  ultra: {
    tokenBonus: 500,
    system: `
INTELLIGENCE TIER — KIE ULTRA (Elite Coaching Engine):
You are the most capable version of KIE that exists. Before answering, silently run three passes and fuse them into ONE response — never narrate this process, just let it sharpen the answer:
1. The user's own view — what they want, and what they're actually afraid of.
2. The employer/market's view — what genuinely gets this person hired, promoted, or paid more.
3. A neutral strategist's view — the move nobody in their position is telling them to make.
Surface at least one counter-intuitive angle they almost certainly haven't considered — true-but-unobvious beats safe-but-obvious. Where it strengthens the advice, reference a real pattern in how careers and hiring actually move (framed as pattern, never as an invented statistic). Hold hard truth and genuine belief in their potential in the same breath — never just one without the other. Before sending, silently check: could this exact reply apply to anyone, or only to this person? If it could apply to anyone, you haven't gone deep enough — sharpen it. At this tier, depth shows up as precision and weight per sentence, never as extra length.`,
  },
};

// ─── Plans, Pricing & Feature Gates — single source of truth ──────────────────
// Every paid feature across the whole app (client UI + every protected
// endpoint) reads from this object. Change a limit or tool list here and it's
// live everywhere — never hardcode these numbers anywhere else.
const PLANS = {
  free: {
    key: 'free', label: 'Free', priceUSD: 0,
    // 50 KIE chat messages per calendar month (Groq Spark). When hit → upgrade prompt only.
    kieMonthlyLimit: 50,
    kieModel: 'spark',           // model that powers KIE chat for this plan
    models: ['spark'],           // models visible in KIE selector
    tools: [],
    templates: 5,
    uploadAnalyze: false,
    recruiterView: false,
    findJobsClick: false,
    coverLetterFromResume: false,
    atsExplanation: false,
    articleDownload: false,
    verifiedBadgeEligible: false,
    prioritySupport: 'none',
    kieWebSearch: false,
    kieCreativeMode: false,
    topupPriceUSD: null,
    topupMessages: 0,
  },
  paid7: {
    key: 'paid7', label: 'Pro', priceUSD: 7,
    // 200 KIE chat messages/month (Claude Haiku / KIE Core). The 200 cap is
    // NEVER shown to the user — if they hit it they see the topup offer only.
    kieMonthlyLimit: 200,
    kieModel: 'core',
    models: ['spark', 'core'],
    tools: ['aibuild', 'careerhealth', 'roadmap', 'linkedin', 'messaging'],
    templates: 'all',
    uploadAnalyze: true,
    recruiterView: false,
    findJobsClick: true,
    coverLetterFromResume: true,
    atsExplanation: true,
    articleDownload: true,
    verifiedBadgeEligible: false,
    prioritySupport: 'good',
    kieWebSearch: true,
    kieCreativeMode: true,
    topupPriceUSD: 1.5,          // 100 extra KIE messages for $1.50
    topupMessages: 100,
  },
  paid15: {
    key: 'paid15', label: 'Premier', priceUSD: 15,
    // 200 KIE chat messages/month (Claude Sonnet / KIE Pro). Same topup mechanic.
    // Ultra is kept in KIE_MODELS/KIE_TIERS for backend/future use but is
    // intentionally excluded from models[] so it never appears in the frontend selector.
    kieMonthlyLimit: 200,
    kieModel: 'nova',
    models: ['spark', 'core', 'nova'],
    tools: ['aibuild', 'careerhealth', 'roadmap', 'linkedin', 'messaging', 'salary', 'industry', 'interview', 'branding', 'promotion'],
    templates: 'all',
    uploadAnalyze: true,
    recruiterView: true,
    findJobsClick: true,
    coverLetterFromResume: true,
    atsExplanation: true,
    articleDownload: true,
    verifiedBadgeEligible: true,
    prioritySupport: 'instant',
    kieWebSearch: true,
    kieCreativeMode: true,
    topupPriceUSD: 5,            // 100 extra KIE messages for $5 (Sonnet is pricier)
    topupMessages: 100,
  },
};
const DEFAULT_PLAN = 'free';
function getPlanConfig(planKey) { return PLANS[planKey] || PLANS[DEFAULT_PLAN]; }

// Looks up the user's current plan from Firestore. Defaults to 'free' if the
// field is missing or holds an unrecognized value — never trust an unknown
// string into a privileged plan.
async function getUserPlanKey(uid) {
  try {
    const snap = await db.collection(USERS).doc(uid).get();
    const plan = snap.exists ? snap.data().plan : null;
    return PLANS[plan] ? plan : DEFAULT_PLAN;
  } catch (e) {
    console.error('getUserPlanKey failed, defaulting to free:', e.message);
    return DEFAULT_PLAN;
  }
}

// ─── Billing-cycle anchor date ──────────────────────────────────────────────
// The KIE message cycle (and top-up expiry) resets on the day-of-month the
// user actually subscribed/upgraded — NOT the 1st of the calendar month.
// Paid users anchor to planUpdatedAt (set fresh on every subscribe/upgrade).
// Free users anchor to createdAt (their signup date), so even Free gets a
// consistent personal monthly cycle instead of everyone resetting on the 1st.
function getCycleAnchorDate(userData) {
  const ts = userData?.planUpdatedAt || userData?.createdAt;
  if (ts && typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(); // last-resort fallback — shouldn't normally hit this
}

// Given the anchor date and "now", returns the start of the CURRENT billing
// cycle. Handles short months the same way Stripe and most subscription
// billers do: clamp to the last day of a short month, then snap back to the
// original anchor day as soon as a month is long enough to support it again.
// e.g. anchor day 31: Jan 31 → Feb 28 (clamped) → Mar 31 (back to 31) → Apr 30
// (clamped again) → May 31 (back to 31). Never permanently stuck at 28.
function getCycleStart(anchorDate, now) {
  const anchorDay = anchorDate.getUTCDate();
  const anchorH = anchorDate.getUTCHours(), anchorM = anchorDate.getUTCMinutes(), anchorS = anchorDate.getUTCSeconds();
  function clampedForMonth(year, month) {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(anchorDay, daysInMonth);
    return new Date(Date.UTC(year, month, day, anchorH, anchorM, anchorS));
  }
  let candidate = clampedForMonth(now.getUTCFullYear(), now.getUTCMonth());
  if (candidate > now) {
    candidate = clampedForMonth(now.getUTCFullYear(), now.getUTCMonth() - 1); // Date() normalizes month underflow into the prior year correctly
  }
  if (candidate < anchorDate) candidate = anchorDate; // cycle can't start before the subscription itself
  return candidate;
}

// ─── KIE chat counter + topup balance — resets on the subscription anniversary,
// not the calendar month ─────────────────────────────────────────────────────
// Topup messages (purchased separately via Paystack) are stored in
// usage.kieTopupRemaining and are drawn down AFTER the cycle's allocation runs
// out. Any unused topup messages expire at the same boundary the main
// allocation resets — stated clearly to users at purchase.
async function checkAndIncrementKieUsage(uid, planKey) {
  const limit  = getPlanConfig(planKey).kieMonthlyLimit;
  const ref    = db.collection(USERS).doc(uid);
  const snap   = await ref.get();
  const data   = snap.exists ? snap.data() : {};
  const usage  = data.usage || {};
  const anchor = getCycleAnchorDate(data);
  const cycleStartKey = getCycleStart(anchor, new Date()).toISOString();

  const sameCycle    = usage.kieCycleStart === cycleStartKey;
  const currentCount = sameCycle ? (usage.kieCount || 0) : 0;
  const topupLeft    = sameCycle ? (usage.kieTopupRemaining || 0) : 0;

  // Within this cycle's allocation
  if (currentCount < limit) {
    const newCount = currentCount + 1;
    await ref.set({ usage: { kieCount: newCount, kieCycleStart: cycleStartKey, kieTopupRemaining: topupLeft } }, { merge: true });
    return { allowed: true, remaining: limit - newCount + topupLeft, limit, count: newCount, fromTopup: false };
  }

  // Allocation exhausted — draw from topup if available
  if (topupLeft > 0) {
    const newTopup = topupLeft - 1;
    await ref.set({ usage: { kieCount: currentCount, kieCycleStart: cycleStartKey, kieTopupRemaining: newTopup } }, { merge: true });
    return { allowed: true, remaining: newTopup, limit, count: currentCount, fromTopup: true, topupRemaining: newTopup };
  }

  // Hard stop — no allocation and no topup left this cycle
  return { allowed: false, remaining: 0, limit, count: currentCount, fromTopup: false };
}

// ─── Multi-currency FX rates (USD base) ───────────────────────────────────────
// Supports NGN (Nigeria), GHS (Ghana), KES (Kenya), ZAR (South Africa), USD.
// Paystack natively settles in all of these. Rates cached 6 hours — if refresh
// fails we use the last good rate (or a conservative hardcoded fallback on cold
// start) so checkout never breaks due to a rate-API hiccup.
const FX_FALLBACKS = { NGN: 1600, GHS: 15, KES: 130, ZAR: 18, USD: 1 };
// Paystack-supported currencies we expose. Everything else falls back to USD.
const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'USD'];
// Map ISO country codes → Paystack currency
const COUNTRY_CURRENCY = {
  NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR',
  // fallback everything else to USD — Paystack accepts USD globally
};
let _fxCache = { rates: { ...FX_FALLBACKS }, fetchedAt: 0 };
async function getExchangeRates() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  if (Date.now() - _fxCache.fetchedAt < SIX_HOURS) return _fxCache.rates;
  try {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    const url    = apiKey
      ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
      : 'https://open.er-api.com/v6/latest/USD';
    const res  = await fetch(url);
    const data = await res.json();
    const all  = data.conversion_rates || data.rates || {};
    const rates = {};
    for (const cur of SUPPORTED_CURRENCIES) {
      rates[cur] = all[cur] || FX_FALLBACKS[cur];
    }
    _fxCache = { rates, fetchedAt: Date.now() };
    console.log('💱 FX rates refreshed:', rates);
  } catch (e) {
    console.error('FX rate refresh failed, using cached/fallback:', e.message);
  }
  return _fxCache.rates;
}
// Backwards-compat helper used by checkout before multi-currency was added
async function getUsdToNgnRate() { return (await getExchangeRates()).NGN; }

// ─── Friendly, feature-specific upgrade / gate copy ───────────────────────────
const UPGRADE_MESSAGES = {
  // KIE chat — monthly limit hit
  kieLimit: (plan) => {
    if (plan === 'free') {
      return `You've used all your free KIE messages for this month. Upgrade to $7 or $15 to unlock more messages and smarter AI models.`;
    }
    const cfg = getPlanConfig(plan);
    return `You've used all your KIE chat messages for this month. You can top up ${cfg.topupMessages} messages for $${cfg.topupPriceUSD} — unused messages won't carry over to next month.`;
  },
  // KIE chat — model not available on plan
  kieModel: (plan, requested) => {
    const name = requested ? ('KIE ' + requested[0].toUpperCase() + requested.slice(1)) : 'this model';
    if (plan === 'free') return `${name} isn't on your plan. Upgrade to $7 for KIE Core, or $15 to unlock KIE Nova.`;
    return `${name} is a $15 feature — upgrade to unlock KIE Pro and the deepest career intelligence on the platform.`;
  },
  // Web search mode locked
  kieWebSearch: () => `Web search is available on paid plans. Upgrade to $7 or $15 to let KIE pull live data into your conversations.`,
  // Creative mode locked
  kieCreativeMode: () => `Creative mode is available on paid plans. Upgrade to $7 or $15 to unlock it.`,
  // AI Tools Hub
  tool: (plan) => plan === 'free'
    ? `AI Tools are locked on the Free plan. $7 unlocks 5 tools, $15 unlocks all 10.`
    : `This tool is part of the $15 plan — it unlocks Salary Intel, Industry Intel, Mock Interview, Personal Brand, and Promotion Ready on top of your existing 5 tools.`,
  // Upload & Analyze
  uploadAnalyze: () => `Your resume has been analyzed. Upgrade to any paid plan to see your full score, strengths, weaknesses, and specific suggestions to improve it. $7 or $15 both unlock it.`,
  // Recruiter View
  recruiterView: (plan) => plan === 'paid7'
    ? `Recruiter View is a $15 feature. You already have Upload & Analyze — this just adds the full recruiter-perspective report on top.`
    : `Recruiter View is part of the $15 plan.`,
  // Find Jobs
  findJobs: () => `Upgrade to any paid plan to open and apply to jobs. $7 or $15 both give you full access.`,
  // Cover letter from resume (end-of-builder screen or from existing resume)
  coverLetter: () => `Auto-building a cover letter from a resume needs a paid plan. You can still write one from scratch for free on the dashboard.`,
  // ATS score explanation
  atsExplanation: () => `You can see your ATS score on any plan. Upgrade to $7 or $15 to see exactly why you got it — the full breakdown of what's working and what to fix.`,
  // Article download
  articleDownload: () => `Downloading articles needs a paid plan — $7 or $15 both unlock it.`,
  // Resume templates beyond the free 5
  templates: (plan) => plan === 'free'
    ? `That template is part of a paid plan. Pro and Premier both unlock every template.`
    : `That template is already unlocked on your plan.`,
  // Free user tries to upload a resume (picker/upload screen)
  resumeUpload: () => `Your resume has been analyzed. Upgrade to any paid plan to see your full ATS score and what to improve. $7 or $15 both unlock the full report.`,
  // Free user requests resume file output (edit/regenerate as file)
  resumeFileExport: () => `Exporting your resume as a file is available on paid plans. Upgrade to $7 or $15 to download your resume and access all templates.`,
};

// Topup purchase messages (shown in the topup modal on billing.html)
const TOPUP_MESSAGES = {
  paid7:  `Top up 100 KIE chat messages for $1.50. These are added to your current month's balance — any unused messages expire when your plan renews next month.`,
  paid15: `Top up 100 KIE chat messages for $5. These are added to your current month's balance — any unused messages expire when your plan renews next month.`,
};

// ─── Universal AI caller — routes Groq vs Anthropic by model key ──────────────
// Non-streaming (used by all non-KIE-chat endpoints: coach, cover-letter, etc.)
async function callKieAI(modelKey, systemContent, messages, cfg) {
  const m = KIE_MODELS[modelKey] || KIE_MODELS.spark;

  if (m.provider === 'groq') {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('Groq API key not configured.');
    const res = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model:       m.model,
        max_tokens:  cfg.max_tokens,
        temperature: cfg.temperature,
        messages:    [{ role: 'system', content: systemContent }, ...messages],
      }),
    }, 1); // BUG FIX: one quick retry on transient 429/5xx before throwing
    if (!res.ok) { const e = await res.text(); throw new Error('Groq error: ' + e); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';

  } else {
    // Anthropic — Claude Haiku / Sonnet / Opus
    // BUG FIX: temperature was previously missing — all Claude models were using
    // the API default (~1.0) regardless of mode (Deep Think should be 0.55,
    // Creative should be 0.93, etc.)
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Anthropic API key not configured. Add ANTHROPIC_API_KEY to your env.');
    const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       m.model,
        max_tokens:  cfg.max_tokens,
        temperature: cfg.temperature,   // ← FIX: was missing before
        system:      systemContent,
        messages:    messages,
      }),
    }, 1); // BUG FIX: one quick retry on transient 429/5xx before throwing
    if (!res.ok) { const e = await res.text(); throw new Error('Anthropic error: ' + e); }
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }
}

// ─── Streaming AI caller — used exclusively by /api/kie ───────────────────────
// Calls onChunk(tokenText) for every token as it arrives. Returns full text.
// This is how Claude.ai / ChatGPT / DeepSeek deliver answers — first token in
// ~300ms instead of waiting 5-15s for the entire response to buffer.
async function callKieAIStream(modelKey, systemContent, messages, cfg, onChunk) {
  const m = KIE_MODELS[modelKey] || KIE_MODELS.spark;

  if (m.provider === 'groq') {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('Groq API key not configured.');
    const res = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model:       m.model,
        max_tokens:  cfg.max_tokens,
        temperature: cfg.temperature,
        stream:      true,
        messages:    [{ role: 'system', content: systemContent }, ...messages],
      }),
    }, 1); // BUG FIX: one quick retry before falling back — only safe pre-stream, no tokens sent yet
    if (!res.ok) { const e = await res.text(); throw new Error('Groq error: ' + e); }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep incomplete line for next iteration
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return;
        try {
          const chunk = JSON.parse(payload);
          const token = chunk.choices?.[0]?.delta?.content || '';
          if (token) onChunk(token);
        } catch { /* malformed chunk — skip */ }
      }
    }

  } else {
    // Anthropic streaming
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Anthropic API key not configured.');
    const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:       m.model,
        max_tokens:  cfg.max_tokens,
        temperature: cfg.temperature,
        stream:      true,
        system:      systemContent,
        messages:    messages,
      }),
    }, 1); // BUG FIX: one quick retry before falling back — only safe pre-stream, no tokens sent yet
    if (!res.ok) { const e = await res.text(); throw new Error('Anthropic error: ' + e); }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(trimmed.slice(6));
          // Anthropic streaming: content_block_delta carries text_delta
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            const token = chunk.delta.text || '';
            if (token) onChunk(token);
          }
        } catch { /* malformed chunk — skip */ }
      }
    }
  }
}

// ─── Generic retry wrapper for transient upstream failures ────────────────────
// callKieAI/callKieAIStream previously had zero retry logic — one transient blip
// from Groq/Anthropic (a dropped connection, a 503, a rate-limit blip) meant an
// immediate downgrade to the Spark fallback engine. This retries the connection
// once with a short backoff first — the same thing Claude.ai/ChatGPT do before
// ever showing the user a degraded response.
async function fetchWithRetry(url, opts, maxRetries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
      throw err;
    }
  }
  throw lastErr;
}

// ─── Real live web search — Tavily ─────────────────────────────────────────────
// This replaces the old "Market Intel" fake — KIE Web Search mode previously had
// a system prompt that explicitly told the model it had NO live internet access
// and to just talk like it might. This actually hits a search API and feeds real,
// current results back into the system prompt — the same "ground the model in a
// real search result" pattern Claude.ai / ChatGPT / Perplexity all use.
// Requires TAVILY_API_KEY in env (free tier: 1,000 searches/month at tavily.com).
// If the key isn't set, performWebSearch() simply isn't called — KIE falls back
// to honestly saying live search isn't configured, instead of pretending.
async function performWebSearch(query, maxResults = 5) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;

  try {
    const controller = new AbortController();
    const killTimer   = setTimeout(() => controller.abort(), 9000); // never let search hang the whole chat
    const res = await fetchWithRetry('https://api.tavily.com/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ query, search_depth: 'basic', max_results: maxResults, include_answer: false }),
      signal: controller.signal,
    }, 1);
    clearTimeout(killTimer);
    if (!res.ok) { const e = await res.text(); throw new Error('Tavily error: ' + e); }
    const data = await res.json();
    return (data.results || []).slice(0, maxResults).map(r => ({
      title:   r.title   || 'Untitled',
      url:     r.url      || '',
      snippet: (r.content || '').replace(/\s+/g, ' ').slice(0, 500),
    }));
  } catch (err) {
    console.error('[webSearch] failed:', err.message);
    return null; // caller treats null same as "not configured" — degrade honestly, never fake it
  }
}

// Turns the latest user message into a clean search query string.
function buildSearchQuery(lastUserMessage) {
  return (lastUserMessage || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

// Builds the system-prompt block that injects real search results (or an honest
// "nothing found" / "not configured" note) right before generation.
function buildSearchContextBlock(query, results, configured) {
  if (!configured) {
    return `\n\nLIVE WEB SEARCH: Live search isn't configured for this assistant right now — answer from general industry knowledge and patterns, and be upfront if you don't have current/live data on something specific (exact current salary numbers, this week's news) instead of inventing it.`;
  }
  if (!results || results.length === 0) {
    return `\n\nLIVE WEB SEARCH: A real-time search was just run for "${query}" but returned nothing usable. Say so plainly — don't invent data to fill the gap.`;
  }
  const lines = results.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (source: ${r.url})`).join('\n');
  return `\n\nLIVE WEB SEARCH RESULTS for "${query}" (fetched just now — this is REAL current data, not training knowledge):\n${lines}\n\nGround your answer in this. Reference sources naturally by name (e.g. "LinkedIn's data shows…", "a recent Glassdoor report found…") — never say you can't access the internet, you just did. If these results don't actually answer the question, say so honestly rather than inventing numbers.`;
}

// ─── Detect when a message needs LIVE data, regardless of which mode is active ─
// Mirrors how ChatGPT/Claude auto-invoke browsing — a user shouldn't need to know
// to tap "Web Search" before asking about salary ranges, "is X still hiring", or
// anything time-anchored. If this fires, a real search runs even outside Web mode.
const LIVE_INFO_PATTERN = /\b(salary|salaries|pay range|compensation|market rate|hiring trends?|in[\s-]?demand skills?|layoffs?|is\s+\w+\s+still\s+(hiring|around|in business)|currently hiring|right now|this year|latest|trending|2026|2027|industry report|glassdoor|h1b|visa sponsorship|job market)\b/i;

function shouldSearchWeb(mode, lastUserMessage) {
  if (mode === 'web') return true;
  return LIVE_INFO_PATTERN.test(lastUserMessage || '');
}

// ─── Detect career-strategy questions that would benefit from Deep Think ──────
// Purely advisory — never silently switches mode or cost tier. Surfaced via the
// SSE 'done' event so the client can offer a one-tap "Try Deep Think" nudge,
// rather than the model quietly deciding for the user.
const DEEP_SIGNAL_PATTERN = /\b(should i (quit|leave|stay|take|accept|switch|pivot)|career (pivot|change|switch)|which (offer|job|role) (should|is better)|torn between|weighing|trade-?offs?|long[\s-]?term (career|strategy)|worth it|burnt? ?out|am i (underpaid|undervalued|ready for))\b/i;

function suggestDeepMode(mode, lastUserMessage) {
  if (mode !== 'default' && mode !== 'quick') return false;
  const msg = lastUserMessage || '';
  return msg.length > 80 && DEEP_SIGNAL_PATTERN.test(msg);
}

// ─── Lightweight in-session fact extraction ────────────────────────────────────
// KIE_MODES.deep already asks the model to "capture and connect" facts shared
// earlier in the chat, but it has to re-derive that from scratch every single
// turn. This gives it a ready-made summary instead — a rough version of the
// session-level profiling Claude.ai/ChatGPT do, scoped to THIS conversation only
// (no cross-session storage yet — that needs its own Firestore schema/design pass).
function extractSessionFacts(messages) {
  const facts = new Set();
  const userText = messages.filter(m => m.role === 'user')
    .map(m => typeof m.content === 'string' ? m.content : '')
    .join(' \n ');

  const roleMatch = userText.match(/\bi(?:'m| am)\s+(?:a|an)\s+([a-z][a-z\s]{2,30}?)(?:\.|,|\n| at | with | who | and |$)/i);
  if (roleMatch) facts.add(`Stated current role: ${roleMatch[1].trim()}`);

  const expMatch = userText.match(/\b(\d{1,2})\+?\s*years?\s*(?:of\s*)?experience/i);
  if (expMatch) facts.add(`Stated experience: ~${expMatch[1]} years`);

  const goalMatch = userText.match(/\b(?:want to|trying to|hoping to|looking to)\s+(?:become|transition into|move into|switch to|break into)\s+(?:a|an)?\s*([a-z][a-z\s]{2,40}?)(?:\.|,|\n|$)/i);
  if (goalMatch) facts.add(`Stated goal: move toward ${goalMatch[1].trim()}`);

  return [...facts];
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
      // ── Admin logging ──────────────────────────────────────────────────────
      db.collection('emailLogs').add({
        email, name, type: 'welcome', success: true,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
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

// ─── Gmail Career Intelligence ─────────────────────────────────────────────────
const CAREER_QUERY = 'subject:(application OR applied OR interview OR offer OR rejected OR "next steps" OR assessment OR screening OR "job opportunity" OR "your application" OR "thank you for applying" OR "we regret" OR "pleased to offer") OR from:(greenhouse.io OR lever.co OR workday.com OR careers@ OR recruitment@ OR hr@ OR talent@ OR noreply@linkedin.com)';

async function classifyCareerEmail(subject, snippet) {
  const s = (subject + ' ' + snippet).toLowerCase();
  if (/thank you for apply|application received|we received your|successfully applied/.test(s)) return 'application_confirmation';
  if (/pleased to offer|congratulations|offer letter|job offer|we.d like to offer/.test(s)) return 'offer';
  if (/unfortunately|regret to inform|not moving forward|other candidates|position.*(has been )?filled/.test(s)) return 'rejection';
  if (/interview|schedule|calendly|meet with|video call|phone screen|zoom link/.test(s)) return 'interview_invite';
  if (/assessment|test|coding challenge|take-home|hackerrank/.test(s)) return 'assessment';
  if (/opportunity|reaching out|your profile|your background|open role|we.re hiring/.test(s)) return 'recruiter_outreach';
  if (/background check|reference|onboarding|start date|paperwork/.test(s)) return 'post_offer';
  try {
    const groqKey = (process.env.GROQ_API_KEY || '').split(',')[0].trim();
    if (!groqKey) return 'general_update';
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 15, temperature: 0,
        messages: [{ role: 'user', content: `Classify this career email into ONE: application_confirmation, interview_invite, assessment, recruiter_outreach, rejection, offer, post_offer, general_update\nSubject: ${subject}\nPreview: ${snippet}\nReply with ONLY the category.` }] })
    });
    const d = await r.json();
    return (d.choices?.[0]?.message?.content || 'general_update').trim().toLowerCase();
  } catch { return 'general_update'; }
}

async function extractEmailEntities(subject, snippet) {
  try {
    const groqKey = (process.env.GROQ_API_KEY || '').split(',')[0].trim();
    if (!groqKey) return { company: null, role: null };
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 60, temperature: 0,
        messages: [{ role: 'user', content: `Extract company and job title from this career email. Return ONLY valid JSON: {"company":"Name or null","role":"Title or null"}\nSubject: ${subject}\nPreview: ${snippet}` }] })
    });
    const d = await r.json();
    const text = (d.choices?.[0]?.message?.content || '{}').trim().replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch { return { company: null, role: null }; }
}

// Only called for emails already classified as interview_invite — keeps this
// extra AI call cheap and rare rather than running it on every single email.
async function extractInterviewDateTime(subject, snippet, emailDate) {
  try {
    const groqKey = (process.env.GROQ_API_KEY || '').split(',')[0].trim();
    if (!groqKey) return null;
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 60, temperature: 0,
        messages: [{ role: 'user', content: `This email was received ${emailDate.toISOString()}. If it states a specific interview date and time, resolve relative phrases (e.g. "next Tuesday at 2pm") against the received date and return it as an absolute ISO 8601 datetime. If only a date is given with no time, or no specific date/time is mentioned at all, return null for "datetime" rather than guessing. Return ONLY valid JSON: {"datetime":"ISO string or null","durationMinutes":number or null}\nSubject: ${subject}\nPreview: ${snippet}` }] })
    });
    const d = await r.json();
    const text   = (d.choices?.[0]?.message?.content || '{}').trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return parsed && parsed.datetime ? parsed : null;
  } catch { return null; }
}

const STATUS_RANK = { post_offer:7, offer:6, rejection:5, interview_invite:4, assessment:3, application_confirmation:2, recruiter_outreach:1, general_update:0 };
function normaliseStr(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'').trim(); }
function isSameApplication(a, b) {
  const cA=normaliseStr(a.company), cB=normaliseStr(b.company);
  if (!cA||!cB) return false;
  const compMatch = cA.includes(cB)||cB.includes(cA)||cA===cB;
  const rA=normaliseStr(a.role), rB=normaliseStr(b.role);
  const roleMatch = !rA||!rB||rA.includes(rB)||rB.includes(rA);
  return compMatch && roleMatch;
}

async function syncUserGmail(uid, tokens) {
  const oauth2 = getOAuthClient(); oauth2.setCredentials(tokens);
  const gmail  = google.gmail({ version: 'v1', auth: oauth2 });
  const list   = await gmail.users.messages.list({ userId: 'me', q: CAREER_QUERY, maxResults: 60 });
  const msgs   = list.data.messages || [];
  if (!msgs.length) return [];
  const details = await Promise.all(msgs.map(m => gmail.users.messages.get({ userId:'me', id:m.id, format:'metadata', metadataHeaders:['Subject','From','Date'] }).catch(()=>null)));
  const parsed = [];
  for (const msg of details) {
    if (!msg) continue;
    const hdrs    = msg.data.payload?.headers || [];
    const getH    = n => hdrs.find(h=>h.name.toLowerCase()===n.toLowerCase())?.value||'';
    const subject = getH('Subject'); const snippet = msg.data.snippet||'';
    const ts      = new Date(msg.data.internalDate ? Number(msg.data.internalDate) : getH('Date'));
    const emailType           = await classifyCareerEmail(subject, snippet);
    const { company, role }   = await extractEmailEntities(subject, snippet);
    let interviewAt = null, interviewDurationMin = null;
    if (emailType === 'interview_invite') {
      const idt = await extractInterviewDateTime(subject, snippet, ts);
      if (idt) { interviewAt = idt.datetime; interviewDurationMin = idt.durationMinutes || 60; }
    }
    parsed.push({ subject, snippet, threadId:msg.data.threadId, ts, emailType, company, role, interviewAt, interviewDurationMin });
  }
  return parsed;
}

function buildApplicationList(emails) {
  const apps = [];
  for (const email of emails.sort((a,b)=>a.ts-b.ts)) {
    const { company, role, emailType, ts, subject, interviewAt, interviewDurationMin } = email;
    if (!company) continue;
    const existing = apps.find(a=>isSameApplication(a,{company,role}));
    const event    = { date: ts.toISOString().split('T')[0], type:emailType, subject };
    if (existing) {
      if ((STATUS_RANK[emailType]||0) > (STATUS_RANK[existing.status]||0)) existing.status = emailType;
      existing.lastActivityTs = Math.max(existing.lastActivityTs, ts.getTime());
      existing.timeline.push(event);
      if (role && !existing.role) existing.role = role;
      if (interviewAt) { existing.interviewAt = interviewAt; existing.interviewDurationMin = interviewDurationMin || 60; }
    } else {
      apps.push({ company, role:role||null, status:emailType, firstSeenTs:ts.getTime(), lastActivityTs:ts.getTime(), timeline:[event],
        ...(interviewAt ? { interviewAt, interviewDurationMin: interviewDurationMin || 60 } : {}) });
    }
  }
  return apps.sort((a,b)=>b.lastActivityTs-a.lastActivityTs);
}

function generateInsights(apps) {
  const ins = []; const now = Date.now();
  for (const app of apps) {
    const days  = Math.floor((now-app.lastActivityTs)/86400000);
    const label = app.role ? `${app.company} (${app.role})` : app.company;
    if (app.status==='interview_invite')  ins.push(`⚡ PRIORITY: Interview stage with ${label}`);
    else if (app.status==='offer')        ins.push(`🎉 OFFER from ${label} — evaluate & negotiate`);
    else if (app.status==='rejection')    ins.push(`${label} — rejected. Analyse gaps.`);
    else if (app.status==='application_confirmation' && days>14) ins.push(`${label} — ${days}d no response. Follow up.`);
    else if (app.status==='recruiter_outreach' && days>5)        ins.push(`Recruiter from ${label} waiting ${days}d`);
    else if (app.status==='assessment')   ins.push(`${label} sent assessment — complete promptly`);
  }
  return ins.slice(0,6);
}

// ─── Gmail Pipeline Intelligence (stats + staleness) ───────────────────────────
// Additive only — reads the same `apps` shape buildApplicationList() already
// produces, doesn't change Firestore schema or touch any resume/cover-letter code.
const GPIPE_STALE_DAYS = 14;
const GPIPE_STALL_STATUSES = ['application_confirmation','recruiter_outreach','assessment'];

function attachStaleFlags(apps) {
  const now = Date.now();
  return apps.map(a => {
    const daysSince = Math.floor((now - a.lastActivityTs) / 86400000);
    const stale = GPIPE_STALL_STATUSES.includes(a.status) && daysSince > GPIPE_STALE_DAYS;
    return { ...a, daysSince, stale };
  });
}

function computePipelineStats(apps) {
  const counts = {};
  for (const a of apps) counts[a.status] = (counts[a.status]||0) + 1;
  const total      = apps.length;
  const rejected   = counts.rejection || 0;
  const interviews = (counts.interview_invite||0) + (counts.post_offer||0) + (counts.offer||0); // reached interview stage or beyond
  const offers     = (counts.offer||0) + (counts.post_offer||0);
  const pct = (n,d) => d ? Math.round((n/d)*100) : 0;
  return {
    total, rejected, active: total - rejected,
    counts,
    interviewRate: pct(interviews, total),
    offerRate:     pct(offers, total),
  };
}

// Cross-company pattern detection — looks across the user's whole history for
// stages where they consistently go quiet, e.g. "you tend to get ghosted after
// the assessment stage". Needs a minimum sample so it doesn't fire noise on a
// handful of applications.
const GPIPE_PATTERN_MIN_SAMPLE = 3;
function detectGhostingPattern(apps) {
  const reached  = (type) => apps.filter(a => a.timeline.some(t=>t.type===type));
  const stuckAt  = (type) => reached(type).filter(a => a.status===type && a.stale);
  const stages = [
    { key:'assessment',         label:'after the assessment stage' },
    { key:'interview_invite',   label:'after the interview stage' },
    { key:'recruiter_outreach', label:'after recruiter outreach' },
  ];
  const patterns = [];
  for (const s of stages) {
    const total = reached(s.key).length;
    if (total < GPIPE_PATTERN_MIN_SAMPLE) continue;
    const stuck = stuckAt(s.key).length;
    const rate  = Math.round((stuck/total)*100);
    if (rate >= 50) patterns.push({ stage:s.key, label:s.label, count:stuck, total, rate });
  }
  return patterns;
}

function buildKieBrainBlock(apps, insights, emailsScanned) {
  if (!apps.length) return `GMAIL CAREER INTELLIGENCE: Gmail connected (${emailsScanned} emails scanned). No career emails found yet — will update as they arrive.`;
  const active     = apps.filter(a=>a.status!=='rejection');
  const rejected   = apps.filter(a=>a.status==='rejection');
  const offers     = apps.filter(a=>a.status==='offer');
  const interviews = apps.filter(a=>a.status==='interview_invite');
  let b = `GMAIL CAREER INTELLIGENCE (${emailsScanned} emails scanned):\n`;
  b += `Pipeline: ${apps.length} companies | Active: ${active.length} | Interviews: ${interviews.length} | Offers: ${offers.length} | Rejected: ${rejected.length}\n\n`;
  if (offers.length)     b += `🔴 URGENT — OFFER: ${offers[0].company}${offers[0].role?' ('+offers[0].role+')':''} — user must respond\n`;
  if (interviews.length) b += `⚡ ACTIVE — INTERVIEW: ${interviews[0].company}${interviews[0].role?' ('+interviews[0].role+')':''} — prep needed\n`;
  b += `\nAPPLICATIONS:\n`;
  for (const app of apps.slice(0,8)) {
    const days = Math.floor((Date.now()-app.lastActivityTs)/86400000);
    b += `• ${app.company}${app.role?' — '+app.role:''}: ${app.status.replace(/_/g,' ')} (${days}d ago)\n`;
  }
  if (insights.length) b += `\nACTIONS:\n${insights.map(i=>'• '+i).join('\n')}`;
  b += `\n\nCOACHING RULES FOR THIS DATA:\n- Never say "I can see your Gmail" — just know it naturally\n- Reference companies by name like a coach who has been tracking this\n- If offer or interview detected — surface it even in unrelated conversations\n- If user seems stressed — acknowledge feelings before advice\n- Weave Gmail data and conversation context together; never treat them as separate`;
  return b;
}

async function getGmailCareerBrainRaw(uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('gmailBrain').doc('summary').get();
    return snap.exists ? snap.data() : null;
  } catch { return null; }
}
async function getGmailCareerBrain(uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('gmailBrain').doc('summary').get();
    return snap.exists ? snap.data().kieBlock||null : null;
  } catch { return null; }
}
async function getValidTokens(uid, storedTokens) {
  const oauth2 = getOAuthClient(); oauth2.setCredentials(storedTokens);
  if (storedTokens.expiry_date && storedTokens.expiry_date > Date.now()+60000) return storedTokens;
  const { credentials } = await oauth2.refreshAccessToken();
  await db.collection('users').doc(uid).collection('gmailBrain').doc('tokens')
    .set({ tokens:credentials, updatedAt:admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
  return credentials;
}
async function syncGmailForUser(uid) {
  const tokenDoc = await db.collection('users').doc(uid).collection('gmailBrain').doc('tokens').get();
  if (!tokenDoc.exists) throw new Error('No Gmail tokens');
  const tokens      = await getValidTokens(uid, tokenDoc.data().tokens);
  const rawEmails   = await syncUserGmail(uid, tokens);
  const apps        = buildApplicationList(rawEmails);
  const insights    = generateInsights(apps);
  const kieBlock    = buildKieBrainBlock(apps, insights, rawEmails.length);
  await db.collection('users').doc(uid).collection('gmailBrain').doc('summary').set(
    { applications:apps, insights, kieBlock, emailsScanned:rawEmails.length, lastSynced:admin.firestore.FieldValue.serverTimestamp() }
  );
  console.log(`[gmail] synced uid:${uid} — ${rawEmails.length} emails → ${apps.length} apps`);
  return { apps, insights, emailsScanned:rawEmails.length };
}

// ─── Conversation Intelligence ────────────────────────────────────────────────
async function generateConvSummary(messages) {
  try {
    const groqKey = (process.env.GROQ_API_KEY||'').split(',')[0].trim();
    if (!groqKey||messages.length<2) return null;
    const recent = messages.slice(-10).map(m=>`${m.role==='user'?'User':'KIE'}: ${(typeof m.content==='string'?m.content:'').slice(0,400)}`).join('\n');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${groqKey}`},
      body: JSON.stringify({ model:'llama-3.1-8b-instant', max_tokens:200, temperature:0.1,
        messages:[{ role:'user', content:`Summarize this career coaching conversation. Return ONLY valid JSON:\n{"topic":"one sentence what user is dealing with","userSituation":"their specific situation 1-2 sentences","emotionalState":"one word: frustrated/anxious/excited/confused/hopeful/determined/stressed/confident","keyFacts":["fact1","fact2"],"unresolved":"what they still need or null","urgency":"high/medium/low"}\n\nConversation:\n${recent}` }]
      })
    });
    const d = await r.json();
    const text = (d.choices?.[0]?.message?.content||'').trim().replace(/```json|```/g,'').trim();
    return JSON.parse(text);
  } catch { return null; }
}
async function saveConvSummary(uid,convId,summary) {
  if (!uid||!convId||!summary) return;
  try { await db.collection('users').doc(uid).collection('convSummaries').doc(convId)
    .set({ ...summary, updatedAt:admin.firestore.FieldValue.serverTimestamp() }, { merge:true }); }
  catch(e) { console.error('[conv-summary] save:',e.message); }
}
async function getConvSummary(uid,convId) {
  if (!uid||!convId) return null;
  try { const snap=await db.collection('users').doc(uid).collection('convSummaries').doc(convId).get(); return snap.exists?snap.data():null; }
  catch { return null; }
}

// Background Gmail auto-sync every 2 hours
setInterval(async()=>{
  try {
    const snap = await db.collection('users').where('gmailConnected','==',true).limit(50).get();
    for (const doc of snap.docs) {
      await syncGmailForUser(doc.id).catch(e=>console.error(`[gmail-cron] uid:${doc.id}:`,e.message));
      await new Promise(r=>setTimeout(r,2000));
    }
  } catch(e) { console.error('[gmail-cron]:',e.message); }
}, 2*60*60*1000);


// ─── Express Setup ─────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // so req.protocol correctly reports https behind Render's proxy (needed for Paystack callback_url)
app.use(cors());

// ─── Paystack Webhook — MUST be registered before express.json() below ────────
// We need the exact raw bytes Paystack sent to verify the signature. If this
// route is ever moved below the global express.json() line, the body will
// already be parsed/consumed and signature verification will start failing.
// ─── Shared logic: apply a successful Paystack transaction's metadata ────────
// Called from BOTH the webhook (async, reliable but depends on Paystack's
// dashboard webhook URL being configured correctly) AND from
// /api/billing/verify (called directly by billing.html the moment the user
// lands back from checkout — works even if the webhook was never set up).
// Idempotent: calling this twice for the same successful reference just
// re-applies the same state, which is harmless.
async function applyPaystackMetadata(metadata, reference) {
  const { uid, plan, type, topupMessages } = metadata || {};
  if (!uid) { console.error('Paystack: missing uid in metadata', metadata); return { applied: false }; }

  if (type === 'topup') {
    const uRef   = db.collection(USERS).doc(uid);
    const snap   = await uRef.get();
    const data   = snap.exists ? snap.data() : {};
    const usage  = data.usage || {};
    const anchor = getCycleAnchorDate(data);
    const cycleStartKey = getCycleStart(anchor, new Date()).toISOString();
    const sameCycle = usage.kieCycleStart === cycleStartKey;
    const existing  = sameCycle ? (usage.kieTopupRemaining || 0) : 0;
    const toAdd     = Number(topupMessages) || 100;
    await uRef.set({
      usage: {
        kieTopupRemaining: existing + toAdd,
        kieCycleStart: cycleStartKey,
        kieCount: sameCycle ? (usage.kieCount || 0) : 0,
      },
    }, { merge: true });
    console.log(`💳 Paystack topup: ${uid} +${toAdd} messages (ref ${reference})`);
    return { applied: true, type: 'topup' };
  }

  if (plan && PLANS[plan]) {
    await db.collection(USERS).doc(uid).set({
      plan,
      planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      usage: { kieCount: 0, kieTopupRemaining: 0, kieCycleStart: admin.firestore.FieldValue.delete() },
    }, { merge: true });
    console.log(`💳 Paystack plan upgrade: ${uid} → ${plan} (ref ${reference})`);
    return { applied: true, type: 'plan', plan };
  }

  console.error('Paystack: unrecognized metadata', metadata);
  return { applied: false };
}

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

// ─── Gmail Routes ────────────────────────────────────────────────────────────
app.post('/api/gmail/connect', authenticate, async (req,res) => {
  if (!GMAIL_CLIENT_ID||!GMAIL_CLIENT_SECRET) return res.status(503).json({ error:'Gmail not configured' });
  const url = getOAuthClient().generateAuthUrl({ access_type:'offline', prompt:'consent',
    scope:['https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/userinfo.email'],
    state: req.user.uid });
  res.json({ url });
});

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
    await db.collection('users').doc(uid).collection('gmailBrain').doc('tokens')
      .set({ tokens, gmailEmail, connectedAt:admin.firestore.FieldValue.serverTimestamp(), updatedAt:admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(uid).set({ gmailConnected:true, gmailEmail, gmailConnectedAt:admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
    syncGmailForUser(uid).catch(e=>console.error('[gmail] initial sync:',e.message));
    res.redirect('/dashboard?gmail=connected');
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
    const sum  = sSnap.exists ? sSnap.data() : {};
    const apps = attachStaleFlags(sum.applications || []);
    res.json({ connected:true, gmailEmail:uSnap.data().gmailEmail||'', emailsScanned:sum.emailsScanned||0,
      applications: apps.slice(0,40), insights: sum.insights||[],
      stats: computePipelineStats(apps),
      patterns: detectGhostingPattern(apps),
      lastSynced:sum.lastSynced?.toDate?.()?.toISOString()||null });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// One-tap AI follow-up draft — text only, the user copies & sends it themselves.
// Kievora never sends mail on a user's behalf (matches the "read-only access" promise
// already shown on the Gmail panel).
app.post('/api/gmail/draft-followup', authenticate, async (req,res) => {
  try {
    const { company, role } = req.body || {};
    if (!company) return res.status(400).json({ error:'company required' });
    const groqKey = (process.env.GROQ_API_KEY||'').split(',')[0].trim();
    if (!groqKey) return res.status(503).json({ error:'AI not configured' });
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${groqKey}`},
      body: JSON.stringify({ model:'llama-3.1-8b-instant', max_tokens:260, temperature:0.6,
        messages:[{ role:'user', content:`Write a short, warm, professional follow-up email a job applicant can send to check on the status of their application. Company: ${company}. Role: ${role||'the role they applied for'}. Keep it under 120 words, confident but not pushy, no generic filler, no placeholder brackets. Return ONLY valid JSON: {"subject":"...","body":"..."}` }]
      })
    });
    const d = await r.json();
    const text  = (d.choices?.[0]?.message?.content||'{}').trim().replace(/```json|```/g,'').trim();
    const draft = JSON.parse(text);
    res.json({ success:true, draft });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.delete('/api/gmail/disconnect', authenticate, async (req,res) => {
  try {
    const tDoc = await db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('tokens').get();
    if (tDoc.exists) { const o=getOAuthClient(); o.setCredentials(tDoc.data().tokens); await o.revokeCredentials().catch(()=>{}); }
    const batch = db.batch();
    batch.delete(db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('tokens'));
    batch.delete(db.collection('users').doc(req.user.uid).collection('gmailBrain').doc('summary'));
    batch.update(db.collection('users').doc(req.user.uid), { gmailConnected:false, gmailEmail:admin.firestore.FieldValue.delete() });
    await batch.commit();
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/api/kie/summarize', authenticate, async (req,res) => {
  const { messages, convId } = req.body;
  if (!Array.isArray(messages)||!convId) return res.status(400).json({ error:'messages and convId required' });
  res.json({ accepted:true });
  generateConvSummary(messages).then(sum=>saveConvSummary(req.user.uid,convId,sum)).catch(e=>console.error('[summarize]:',e.message));
});

// ─── GET /api/plan-config — what THIS user is allowed to do, right now ────────
// dashboard.html fetches this once on load and uses it to hide/disable any
// gated UI — the actual enforcement still happens server-side on each
// protected endpoint, this is just so the UI doesn't show options it can't
// honor.
app.get('/api/plan-config', authenticate, async (req, res) => {
  try {
    const planKey = await getUserPlanKey(req.user.uid);
    res.json({ plan: planKey, gates: getPlanConfig(planKey) });
  } catch (e) {
    console.error('GET /api/plan-config ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/billing/rates — live USD prices converted to the user's currency
// billing.html calls this on load with the ISO country code detected client-side
// (via the browser's IP-geolocation lookup). Returns converted, formatted
// prices for all plans so the page shows "₦11,200/mo" instead of "$7/mo".
// No auth required — this just reflects public pricing.
app.get('/api/billing/rates', async (req, res) => {
  try {
    const country  = (req.query.country || 'US').toUpperCase();
    const currency = COUNTRY_CURRENCY[country] || 'USD';
    const rates    = await getExchangeRates();
    const rate     = rates[currency] || 1;
    const symbols  = { NGN: '₦', GHS: 'GH₵', KES: 'KSh', ZAR: 'R', USD: '$' };
    const symbol   = symbols[currency] || '$';

    const convert = (usd) => {
      if (currency === 'USD') return { display: `$${usd}`, raw: usd };
      const amount = Math.round(usd * rate);
      return { display: `${symbol}${amount.toLocaleString('en-US')}`, raw: amount };
    };

    res.json({
      currency, symbol, rate, country,
      plans: {
        free:   { ...convert(0),   label: 'Free',    key: 'free'   },
        paid7:  { ...convert(7),   label: 'Pro',      key: 'paid7'  },
        paid15: { ...convert(15),  label: 'Premier',  key: 'paid15' },
      },
      topup: {
        paid7:  { ...convert(1.5), messages: 100 },
        paid15: { ...convert(5),   messages: 100 },
      },
    });
  } catch (e) {
    console.error('GET /api/billing/rates ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/upgrade-message?feature=tool — friendly, context-specific copy ──
// Call this whenever a user taps something locked, pass the feature key
// (kieLimit | kieModel | tool | uploadAnalyze | recruiterView | findJobs |
// coverLetter | atsExplanation | articleDownload), and show the returned
// message in a toast/modal. Keeps every upgrade nudge in the app consistent
// with what the server actually enforces.
app.get('/api/upgrade-message', authenticate, async (req, res) => {
  try {
    const feature = req.query.feature;
    const builder  = UPGRADE_MESSAGES[feature];
    if (!builder) return res.status(400).json({ error: 'Unknown feature key: ' + feature });
    const planKey = await getUserPlanKey(req.user.uid);
    res.json({ plan: planKey, message: builder(planKey, req.query.model) });
  } catch (e) {
    console.error('GET /api/upgrade-message ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/billing/checkout — starts a Paystack transaction in NGN ────────
// Prices are quoted in USD ($7/$15) but a Nigerian Paystack account settles in
// NGN, so we convert at the live rate right before opening checkout. Reads
// PAYSTACK_SECRET_KEY from env — drop in the live sk_live_... key later and
// this route needs zero code changes.
app.post('/api/billing/checkout', authenticate, async (req, res) => {
  try {
    const { plan, country = 'US' } = req.body;
    if (!['paid7', 'paid15'].includes(plan)) {
      return res.status(400).json({ error: 'plan must be "paid7" or "paid15".' });
    }
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Payments are not configured yet — missing PAYSTACK_SECRET_KEY.' });

    const currency  = COUNTRY_CURRENCY[(country || 'US').toUpperCase()] || 'USD';
    const usdAmount  = getPlanConfig(plan).priceUSD;
    const rates      = await getExchangeRates();
    const rate       = rates[currency] || 1;
    const localAmount = Math.round(usdAmount * rate);
    // Paystack amounts are in the smallest currency unit — kobo for NGN, pesewas
    // for GHS, cents for KES/ZAR/USD. All of these are just amount × 100.
    const minorAmount = localAmount * 100;

    const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method:  'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:        req.user.email,
        amount:       minorAmount,
        currency,
        metadata:     { uid: req.user.uid, plan, usdAmount, currency, rate },
        callback_url: `${req.protocol}://${req.get('host')}/billing`,
      }),
    });
    const data = await initRes.json();
    if (!data.status) {
      console.error('Paystack init failed:', data.message);
      return res.status(502).json({ error: data.message || 'Could not start checkout.' });
    }
    res.json({
      authorization_url: data.data.authorization_url,
      reference:          data.data.reference,
      currency, localAmount, rate, usdAmount,
    });
  } catch (e) {
    console.error('POST /api/billing/checkout ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/billing/verify — confirm + apply a transaction immediately ─────
// billing.html calls this the moment the user lands back from Paystack
// checkout (it has ?reference=xxx in the URL). This does NOT depend on
// Paystack's dashboard webhook being configured — it independently asks
// Paystack "did this reference actually succeed?" and applies the result
// right then, so the UI updates instantly even if the webhook is missing,
// misconfigured, or just hasn't arrived yet. The webhook still runs too —
// applyPaystackMetadata() is idempotent, so whichever gets there first wins
// and the second is a harmless no-op repeat of the same state.
app.get('/api/billing/verify', authenticate, async (req, res) => {
  try {
    const reference = req.query.reference;
    if (!reference) return res.status(400).json({ error: 'reference is required.' });

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Payments are not configured.' });

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || !verifyData.data) {
      console.error('Paystack verify failed:', verifyData.message);
      return res.status(502).json({ error: verifyData.message || 'Could not verify transaction.' });
    }

    const tx = verifyData.data;
    if (tx.status !== 'success') {
      // Not an error — the user might have cancelled or it's still pending
      return res.json({ verified: false, status: tx.status });
    }

    // Make sure this reference actually belongs to the person asking — never
    // let a user apply someone else's transaction by guessing a reference.
    if (tx.metadata?.uid !== req.user.uid) {
      console.error(`Paystack verify: uid mismatch — token uid ${req.user.uid}, tx uid ${tx.metadata?.uid}`);
      return res.status(403).json({ error: 'This transaction does not belong to your account.' });
    }

    const result = await applyPaystackMetadata(tx.metadata, reference);
    res.json({ verified: true, status: 'success', ...result });
  } catch (e) {
    console.error('GET /api/billing/verify ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/billing/me — plan, usage & account info for billing.html ────────
app.get('/api/billing/me', authenticate, async (req, res) => {
  try {
    const uid     = req.user.uid;
    const planKey = await getUserPlanKey(uid);
    const snap    = await db.collection(USERS).doc(uid).get();
    const data    = snap.exists ? snap.data() : {};
    const usage   = data.usage || {};
    const anchor      = getCycleAnchorDate(data);
    const cycleStart  = getCycleStart(anchor, new Date());
    const cycleStartKey = cycleStart.toISOString();
    const sameCycle        = usage.kieCycleStart === cycleStartKey;
    const kieUsedThisMonth = sameCycle ? (usage.kieCount || 0) : 0;
    const kieTopupLeft     = sameCycle ? (usage.kieTopupRemaining || 0) : 0;
    const cfg = getPlanConfig(planKey);

    // Next renewal = one cycle-length after the current cycle's start, using
    // the same clamping rule (so a Jan-31 anchor correctly shows Feb 28, etc.)
    const nextRenewal = getCycleStart(anchor, new Date(cycleStart.getTime() + 32 * 24 * 60 * 60 * 1000));

    res.json({
      plan:           planKey,
      planLabel:      cfg.label,
      planUpdatedAt:  data.planUpdatedAt || null,
      renewsAt:       nextRenewal.toISOString(),
      gates:          cfg,
      usage: {
        kieUsedThisMonth,
        kieMonthlyLimit:  cfg.kieMonthlyLimit,
        kieTopupLeft,
      },
      topup: cfg.topupPriceUSD ? {
        priceUSD:  cfg.topupPriceUSD,
        messages:  cfg.topupMessages,
        message:   TOPUP_MESSAGES[planKey] || null,
      } : null,
      plans: Object.values(PLANS).map(p => ({ key: p.key, label: p.label, priceUSD: p.priceUSD })),
    });
  } catch (e) {
    console.error('GET /api/billing/me ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/billing/topup — buy 100 extra KIE chat messages this month ─────
// Only available to paid users (Pro or Premier). Free users are directed to upgrade.
// Paystack metadata includes type:'topup' so the webhook knows to add messages
// rather than change the plan.
app.post('/api/billing/topup', authenticate, async (req, res) => {
  try {
    const { country = 'US' } = req.body;
    const planKey = await getUserPlanKey(req.user.uid);
    const cfg     = getPlanConfig(planKey);
    if (!cfg.topupPriceUSD) {
      return res.status(403).json({ error: 'Top-up is not available on the Free plan — upgrade to a paid plan first.' });
    }
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(500).json({ error: 'Payments are not configured yet.' });

    const currency    = COUNTRY_CURRENCY[(country || 'US').toUpperCase()] || 'USD';
    const rates       = await getExchangeRates();
    const rate        = rates[currency] || 1;
    const localAmount = Math.round(cfg.topupPriceUSD * rate);
    const minorAmount = localAmount * 100;

    const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method:  'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:        req.user.email,
        amount:       minorAmount,
        currency,
        metadata:     {
          uid:           req.user.uid,
          plan:          planKey,
          type:          'topup',
          topupMessages: cfg.topupMessages,
          usdAmount:     cfg.topupPriceUSD,
          currency, rate,
        },
        callback_url: `${req.protocol}://${req.get('host')}/billing?topup=1`,
      }),
    });
    const data = await initRes.json();
    if (!data.status) return res.status(502).json({ error: data.message || 'Could not start topup checkout.' });
    res.json({ authorization_url: data.data.authorization_url, currency, localAmount, rate });
  } catch (e) {
    console.error('POST /api/billing/topup ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

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

// ─── Cloudinary Image Upload ──────────────────────────────────────────────────
// POST /api/upload-image  (multipart/form-data, field: "image")
// Returns: { url: "https://res.cloudinary.com/…" }
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

// ─── POST /api/follow ──────────────────────────────────────────────────────────
// Atomically writes/deletes the follow doc AND updates followerCount + followingCount
// on both user docs. Admin SDK bypasses client-side Firestore rules so cross-user
// field updates are safe.
app.post('/api/follow', authenticate, async (req, res) => {
  const followerId  = req.user.uid;
  const { followingId, action } = req.body; // action: 'follow' | 'unfollow'
  if (!followingId || !['follow','unfollow'].includes(action)) {
    return res.status(400).json({ error: 'Missing followingId or invalid action' });
  }
  if (followerId === followingId) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }
  try {
    const followDocId  = `${followerId}_${followingId}`;
    const followRef    = db.collection('follows').doc(followDocId);
    const followerRef  = db.collection('users').doc(followingId); // person being followed
    const followingRef = db.collection('users').doc(followerId);  // person doing the following
    const delta = action === 'follow' ? 1 : -1;
    const batch = db.batch();
    if (action === 'follow') {
      batch.set(followRef, {
        followerId,
        followingId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      batch.delete(followRef);
    }
    batch.set(followerRef,  { followerCount:  admin.firestore.FieldValue.increment(delta) }, { merge: true });
    batch.set(followingRef, { followingCount: admin.firestore.FieldValue.increment(delta) }, { merge: true });
    await batch.commit();

    // Bust the following-feed cache for the follower so their feed refreshes
    bustFeedCache(followerId);

    res.json({ success: true, action });
  } catch (err) {
    console.error('POST /api/follow ERROR:', err.message);
    res.status(500).json({ error: 'Follow action failed: ' + err.message });
  }
});

// ─── GET /api/following-feed ───────────────────────────────────────────────────
// Returns articles from users the caller follows.
// Results are cached per-user for 5 minutes in memory — so repeated tab opens
// cost 0 Firestore reads instead of N/10 queries each time.
//
// Cache entry: { articles: [...], ts: Date.now() }
// Invalidated automatically after FEED_CACHE_TTL ms.
// The cache is also busted when the user follows/unfollows via /api/follow.

const feedCache   = new Map();   // uid → { articles, ts }
const FEED_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function bustFeedCache(uid) {
  feedCache.delete(uid);
}

// Sweep expired entries every 10 minutes so the Map never grows unboundedly.
// Without this, every user who ever opens the Following tab would stay in memory forever.
setInterval(() => {
  const now = Date.now();
  let swept = 0;
  for (const [uid, entry] of feedCache) {
    if (now - entry.ts > FEED_CACHE_TTL) {
      feedCache.delete(uid);
      swept++;
    }
  }
  if (swept > 0) console.log(`[feed-cache] swept ${swept} expired entries, ${feedCache.size} remaining`);
}, 10 * 60 * 1000);

app.get('/api/following-feed', authenticate, async (req, res) => {
  const uid   = req.user.uid;
  const fresh = req.query.fresh === 'true';

  // ── 1. Serve from cache if fresh ──────────────────────────────────────────
  if (!fresh) {
    const cached = feedCache.get(uid);
    if (cached && Date.now() - cached.ts < FEED_CACHE_TTL) {
      return res.json({ articles: cached.articles, followedUids: cached.followedUids || [], fromCache: true });
    }
  } else {
    // Force bust so the new result overwrites stale cache
    feedCache.delete(uid);
  }

  try {
    // ── 2. Get followed UIDs ────────────────────────────────────────────────
    const followsSnap = await db.collection('follows')
      .where('followerId', '==', uid)
      .get();

    const followedUids = followsSnap.docs
      .map(d => d.data().followingId)
      .filter(Boolean);

    if (!followedUids.length) {
      // Cache the empty result too — no point re-querying follows collection every tab open
      feedCache.set(uid, { articles: [], followedUids: [], ts: Date.now() });
      return res.json({ articles: [], followedUids: [], fromCache: false });
    }

    // ── 3. Chunk into groups of 10 (Firestore `in` limit) ──────────────────
    const chunks = [];
    for (let i = 0; i < followedUids.length; i += 10) {
      chunks.push(followedUids.slice(i, i + 10));
    }

    // ── 4. Run all chunk queries in parallel (not sequential) ───────────────
    const chunkResults = await Promise.all(
      chunks.map(chunk =>
        db.collection('articles')
          .where('authorUid', 'in', chunk)
          .where('status', '==', 'published')
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get()
          .catch(e => { console.warn('following-feed chunk err:', e.message); return null; })
      )
    );

    // ── 5. Merge + sort + dedupe ────────────────────────────────────────────
    const seen    = new Set();
    const articles = [];
    chunkResults.forEach(snap => {
      if (!snap) return;
      snap.docs.forEach(d => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        const data = d.data();
        articles.push({
          id:          d.id,
          title:       data.title       || '',
          brief:       data.brief       || data.excerpt || '',
          cat:         data.cat         || data.category || '',
          img:         data.img         || data.coverImage || '',
          author:      data.author      || data.authorName || '',
          authorUid:   data.authorUid   || '',
          avatar:      data.avatar      || data.authorPhoto || '',
          read:        data.read        || '',
          // Send createdAt as plain seconds so client doesn't need Firestore SDK to parse it
          createdAt:   data.createdAt   ? { seconds: data.createdAt._seconds || data.createdAt.seconds || 0 } : null,
          status:      data.status      || '',
        });
      });
    });

    articles.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    // ── 6. Store in cache ───────────────────────────────────────────────────
    feedCache.set(uid, { articles, followedUids, ts: Date.now() });

    res.json({ articles, followedUids, fromCache: false });

  } catch (err) {
    console.error('GET /api/following-feed ERROR:', err.message);
    res.status(500).json({ error: 'Could not load feed: ' + err.message });
  }
});


const KIE_MODES = {

  default: {
    label:       'Default',
    max_tokens:  1100,
    temperature: 0.72,
    system: `You are KIE — the world's best AI career coach, built by Kievora. You are not a chatbot. You are not a FAQ. You are the mentor people wish they had — the one who actually cares, actually listens, and actually gets them moving.

SCOPE — you help with EVERYTHING career-related:
- Resumes, CV writing, ATS optimisation
- Cover letters, LinkedIn bios, Instagram/Twitter/X bios
- Job applications and outreach messages
- How to reply to clients, recruiters, managers — any professional message
- Interview prep, salary negotiation, career switching
- Career plans, 30/60/90 day strategies, personal branding roadmaps
- Job alerts analysis — "should I apply?", "is this role right for me?"
- Reading and giving feedback on any document, profile, or screenshot a user shares

PLATFORM (mention naturally when it solves their actual problem):
Kievora has 13 resume templates (Classic, Modern, Bold, Minimal, Vivid, Elegant, Slate, Coral, Split, Ink, Executive, Nova, Tribune — last 3 support profile photos), a 3-step resume builder, ATS score checker, Resume Analyzer, and Template Match Quiz.
⚠️ CRITICAL: If a user shows/sends an external resume template or asks you to replicate one, say: "I can only create resumes using Kievora's 13 templates — I can't replicate an external design. Pick one of Kievora's templates and I'll make it great." Then show the template picker.
Kievora does NOT do cover letters as a separate product, websites, or portfolios. However, YOU as KIE can draft any document text a user needs as a code block.

STRUCTURED OUTPUT — CODE BLOCKS:
When you produce a standalone document — a LinkedIn bio, a cover letter draft, an email/message to send, a resignation letter, a 30-day plan, a cold outreach message, a client reply, a professional summary, or any text meant to be COPIED AND USED by the user — wrap it in this exact format:
[CODEBLOCK:label]
content here
[/CODEBLOCK]
where label is what it is (e.g. "LinkedIn Bio", "Cover Letter", "Client Reply", "30-Day Plan", "Email Draft", "Professional Summary").
The text BEFORE and AFTER the code block should be your coaching context. Do NOT wrap regular chat replies in code blocks — only copy-and-use documents.

RESUME PDF TRIGGER:
If the user has a SAVED KIEVORA resume loaded (per the FILE STATUS note below, when present) and asks you to apply changes AND resend/send the PDF, end your reply with [SEND_PDF] on its own line. Do NOT add [SEND_PDF] unless the user has explicitly asked for the PDF to be resent, and NEVER add it when the loaded resume is raw uploaded text with no template — there's no real PDF to send in that case.

CORE COACHING INTELLIGENCE — non-negotiable on every substantive reply:

1. READ BETWEEN THE LINES — What is the person actually struggling with or asking for? Respond to that, not just the literal words.

2. USE THEIR CONTEXT — Everything they've shared in this conversation (role, industry, situation, goals) shapes every answer you give. Make advice feel personal and specific.

3. BE DIRECTIVE — Don't give a list of options and say "pick one." Tell them what to do. "Here's exactly what to change."

4. ONE CLEAR ACTION — End every substantive reply with one specific action, introduced by a short bolded label + colon. Vary it — **Your move:**, **Next step:**, **Try this:**, **Do this now:** — whatever fits. Always close this way.

5. FORMAT FOR READABILITY — Short paragraphs, blank lines between distinct points, "- " bullets for 3+ items. Never cram advice into a wall of text.

6. NEVER GENERIC — Every reply should feel like it was written specifically for this person, not copy-paste advice.

7. NEVER PAD — No filler, no "great question," no throat-clearing. Every sentence earns its place.

TONE: The mentor they wished they had — thorough, straight, genuinely invested. Thinks before speaking. Smart without being cold.

GREETING RULE: One warm sentence. Ask what they want to work through.

OUT-OF-SCOPE RULE: Anything unrelated to careers, professional life, resumes, or Kievora — one warm sentence decline and redirect.

RESUME CONTEXT RULES — when resume is loaded: You have it. Never ask them to share it. Use the real content — their exact words, their specific roles, their actual skills — as the foundation of every analysis. Rewrite requests get rewrites. Don't describe, do.

FOLLOW-UP CHIPS: At the end of substantive responses (not short replies, not responses ending in a question), include 2–3 follow-up chips for what the user might want help with next — never advice telling them what to go do on their own. Each chip is something they'd tap to ask YOU, in their voice: "Help me...", "How do I...", "Check my...", "Write me...". One short line per chip, 3–7 words, no line breaks inside the tags. Format each at the very end of your reply: [FU]chip text[/FU]. Example after startup discussion: [FU]Help me write an investor pitch[/FU] [FU]How do I validate my idea fast?[/FU] [FU]Build my personal brand as a founder[/FU]. Example after resume edit: [FU]Improve my work experience bullets[/FU] [FU]Check my ATS score[/FU]. Never use [FU] chips on greetings, short replies, or when your response ends with a question.`,
  },

  // BUG FIX: deep and web were previously merged INSIDE the default object as
  // duplicate keys — JavaScript last-write-wins meant default always used Market
  // Intel settings, and KIE_MODES.deep / KIE_MODES.web were both undefined.
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

5. STRUCTURE FOR CLARITY — Short sharp intro that frames the situation → the actual analysis (short paragraphs and, where it helps, bolded mini-headings or "- " bullet lists for distinct angles) → one powerful closing insight that reframes how they see the problem. Never one dense block — give it room to breathe.

6. END WITH ACTION — One specific concrete step, introduced by a short bolded label + colon. Vary the label — **Your move:**, **Next step:**, **Where to start:**, **Try this:**, **Here's the move:** — whatever fits. Even deep analysis must land on something they can actually do.

7. CHALLENGE ASSUMPTIONS — If their premise is wrong, say so clearly and early. "Before I answer — I want to push back on something. The assumption here is X, but I think the real issue is Y."

8. NEVER PAD — Every sentence must earn its place. No filler, no throat-clearing, no "great question." Deep does not mean long for the sake of it.

TONE: The mentor they wished they had — thorough, straight, genuinely invested. Thinks before speaking. Smart without being cold.

GREETING RULE: One warm sentence. Ask what they want to work through.

OUT-OF-SCOPE RULE: Anything unrelated to careers, resumes, job searching, salary, interviews, or Kievora — one warm sentence decline and redirect.

RESUME CONTEXT RULES — when resume is loaded: You have it. Never ask them to share it. Use the real content — their exact words, their specific roles, their actual skills — as the foundation of every analysis. Rewrite requests get rewrites. Don't describe, do.

FOLLOW-UP CHIPS: At the end of substantive responses (not short replies, not responses ending in a question), include 2–3 follow-up chips tied to the topic just discussed — things the user could tap to ask you next, not advice for them to carry out alone. One short line each, 3–7 words, no line breaks inside the tags: [FU]chip text[/FU]. Never use on greetings, short replies, or when ending with a question.`,
  },

  web: {
    label:       'Web Search',
    max_tokens:  1000,
    temperature: 0.65,
    system: `You are KIE in Web Search mode — a career mentor built by Kievora with real, live internet access for this conversation via an actual search tool that runs before you answer.

LIVE SEARCH RULE — CRITICAL: If a "LIVE WEB SEARCH RESULTS" block appears below, that's real, current data fetched seconds ago — not your training knowledge. Ground your answer in it and reference sources naturally by name ("LinkedIn's data shows…", "a recent Glassdoor report found…"). If instead you see a "LIVE WEB SEARCH" note saying nothing was found or search isn't configured, be straight about that — say you don't have live data on that specific point and answer from general industry patterns instead. Never claim to have searched when no results block is present, and never pretend you lack internet access when results ARE present — both are dishonest in opposite directions.

SCOPE: You handle everything career-related — resumes, LinkedIn, job market questions, cover letters, client replies, professional messages, career roadmaps, salary negotiation, job alert analysis, interview prep.

PLATFORM: 13 templates, ATS checker, Resume Analyzer, Template Match Quiz. User is already on the platform — point to features by name.

STRUCTURED OUTPUT — CODE BLOCKS: When you produce a standalone document meant to be copied (LinkedIn bio, email, career plan, cover letter, client message) wrap it in [CODEBLOCK:label]...[/CODEBLOCK]. Regular chat replies never get code blocks.

MARKET INTEL COACHING BEHAVIORS (every substantive reply):
1. CAPTURE THEIR CONTEXT — Role, industry, location, experience level shapes every insight.
2. SPOT INTEREST SIGNALS — Engage any hint of career exploration with market reality.
3. MARKET INSIGHT FIRST, PERSONAL ANGLE SECOND — Lead with the market reality, then connect to them.
4. BE DIRECTIVE — Tell them what the market data means for THEM specifically.
5. END WITH ACTION — One specific, market-informed action. **Your move:**, **Next step:**, **Do this now:**, **Try this:**.
6. FORMAT — Short paragraphs, blank lines, "- " bullets for 3+ items.
7. HONEST ABOUT LIMITS — Fast-moving spaces get flagged to verify on Glassdoor/LinkedIn Salary, even with live results in hand.

TONE: The mentor who reads everything and shares it like a trusted friend — knowledgeable, honest, direct, warm.

RESUME CONTEXT RULES — when resume is loaded: Connect market intelligence directly to what's in THEIR resume.

FOLLOW-UP CHIPS: At the end of substantive responses (not short replies, not responses ending in a question), include 2–3 follow-up chips tied to the market topic just discussed — phrased as something the user could ask you next, not market advice for them to execute alone. One short line each, 3–7 words, no line breaks inside the tags: [FU]chip text[/FU]. Never use on greetings, short replies, or when ending with a question.`,
  },

  quick: {
    label:       'Quick Answer',
    max_tokens:  400,
    temperature: 0.7,
    system: `You are KIE in Quick Answer mode — the world's sharpest AI career coach when time matters. You cut to what the person actually needs in the fewest words possible. No warm-up. No fluff. Just the answer, then the action.

SCOPE: You handle EVERYTHING career-related — resumes, LinkedIn, cover letters, client replies, job applications, interview prep, career plans, professional messages, job alert analysis.

PLATFORM: 13 templates, ATS checker, Resume Analyzer, Template Match Quiz. User is on the platform already — name features directly.

STRUCTURED OUTPUT — CODE BLOCKS: When you produce a standalone document meant to be copied (a message, bio, letter, plan) wrap it in [CODEBLOCK:label]...[/CODEBLOCK]. Regular chat replies never get code blocks.

QUICK ANSWER RULES — zero exceptions:
- Greetings: ONE warm sentence. Done.
- Career questions: the single most valuable insight in 2-3 sentences OR 3 tight bullet points. Never both. Never more.
- LEAD with the answer — never with context or preamble.
- BE DIRECTIVE — "Do this." Not "you might consider."
- CLOSE with one action: **Your move:**, **Next step:**, **Try this:**, **Do this:** — always.
- VAGUE QUESTION: ask ONE clarifying question instead of guessing.
- OUT-OF-SCOPE: one warm sentence decline, redirect to career.

RESUME CONTEXT RULES — when resume is loaded: Use it immediately. Give specific answers, not general advice.

FOLLOW-UP CHIPS: When you give a substantive answer (not a greeting, not a clarifying question), end with 1–2 follow-up chips as tight as your answers — short, tappable next questions, not instructions: [FU]chip text[/FU]. One line each, 3–7 words, no line breaks inside the tags. Skip on greetings or when your reply ends with a question.`,
  },

  creative: {
    label:       'Creative',
    max_tokens:  1000,
    temperature: 0.93,
    system: `You are KIE in Creative mode — the boldest, most unconventional version of the world's best AI career coach, built by Kievora. You don't play it safe. You help people see their career in a way they never have before and then you get them moving.

SCOPE: Everything career — resumes, bold LinkedIn bios, client outreach, cover letters, personal branding, career pivots, unconventional job search strategies. You make every document they produce feel like them — not a template.

PLATFORM: 13 templates — most distinctive ones: Vivid (standout purple), Coral (warm & bold), Ink (editorial black), Nova (photo, deep purple), Tribune (photo, near-black), Bold (dark red). Template Match Quiz. User is already on the platform — never send them to the website.
If a user sends an external template image and asks to replicate it, say: "I can't copy that design — but I can build you something even more distinctive using one of Kievora's 13 templates. Pick one and I'll make it you." Then show the picker.

STRUCTURED OUTPUT — CODE BLOCKS: When you produce a standalone document meant to be copied (LinkedIn bio, bold cover letter, outreach message, personal statement, career manifesto, plan) wrap it in [CODEBLOCK:label]...[/CODEBLOCK]. Regular chat replies never get code blocks.

CREATIVE COACHING BEHAVIORS (every substantive reply):
1. AMPLIFY EVERYTHING — Their background, interests, throwaway comments — all creative material. Turn gaps into differentiators.
2. READ THE SIGNAL — If they hint at something bold or scary (a pivot, an unconventional move) — bring it forward. "You keep mentioning content creation — is that what you actually want?"
3. CHALLENGE THE SAFE PLAY — What's the obvious move? Good. Now what's the smarter, bolder one?
4. BE DIRECTIVE AND ENERGISING — "Here's what you need to do" not "here are some options."
5. END WITH ACTION — One bold, specific step. **Your move:**, **Here's the move:**, **Try this:**, **Do this:** — with energy.
6. FORMAT — Punchy short paragraphs with blank lines. Use "- " bullets for 3+ bold ideas.
7. CELEBRATE AMBITION — When someone thinks big, push them further, not back.

TONE: The mentor who changed how they see their career. Energetic. Direct. Vivid. Zero corporate energy.

RESUME CONTEXT RULES — when resume is loaded: Give bold, specific feedback on THEIR actual content. Rewrites should be distinctive, memorable, and true to who they actually are.

FOLLOW-UP CHIPS: At the end of substantive responses, include 2–3 bold follow-up chips tied to what was just discussed — things the user could tap to ask you next, not a to-do list for them. One short line each, 3–7 words, no line breaks inside the tags: [FU]chip text[/FU]. Skip on greetings, short replies, or when ending with a question.`,
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

// ─── Context trimming — keeps message history within a safe token budget ────────
// Rough heuristic: 1 token ≈ 4 chars. Budget of 14,000 chars leaves comfortable
// room for the system prompt + max response. Always keeps the most-recent message.
function trimMessagesForContext(messages, maxChars = 14000) {
  let total = 0;
  const result = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg  = messages[i];
    const text = typeof msg.content === 'string'
      ? msg.content
      : (Array.isArray(msg.content)
          ? msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
          : '');
    total += text.length;
    if (total > maxChars && result.length > 0) break;
    result.unshift(msg);
  }
  return result;
}

// ─── Conversation anchor — keeps the opening context alive in long chats ──────
// trimMessagesForContext() above is a pure sliding window, so a long-running chat
// can silently drop the very first message — often where the user stated their
// role, goal, or situation. Rather than inject a synthetic message into the
// messages array (which can break the strict user/assistant alternation some
// providers enforce), this surfaces a short anchor note into the SYSTEM prompt
// instead — the same place Claude.ai/ChatGPT keep durable context that shouldn't
// compete with the live turn-by-turn window.
function getConversationAnchor(allMessages, trimmedMessages) {
  if (allMessages.length === 0 || trimmedMessages.length === allMessages.length) return '';
  const first = allMessages[0];
  if (first.role !== 'user') return '';
  const firstText = typeof first.content === 'string' ? first.content.trim() : '';
  if (firstText.length < 15) return '';
  return `\n\nCONVERSATION ANCHOR — how this chat started (older messages were trimmed from the active context window, but don't lose the thread): "${firstText.slice(0, 280)}"`;
}

// ─── KIE AI Proxy — SSE Streaming ─────────────────────────────────────────────
// Streams tokens to the client as they arrive — first word in ~300ms instead of
// waiting 5–15s for the full response. Same approach used by Claude.ai, ChatGPT,
// and DeepSeek.
//
// SSE protocol:
//   data: {"t":"d","v":"token"}          ← content delta
//   data: {"t":"done","model":"spark",   ← stream complete
//           "mode":"default","fallback":false}
//   data: {"t":"err","v":"message"}      ← unrecoverable error
app.post('/api/kie', authenticate, async (req, res) => {
  const { messages, mode = 'default', model = 'spark', resumeContext = '', userCategory = '' } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  // ── Plan gate: monthly message limit + model access + mode access ────────────
  const planKey = await getUserPlanKey(req.user.uid);
  const planCfg = getPlanConfig(planKey);

  // Block creative mode and web search for free users
  if (mode === 'creative' && !planCfg.kieCreativeMode) {
    return res.status(403).json({
      error: 'mode_locked',
      message: UPGRADE_MESSAGES.kieCreativeMode(),
    });
  }
  if (mode === 'web' && !planCfg.kieWebSearch) {
    return res.status(403).json({
      error: 'mode_locked',
      message: UPGRADE_MESSAGES.kieWebSearch(),
    });
  }

  // Monthly message limit check — runs BEFORE any AI call
  const usage = await checkAndIncrementKieUsage(req.user.uid, planKey);
  if (!usage.allowed) {
    return res.status(403).json({
      error:      'limit_reached',
      message:    UPGRADE_MESSAGES.kieLimit(planKey),
      isTopup:    planKey !== 'free',
      topupInfo:  planKey !== 'free' ? {
        messages:  planCfg.topupMessages,
        priceUSD:  planCfg.topupPriceUSD,
        message:   TOPUP_MESSAGES[planKey],
      } : null,
    });
  }

  // Model selection: user picks within what their plan allows; anything above
  // their plan's ceiling is silently capped to the plan's default model.
  const requestedModel     = KIE_MODELS[model] ? model : planCfg.kieModel;
  const planAllowsModel    = planCfg.models.includes(requestedModel);
  const effectiveModel     = planAllowsModel ? requestedModel : planCfg.kieModel;
  const modelWasDowngraded = !planAllowsModel;

  const effectiveMode  = resolveMode(messages, mode);
  const cfg            = KIE_MODES[effectiveMode] || KIE_MODES.default;
  const m              = KIE_MODELS[effectiveModel];
  const tier           = KIE_TIERS[effectiveModel] || KIE_TIERS.spark;

  const tierTokenBonus = effectiveMode === 'quick' ? 0 : tier.tokenBonus;
  const effectiveCfg   = { ...cfg, max_tokens: cfg.max_tokens + tierTokenBonus };

  // ── Build system content ──────────────────────────────────────────────────
  let systemContent = cfg.system + `\n${tier.system}`;

  // ── Model Voice — each tier has a distinct personality ──────────────────
  const MODEL_VOICE = {
    spark: `\n\nVOICE — KIE SPARK: Be fast, sharp, straight to the point. Short answers unless depth is needed. No filler phrases. Think sharp friend not corporate coach. One clear next step per response. Warm but efficient.`,
    core:  `\n\nVOICE — KIE CORE: Be smart, warm, genuinely invested. Balance depth with clarity. Feel like a senior colleague who wants them to win. Acknowledge feelings before advice when user seems stressed. One focused question when you need context.`,
    nova:  `\n\nVOICE — KIE NOVA: Be an elite career strategist. Deep analysis, specific insight, sophisticated framing. Spot patterns others miss and name them. Speak with quiet confidence. Reference their specific situation precisely — no generic advice. Anticipate what they should be asking but haven't yet.`,
    ultra: `\n\nVOICE — KIE ULTRA: Be the pinnacle of career intelligence. Extraordinary depth and precision. Reframe questions to something better when needed. Draw connections across their entire career picture. Think three steps ahead. Communicate with the authority of the best career advisor they have ever had.`,
  };
  systemContent += MODEL_VOICE[effectiveModel] || MODEL_VOICE.spark;

  systemContent += `\n\nTEMPLATE NAME LOCK: Kievora has EXACTLY 13 templates and no others: Classic, Modern, Bold, Minimal, Vivid, Elegant, Slate, Coral, Split, Ink, Executive, Nova, Tribune. Never invent, guess, or reference any template name outside this exact list — there is no "Onyx" or any other name. A "template" is a visual layout applied to a saved Kievora resume file; it is NOT something you can apply by formatting text in chat. If you don't know which template (if any) is active, don't name one — just don't mention a template name at all.`;

  if (resumeContext === 'NO_RESUME_YET') {
    systemContent += `\n\nCOACHING CONTEXT: This user hasn't built or uploaded a resume yet. Coach them on whatever they ask. When it fits naturally (not every message), mention that they can build a resume on Kievora or upload a PDF/image with the 📎 button for more personal coaching.`;
  } else if (resumeContext === 'HAS_RESUMES_UNSELECTED') {
    systemContent += `\n\nCOACHING CONTEXT: This user has saved resumes but hasn't selected one. Answer helpfully, then mention once — naturally, not pushy — that selecting a resume from the picker lets you give specific coaching.`;
  } else if (resumeContext && resumeContext.trim().length > 20) {
    const isSavedKievoraResume = resumeContext.includes("=== USER'S CURRENT RESUME ===");
    systemContent += `\n\n--- USER'S RESUME (coach based on this specific content) ---\n${resumeContext.trim()}\n--- END RESUME ---`;
    if (isSavedKievoraResume) {
      systemContent += `\n\nFILE STATUS: This is a Kievora-built resume — it has a real template applied (see the "Template:" line above) and a real downloadable PDF behind it, handled outside of this chat. If asked to download/send/resend it, just confirm warmly — the actual file delivery is handled by the product, not by you writing a code block.`;
    } else {
      systemContent += `\n\nFILE STATUS: This resume came from an UPLOADED file — it is raw extracted text with NO Kievora template applied and NO real downloadable PDF behind it. Never claim a template (any name, including ones from the list above) has been applied to it — that's not possible for raw uploaded text. Never say you've "generated," "formatted," or "created" a downloadable file from it, and never say anything like "I'm a language model and can't send files" — that breaks character and isn't even true of this product. If the user asks to download it, get it as a file, or apply a template to it: in one or two warm sentences, tell them you can rebuild it into a real, editable Kievora resume they can style with any of the 13 templates and download as an actual PDF — and invite them to say "build me a resume" to do that. Do not paste the resume text into a code block and present it as a finished document.`;
    }
  }

  if (userCategory) {
    systemContent += `\n\nUSER CONTEXT: This user's professional field is "${userCategory}". Don't announce that you know this — just let it shape your answer naturally.`;
  }

  // ── Intelligence Merge Layer ──────────────────────────────────────────────
  // Loads conversation summary + Gmail brain in parallel, then gives KIE
  // explicit rules on how to weave both together naturally.
  const { convId = null } = req.body;
  const [convSummary, gmailBrain, gmailRaw] = await Promise.all([
    convId ? getConvSummary(req.user.uid, convId) : Promise.resolve(null),
    getGmailCareerBrain(req.user.uid),
    getGmailCareerBrainRaw(req.user.uid),
  ]);

  // ── Conversation understanding ───────────────────────────────────────────
  if (convSummary) {
    let sb = `\n\nCONVERSATION CONTEXT — what this chat is really about:`;
    sb += `\nTopic: ${convSummary.topic||'general career coaching'}`;
    if (convSummary.userSituation)  sb += `\nSituation: ${convSummary.userSituation}`;
    if (convSummary.emotionalState) sb += `\nEmotional state: ${convSummary.emotionalState}`;
    if (convSummary.keyFacts?.length) sb += `\nKey facts: ${convSummary.keyFacts.join(', ')}`;
    if (convSummary.unresolved) sb += `\nUnresolved: ${convSummary.unresolved}`;
    systemContent += sb;
  } else {
    const sessionFacts = extractSessionFacts(messages);
    if (sessionFacts.length > 0)
      systemContent += `\n\nEARLY SESSION FACTS:\n- ${sessionFacts.join('\n- ')}`;
  }

  // ── Conversation anchor (re-inject first message if trimmed) ─────────────
  const conversationAnchor = getConversationAnchor(formattedMessages, trimmedMessages);
  if (conversationAnchor) systemContent += conversationAnchor;

  // ── Gmail + merge instructions ───────────────────────────────────────────
  if (gmailBrain) {
    systemContent += `\n\n${gmailBrain}`;
    const apps       = gmailRaw?.applications || [];
    const hasOffer   = apps.some(a=>a.status==='offer');
    const hasIntv    = apps.some(a=>a.status==='interview_invite');
    const hasCrit    = hasOffer || hasIntv;
    const topic      = convSummary?.topic || '';
    const emotion    = convSummary?.emotionalState || '';
    const jobRelated = /job|career|resume|interview|salary|offer|application|role|work|hire|recruit|apply/i.test(topic);
    const isStressed = ['stressed','anxious','frustrated','confused'].includes(emotion);

    systemContent += `\n\nINTELLIGENCE MERGE — follow these silently, never announce them:`;
    if (hasCrit) systemContent += `\nCRITICAL: ${hasOffer?'Job offer':'Interview invite'} detected. Surface this naturally in your response even if the question is unrelated. Don't ignore it.`;
    if (jobRelated && gmailBrain) systemContent += `\nALIGNED: Conversation and Gmail both relate to job search. Weave them together naturally — reference specific companies and timelines from Gmail when relevant.`;
    if (!jobRelated && !hasCrit) systemContent += `\nOFF-TOPIC: User is asking about something unrelated to their active job search. Answer their question fully first. Only bridge to Gmail if there is a clear genuine connection — never forced.`;
    if (isStressed) systemContent += `\nEMOTION: User is ${emotion}. Lead with acknowledgement before advice. Gmail context supports the response, it does not replace the human moment.`;
    systemContent += `\nCORE: You naturally know everything — conversation history, job search, Gmail situation. Never say "I can see from your Gmail" or "based on your data". Just know it like a coach who has been watching closely.`;
  }


  console.log(`POST /api/kie [SSE] — model:${effectiveModel}(${m.model}) mode:${effectiveMode} msgs:${trimmedMessages.length} hasImage:${messages.some(msg => msg.imageBase64)}`);

  // ── Set SSE headers ───────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Render/nginx proxy buffering
  res.flushHeaders();

  const sendSSE = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // ── Real live web search (BUG FIX — this used to be entirely fake) ─────────
  // Web Search mode previously just told the model "pretend you might know
  // current info, but you have no internet access." Now it runs an actual
  // search BEFORE generation starts, streams a 'search'/'searchdone' SSE event
  // so the client can show a real (not time-faked) searching indicator, and
  // grounds the system prompt in the real results. This also fires outside
  // Web Search mode when the question is clearly time-sensitive (salary,
  // "is X still hiring", "this year", etc.) — same auto-browse behavior
  // Claude.ai/ChatGPT use instead of requiring the user to flip a switch.
  const lastUserMsgRaw = [...messages].reverse().find(mm => mm.role === 'user');
  const lastUserMessage = typeof lastUserMsgRaw?.content === 'string' ? lastUserMsgRaw.content : '';
  const wantsSearch = shouldSearchWeb(effectiveMode, lastUserMessage);
  if (wantsSearch) {
    const searchConfigured = !!process.env.TAVILY_API_KEY;
    if (searchConfigured) {
      const searchQuery = buildSearchQuery(lastUserMessage);
      sendSSE({ t: 'search', v: searchQuery });
      const searchResults = await performWebSearch(searchQuery);
      const sourcesList = searchResults
        ? searchResults.map(r => ({ title: r.title, url: r.url }))
        : [];
      sendSSE({ t: 'searchdone', count: sourcesList.length, sources: sourcesList });
      systemContent += buildSearchContextBlock(searchQuery, searchResults, true);
    } else {
      systemContent += buildSearchContextBlock('', null, false);
    }
  }

  // Advisory-only nudge — never silently switches mode. See suggestDeepMode().
  const modeSuggestion = suggestDeepMode(effectiveMode, lastUserMessage) ? 'deep' : null;

  let fullReply     = '';
  let streamStarted = false;

  // Text-only messages for the Spark fallback (Groq has no vision)
  const textOnlyMessages = trimmedMessages.map(msg => ({
    role:    msg.role,
    content: typeof msg.content === 'string'
      ? msg.content
      : (msg.content?.find?.(b => b.type === 'text')?.text || ''),
  }));

  // Fire-and-forget Firestore logging — strips imageBase64 to prevent
  // 1 MB document-size limit violations (Bug #4 fix)
  const doLogging = (replyText, usedModel, usedMode) => {
    const _uid = req.user.uid;
    db.collection('analyticsEvents').add({
      event: 'kie_chat', feature: 'kie_chat',
      userId: _uid, userName: req.user.name || req.user.email || null,
      model: usedModel, mode: usedMode,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});

    // Strip imageBase64 — base64 images can be hundreds of KB each and would
    // blow past Firestore's 1 MB document limit silently
    const safeMessages = messages.map(msg => {
      if (!msg.imageBase64) return msg;
      const { imageBase64: _dropped, ...rest } = msg;
      return { ...rest, imageName: msg.imageName || 'image', imageType: msg.imageType };
    });
    db.collection('kieLogs').doc(_uid).collection('conversations').add({
      title:        safeMessages[0]?.content?.slice?.(0, 50) || 'Chat',
      messages:     [...safeMessages, { role: 'assistant', content: replyText }],
      model:        usedModel,
      mode:         usedMode,
      messageCount: safeMessages.length + 1,
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  };

  try {
    await callKieAIStream(effectiveModel, systemContent, trimmedMessages, effectiveCfg, (token) => {
      fullReply += token;
      streamStarted = true;
      sendSSE({ t: 'd', v: token });
    });
    sendSSE({
      t: 'done', model: effectiveModel, mode: effectiveMode, fallback: false, modeSuggestion,
      planLimited:    modelWasDowngraded,
      upgradeMessage: modelWasDowngraded ? UPGRADE_MESSAGES.kieModel(planKey, requestedModel) : null,
      usageRemaining: usage.remaining, usageLimit: usage.limit,
    });
    res.end();
    doLogging(fullReply, effectiveModel, effectiveMode);

  } catch (err) {
    console.error('POST /api/kie stream error:', err.message);

    if (!streamStarted && effectiveModel !== 'spark') {
      // Primary model failed before sending any tokens — try Spark fallback
      console.log('[kie] falling back to KIE Spark (Groq)…');
      fullReply = '';
      try {
        await callKieAIStream('spark', systemContent, textOnlyMessages, { ...cfg }, (token) => {
          fullReply += token;
          sendSSE({ t: 'd', v: token });
        });
        sendSSE({ t: 'done', model: 'spark', mode: effectiveMode, fallback: true, modeSuggestion });
        res.end();
        doLogging(fullReply, 'spark', effectiveMode);
      } catch (fallbackErr) {
        console.error('[kie] fallback also failed:', fallbackErr.message);
        sendSSE({ t: 'err', v: 'KIE is unavailable right now. Please try again.' });
        res.end();
      }
    } else {
      if (fullReply.length > 0) {
        // Partial reply already streamed — close cleanly so client keeps what it got
        sendSSE({ t: 'done', model: effectiveModel, mode: effectiveMode, fallback: false, partial: true });
        doLogging(fullReply, effectiveModel, effectiveMode);
      } else {
        sendSSE({ t: 'err', v: 'KIE is unavailable right now. Please try again.' });
      }
      res.end();
    }
  }
});

// ─── POST /api/kie-intent — fast intent-classification safety net ─────────────
// Layer 2 of the hybrid intent system. The client's instant regex layer
// (detectKieIntent in dashboard.html) catches clean phrasings with zero added
// latency — that stays the fast path for the obvious cases. This endpoint
// catches the paraphrased/ambiguous ones the regex misses ("can you whip up a
// new one for a product role" → BUILD_RESUME_FROM_SCRATCH, etc). Runs on KIE
// Spark (Groq) for speed — typically 300–600ms — and is designed to fail
// closed to "NONE" on any uncertainty or error, since silently misrouting an
// ordinary coaching question into a file action is far worse than occasionally
// missing one (which just falls through to normal chat, same as today).
app.post('/api/kie-intent', authenticate, async (req, res) => {
  const { message, recentHistory = [], hasSelectedResume = false } = req.body;
  if (!message || typeof message !== 'string') {
    return res.json({ intent: 'NONE' });
  }

  const historyText = (Array.isArray(recentHistory) ? recentHistory : [])
    .slice(-8)
    .map(h => `${h.role === 'user' ? 'User' : 'KIE'}: ${(h.content || '').slice(0, 300)}`)
    .join('\n');

  const system = `You classify a single chat message into ONE resume-action intent, using the recent conversation for context. Respond with ONLY raw JSON, no markdown, no explanation.

Intents:
- "SEND_RESUME": user wants their EXISTING saved resume sent/downloaded as-is, no changes requested.
- "UPDATE_RESUME_AND_SEND": user wants a change made to their EXISTING resume (summary, experience, skills, education, etc.) AND then wants it sent/downloaded.
- "CHANGE_TEMPLATE": user wants to switch the visual template/design of their EXISTING resume, no content change.
- "BUILD_RESUME_FROM_SCRATCH": user wants a brand NEW resume built/created/generated from a description (a role, background, situation) — not an edit to something they already have.
- "NONE": anything else — general career coaching, a question, small talk, or too ambiguous to be confident.

Rules:
- If genuinely unsure, return "NONE" — a missed action is far cheaper than wrongly hijacking a normal coaching question.
- hasSelectedResume tells you whether the user currently has a resume selected in this chat. If false, "SEND_RESUME"/"UPDATE_RESUME_AND_SEND"/"CHANGE_TEMPLATE" are unlikely to be right — lean toward "BUILD_RESUME_FROM_SCRATCH" or "NONE" instead.
- For "CHANGE_TEMPLATE", set templateName to whatever template name the user mentioned, or null if none was named.
- For "BUILD_RESUME_FROM_SCRATCH", set resumeBrief to a short, clean brief (role, experience, industry) combining what they want built — pull details from the conversation if the message itself didn't include them. If there's truly nothing usable anywhere, still return "BUILD_RESUME_FROM_SCRATCH" with whatever's available — the client asks for more detail if it's too thin.

Return exactly: {"intent":"...","templateName":null,"resumeBrief":null}`;

  const userPrompt = `hasSelectedResume: ${hasSelectedResume}

Recent conversation:
${historyText || '(none)'}

Latest message to classify: "${message}"`;

  try {
    const raw = await callKieAI('spark', system, [{ role: 'user', content: userPrompt }], { max_tokens: 150, temperature: 0.1 });
    const parsed = parseAIJson(raw);
    const validIntents = ['SEND_RESUME', 'UPDATE_RESUME_AND_SEND', 'CHANGE_TEMPLATE', 'BUILD_RESUME_FROM_SCRATCH', 'NONE'];
    if (!validIntents.includes(parsed.intent)) parsed.intent = 'NONE';
    res.json(parsed);
  } catch (err) {
    console.error('POST /api/kie-intent ERROR:', err.message);
    res.json({ intent: 'NONE' }); // fail closed — never block normal chat on a classifier error
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

    // ── Admin logging (fire-and-forget) ──────────────────────────────────────
    db.collection('supportChats').add({
      messages:  [...messages, { role: 'assistant', content: reply }],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  } catch (err) {
    console.error('POST /api/kie-support error:', err.message);
    res.status(500).json({ error: 'Failed to reach KIE. Please try again.' });
  }
});

// ─── POST /api/analyze-resume ──────────────────────────────────────────────────
app.post('/api/analyze-resume', authenticate, async (req, res) => {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(503).json({ error: 'AI analysis not configured.' });

  // Gate: free users get basic analysis back but the response is flagged so
  // the frontend can show the "upgrade to see your score" prompt.
  const planKey = await getUserPlanKey(req.user.uid);
  const planCfg = getPlanConfig(planKey);
  const isFreePlan = planKey === 'free';

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

    console.log(`POST /api/analyze-resume — score:${analysis.atsScore} grade:${analysis.grade} plan:${planKey} uid:${req.user.uid}`);
    // Free plan: strip explanation fields and return an upgrade gate flag.
    // The score number is intentionally omitted too — they see "analyzed" but
    // must upgrade to see it. This creates the "show the wound, sell the cure" moment.
    if (isFreePlan) {
      return res.json({
        fullName:   analysis.fullName,
        jobTitle:   analysis.jobTitle,
        gateLocked: true,
        upgradeMessage: UPGRADE_MESSAGES.resumeUpload(),
      });
    }
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
  // Plan gate: free users can see the listing cards but can't open/apply to jobs.
  // We still run the search and return the jobs — but free-user responses have
  // url stripped and a gateLocked flag, so the frontend replaces the "Apply" CTA
  // with an upgrade prompt. This way free users feel the value before hitting the wall.
  const planKey = await getUserPlanKey(req.user.uid);
  const canClick = getPlanConfig(planKey).findJobsClick;

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
  if (!canClick) {
    // Free users: return listings but strip apply URLs and add upgrade gate
    const gatedJobs = jobs.map(({ url, ...rest }) => rest); // eslint-disable-line no-unused-vars
    return res.json({ jobs: gatedJobs, gateLocked: true, upgradeMessage: UPGRADE_MESSAGES.findJobs() });
  }
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
  const { prompt } = req.body;
  // Plan gate: tool hub — check the user's plan allows this tool
  const _planKey = await getUserPlanKey(req.user.uid);
  const _planCfg = getPlanConfig(_planKey);
  if (!_planCfg.tools.includes('aibuild')) {
    return res.status(403).json({ error: 'plan_locked', message: UPGRADE_MESSAGES.tool(_planKey) });
  }

  const model = 'spark'; // ALL tools always use Groq Spark — permanent
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
  const m   = KIE_MODELS[model] ? model : 'nova';

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
- Everything must be specific to the actual roles — no generic advice`;

  const cfg = { max_tokens: 2000, temperature: 0.65 };
  const m   = KIE_MODELS[model] ? model : 'nova';
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
- youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them where they likely sit in this range given their experience level, the ONE factor most likely to move them toward the top of the range, and a concrete next step (e.g. a number to anchor on, a skill to highlight, or a location/remote angle to consider) — make it feel like advice from a friend who has their back in a negotiation`;

  const cfg = { max_tokens: 1200, temperature: 0.45 };
  const m   = KIE_MODELS[model] ? model : 'nova';
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
- youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Translate this industry snapshot into what it means for SOMEONE BUILDING A CAREER here right now — name the single skill or move that would position them best given where this industry is heading, and what that could mean for their job security or growth`;

  const cfg = { max_tokens: 1800, temperature: 0.6 };
  const m   = KIE_MODELS[model] ? model : 'nova';

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
- youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them, compared to their current headline/about, what changing to the optimized version will actually do for them (e.g. how it changes who finds them and what recruiters assume about them at a glance), and the ONE edit to make first if they only do one thing today`;

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
- framework: recommended answer framework (e.g. "STAR Method", "Past-Present-Future", "Problem-Action-Result")`;

  const prev = previousQuestions.length ? `\nDo NOT repeat or closely paraphrase these: ${previousQuestions.slice(-5).join(' | ')}` : '';
  const cfg = { max_tokens: 800, temperature: 0.85 };
  const m   = KIE_MODELS[model] ? model : 'nova';

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
- youTakeaway: 2-3 sentences written DIRECTLY to the candidate ("You..."/"Your..."). Reference something specific they actually said, tell them honestly how that would land in a real interview, and give them ONE thing to fix before the next question that would make the biggest difference`;

  const cfg = { max_tokens: 1400, temperature: 0.55 };
  const m   = KIE_MODELS[model] ? model : 'nova';

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
- youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them what makes this brand package distinctly THEIRS (referencing something specific from their background if provided), where to use it first for the biggest impact, and the one habit that will keep this brand consistent across their profiles`;

  const cfg = { max_tokens: 1800, temperature: 0.82 };
  const m   = KIE_MODELS[model] ? model : 'nova';
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
- verdict: 2-3 sentence honest, big-picture career health verdict — the "bottom line" if they only read one thing`;

  const cfg = { max_tokens: 1800, temperature: 0.45 };
  const m   = KIE_MODELS[model] ? model : 'nova';
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
- leadershipTips: 4 leadership-specific tips for this exact transition`;

  const cfg = { max_tokens: 1800, temperature: 0.6 };
  const m   = KIE_MODELS[model] ? model : 'nova';
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
- youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Tell them which of the two versions fits their situation best and why, plus the single most important thing to do AFTER sending (timing of follow-up, what to prep for, etc.)`;

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
- verdict: 2-3 sentence recruiter's blunt assessment`;

  const cfg = { max_tokens: 1500, temperature: 0.5 };
  const m   = KIE_MODELS[model] ? model : 'nova';
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
- youTakeaway: 2-3 sentences written DIRECTLY to the candidate ("You..."/"Your..."). Tell them honestly whether this is worth applying to and why, the ONE change to their resume that would raise this score the most before they hit submit, and what to lean on in a cover letter or interview given this specific match`;

  const cfg = { max_tokens: 1200, temperature: 0.4 };
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
- youTakeaway: 2-3 sentences written DIRECTLY to the person ("You..."/"Your..."). Reassure them this letter strikes the right tone for leaving on good terms, and tell them the ONE thing to handle carefully in the days right after sending it (e.g. the conversation with their manager, timing of the announcement, or protecting references)`;

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

// ─── POST /api/approve-submission ─────────────────────────────────────────────
// Admin-only. Atomically:
//   1. Copies the submission to `articles` with status:'published'
//      — remaps userId → authorUid, stores authorUsername for @username nav
//   2. Updates the submission doc → status:'approved'
//   3. Busts the author's feed cache so followers see the article immediately
app.post('/api/approve-submission', authenticate, async (req, res) => {
  const callerUid = req.user.uid;
  try {
    const adminDoc = await db.collection('admins').doc(callerUid).get();
    if (!adminDoc.exists) return res.status(403).json({ error: 'Forbidden: admin access required.' });
  } catch {
    return res.status(403).json({ error: 'Could not verify admin status.' });
  }

  const { submissionId, reviewNote = '' } = req.body;
  if (!submissionId) return res.status(400).json({ error: 'submissionId is required.' });

  try {
    const subRef  = db.collection('submissions').doc(submissionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) return res.status(404).json({ error: 'Submission not found.' });

    const sub = subSnap.data();
    if (sub.status === 'approved') return res.status(409).json({ error: 'Already approved.' });

    const now = admin.firestore.FieldValue.serverTimestamp();

    const articleDoc = {
      id:             submissionId,
      title:          sub.title          || '',
      brief:          sub.brief          || '',
      body:           sub.body           || '',
      cat:            sub.cat            || 'CAREERS',
      cover:          sub.cover          || '',
      readTime:       sub.readTime       || '5 min read',
      // Both field names kept — userId for backward compat, authorUid for following-feed query
      userId:         sub.userId         || '',
      authorUid:      sub.userId         || '',
      authorName:     sub.authorName     || '',
      authorPhoto:    sub.authorPhoto    || '',
      authorUsername: sub.authorUsername || '',   // needed for @username nav in article-read
      authorBio:      sub.authorBio      || '',
      status:         'published',
      publishedAt:    now,
      createdAt:      sub.createdAt      || now,
      likes:          0,
      saves:          0,
    };

    const batch = db.batch();
    batch.set(db.collection('articles').doc(submissionId), articleDoc);
    batch.update(subRef, {
      status:     'approved',
      reviewNote: reviewNote,
      approvedAt: now,
      approvedBy: callerUid,
    });
    await batch.commit();

    // Bust author's feed cache so followers see the new article immediately
    bustFeedCache(sub.userId);

    console.log(`✅ /api/approve-submission — id:${submissionId} author:${sub.userId} by:${callerUid}`);
    res.json({ success: true, articleId: submissionId });

  } catch (err) {
    console.error('POST /api/approve-submission ERROR:', err.message);
    res.status(500).json({ error: 'Approval failed: ' + err.message });
  }
});

// ─── POST /api/reject-submission ──────────────────────────────────────────────
// Admin-only. Updates submission status → 'rejected' with a review note.
app.post('/api/reject-submission', authenticate, async (req, res) => {
  const callerUid = req.user.uid;
  try {
    const adminDoc = await db.collection('admins').doc(callerUid).get();
    if (!adminDoc.exists) return res.status(403).json({ error: 'Forbidden: admin access required.' });
  } catch {
    return res.status(403).json({ error: 'Could not verify admin status.' });
  }

  const { submissionId, reviewNote = '' } = req.body;
  if (!submissionId) return res.status(400).json({ error: 'submissionId is required.' });

  try {
    const subRef  = db.collection('submissions').doc(submissionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists) return res.status(404).json({ error: 'Submission not found.' });

    await subRef.update({
      status:     'rejected',
      reviewNote: reviewNote,
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectedBy: callerUid,
    });

    console.log(`❌ /api/reject-submission — id:${submissionId} by:${callerUid}`);
    res.json({ success: true });

  } catch (err) {
    console.error('POST /api/reject-submission ERROR:', err.message);
    res.status(500).json({ error: 'Rejection failed: ' + err.message });
  }
});

// ─── GET /api/admin/submissions ───────────────────────────────────────────────
// Admin-only. Returns submissions filtered by ?status=pending|approved|rejected|all
app.get('/api/admin/submissions', authenticate, async (req, res) => {
  const callerUid = req.user.uid;
  try {
    const adminDoc = await db.collection('admins').doc(callerUid).get();
    if (!adminDoc.exists) return res.status(403).json({ error: 'Forbidden.' });
  } catch {
    return res.status(403).json({ error: 'Could not verify admin status.' });
  }

  const status = req.query.status || 'pending';
  try {
    let q = db.collection('submissions').orderBy('createdAt', 'desc');
    if (status !== 'all') q = q.where('status', '==', status);
    const snap = await q.limit(100).get();
    const submissions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ submissions });
  } catch (err) {
    console.error('GET /api/admin/submissions ERROR:', err.message);
    res.status(500).json({ error: 'Could not load submissions: ' + err.message });
  }
});

// ─── Page Routes ───────────────────────────────────────────────────────────────
app.get('/',          (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/index',     (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
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
app.get('/seed-articles', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'seed-articles.html')));
app.get('/write',     (_req, res) => res.sendFile(path.join(__dirname, 'public', 'write.html')));
app.get('/settings',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));
app.get('/insights',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'insights.html')));
app.get('/billing',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'billing.html')));
app.get('/kievora-profile', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'kievora-profile.html')));

// ─── Clean profile URLs: /profile  or  /profile/@username ─────────────────────
app.get('/profile',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/profile/@:username', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));

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
