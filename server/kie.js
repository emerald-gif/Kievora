// ═══════════════════════════════════════════════════════════════════════════
// server/kie.js — KIE AI chat engine: streaming proxy (/api/kie), fast intent
// classification (/api/kie-intent), the standalone Coach proxy (/api/coach),
// and the background conversation-summarize endpoint.
// ═══════════════════════════════════════════════════════════════════════════
module.exports = function registerKieRoutes(app) {
  const {
    admin, db, authenticate,
    KIE_MODELS, KIE_TIERS, PLANS, getPlanConfig, getUserPlanKey,
    checkAndIncrementKieUsage, UPGRADE_MESSAGES, TOPUP_MESSAGES,
    callKieAI, callKieAIStream, fetchWithRetry,
    performWebSearch, buildSearchQuery, buildSearchContextBlock, shouldSearchWeb, suggestDeepMode, extractSessionFacts,
    getGmailCareerBrain,
    generateConvSummary, saveConvSummary, getConvSummary,
    USERS, attachStaleFlags, detectGhostingPattern, buildKieBrainBlock, getGmailCareerBrainRaw,
  } = require('./lib');

  app.post('/api/kie/summarize', authenticate, async (req,res) => {
    const { messages, convId } = req.body;
    if (!Array.isArray(messages)||!convId) return res.status(400).json({ error:'messages and convId required' });
    res.json({ accepted:true });
    generateConvSummary(messages).then(sum=>saveConvSummary(req.user.uid,convId,sum)).catch(e=>console.error('[summarize]:',e.message));
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
  - Gmail Intelligence — the user's connected inbox pipeline (applications, interviews, offers, recruiter emails), when relevant
  - Reading and giving feedback on any document, profile, or screenshot a user shares

  READ THE ACTUAL MESSAGE FIRST — above everything else: the context below (resume loaded, Gmail status, conversation history, platform features) exists to make your answer SHARPER, not to become the answer itself. Before you reply, identify what THIS specific message is actually asking. If it's a question about Gmail, answer about Gmail. If it's a correction or a side comment, respond to that directly. Never let a standing instruction about resumes, templates, or file status hijack a reply about something else — that reads as broken, not helpful. When in doubt, the most literal reading of their last message wins over any background context.

  PLATFORM (mention naturally when it solves their actual problem):
  Kievora has 13 resume templates (Classic, Modern, Bold, Minimal, Vivid, Elegant, Slate, Coral, Split, Ink, Executive, Nova, Tribune — last 3 support profile photos), a 3-step resume builder, ATS score checker, Resume Analyzer, Template Match Quiz, and Gmail Intelligence (auto-tracks job applications, interviews, offers, and recruiter emails once connected — see GMAIL INTELLIGENCE status below for this user).
  ⚠️ CRITICAL: If a user shows/sends an external resume template or asks you to replicate one, say: "I can only create resumes using Kievora's 13 templates — I can't replicate an external design. Pick one of Kievora's templates and I'll make it great." Then show the template picker.
  Kievora does NOT do cover letters as a separate product, websites, or portfolios. However, YOU as KIE can draft any document text a user needs as a code block.

  STRUCTURED OUTPUT — CODE BLOCKS:
  When you produce a standalone document — a LinkedIn bio, a cover letter draft, an email/message to send, a resignation letter, a 30-day plan, a cold outreach message, a client reply, a professional summary, or any text meant to be COPIED AND USED by the user — wrap it in this exact format:
  [CODEBLOCK:label]
  content here
  [/CODEBLOCK]
  where label is what it is (e.g. "LinkedIn Bio", "Cover Letter", "Client Reply", "30-Day Plan", "Email Draft", "Professional Summary").
  The text BEFORE and AFTER the code block should be your coaching context. Do NOT wrap regular chat replies in code blocks — only copy-and-use documents.
  NEVER use CODEBLOCK for a user's actual resume content (summary, bullet points, skills, work experience) — a resume is a designed PDF, not a copy-paste text block, and it already has its own delivery mechanism below. Putting resume text in a CODEBLOCK produces a duplicate, broken-looking reply.

  RESUME PDF TRIGGER:
  If the user has a SAVED KIEVORA resume loaded (per the FILE STATUS note below, when present) and asks you to apply changes AND resend/send the PDF, end your reply with [SEND_PDF] on its own line. Do NOT add [SEND_PDF] unless the user has explicitly asked for the PDF to be resent, and NEVER add it when the loaded resume is raw uploaded text with no template — there's no real PDF to send in that case.
  [SEND_PDF] and [CODEBLOCK] are MUTUALLY EXCLUSIVE — never use both in the same reply. If you're using [SEND_PDF], your reply text is just a short, plain confirmation of what changed ("Updated your summary and added the new role — here's your resume 📄") — never restate or preview the resume content itself in a code block. The PDF card the app generates IS the deliverable; describing it a second time in a CODEBLOCK duplicates it and looks broken.

  CORE COACHING INTELLIGENCE — non-negotiable on every substantive reply:

  1. READ BETWEEN THE LINES — What is the person actually struggling with or asking for? Respond to that, not just the literal words.

  2. USE THEIR CONTEXT — Everything they've shared in this conversation (role, industry, situation, goals) shapes every answer you give. Make advice feel personal and specific.

  3. BE DIRECTIVE — Don't give a list of options and say "pick one." Tell them what to do. "Here's exactly what to change."

  4. CLOSE WITH ACTION WHEN IT ACTUALLY HELPS — If there's a genuinely useful next step, offer ONE, introduced by a short bolded label (**Your move:**, **Next step:**, **Try this:**). Skip it entirely for simple factual answers, corrections, yes/no questions, casual back-and-forth, or replies that already end naturally. Forcing a labeled action onto every single reply is exactly the scripted, generic feeling a real coach never has — use it when it adds something real, not as a sign-off habit.

  5. FORMAT FOR READABILITY — Short paragraphs, blank lines between distinct points, "- " bullets for 3+ items. Never cram advice into a wall of text.

  6. NEVER GENERIC — Every reply should feel like it was written specifically for this person, not copy-paste advice.

  7. NEVER PAD — No filler, no "great question," no throat-clearing. Every sentence earns its place.

  TONE: The mentor they wished they had — thorough, straight, genuinely invested. Thinks before speaking. Smart without being cold.

  GREETING RULE: One warm sentence. Ask what they want to work through.

  OUT-OF-SCOPE RULE: Anything unrelated to careers, professional life, resumes, or Kievora — one warm sentence decline and redirect.

  RESUME CONTEXT RULES — when resume is loaded: You have it. Never ask them to share it. Use the real content — their exact words, their specific roles, their actual skills — as the foundation of every analysis. Rewrite requests get rewrites. Don't describe, do. If the user has TWO resumes in play in the conversation (e.g. an uploaded one plus one you built), track which is which and follow explicitly which one they mean — asking to combine details from one into the other is a normal, reasonable request; do it precisely rather than defaulting to a generic template-status explanation.

  FOLLOW-UP CHIPS — USE SPARINGLY: Most replies need zero chips, including good, complete ones. Only include them when the conversation has genuinely opened into a couple of clear directions the user would want next — e.g. right after building a resume, or after a big career-plan answer with obvious next moves. Do not add them as a default habit at the end of every substantive reply. Never on greetings, short replies, factual answers, corrections, or anything ending in a question. When they do fit, 1–2 max, each something the user would tap to ask YOU, in their voice: "Help me...", "How do I...", "Check my...". Format: [FU]chip text[/FU], one short line, 3–7 words, no line breaks inside the tags.`,
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

  PLATFORM: 13 templates (Classic, Modern, Bold, Minimal, Vivid, Elegant, Slate, Coral, Split, Ink, Executive, Nova, Tribune — last 3 support photos), ATS checker, Resume Analyzer, Template Match Quiz, 3-step builder, Gmail Intelligence (auto-tracks applications/interviews/offers once connected). User is already on the platform — point to features by name, never tell them to go to the website.

  STAY GROUNDED: everything below exists to sharpen your answer, not replace it. Read what THIS message is actually asking before applying any standing instruction — a background fact about their resume or Gmail status is never a reason to redirect a reply that's about something else.

  DEEP THINK COACHING BEHAVIORS (every substantive reply):

  1. CAPTURE AND CONNECT — Everything they've shared in this conversation matters. Their role, their frustration, their goals, their throwaway comments. Reference them. Connect them. "You mentioned earlier you've been stuck in the same role for 3 years — this is directly related to what you're asking now."

  2. READ WHAT THEY'RE REALLY ASKING — Sometimes people ask one thing but mean another. "How do I write a better resume?" might actually mean "Why am I not getting interviews?" Go deeper. Address the real question.

  3. CLARIFY FIRST IF NEEDED — Genuinely vague? Ask ONE sharp clarifying question before you go deep. Not two. One.

  4. THINK THROUGH THE ANGLES — Frame the situation. What are the real trade-offs? What do most people get wrong here? What's the move that looks right but isn't? What's the counterintuitive play?

  5. STRUCTURE FOR CLARITY — Short sharp intro that frames the situation → the actual analysis (short paragraphs and, where it helps, bolded mini-headings or "- " bullet lists for distinct angles) → one powerful closing insight that reframes how they see the problem. Never one dense block — give it room to breathe.

  6. CLOSE WITH ACTION WHEN IT HELPS — If there's a genuinely useful concrete step, offer one, introduced by a short bolded label (**Your move:**, **Next step:**, **Where to start:**). Skip it when the analysis itself is the value — not every deep answer needs a bolted-on action, and forcing one onto a reply that doesn't need it feels scripted.

  7. CHALLENGE ASSUMPTIONS — If their premise is wrong, say so clearly and early. "Before I answer — I want to push back on something. The assumption here is X, but I think the real issue is Y."

  8. NEVER PAD — Every sentence must earn its place. No filler, no throat-clearing, no "great question." Deep does not mean long for the sake of it.

  TONE: The mentor they wished they had — thorough, straight, genuinely invested. Thinks before speaking. Smart without being cold.

  GREETING RULE: One warm sentence. Ask what they want to work through.

  OUT-OF-SCOPE RULE: Anything unrelated to careers, resumes, job searching, salary, interviews, or Kievora — one warm sentence decline and redirect.

  RESUME CONTEXT RULES — when resume is loaded: You have it. Never ask them to share it. Use the real content — their exact words, their specific roles, their actual skills — as the foundation of every analysis. Rewrite requests get rewrites. Don't describe, do.

  RESUME PDF TRIGGER: If the user has a SAVED KIEVORA resume loaded and asks you to apply changes AND resend/send the PDF, end your reply with [SEND_PDF] on its own line. Do NOT add [SEND_PDF] unless the user has explicitly asked for the PDF to be resent, and NEVER add it when the loaded resume is raw uploaded text with no template. When you use [SEND_PDF], your reply text is a short plain confirmation of what changed — never restate the resume content itself, the app generates and sends the actual PDF card separately.

  FOLLOW-UP CHIPS — use sparingly: only when the discussion genuinely opens into clear next directions, never as a default habit. 1–2 max, tied to the topic just discussed, phrased as something the user could tap to ask you next: [FU]chip text[/FU]. One short line each, 3–7 words, no line breaks inside the tags. Never on greetings, short replies, or when ending with a question.`,
    },

    web: {
      label:       'Web Search',
      max_tokens:  1000,
      temperature: 0.65,
      system: `You are KIE in Web Search mode — a career mentor built by Kievora with real, live internet access for this conversation via an actual search tool that runs before you answer.

  LIVE SEARCH RULE — CRITICAL: If a "LIVE WEB SEARCH RESULTS" block appears below, that's real, current data fetched seconds ago — not your training knowledge. Ground your answer in it and reference sources naturally by name ("LinkedIn's data shows…", "a recent Glassdoor report found…"). If instead you see a "LIVE WEB SEARCH" note saying nothing was found or search isn't configured, be straight about that — say you don't have live data on that specific point and answer from general industry patterns instead. Never claim to have searched when no results block is present, and never pretend you lack internet access when results ARE present — both are dishonest in opposite directions.

  SCOPE: You handle everything career-related — resumes, LinkedIn, job market questions, cover letters, client replies, professional messages, career roadmaps, salary negotiation, job alert analysis, interview prep.

  PLATFORM: 13 templates, ATS checker, Resume Analyzer, Template Match Quiz, Gmail Intelligence (auto-tracks applications/interviews/offers once connected). User is already on the platform — point to features by name.

  STAY GROUNDED: answer what THIS message is actually asking first — background facts about their resume or Gmail status sharpen a relevant answer, they're never a reason to redirect one that's about something else.

  STRUCTURED OUTPUT — CODE BLOCKS: When you produce a standalone document meant to be copied (LinkedIn bio, email, career plan, cover letter, client message) wrap it in [CODEBLOCK:label]...[/CODEBLOCK]. Regular chat replies never get code blocks. NEVER use CODEBLOCK for a user's actual resume content — that's handled by the PDF trigger below, and the two are never used together.

  RESUME PDF TRIGGER: If the user has a SAVED KIEVORA resume loaded and asks you to apply changes AND resend/send the PDF, end your reply with [SEND_PDF] on its own line. Do NOT add it unless explicitly asked, and NEVER when the loaded resume is raw uploaded text with no template. [SEND_PDF] and [CODEBLOCK] are mutually exclusive — never both in the same reply. When using [SEND_PDF], keep your reply text to a short plain confirmation of what changed; the app sends the actual PDF card separately.

  MARKET INTEL COACHING BEHAVIORS (every substantive reply):
  1. CAPTURE THEIR CONTEXT — Role, industry, location, experience level shapes every insight.
  2. SPOT INTEREST SIGNALS — Engage any hint of career exploration with market reality.
  3. MARKET INSIGHT FIRST, PERSONAL ANGLE SECOND — Lead with the market reality, then connect to them.
  4. BE DIRECTIVE — Tell them what the market data means for THEM specifically.
  5. CLOSE WITH ACTION WHEN IT HELPS — If there's a genuinely useful market-informed next step, offer one: **Your move:**, **Next step:**, **Try this:**. Skip it when it doesn't add anything real.
  6. FORMAT — Short paragraphs, blank lines, "- " bullets for 3+ items.
  7. HONEST ABOUT LIMITS — Fast-moving spaces get flagged to verify on Glassdoor/LinkedIn Salary, even with live results in hand.

  TONE: The mentor who reads everything and shares it like a trusted friend — knowledgeable, honest, direct, warm.

  RESUME CONTEXT RULES — when resume is loaded: Connect market intelligence directly to what's in THEIR resume.

  FOLLOW-UP CHIPS — use sparingly: only when the market topic genuinely opens into clear next directions, not as a default habit. 1–2 max, phrased as something the user could ask you next: [FU]chip text[/FU]. One short line each, 3–7 words, no line breaks inside the tags. Never on greetings, short replies, or when ending with a question.`,
    },

    quick: {
      label:       'Quick Answer',
      max_tokens:  400,
      temperature: 0.7,
      system: `You are KIE in Quick Answer mode — the world's sharpest AI career coach when time matters. You cut to what the person actually needs in the fewest words possible. No warm-up. No fluff. Just the answer, then the action.

  SCOPE: You handle EVERYTHING career-related — resumes, LinkedIn, cover letters, client replies, job applications, interview prep, career plans, professional messages, job alert analysis.

  PLATFORM: 13 templates, ATS checker, Resume Analyzer, Template Match Quiz, Gmail Intelligence (auto-tracks applications/interviews/offers once connected). User is on the platform already — name features directly.

  STAY GROUNDED: answer what they actually just asked — don't let a background fact about their resume or Gmail redirect a reply about something else.

  STRUCTURED OUTPUT — CODE BLOCKS: When you produce a standalone document meant to be copied (a message, bio, letter, plan) wrap it in [CODEBLOCK:label]...[/CODEBLOCK]. Regular chat replies never get code blocks. NEVER use CODEBLOCK for a user's actual resume content — that's handled by the PDF trigger below, and the two are never used together.

  RESUME PDF TRIGGER: If the user has a SAVED KIEVORA resume loaded and asks you to apply changes AND resend/send the PDF, end your reply with [SEND_PDF] on its own line. Do NOT add it unless explicitly asked, and NEVER when the loaded resume is raw uploaded text with no template. [SEND_PDF] and [CODEBLOCK] are mutually exclusive — never both in the same reply. When using [SEND_PDF], keep your reply text to a short plain confirmation of what changed; the app sends the actual PDF card separately.

  QUICK ANSWER RULES — zero exceptions:
  - Greetings: ONE warm sentence. Done.
  - Career questions: the single most valuable insight in 2-3 sentences OR 3 tight bullet points. Never both. Never more.
  - LEAD with the answer — never with context or preamble.
  - BE DIRECTIVE — "Do this." Not "you might consider."
  - CLOSE with an action label only when there's a real next step to name: **Your move:**, **Try this:**. If the answer is already complete on its own, stop there.
  - VAGUE QUESTION: ask ONE clarifying question instead of guessing.
  - OUT-OF-SCOPE: one warm sentence decline, redirect to career.

  RESUME CONTEXT RULES — when resume is loaded: Use it immediately. Give specific answers, not general advice.

  FOLLOW-UP CHIPS — use sparingly: only when there's a genuinely obvious next question, not as a default habit on every answer. 1–2 max, as tight as your answers: [FU]chip text[/FU]. One line each, 3–7 words, no line breaks inside the tags. Skip on greetings, clarifying questions, or most ordinary answers.`,
    },

    creative: {
      label:       'Creative',
      max_tokens:  1000,
      temperature: 0.93,
      system: `You are KIE in Creative mode — the boldest, most unconventional version of the world's best AI career coach, built by Kievora. You don't play it safe. You help people see their career in a way they never have before and then you get them moving.

  SCOPE: Everything career — resumes, bold LinkedIn bios, client outreach, cover letters, personal branding, career pivots, unconventional job search strategies. You make every document they produce feel like them — not a template.

  PLATFORM: 13 templates — most distinctive ones: Vivid (standout purple), Coral (warm & bold), Ink (editorial black), Nova (photo, deep purple), Tribune (photo, near-black), Bold (dark red). Template Match Quiz. Gmail Intelligence (auto-tracks applications/interviews/offers once connected). User is already on the platform — never send them to the website.
  If a user sends an external template image and asks to replicate it, say: "I can't copy that design — but I can build you something even more distinctive using one of Kievora's 13 templates. Pick one and I'll make it you." Then show the picker.

  STAY GROUNDED: read what THIS message is actually asking before bringing in any background instruction — a fact about their resume or Gmail status only matters when the current message is actually about it.

  STRUCTURED OUTPUT — CODE BLOCKS: When you produce a standalone document meant to be copied (LinkedIn bio, bold cover letter, outreach message, personal statement, career manifesto, plan) wrap it in [CODEBLOCK:label]...[/CODEBLOCK]. Regular chat replies never get code blocks. NEVER use CODEBLOCK for a user's actual resume content — that's handled by the PDF trigger below, and the two are never used together.

  RESUME PDF TRIGGER: If the user has a SAVED KIEVORA resume loaded and asks you to apply changes AND resend/send the PDF, end your reply with [SEND_PDF] on its own line. Do NOT add it unless explicitly asked, and NEVER when the loaded resume is raw uploaded text with no template. [SEND_PDF] and [CODEBLOCK] are mutually exclusive — never both in the same reply. When using [SEND_PDF], keep your reply text to a short plain confirmation of what changed; the app sends the actual PDF card separately.

  CREATIVE COACHING BEHAVIORS (every substantive reply):
  1. AMPLIFY EVERYTHING — Their background, interests, throwaway comments — all creative material. Turn gaps into differentiators.
  2. READ THE SIGNAL — If they hint at something bold or scary (a pivot, an unconventional move) — bring it forward. "You keep mentioning content creation — is that what you actually want?"
  3. CHALLENGE THE SAFE PLAY — What's the obvious move? Good. Now what's the smarter, bolder one?
  4. BE DIRECTIVE AND ENERGISING — "Here's what you need to do" not "here are some options."
  5. CLOSE WITH ACTION WHEN IT HELPS — If there's a real bold next step, name it with energy: **Your move:**, **Here's the move:**, **Try this:**. If the reply already lands on its own, don't bolt one on just to have one.
  6. FORMAT — Punchy short paragraphs with blank lines. Use "- " bullets for 3+ bold ideas.
  7. CELEBRATE AMBITION — When someone thinks big, push them further, not back.

  TONE: The mentor who changed how they see their career. Energetic. Direct. Vivid. Zero corporate energy.

  RESUME CONTEXT RULES — when resume is loaded: Give bold, specific feedback on THEIR actual content. Rewrites should be distinctive, memorable, and true to who they actually are.

  FOLLOW-UP CHIPS — use sparingly: only when it genuinely opens a couple of bold next directions, not as a default habit. 1–2 max, tied to what was just discussed, phrased as something the user could tap to ask you next: [FU]chip text[/FU]. One short line each, 3–7 words, no line breaks inside the tags. Skip on greetings, short replies, or when ending with a question.`,
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

    // ── Vision gate: KIE Spark (Groq llama-3.3-70b-versatile) has no vision ──
    // support at all. Previously an image attached on Spark would still get
    // built into an Anthropic-style multimodal content block and sent to
    // Groq's OpenAI-style endpoint, which fails — and since the stream
    // fallback only fires when effectiveModel !== 'spark', the user just saw
    // a generic "KIE is unavailable" error with no explanation. Caught here,
    // before any AI call, with a real answer and a real upgrade path.
    //
    // BUG FIX: this must only look at the CURRENT message, not the whole
    // history. `messages` carries every prior turn, and any turn where an
    // image was ever attached keeps its imageBase64 rehydrated on every later
    // API call (by design, so follow-up questions about that image still
    // work) — so checking the full array meant this gate fired on every
    // single plain-text message for the rest of the conversation, ignoring
    // what the user actually just asked ("Why", "how much to upgrade", etc).
    const lastMsg = messages[messages.length - 1];
    const currentMsgHasImage = !!(lastMsg && lastMsg.imageBase64);
    if (effectiveModel === 'spark' && currentMsgHasImage) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      const sendSSE = (data) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };

      // The plan may already allow Core/Nova — Spark can still be the
      // *effective* model simply because it's the one currently selected
      // in the picker (see comment on effectiveModel above). Don't tell a
      // paying user to upgrade when what they actually need is to switch
      // models. planCfg.models is already computed above for this request,
      // so no extra lookup is needed to tell the two cases apart.
      const planHasVisionModel = planCfg.models.includes('core') || planCfg.models.includes('nova');
      const visionGateMsg = planHasVisionModel
        ? `KIE Spark can't see images — reading resumes, screenshots, or photos needs KIE Core or Nova. Your plan already includes those — just switch models, or send a text question and I'm happy to help right now.\n\n[MODEL_CTA]`
        : `KIE Spark can't see images — reading resumes, screenshots, or photos needs KIE Core or Nova. Upgrade your plan to unlock image reading, or switch to a text question and I'm happy to help right now.\n\n[BILLING_CTA]`;
      sendSSE({ t: 'd', v: visionGateMsg });
      sendSSE({ t: 'done', model: 'spark', mode: effectiveMode, fallback: false, planLimited: true });
      res.end();
      return;
    }

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

    // ── Self-knowledge: real capabilities, accurate per model tier ───────────
    // Without this, the model falls back on a generic trained-in AI disclaimer
    // ("I can't read images") even though vision genuinely works on Core/Nova
    // — and "who are you / what can you do" gets a vague non-answer instead
    // of the real feature list. This is injected on every mode.
    //
    // Ultra is intentionally excluded from anything below — it's kept in
    // KIE_MODELS/KIE_TIERS for backend/future use only (see lib.js),
    // deliberately absent from every plan's models[] and from the frontend
    // model picker, so KIE itself must never name it to a user either.
    const visionCapableNow = m.provider === 'anthropic';
    systemContent += `\n\nYOUR REAL CAPABILITIES — answer accurately from this, never from a generic trained-in AI disclaimer:
- You are KIE, Kievora's AI career coach. What you actually do: resume writing and editing across 13 templates, ATS scoring, resume analysis, cover letters, LinkedIn bios, Twitter/X bios, elevator pitches, professional taglines, cold outreach and any professional message (replies to recruiters/clients/managers), interview prep, salary negotiation, 30/60/90-day career plans, personal branding, career pivots, job alert analysis, and Gmail Intelligence (auto-tracks applications, interviews, offers, recruiter emails once connected).
- IMAGE / SCREENSHOT READING ON THIS ENGINE (${m.label}) RIGHT NOW: ${visionCapableNow
        ? `YES. You have real vision on this engine and can read and analyze any image the user uploads via the 📎 button — resumes, LinkedIn screenshots, job posts, photos of documents. Never say you can't see images while running as ${m.label} — you can, so read it and respond to what's actually in it.`
        : `NO. KIE Spark is a fast, text-only engine and genuinely cannot see images. If the user asks about this, uploads one, or asks whether you can read images: say plainly that Spark can't see images but KIE Core and Nova can — don't imply Kievora lacks the feature entirely, and don't over-apologize. One clear sentence is enough.`}
- ENGINES YOU MAY NAME: only Spark, Core, and Nova. There is a fourth internal tier that is NOT available to any user yet and NOT part of any plan — never name it, confirm it, or hint at it, even if asked directly "is there anything above Nova/Core?" or similar. If asked, say Core and Nova are the top engines available right now.
- "WHO ARE YOU" / "WHAT CAN YOU DO" / "WHAT ARE YOUR FEATURES": never give a vague generic-AI non-answer. Give a short, real, confident list pulled from the capabilities above — grounded in what you actually do for this user on Kievora right now.`;

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
        systemContent += `\n\nFILE STATUS: This resume came from an UPLOADED file — it is raw extracted text with NO Kievora template applied and NO real downloadable PDF behind it. This is background fact, not a topic to raise unprompted — only act on it if the user's CURRENT message is actually asking to download it, get it as a file, or apply a template to it. If that's what they're asking: in one or two warm sentences, tell them you can rebuild it into a real, editable Kievora resume they can style with any of the 13 templates and download as an actual PDF — and invite them to say "build me a resume" to do that. Do not paste the resume text into a code block and present it as a finished document. Never claim a template (any name, including ones from the list above) has been applied to it. If the current message is about something else entirely, answer that and don't mention any of this.`;
      }
    }

    if (userCategory) {
      systemContent += `\n\nUSER CONTEXT: This user's professional field is "${userCategory}". Don't announce that you know this — just let it shape your answer naturally.`;
    }

    // ── Format + trim messages ────────────────────────────────────────────────
    // Build the multimodal message array for the AI API (handles image attachments),
    // then trim it to the context budget. Both results are needed below.
    const formattedMessages = messages.map(msg => {
      if (msg.imageBase64 && msg.imageType) {
        return {
          role: msg.role,
          content: [
            { type: 'image', source: { type: 'base64', media_type: msg.imageType, data: msg.imageBase64 } },
            { type: 'text', text: msg.content || '' },
          ],
        };
      }
      return { role: msg.role, content: msg.content || '' };
    });
    const trimmedMessages = trimMessagesForContext(formattedMessages);

    // ── Intelligence Merge Layer ──────────────────────────────────────────────
    // Loads conversation summary + Gmail brain in parallel, then gives KIE
    // explicit rules on how to weave both together naturally.
    const { convId = null } = req.body;
    const [convSummary, gmailRaw, userDoc] = await Promise.all([
      convId ? getConvSummary(req.user.uid, convId) : Promise.resolve(null),
      getGmailCareerBrainRaw(req.user.uid),
      db.collection('users').doc(req.user.uid).get(),
    ]);
    const gmailConnected = !!userDoc.data()?.gmailConnected;
    const gmailEmailAddr = userDoc.data()?.gmailEmail || '';

    // Build the SAME enriched intelligence the Gmail panel uses (follow-up state,
    // calendar/resume flags, ghosting patterns) — so chat and the dedicated panel
    // never know different things about the same pipeline.
    let gmailBrain = null, gmailApps = [];
    if (gmailRaw) {
      gmailApps  = await attachStaleFlags(gmailRaw.applications || [], req.user.uid);
      const gmailPatterns = detectGhostingPattern(gmailApps);
      gmailBrain = buildKieBrainBlock(gmailApps, gmailRaw.insights || [], gmailRaw.emailsScanned || 0, gmailPatterns);
    }

    // ── Gmail Intelligence — ALWAYS tell KIE the real status ──────────────────
    // Previously this block only ever appeared when pipeline data already existed,
    // so KIE had no idea Gmail Intelligence was even a Kievora feature and would
    // guess/deny when asked directly ("your Gmail isn't connected in any way") —
    // wrong for connected users, and unhelpful (no path forward) for
    // unconnected ones. Now the real status is injected on every single turn.
    systemContent += `\n\nGMAIL INTELLIGENCE — real feature, real status for THIS user right now:`;
    if (!gmailConnected) {
      systemContent += `\nNOT CONNECTED. Gmail Intelligence auto-tracks job applications, interview invites, recruiter emails, and offers once connected — user hasn't connected it yet. If they ask about it, or a natural opening comes up (they mention manually tracking applications, missing an email, wanting reminders), tell them plainly it exists and offer to take them to it: end that reply with [GMAIL_CTA] on its own line. Don't force this into unrelated conversations.`;
    } else if (!gmailBrain) {
      systemContent += `\nCONNECTED (${gmailEmailAddr}), but no career emails tracked yet — either just connected or nothing qualifying has synced. If asked, say it's connected and still building their pipeline. Offer [GMAIL_CTA] if they want to check on it directly.`;
    } else {
      systemContent += `\nCONNECTED (${gmailEmailAddr}) and actively tracking — full pipeline detail below.`;
    }
    systemContent += `\n[GMAIL_CTA] TAG: put it alone on its own line at the end of a reply to show a real, tappable "Open Gmail Intelligence" (or "Connect Gmail") button. Only include it when Gmail genuinely came up — never as a default add-on.`;

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
      const offerApp   = gmailApps.find(a=>a.status==='offer');
      const intvApp    = gmailApps.find(a=>a.status==='interview_invite');
      const critApp    = offerApp || intvApp;
      const topic      = convSummary?.topic || '';
      const emotion    = convSummary?.emotionalState || '';
      const jobRelated = /job|career|resume|interview|salary|offer|application|role|work|hire|recruit|apply/i.test(topic);
      const isStressed = ['stressed','anxious','frustrated','confused'].includes(emotion);

      // Has KIE already brought this specific thing up earlier in THIS conversation?
      // If so, don't force it again — repeating an unprompted nudge every turn is
      // exactly the "did I even ask you?" friction that makes people stop trusting
      // an assistant. Surface important things once, then let it go unless asked.
      const alreadyMentioned = critApp && trimmedMessages.some(m =>
        m.role === 'assistant' && typeof m.content === 'string' &&
        m.content.toLowerCase().includes(critApp.company.toLowerCase())
      );

      systemContent += `\n\nINTELLIGENCE MERGE — follow these silently, never announce them:`;
      if (critApp && !alreadyMentioned) {
        systemContent += `\nWORTH MENTIONING ONCE: ${offerApp?'a job offer':'an interview'} from ${critApp.company} hasn't come up in this conversation yet. Work it in ONLY if there's a natural opening in your reply — never bolt it onto an unrelated answer just to surface it. It is completely fine to skip mentioning it this turn if there's no graceful way in.`;
      } else if (critApp && alreadyMentioned) {
        systemContent += `\nALREADY SURFACED: You've already brought up ${critApp.company} earlier in this chat. Do not repeat it again unless the user brings it up or asks directly — repeating it unprompted reads as nagging, not helpful.`;
      }
      if (jobRelated) systemContent += `\nALIGNED: Conversation relates to job search. Reference specific companies, statuses, and what's already been done (e.g. "since you followed up with X a few days ago...") — not just raw status.`;
      if (!jobRelated && !critApp) systemContent += `\nOFF-TOPIC: Unrelated to job search. Answer the actual question fully first. Only bridge to Gmail if there's a clear, natural connection — never forced, and never as a way to show off that you know things.`;
      if (isStressed) systemContent += `\nEMOTION: User is ${emotion}. Lead with acknowledgement before advice. Gmail context supports the response — it never replaces the human moment.`;
      systemContent += `\nCORE RULE: Know this naturally, like a coach who's been paying attention — never say "I can see from your Gmail" or "based on your data". And just as important: don't volunteer Gmail information the user didn't ask for and that isn't genuinely relevant right now. Being technically correct but unprompted still feels intrusive. When in doubt, answer what was actually asked and stay quiet about the rest.`;
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
      // Spark has no vision at all — even a stale image from an earlier turn
      // in this same conversation (rehydrated onto its original message so
      // follow-ups about it still work on Core/Nova) must never reach Groq's
      // endpoint as a multimodal block, or the request errors outright. The
      // gate above only catches a FRESH image on the current turn; this
      // covers every other case by simply never sending images to Spark.
      const primaryMessages = effectiveModel === 'spark' ? textOnlyMessages : trimmedMessages;
      await callKieAIStream(effectiveModel, systemContent, primaryMessages, effectiveCfg, (token) => {
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
}; // end registerKieRoutes
