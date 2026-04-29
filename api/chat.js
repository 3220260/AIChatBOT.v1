import { GoogleGenerativeAI } from "@google/generative-ai";
import { faqs } from "../faqs.js";

/* =========================================
   1. SETTINGS
   ========================================= */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const MAX_MESSAGE_LENGTH = 700;
const MAX_MESSAGES_PER_WINDOW = 8;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_ACTIVE_REQUESTS = 20;
const MAX_HISTORY_MESSAGES = 8;
const MAX_RELEVANT_FAQS_FOR_GEMINI = 6;

// Αν direct FAQ score >= αυτό, απαντάμε χωρίς Gemini.
const DIRECT_FAQ_SCORE = 8;

// Αν έχει σχετικό FAQ αλλά όχι αρκετά καθαρό match, τότε πάμε Gemini.
const MIN_RELEVANT_SCORE_FOR_GEMINI = 2;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: GEMINI_MODEL }) : null;

const memory = new Map();
const rateLimitStore = new Map();
let activeRequests = 0;

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

/* =========================================
   3. LOCAL FILTERS — 0 TOKENS
   ========================================= */
const LOCAL_SMALL_TALK = [
  {
    patterns: ["γεια", "γειά", "καλημερα", "καλησπερα", "καληνυχτα", "hello", "hi", "geia", "kalimera", "kalispera"],
    reply: "Γεια σας! Μπορώ να σας βοηθήσω με πληροφορίες για κινητή, σταθερή, internet, EON TV, ασφάλιση υγείας, αιτήσεις και δικαιολογητικά."
  },
  {
    patterns: ["ευχαριστω", "ευχαριστώ", "thanks", "thank you", "euxaristo", "efxaristo"],
    reply: "Παρακαλώ! Είμαι στη διάθεσή σας για πληροφορίες σχετικά με τις προσφορές και τις διαδικασίες του Συνεταιρισμού."
  },
  {
    patterns: ["ποιος εισαι", "τι εισαι", "ανθρωπος", "ρομποτ", "bot", "poios eisai", "ti eisai", "robot"],
    reply: "Είμαι ο ψηφιακός βοηθός του Synetelas και απαντώ σε ερωτήσεις για προσφορές, αιτήσεις, δικαιολογητικά, κινητή, σταθερή, EON TV και ασφάλιση υγείας."
  }
];

const BUSINESS_KEYWORDS = [
  "vodafone",
  "cu",
  "nova",
  "q",
  "eon",
  "tv",
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
  "ασφάλιση",
  "ασφαλιση",
  "asfalisi",
  "υγεία",
  "υγεια",
  "igeia",
  "interamerican",
  "anytime",
  "προσφορά",
  "προσφορα",
  "prosfora",
  "τιμή",
  "τιμη",
  "timi",
  "συνεταιρισμός",
  "συνεταιρισμος",
  "sinetairismos",
  "synetelas",
  "πκσαα",
  "pksaa"
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
  "minecraft",
  "fortnite",
  "instagram",
  "tiktok",
  "facebook"
];

