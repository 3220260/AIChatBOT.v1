import { GoogleGenerativeAI } from "@google/generative-ai";
import { faqs } from "../faqs.js";

/* =========================================
   1. SETTINGS
   ========================================= */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const MAX_MESSAGE_LENGTH = 500;
const MAX_MESSAGES_PER_WINDOW = 8;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_ACTIVE_REQUESTS = 20;
const MAX_HISTORY_MESSAGES = 4;
const MAX_RELEVANT_FAQS_FOR_GEMINI = 3;
const MAX_FAQ_ANSWER_CHARS_FOR_GEMINI = 420;
const MAX_HISTORY_CHARS_FOR_GEMINI = 360;
const MAX_OUTPUT_TOKENS = readIntEnv("GEMINI_MAX_OUTPUT_TOKENS", 220, 80, 600);
const GEMINI_THINKING_BUDGET = readIntEnv("GEMINI_THINKING_BUDGET", 0, -1, 24576);

// Αν direct FAQ score >= αυτό, απαντάμε χωρίς Gemini.
const DIRECT_FAQ_SCORE = 7;
const DIRECT_FAQ_SCORE_GAP = 2;

// Αν έχει σχετικό FAQ αλλά όχι αρκετά καθαρό match, τότε πάμε Gemini.
const MIN_RELEVANT_SCORE_FOR_GEMINI = 2;

const GEMINI_GENERATION_CONFIG = {
  temperature: 0.15,
  topP: 0.8,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  thinkingConfig: {
    thinkingBudget: GEMINI_THINKING_BUDGET
  }
};

const UNKNOWN_REPLY = "Δεν έχω σίγουρη πληροφορία γι’ αυτό. Καλύτερα να επικοινωνήσετε με εκπρόσωπο του Συνεταιρισμού.";
const SCOPE_REPLY = "Μπορώ να βοηθήσω μόνο με πληροφορίες για τηλεφωνία, τηλεόραση και σταθερό internet.";

const GEMINI_SYSTEM_RULES = [
  "You are Sofia, the official Synetelas support bot.",
  "Reply in Greek, concise, max 80 words.",
  "Use only KB facts about telephony, TV and fixed internet.",
  `If KB is insufficient, say exactly: "${UNKNOWN_REPLY}"`,
  "Never show IDs, scores or internal notes."
].join(" ");

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: GEMINI_MODEL }) : null;

const memory = new Map();
const rateLimitStore = new Map();
let activeRequests = 0;

function readIntEnv(name, fallback, min, max) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/* =========================================
   2. GREEK / GREEKLISH NORMALIZATION
   ========================================= */
const GREEK_TO_LATIN = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "i",
  φ: "f",
  χ: "x",
  ψ: "ps",
  ω: "o"
};

