// ═══════════════════════════════════════════════════════════════════════════
// server/lib.js — Shared config, Firebase/Cloudinary/Gmail-OAuth setup, and every
// helper function used by more than one route module (plans/billing math, the
// KIE AI callers, Gmail parsing/sync helpers, email senders, conversation
// summaries, auth middleware). Nothing in here touches `app` directly — this
// is pure config + logic, required by server/index.js and every route module.
// ═══════════════════════════════════════════════════════════════════════════
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
    model:    'claude-sonnet-5',
  },
  ultra: {
    label:    'KIE Ultra',
    tagline:  'Elite Coaching Engine',
    badge:    'Elite',
    provider: 'anthropic',
    model:    'claude-opus-4-8',
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
    gmail: false,
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
    gmail: false,
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
    gmail: true,
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
  // Gmail AI — Premier-exclusive inbox tracking
  gmail: () => `Gmail AI is a Premier-exclusive feature — connect your inbox and let KIE auto-track applications, interviews, and recruiter emails. Upgrade to $15 to unlock it.`,
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

// ─── Brevo Signup OTP Email (templateId 2) ─────────────────────────────────────
// Used only for email/password signups — Google signups already come with a
// verified email from Firebase, so they skip this entirely.
async function sendOtpEmail(email, name, otp) {
  const brevoKey = process.env.BREVO_API_KEY;
  if (!brevoKey) {
    console.warn('⚠️  BREVO_API_KEY not set — skipping OTP email for', email);
    return false;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey,
      },
      body: JSON.stringify({
        sender:     { email: 'support@kievora.app', name: 'Kievora' },
        to:         [{ email, name }],
        templateId: 2,
        params:     { name, otp },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('❌ Brevo OTP email failed:', res.status, errBody);
      return false;
    }
    console.log(`✅ OTP email sent → ${email}`);
    db.collection('emailLogs').add({
      email, name, type: 'otp', success: true,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
    return true;
  } catch (err) {
    console.error('❌ Brevo sendOtpEmail error:', err.message);
    return false;
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
        sender:     { email: 'support@kievora.app', name: 'Kievora' },
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

// Sunday digest — only sent if there's actually something to report, and only
// to users who haven't opted out (digestOptOut field, default false/on, since
// connecting Gmail is itself an opt-in signal they want to be kept posted).
async function sendWeeklyDigest(email, name, apps) {
  const brevoKey = process.env.BREVO_API_KEY;
  if (!brevoKey || !email || !apps || !apps.length) return;
  try {
    const newThisWeek = apps.filter(a => (Date.now()-a.firstSeenTs) < 7*86400000);
    const interviews  = apps.filter(a=>a.status==='interview_invite');
    const offers      = apps.filter(a=>a.status==='offer');
    const goingStale  = apps.filter(a=>a.nextState==='needs_followup'||a.nextState==='needs_followup_again');
    // Nothing new, nothing urgent, nothing stale — skip. A digest with literally
    // zero news is exactly the kind of unwanted noise that makes people opt out.
    if (!newThisWeek.length && !interviews.length && !offers.length && !goingStale.length) return;

    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;color:#0f0e17;line-height:1.6">
      <h2 style="color:#7c3aed;margin-bottom:4px">Your week on Kievora</h2>
      <p style="color:#475569">Hey ${name||'there'}, here's what happened in your job search this week:</p>
      <ul style="padding-left:18px;color:#0f0e17">
        <li><b>${newThisWeek.length}</b> new application${newThisWeek.length===1?'':'s'} tracked</li>
        <li><b>${interviews.length}</b> interview${interviews.length===1?'':'s'} active</li>
        <li><b>${offers.length}</b> offer${offers.length===1?'':'s'} pending response</li>
        <li><b>${goingStale.length}</b> going stale — could use a follow-up</li>
      </ul>
      <a href="https://kievora.onrender.com/dashboard" style="background:#7c3aed;color:#fff;padding:11px 20px;border-radius:9px;text-decoration:none;display:inline-block;margin-top:10px;font-weight:600">Open Kievora</a>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px">You're getting this because Gmail Intelligence is connected — manage it anytime from Settings.</p>
    </div>`;
    const subject = offers.length ? `🎉 You have an offer — plus your week on Kievora`
      : interviews.length ? `⚡ ${interviews.length} interview${interviews.length===1?'':'s'} active — your week on Kievora`
      : `Your job search this week: ${newThisWeek.length} new, ${goingStale.length} need follow-up`;
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:'POST', headers:{'Content-Type':'application/json','api-key':brevoKey},
      body: JSON.stringify({ sender:{email:'support@kievora.com',name:'Kievora'}, to:[{email,name:name||email}], subject, htmlContent:html })
    });
    if (res.ok) db.collection('emailLogs').add({ email, type:'gmail_weekly_digest', success:true, sentAt:admin.firestore.FieldValue.serverTimestamp() }).catch(()=>{});
    else console.error('[digest] Brevo failed:', res.status, await res.text());
  } catch(e) { console.error('[digest]', e.message); }
}

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
    const { company, role, emailType, ts, subject, interviewAt, interviewDurationMin, threadId } = email;
    if (!company) continue;
    const existing = apps.find(a=>isSameApplication(a,{company,role}));
    const event    = { date: ts.toISOString().split('T')[0], type:emailType, subject, threadId: threadId||null };
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

// ─── Gmail Pipeline Intelligence (stats + a real state machine) ───────────────
// Additive only — reads the same `apps` shape buildApplicationList() already
// produces, doesn't change Firestore schema or touch any resume/cover-letter code.
const GPIPE_STALE_DAYS      = 14; // no movement for this long → first nudge fires
const GPIPE_FOLLOWUP_GRACE  = 7;  // after sending a follow-up, give it this long before nagging again
const GPIPE_STALL_STATUSES  = ['application_confirmation','recruiter_outreach','assessment'];

// Figures out what's actually next for one application, given its current
// email-derived status AND whatever the user has already done about it
// (tracked separately in Firestore — see mark-action route below). This is
// the piece that stops the same nudge firing forever after it's been handled.
function computeNextAction(a, action) {
  const followUpCount  = action?.followUpCount  || 0;
  const calendarAdded  = !!action?.calendarAdded;
  const resumeTailored = !!action?.resumeTailored;
  const lastFollowUpAt = action?.lastFollowUpAt?.toDate ? action.lastFollowUpAt.toDate()
                        : (action?.lastFollowUpAt ? new Date(action.lastFollowUpAt) : null);
  const base = { followUpCount, calendarAdded, resumeTailored };

  if (a.status === 'offer')            return { ...base, state:'respond_offer',  label:'Respond to offer' };
  if (a.status === 'interview_invite') return { ...base, state:'prep_interview', label: calendarAdded ? 'Added to calendar' : 'Prep for interview' };
  if (a.status === 'rejection')        return { ...base, state:'closed',         label:null };
  if (!GPIPE_STALL_STATUSES.includes(a.status)) return { ...base, state:'active', label:null };

  // application_confirmation / recruiter_outreach / assessment — the group that can go stale
  if (a.daysSince <= GPIPE_STALE_DAYS && followUpCount === 0)
    return { ...base, state:'fresh', label:null };

  if (followUpCount === 0)
    return { ...base, state:'needs_followup', label:'Send a follow-up' };

  const daysSinceFollowUp = lastFollowUpAt ? Math.floor((Date.now()-lastFollowUpAt.getTime())/86400000) : null;
  if (daysSinceFollowUp !== null && daysSinceFollowUp < GPIPE_FOLLOWUP_GRACE)
    return { ...base, state:'waiting', label:`Waiting on reply (followed up ${daysSinceFollowUp<=0?'today':daysSinceFollowUp+'d ago'})` };

  return { ...base, state:'needs_followup_again', label:'Send another follow-up' };
}

async function attachStaleFlags(apps, uid) {
  const now = Date.now();
  let actionMap = {};
  try {
    const snap = await db.collection('users').doc(uid).collection('gmailBrain').doc('actions').collection('apps').get();
    snap.forEach(d => { actionMap[d.id] = d.data(); });
  } catch(e) { /* no actions yet — fine, treat as fresh */ }
  return apps.map(a => {
    const daysSince = Math.floor((now - a.lastActivityTs) / 86400000);
    const appId  = normaliseStr(a.company);
    const next   = computeNextAction({ ...a, daysSince }, actionMap[appId]);
    return { ...a, daysSince, appId,
      stale: next.state==='needs_followup' || next.state==='needs_followup_again',
      nextState: next.state, nextAction: next.label,
      followUpCount: next.followUpCount, calendarAdded: next.calendarAdded, resumeTailored: next.resumeTailored };
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

// ─── Trend tracking ─────────────────────────────────────────────────────────
// Stats are a live snapshot — "right now". To say anything like "your interview
// rate is up this month" needs actual history, so every sync writes one row per
// ISO week (overwritten if synced again same week, never duplicated).
function getWeekKey(d = new Date()) {
  const date = new Date(d.getTime());
  date.setUTCHours(0,0,0,0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay()+6)%7)); // back up to Monday (UTC)
  return date.toISOString().split('T')[0];
}

async function recordPipelineTrend(uid, stats) {
  try {
    await db.collection('users').doc(uid).collection('gmailBrain').doc('trends').collection('weeks').doc(getWeekKey())
      .set({ interviewRate: stats.interviewRate, offerRate: stats.offerRate, total: stats.total, recordedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
  } catch(e) { /* non-critical — trend just won't have this week's point */ }
}

// Compares current stats against the OLDEST snapshot on file (capped at the
// last 12 weeks) — returns null until there's genuinely at least 2 weeks of
// history, rather than reporting a misleading "trend" off a single data point.
async function getTrendComparison(uid, currentStats) {
  try {
    const snap = await db.collection('users').doc(uid).collection('gmailBrain').doc('trends').collection('weeks').orderBy('recordedAt','asc').limitToLast(12).get();
    const weeks = snap.docs.map(d=>d.data());
    if (weeks.length < 2) return null;
    const oldest = weeks[0];
    return {
      interviewRateChange: currentStats.interviewRate - (oldest.interviewRate||0),
      offerRateChange:     currentStats.offerRate - (oldest.offerRate||0),
      sinceWeeks: weeks.length,
    };
  } catch(e) { return null; }
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

function buildKieBrainBlock(apps, insights, emailsScanned, patterns) {
  if (!apps.length) return `GMAIL CAREER INTELLIGENCE: Gmail connected (${emailsScanned} emails scanned). No career emails found yet — will update as they arrive.`;
  const active     = apps.filter(a=>a.status!=='rejection');
  const rejected   = apps.filter(a=>a.status==='rejection');
  const offers     = apps.filter(a=>a.status==='offer');
  const interviews = apps.filter(a=>a.status==='interview_invite');
  let b = `GMAIL CAREER INTELLIGENCE (${emailsScanned} emails scanned):\n`;
  b += `Pipeline: ${apps.length} companies | Active: ${active.length} | Interviews: ${interviews.length} | Offers: ${offers.length} | Rejected: ${rejected.length}\n\n`;
  if (offers.length) b += `🔴 OFFER — ${offers[0].company}${offers[0].role?' ('+offers[0].role+')':''} — awaiting response\n`;
  if (interviews.length) {
    const i = interviews[0];
    const when = i.interviewAt ? ` scheduled ${new Date(i.interviewAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}` : '';
    b += `⚡ INTERVIEW — ${i.company}${i.role?' ('+i.role+')':''}${when} — prep needed\n`;
  }
  b += `\nAPPLICATIONS (current state — use this, don't suggest actions already done):\n`;
  for (const app of apps.slice(0,8)) {
    let line = `• ${app.company}${app.role?' — '+app.role:''}: ${app.status.replace(/_/g,' ')} (${app.daysSince}d ago)`;
    if (app.nextAction)            line += ` — NEXT: ${app.nextAction}`;
    if (app.followUpCount)         line += ` [followed up ${app.followUpCount}x already]`;
    if (app.calendarAdded)         line += ` [already on calendar]`;
    if (app.resumeTailored)        line += ` [resume already tailored for this]`;
    b += line + '\n';
  }
  if (insights.length) b += `\nACTIONS:\n${insights.map(i=>'• '+i).join('\n')}`;
  if (patterns?.length) b += `\nPATTERNS NOTICED ACROSS THEIR HISTORY:\n${patterns.map(p=>`• Tends to go quiet ${p.label} (${p.count} of ${p.total} that reached this stage, ${p.rate}%)`).join('\n')}`;
  b += `\n\nCOACHING RULES FOR THIS DATA:\n- Never say "I can see your Gmail" — just know it naturally\n- Reference companies by name like a coach who has been tracking this\n- Check follow-up/calendar/resume state before suggesting an action — if they already followed up or already added it to calendar, don't suggest it again\n- If user seems stressed — acknowledge feelings before advice\n- Weave Gmail data and conversation context together; never treat them as separate\n- Don't repeat the same unprompted nudge every turn once it's been said — see INTELLIGENCE MERGE rules for exactly when to surface vs stay quiet`;
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
  const enriched    = await attachStaleFlags(apps, uid);
  const patterns    = detectGhostingPattern(enriched);
  const kieBlock    = buildKieBrainBlock(enriched, insights, rawEmails.length, patterns);
  await recordPipelineTrend(uid, computePipelineStats(enriched));
  await db.collection('users').doc(uid).collection('gmailBrain').doc('summary').set(
    { applications:apps, insights, kieBlock, emailsScanned:rawEmails.length, lastSynced:admin.firestore.FieldValue.serverTimestamp() }
  );
  console.log(`[gmail] synced uid:${uid} — ${rawEmails.length} emails → ${apps.length} apps`);
  return { apps, enriched, insights, emailsScanned:rawEmails.length, stats: computePipelineStats(enriched) };
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

// Background Gmail auto-sync every 2 hours (also fires the Sunday digest)
setInterval(async()=>{
  try {
    const snap = await db.collection('users').where('gmailConnected','==',true).limit(50).get();
    const isDigestDay = new Date().getUTCDay() === 0; // Sunday, UTC
    const weekKey = getWeekKey();
    for (const doc of snap.docs) {
      const u = doc.data();
      const result = await syncGmailForUser(doc.id).catch(e=>{ console.error(`[gmail-cron] uid:${doc.id}:`,e.message); return null; });
      if (isDigestDay && result && !u.gmailDigestOptOut && u.lastDigestWeek !== weekKey) {
        await sendWeeklyDigest(u.email, u.name||u.displayName, result.enriched).catch(e=>console.error('[digest]',e.message));
        await db.collection('users').doc(doc.id).set({ lastDigestWeek: weekKey }, { merge:true }).catch(()=>{});
      }
      await new Promise(r=>setTimeout(r,2000));
    }
  } catch(e) { console.error('[gmail-cron]:',e.message); }
}, 2*60*60*1000);

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

module.exports = {
  getOAuthClient, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI, upload,
  admin, db, RESUMES, USERS,
  KIE_MODELS, KIE_TIERS, PLANS, DEFAULT_PLAN, getPlanConfig, getUserPlanKey,
  getCycleAnchorDate, getCycleStart, checkAndIncrementKieUsage,
  COUNTRY_CURRENCY, FX_FALLBACKS, getExchangeRates, getUsdToNgnRate,
  UPGRADE_MESSAGES, TOPUP_MESSAGES,
  callKieAI, callKieAIStream, fetchWithRetry,
  performWebSearch, buildSearchQuery, buildSearchContextBlock, shouldSearchWeb, suggestDeepMode, extractSessionFacts,
  sendWelcomeEmail, sendOtpEmail, sendWeeklyDigest,
  classifyCareerEmail, extractEmailEntities, extractInterviewDateTime, normaliseStr, isSameApplication,
  syncUserGmail, buildApplicationList, generateInsights, computeNextAction, attachStaleFlags, computePipelineStats,
  getWeekKey, recordPipelineTrend, getTrendComparison, detectGhostingPattern, buildKieBrainBlock,
  getGmailCareerBrainRaw, getGmailCareerBrain, getValidTokens, syncGmailForUser,
  generateConvSummary, saveConvSummary, getConvSummary,
  applyPaystackMetadata,
  authenticate,
  cloudinary,
  serviceAccount,
};