function getLocalSmallTalkReply(message) {
  const normalized = toSearchKey(message);

  for (const item of LOCAL_SMALL_TALK) {
    if (item.patterns.some((pattern) => normalized.includes(toSearchKey(pattern)))) {
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

  if (hasBusinessKeyword(message)) {
    return false;
  }

  return OUT_OF_SCOPE_KEYWORDS.some((keyword) => normalizedMessage.includes(toSearchKey(keyword)));
}

/* =========================================
   4. FAQ MATCHING — 0 TOKENS WHEN DIRECT
   ========================================= */
function getRelevantFaqs(message, limit = MAX_RELEVANT_FAQS_FOR_GEMINI) {
  const normalizedMessage = toSearchKey(message);

  const messageWords = normalizedMessage
    .split(" ")
    .filter((word) => word.length >= 3);

  const scored = faqs.map((faq) => {
    const searchableText = toSearchKey([
      faq.category,
      faq.question,
      faq.answer,
      ...(faq.keywords || [])
    ].join(" "));

    let score = 0;

    for (const word of messageWords) {
      if (searchableText.includes(word)) {
        score += 1;
      }
    }

    for (const keyword of faq.keywords || []) {
      if (normalizedMessage.includes(toSearchKey(keyword))) {
        score += 4;
      }
    }

    // Ενισχύσεις για πολύ συχνές προθέσεις.
    if (normalizedMessage.includes("dikaiologitika") && searchableText.includes("dikaiologitika")) score += 3;
    if (normalizedMessage.includes("katathesi") && searchableText.includes("katathesi")) score += 3;
    if (normalizedMessage.includes("foritotita") && searchableText.includes("foritotita")) score += 3;
    if (normalizedMessage.includes("energopoi") && searchableText.includes("energopoi")) score += 3;

    return { faq, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function shouldAnswerDirectly(scoredFaqs) {
  if (!scoredFaqs.length) return false;
  return scoredFaqs[0].score >= DIRECT_FAQ_SCORE;
}

function buildFaqContext(relevantFaqs) {
  return relevantFaqs
    .map((f) => `Κατηγορία: ${f.category}\nΕρώτηση: ${f.question}\nΑπάντηση: ${f.answer}`)
    .join("\n\n---\n\n");
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
  const outputTokens = usage.candidatesTokenCount || 0;
  const totalTokens = usage.totalTokenCount || inputTokens + outputTokens;

  // Ενδεικτικές τιμές για Gemini 2.5 Flash paid tier:
  // input: $0.30 / 1M tokens, output: $2.50 / 1M tokens
  const inputCostUsd = (inputTokens / 1_000_000) * 0.30;
  const outputCostUsd = (outputTokens / 1_000_000) * 2.50;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: Number((inputCostUsd + outputCostUsd).toFixed(8))
  };
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

    if (isClearlyOutOfScope(safeMessage)) {
      return res.status(200).json({
        reply: "Μπορώ να βοηθήσω μόνο με πληροφορίες για τις προσφορές, τις αιτήσεις, τα δικαιολογητικά, την κινητή, τη σταθερή, την EON TV και την ασφάλιση υγείας του Συνεταιρισμού.",
        source: "blocked_out_of_scope",
        usedGemini: false,
        estimatedTokensUsed: 0
      });
    }

    const scoredFaqs = getRelevantFaqs(safeMessage);

    if (!scoredFaqs.length || scoredFaqs[0].score < MIN_RELEVANT_SCORE_FOR_GEMINI) {
      return res.status(200).json({
        reply: "Δεν έχω σίγουρη πληροφορία γι’ αυτό μέσα στα διαθέσιμα στοιχεία. Καλύτερα να επικοινωνήσετε με εκπρόσωπο του Συνεταιρισμού.",
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

      const contextMessage = `
Είσαι φιλικό chatbot εξυπηρέτησης πελατών για τον Συνεταιρισμό Synetelas.

Απάντησε πάντα στα ελληνικά, σύντομα και κατανοητά.

Χρησιμοποίησε ΜΟΝΟ τις παρακάτω πληροφορίες όταν η ερώτηση αφορά υπηρεσίες, τιμές, δικαιολογητικά, διαδικασίες ή προσφορές.

Αν οι πληροφορίες δεν επαρκούν, μην μαντεύεις. Πες:
"Δεν έχω σίγουρη πληροφορία γι’ αυτό. Καλύτερα να επικοινωνήσετε με εκπρόσωπο του Συνεταιρισμού."

Μην εμφανίζεις τεχνικούς όρους, IDs, scores ή αναφορές εσωτερικού συστήματος.

ΠΛΗΡΟΦΟΡΙΕΣ:
${faqContext}

ΜΗΝΥΜΑ ΠΕΛΑΤΗ:
${safeMessage}
`;

      const currentChat = [
        ...history,
        {
          role: "user",
          parts: [{ text: contextMessage }]
        }
      ];

      const result = await model.generateContent({ contents: currentChat });
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
        matchedFaqIds: scoredFaqs.map((item) => item.faq.id),
        bestScore: scoredFaqs[0]?.score || 0,
        messagePreview: safeMessage.slice(0, 80),
        ...cost
      });

      return res.status(200).json({
        reply,
        source: "gemini",
        usedGemini: true,
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