function stripGreekTones(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function greekToLatin(text = "") {
  return String(text).replace(/[α-ως]/g, (char) => GREEK_TO_LATIN[char] || char);
}

function normalizeGreeklish(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/8/g, "th")
    .replace(/3/g, "e")
    .replace(/0/g, "o")
    .replace(/ph/g, "f")
    .replace(/ch/g, "x")
    .replace(/kh/g, "x")
    .replace(/ks/g, "x")
    .replace(/ou/g, "u")
    .replace(/h/g, "i")
    .replace(/y/g, "i")
    .replace(/ei/g, "i")
    .replace(/oi/g, "i")
    .replace(/ai/g, "e")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSearchKey(text = "") {
  const withoutTones = stripGreekTones(String(text).toLowerCase());
  const latin = greekToLatin(withoutTones);
  return normalizeGreeklish(latin);
}

function toSmallTalkKey(text = "") {
  return stripGreekTones(String(text).toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "τι",
  "ποια",
  "ποιο",
  "ποιος",
  "πως",
  "που",
  "για",
  "και",
  "να",
  "το",
  "τη",
  "την",
  "τον",
  "τα",
  "στο",
  "στη",
  "στην",
  "με",
  "σε",
  "απο",
  "είναι",
  "ειναι",
  "χρειάζεται",
  "χρειαζεται",
  "χρειάζονται",
  "χρειαζονται",
  "the",
  "what",
  "how",
  "where",
  "for",
  "and"
].map(toSearchKey));

/* =========================================
   3. LOCAL FILTERS — 0 TOKENS
   ========================================= */
const LOCAL_SMALL_TALK = [
  {
    patterns: ["γεια", "γειά", "καλημερα", "καλησπερα", "καληνυχτα", "hello", "geia", "kalimera", "kalispera"],
    reply: "Γεια σας! Μπορώ να σας βοηθήσω με πληροφορίες για τηλεφωνία, τηλεόραση, σταθερό internet, αιτήσεις και δικαιολογητικά."
  },
  {
    patterns: ["ευχαριστω", "ευχαριστώ", "thanks", "thank you", "euxaristo", "efxaristo"],
    reply: "Παρακαλώ! Είμαι στη διάθεσή σας για πληροφορίες σχετικά με τηλεφωνία, τηλεόραση και σταθερό internet."
  },
  {
    patterns: ["ποιος εισαι", "τι εισαι", "ανθρωπος", "ρομποτ", "bot", "poios eisai", "ti eisai", "robot"],
    reply: "Είμαι η Sofia, η ψηφιακή βοηθός του Synetelas, και απαντώ σε ερωτήσεις για τηλεφωνία, τηλεόραση, σταθερό internet, αιτήσεις και δικαιολογητικά."
  }
];

const ALLOWED_FAQ_CATEGORIES = new Set([
  "Σταθερή τηλεφωνία / Internet",
  "EON TV",
  "Κινητή / Καρτοκινητή",
  "Vodafone CU",
  "Nova Q"
]);

const BUSINESS_KEYWORDS = [
  "vodafone",
  "cu",
  "nova",
  "q",
  "eon",
  "tv",
  "τηλεφωνία",
  "τηλεφωνια",
  "tilefonia",
  "τηλέφωνο",
  "τηλεφωνο",
  "tilefono",
  "κινητή",
  "κινητη",
  "kinhth",
  "kinito",
  "σταθερή",
  "σταθερο",
  "statheri",
  "stathero",
  "internet",
  "ίντερνετ",
  "ιντερνετ",
  "τηλεόραση",
  "τηλεοραση",
  "tileorasi",
  "φορητότητα",
  "φορητοτητα",
  "foritotita",
  "metafora arithmou",
  "μεταφορά αριθμού",
  "νεος αριθμος",
  "νέος αριθμός",
  "neos arithmos",
  "neo noumero",
  "sim",
  "κάρτα",
  "καρτα",
  "karta",
  "καρτοκινητή",
  "καρτοκινητη",
  "kartokinito",
  "δικαιολογητικά",
  "δικαιολογητικα",
  "dikaiologitika",
  "χαρτια",
  "xartia",
  "eggrafa",
  "ταυτότητα",
  "ταυτοτητα",
  "tautotita",
  "taftotita",
  "gov",
  "κεπ",
  "kep",
  "κατάθεση",
  "καταθεση",
  "katathesi",
  "pliromi",
  "iban",
  "προσφορά",
  "προσφορα",
  "prosfora",
  "τιμή",
  "τιμη",
  "timi"
];

const OUT_OF_SCOPE_KEYWORDS = [
  "ανέκδοτο",
  "ανεκδοτο",
  "anekdoto",
  "τραγούδι",
  "τραγουδι",
  "tragoudi",
  "ποίημα",
  "ποιημα",
  "poiima",
  "καιρός",
  "καιρος",
  "kairos",
  "ποδόσφαιρο",
  "ποδοσφαιρο",
  "podosfairo",
  "στοίχημα",
  "στοιχημα",
  "stoixima",
  "μαγειρική",
  "μαγειρικη",
  "mageiriki",
  "ταινία",
  "ταινια",
  "tainia",
  "πολιτική",
  "πολιτικη",
  "politiki",
  "ασφάλιση",
  "ασφαλιση",
  "asfalisi",
  "ασφάλεια",
  "ασφαλεια",
  "asfaleia",
  "υγεία",
  "υγεια",
  "igeia",
  "interamerican",
  "anytime",
  "νοσοκομείο",
  "νοσοκομειο",
  "nosokomeio",
  "κλινική",
  "κλινικη",
  "kliniki",
  "minecraft",
  "fortnite",
  "instagram",
  "tiktok",
  "facebook"
];

const AMBIGUOUS_SCOPE_KEYWORDS = [
  "συνεταιρισμός",
  "συνεταιρισμος",
  "sinetairismos",
  "synetelas",
  "πκσαα",
  "pksaa",
  "επικοινωνία",
  "επικοινωνια",
  "επικοινων",
  "επικοινωνώ",
  "επικοινωνω",
  "epikoinonia",
  "epikoinon"
];

function getLocalSmallTalkReply(message) {
  const normalized = toSmallTalkKey(message);
  const words = new Set(normalized.split(" ").filter(Boolean));

  for (const item of LOCAL_SMALL_TALK) {
    if (item.patterns.some((pattern) => {
      const normalizedPattern = toSmallTalkKey(pattern);
      if (!normalizedPattern) return false;
      if (normalizedPattern.includes(" ")) return normalized.includes(normalizedPattern);
      return words.has(normalizedPattern);
    })) {
      return item.reply;
    }
  }

  return null;
}

function hasBusinessKeyword(message) {
  const normalizedMessage = toSearchKey(message);
  return BUSINESS_KEYWORDS.some((keyword) => normalizedMessage.includes(toSearchKey(keyword)));
}

function isClearlyOutOfScope(message) {
  const normalizedMessage = toSearchKey(message);
  return OUT_OF_SCOPE_KEYWORDS.some((keyword) => normalizedMessage.includes(toSearchKey(keyword)));
}

function hasAmbiguousScopeKeyword(message) {
  const normalizedMessage = toSearchKey(message);
  return AMBIGUOUS_SCOPE_KEYWORDS.some((keyword) => normalizedMessage.includes(toSearchKey(keyword)));
}

function shouldBlockForScope(message) {
  if (isClearlyOutOfScope(message)) return true;
  return hasAmbiguousScopeKeyword(message) && !hasBusinessKeyword(message);
}

/* =========================================
   4. FAQ MATCHING — 0 TOKENS WHEN DIRECT
   ========================================= */
function getRelevantFaqs(message, limit = MAX_RELEVANT_FAQS_FOR_GEMINI) {
  const normalizedMessage = toSearchKey(message);

  const messageWords = [...new Set(
    normalizedMessage
      .split(" ")
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
  )];

  const scored = faqs.filter(isAllowedFaq).map((faq) => {
    const searchableText = toSearchKey([
      faq.category,
      faq.question,
      faq.answer,
      ...(faq.keywords || [])
    ].join(" "));
    const normalizedQuestion = toSearchKey(faq.question);

    let score = 0;

    for (const word of messageWords) {
      if (searchableText.includes(word)) {
        score += 1;
      }
    }

    for (const keyword of faq.keywords || []) {
      const normalizedKeyword = toSearchKey(keyword);
      if (normalizedKeyword.length >= 3 && normalizedMessage.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ") ? 6 : 4;
      }
    }

    if (normalizedQuestion.includes(normalizedMessage) || normalizedMessage.includes(normalizedQuestion)) {
      score += 8;
    }

    // Ενισχύσεις για πολύ συχνές προθέσεις.
    if (normalizedMessage.includes("dikaiologitika") && searchableText.includes("dikaiologitika")) score += 3;
    if (normalizedMessage.includes("katathesi") && searchableText.includes("katathesi")) score += 3;
    if (normalizedMessage.includes("foritotita") && searchableText.includes("foritotita")) score += 3;
    if (normalizedMessage.includes("energopoi") && searchableText.includes("energopoi")) score += 3;

    const wantsPrice = /(prosfora|timi|times|poso|kostos|pagio)/.test(normalizedMessage);
    const isPriceFaq = /(price|program|offer)/.test(faq.id)
      || /(prosfora|timi|times|kostos|pagio|17 90|20 90)/.test(searchableText);

    if (wantsPrice && isPriceFaq) {
      score += 12;
    } else if (wantsPrice && /(prosfora|timi|times|kostos|pagio|17 90|20 90)/.test(searchableText)) {
      score += 7;
    }

    if (/(dikaiologitika|xartia|eggrafa)/.test(normalizedMessage)
      && /(dikaiologitika|tautotita|eggrafa|apodeiktiko|dilosi)/.test(searchableText)) {
      score += 5;
    }

    const wantsSubmissionEmail = /(email|emel|mail|mel|apostol|steln|steil)/.test(normalizedMessage);
    if (wantsSubmissionEmail && faq.id === "mobile-submit-email") {
      score += 30;
    }

    return { faq, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function isAllowedFaq(faq) {
  return ALLOWED_FAQ_CATEGORIES.has(faq.category);
}

function shouldAnswerDirectly(scoredFaqs) {
  if (!scoredFaqs.length) return false;
  const [best, second] = scoredFaqs;
  const scoreGap = best.score - (second?.score || 0);
  return best.score >= DIRECT_FAQ_SCORE && scoreGap >= DIRECT_FAQ_SCORE_GAP;
}

function buildFaqContext(relevantFaqs) {
  return relevantFaqs
    .map((f, index) => {
      const answer = compactText(f.answer, MAX_FAQ_ANSWER_CHARS_FOR_GEMINI);
      return `${index + 1}. ${f.category}\nQ: ${f.question}\nA: ${answer}`;
    })
    .join("\n\n");
}

function compactText(text = "", maxChars = 420) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  const clipped = compact.slice(0, maxChars - 1);
  const lastSentence = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf(";"),
    clipped.lastIndexOf("!")
  );
  if (lastSentence > maxChars * 0.55) {
    return `${clipped.slice(0, lastSentence + 1).trim()}`;
  }
  return `${clipped.trim()}…`;
}

function shouldIncludeHistory(message) {
  const normalizedMessage = toSearchKey(message);
  const words = normalizedMessage.split(" ").filter(Boolean);

  if (words.length <= 4) return true;

  return [
    "αυτο",
    "αυτό",
    "εκεινο",
    "εκείνο",
    "τουτο",
    "αυτη",
    "αυτή",
    "αυτα",
    "αυτά",
    "επισης",
    "επίσης",
    "και για",
    "τιμη",
    "τιμή",
    "ποσο",
    "πόσο",
    "διαρκεια",
    "διάρκεια"
  ].some((term) => normalizedMessage.includes(toSearchKey(term)));
}

function buildHistoryContext(history, message) {
  if (!history.length || !shouldIncludeHistory(message)) return "";

  return history
    .slice(-2)
    .map((item) => {
      const role = item.role === "model" ? "Bot" : "User";
      const text = compactText(item.parts?.[0]?.text || "", Math.floor(MAX_HISTORY_CHARS_FOR_GEMINI / 2));
      return `${role}: ${text}`;
    })
    .join("\n")
    .slice(0, MAX_HISTORY_CHARS_FOR_GEMINI);
}

function buildGeminiPrompt({ faqContext, historyContext, message }) {
  return [
    GEMINI_SYSTEM_RULES,
    historyContext ? `Previous turn:\n${historyContext}` : "",
    `KB:\n${faqContext}`,
    `Customer: ${message}`
  ].filter(Boolean).join("\n\n");
}

function cleanReply(text = "") {
  return String(text)
    .replace(/\[cite:\s*[^\]]+\]/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/* =========================================
   5. RATE LIMITS
   ========================================= */
function getClientKey(req, userId) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = typeof forwardedFor === "string"
    ? forwardedFor.split(",")[0].trim()
    : req.socket?.remoteAddress || "unknown";

  return String(userId || ip || "unknown").slice(0, 120);
}

function checkRateLimit(req, userId) {
  const key = getClientKey(req, userId);
  const now = Date.now();

  const current = rateLimitStore.get(key) || {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS
  };

  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  current.count += 1;
  rateLimitStore.set(key, current);

  if (current.count > MAX_MESSAGES_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/* =========================================
   6. TOKEN LOGGING / COST ESTIMATE
   ========================================= */
function calculateCostEstimate(usage = {}) {
  const inputTokens = usage.promptTokenCount || 0;
  const visibleOutputTokens = usage.candidatesTokenCount || 0;
  const thinkingTokens = usage.thoughtsTokenCount || 0;
  const outputTokens = visibleOutputTokens + thinkingTokens;
  const totalTokens = usage.totalTokenCount || inputTokens + outputTokens;
  const pricing = getGeminiPricing(GEMINI_MODEL);

  const inputCostUsd = (inputTokens / 1_000_000) * pricing.inputUsdPerMillion;
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputUsdPerMillion;

  return {
    inputTokens,
    outputTokens,
    thinkingTokens,
    totalTokens,
    estimatedCostUsd: Number((inputCostUsd + outputCostUsd).toFixed(8))
  };
}

function getGeminiPricing(modelName = "") {
  const normalizedModel = String(modelName).toLowerCase();

  if (normalizedModel.includes("flash-lite")) {
    return { inputUsdPerMillion: 0.10, outputUsdPerMillion: 0.40 };
  }

  if (normalizedModel.includes("flash")) {
    return { inputUsdPerMillion: 0.30, outputUsdPerMillion: 2.50 };
  }

  return { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10.00 };
}

/* =========================================
   7. API HANDLER
   ========================================= */
export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message, userId } = req.body || {};
    const safeMessage = typeof message === "string" ? message.trim() : "";

    if (!safeMessage || !userId) {
      return res.status(400).json({ error: "Λείπει μήνυμα ή αναγνωριστικό χρήστη." });
    }

    if (safeMessage.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Το μήνυμα είναι πολύ μεγάλο. Παρακαλώ γράψτε μέχρι ${MAX_MESSAGE_LENGTH} χαρακτήρες.`
      });
    }

    const rateLimit = checkRateLimit(req, userId);

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: `Πολλά μηνύματα σε μικρό χρόνο. Δοκιμάστε ξανά σε ${rateLimit.retryAfterSeconds} δευτερόλεπτα.`
      });
    }

    const localReply = getLocalSmallTalkReply(safeMessage);
    if (localReply) {
      return res.status(200).json({
        reply: localReply,
        source: "local_small_talk",
        usedGemini: false,
        estimatedTokensUsed: 0
      });
    }

    if (shouldBlockForScope(safeMessage)) {
      return res.status(200).json({
        reply: SCOPE_REPLY,
        source: "blocked_out_of_scope",
        usedGemini: false,
        estimatedTokensUsed: 0
      });
    }

    const scoredFaqs = getRelevantFaqs(safeMessage);

    if (!scoredFaqs.length || scoredFaqs[0].score < MIN_RELEVANT_SCORE_FOR_GEMINI) {
      return res.status(200).json({
        reply: UNKNOWN_REPLY,
        source: "no_relevant_faq",
        usedGemini: false,
        estimatedTokensUsed: 0
      });
    }

    if (shouldAnswerDirectly(scoredFaqs)) {
      return res.status(200).json({
        reply: scoredFaqs[0].faq.answer,
        source: "direct_faq",
        usedGemini: false,
        estimatedTokensUsed: 0,
        matchedFaqId: scoredFaqs[0].faq.id,
        score: scoredFaqs[0].score
      });
    }

    if (!model) {
      return res.status(500).json({
        error: "Το chatbot δεν έχει ρυθμιστεί σωστά. Λείπει το GEMINI_API_KEY στο Vercel."
      });
    }

    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
      return res.status(503).json({
        error: "Υπάρχει μεγάλη κίνηση αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο."
      });
    }

    activeRequests += 1;

    try {
      let history = memory.get(userId) || [];
      history = history.slice(-MAX_HISTORY_MESSAGES);

      const relevantFaqs = scoredFaqs.map((item) => item.faq);
      const faqContext = buildFaqContext(relevantFaqs);
      const historyContext = buildHistoryContext(history, safeMessage);
      const contextMessage = buildGeminiPrompt({
        faqContext,
        historyContext,
        message: safeMessage
      });

      const currentChat = [
        {
          role: "user",
          parts: [{ text: contextMessage }]
        }
      ];

      const result = await model.generateContent({
        contents: currentChat,
        generationConfig: GEMINI_GENERATION_CONFIG
      });
      const reply = cleanReply(result.response.text());
      const usage = result.response.usageMetadata || {};
      const cost = calculateCostEstimate(usage);

      history.push({
        role: "user",
        parts: [{ text: safeMessage }]
      });

      history.push({
        role: "model",
        parts: [{ text: reply }]
      });

      if (history.length > MAX_HISTORY_MESSAGES) {
        history = history.slice(-MAX_HISTORY_MESSAGES);
      }

      memory.set(userId, history);

      console.log("BOT_USAGE", {
        userId,
        source: "gemini",
        model: GEMINI_MODEL,
        matchedFaqIds: scoredFaqs.map((item) => item.faq.id),
        bestScore: scoredFaqs[0]?.score || 0,
        sentFaqs: relevantFaqs.length,
        sentHistory: Boolean(historyContext),
        messagePreview: safeMessage.slice(0, 80),
        ...cost
      });

      return res.status(200).json({
        reply,
        source: "gemini",
        usedGemini: true,
        model: GEMINI_MODEL,
        matchedFaqIds: scoredFaqs.map((item) => item.faq.id),
        ...cost
      });
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
    }
  } catch (err) {
    console.error("Σφάλμα στο backend:", err);
    return res.status(500).json({
      error: "Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά σε λίγο."
    });
  }
}
