// ═══════════════════════════════════════════════════════════════════════════
// server/billing.js — Plan config, live currency rates, upgrade copy, Paystack
// checkout/verify/topup, and the health-check endpoint.
// ═══════════════════════════════════════════════════════════════════════════
module.exports = function registerBillingRoutes(app) {
  const {
    admin, db, authenticate,
    PLANS, DEFAULT_PLAN, getPlanConfig, getUserPlanKey,
    getExchangeRates, getUsdToNgnRate, COUNTRY_CURRENCY,
    UPGRADE_MESSAGES, TOPUP_MESSAGES,
    applyPaystackMetadata,
    USERS, RESUMES, getCycleAnchorDate, getCycleStart, serviceAccount,
  } = require('./lib');


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
  // (kieLimit | kieModel | tool | atsChecker | resumeOptimize | recruiterView | findJobs |
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
      const sameCycle        = usage.aiCreditsCycleStart === cycleStartKey;
      const creditsUsed      = sameCycle ? (usage.aiCreditsUsed || 0) : 0;
      const creditsTopupLeft = sameCycle ? (usage.aiCreditsTopup || 0) : 0;
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
          aiCreditsUsed: creditsUsed,
          aiCreditBudget: cfg.aiCreditBudget,
          aiCreditsRemaining: Math.max(0, cfg.aiCreditBudget - creditsUsed),
          aiCreditsTopupLeft: creditsTopupLeft,
        },
        topup: cfg.topupPriceUSD ? {
          priceUSD:  cfg.topupPriceUSD,
          credits:   cfg.topupCredits,
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
            topupCredits:  cfg.topupCredits,
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
}; // end registerBillingRoutes
