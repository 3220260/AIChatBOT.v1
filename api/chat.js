import { GoogleGenerativeAI } from "@google/generative-ai";
import { faqs } from "../faqs.js";

/* =========================================
   1. SETTINGS
   ========================================= */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const DEBUG = process.env.DEBUG === "true";

const MAX_MESSAGE_LENGTH = 500;
const MAX_MESSAGES_PER_WINDOW = 8;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_ACTIVE_REQUESTS = 20;
const MAX_HISTORY_MESSAGES = 4;
const MAX_RELEVANT_FAQS_FOR_GEMINI = 5;
const MAX_FAQ_ANSWER_CHARS_FOR_GEMINI = 420;
const MAX_HISTORY_CHARS_FOR_GEMINI = 360;
const MAX_OFF_TOPIC_PLAYFUL_REPLIES = 5;
const MAX_OUTPUT_TOKENS = readIntEnv("GEMINI_MAX_OUTPUT_TOKENS", 220, 80, 600);
const GEMINI_THINKING_BUDGET = readIntEnv("GEMINI_THINKING_BUDGET", 0, -1, 24576);

// Αν direct FAQ score >= αυτό, απαντάμε χωρίς Gemini.
const DIRECT_FAQ_SCORE = 7;
const DIRECT_FAQ_SCORE_GAP = 2;

// Αν έχει σχετικό FAQ αλλά όχι αρκετά καθαρό match, τότε πάμε Gemini.
const MIN_RELEVANT_SCORE_FOR_GEMINI = 2;

const UNKNOWN_REPLY = "Δεν έχω σίγουρη πληροφορία γι’ αυτό. Καλύτερα να επικοινωνήσετε με τον Συνεταιρισμό.";
const SCOPE_REPLY = "Μπορώ να βοηθήσω με πληροφορίες για τις προσφορές, τις διαδικασίες και την ιστοσελίδα του Συνεταιρισμού.";

const GEMINI_SYSTEM_RULES = [
  "You are Sofia, the official digital assistant for the Π.Κ.Σ.Α.Α. website.",
  "Reply only in Greek.",
  "Use only the provided website knowledge/context.",
  "Help users understand offers, documents, procedures, contact details and how to use the website.",
  "Do not invent prices, terms, offers, phone numbers, emails, IBANs, or procedures.",
  `If the context is insufficient, say exactly: "${UNKNOWN_REPLY}"`,
  `If the question is unrelated to the website, reply exactly with: "${SCOPE_REPLY}"`,
  "Be concise, friendly and practical.",
  "When the user asks for a process, answer with short numbered steps.",
  "When the user asks for documents, answer with a compact checklist.",
  "Never show IDs, scores, token counts, costs or internal notes."
].join(" ");

const GEMINI_GENERATION_CONFIG = buildGenerationConfig(GEMINI_MODEL);

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: GEMINI_MODEL }) : null;

const memory = new Map();
const rateLimitStore = new Map();
const offTopicPlayStore = new Map();
let activeRequests = 0;

function readIntEnv(name, fallback, min, max) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

function sendJson(res, statusCode, payload, debugPayload = {}) {
  const responsePayload = DEBUG
    ? { ...payload, ...debugPayload }
    : payload;

  return res.status(statusCode).json(responsePayload);
}

function buildGenerationConfig(modelName = GEMINI_MODEL) {
  const normalizedModel = String(modelName).toLowerCase();
  const baseConfig = {
    temperature: 0.15,
    topP: 0.8,
    maxOutputTokens: MAX_OUTPUT_TOKENS
  };

  if (normalizedModel.startsWith("gemini-2.5")) {
    return {
      ...baseConfig,
      thinkingConfig: {
        thinkingBudget: GEMINI_THINKING_BUDGET
      }
    };
  }

  // Keep Gemini 3 configuration conservative for SDK compatibility.
  if (normalizedModel.startsWith("gemini-3")) {
    return baseConfig;
  }

  return baseConfig;
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
    .replace(/\bthlefon/g, "tilefon")
    .replace(/\btilephon/g, "tilefon")
    .replace(/\bkinhth/g, "kinito")
    .replace(/\bkiniti/g, "kinito")
    .replace(/\bstatherh/g, "statheri")
    .replace(/\bforhtothta/g, "foritotita")
    .replace(/\bforitothta/g, "foritotita")
    .replace(/\bforhtotita/g, "foritotita")
    .replace(/\bdikaiologhtika/g, "dikaiologitika")
    .replace(/\bdikeologhtika/g, "dikeologitika")
    .replace(/\bdikeologitika/g, "dikeologitika")
    .replace(/\baithsh/g, "aitisi")
    .replace(/\bepikinonia/g, "epikoinonia")
    .replace(/\bepikinono/g, "epikoinon")
    .replace(/\bepikoinono/g, "epikoinon")
    .replace(/\bstelnw/g, "stelno")
    .replace(/\bsteal\b/g, "steil")
    .replace(/\bstile\b/g, "steil")
    .replace(/\bstilw\b/g, "steil")
    .replace(/\bstelnw\b/g, "stelno")
    .replace(/\bteile\b/g, "steile")
    .replace(/\bmoi\b/g, "mou")
    .replace(/\bmoy\b/g, "mou")
    .replace(/\btaytotita/g, "tautotita")
    .replace(/\btautothta/g, "tautotita")
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
    patterns: ["γεια", "γειά", "καλημερα", "καλησπερα", "καληνυχτα", "hello", "geia", "kalimera", "kalispera","gia sou","hi","χαι","γεια σου","μιλα","μιλα μου","τι κανεις","τι κανεισ", "ti kaneis","mila","mila mou","mila moy"],
    reply: "Γεια σας! Είμαι η Sofia και μπορώ να βοηθήσω με προσφορές, δικαιολογητικά, διαδικασίες και στοιχεία επικοινωνίας του Π.Κ.Σ.Α.Α."
  },
  {
    patterns: ["ευχαριστω", "ευχαριστώ", "thanks", "thank you", "euxaristo", "efxaristo","kleise","klise","off","of","οφ","κλεισε"],
    reply: "Παρακαλώ! Είμαι στη διάθεσή σας για πληροφορίες της ιστοσελίδας του Π.Κ.Σ.Α.Α."
  },
  {
    patterns: [
      "ποιος εισαι",
      "ποιος είσαι",
      "τι εισαι",
      "τι είσαι",
      "πως σε λενε",
      "πώς σε λένε",
      "ποιο ειναι το ονομα σου",
      "ποιο είναι το όνομά σου",
      "ονομα σου",
      "όνομα σου",
      "ανθρωπος",
      "ρομποτ",
      "bot",
      "poios eisai",
      "ti eisai",
      "pos se lene",
      "pos se lene?",
      "pio einai to onoma sou",
      "poio einai to onoma sou",
      "onoma sou",
      "onomazesai",
      "robot"
    ],
    reply: "Είμαι η Sofia, η ψηφιακή βοηθός του Π.Κ.Σ.Α.Α., και απαντώ με πληροφορίες από την ιστοσελίδα για προσφορές, διαδικασίες και επικοινωνία."
  }
];

const INTERNAL_FAQ_CATEGORIES = new Set(["Οδηγίες bot"]);

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
  "timi",
  "συνεταιρισμός",
  "συνεταιρισμος",
  "synetairismos",
  "sinetairismos",
  "πκσαα",
  "pksaa",
  "προσφορές",
  "προσφορες",
  "prosfores",
  "υγεία",
  "υγεια",
  "igeia",
  "ασφάλιση",
  "ασφαλιση",
  "asfalisi",
  "ασφάλεια",
  "ασφαλεια",
  "asfaleia",
  "interamerican",
  "anytime",
  "επικοινωνία",
  "επικοινωνια",
  "epikoinonia",
  "viber",
  "χάρτης",
  "χαρτης",
  "xartis",
  "maps",
  "google maps",
  "cosmote",
  "cookies",
  "δεδομένα",
  "δεδομενα",
  "dedomena"
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
  "καιρό",
  "καιρο",
  "kero",
  "kairos",
  "ποδόσφαιρο",
  "ποδοσφαιρο",
  "podosfairo",
  "πρωτάθλημα",
  "πρωταθλημα",
  "protathlima",
  "στοίχημα",
  "στοιχημα",
  "stoixima",
  "μαγειρική",
  "μαγειρικη",
  "mageiriki",
  "συνταγή",
  "συνταγη",
  "syntagi",
  "μακαρόνια",
  "μακαρονια",
  "makaronia",
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
  "facebook",
  "διάγνωση",
  "διαγνωση",
  "diagnosi",
  "φαρμακο",
  "φαρμακο",
  "επένδυση",
  "επενδυση",
  "ependysi",
  "μετοχές",
  "μετοχες",
  "metoxes",
  "δικηγόρος",
  "δικηγορος",
  "dikigoros"
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

const WEBSITE_RELATED_KEYWORDS = [
  "συνεταιρισμός",
  "συνεταιρισμος",
  "synetairismos",
  "sinetairismos",
  "synetelas",
  "πκσαα",
  "pksaa",
  "προσφορά",
  "προσφορα",
  "προσφορές",
  "προσφορες",
  "prosfora",
  "prosfores",
  "vodafone",
  "cu",
  "nova",
  "q",
  "eon",
  "tv",
  "internet",
  "ίντερνετ",
  "ιντερνετ",
  "σταθερή",
  "σταθερη",
  "σταθερό",
  "σταθερο",
  "statheri",
  "stathero",
  "κινητή",
  "κινητη",
  "kinito",
  "kinita",
  "δικαιολογητικά",
  "δικαιολογητικα",
  "dikaiologitika",
  "dikeologitika",
  "xartia",
  "έγγραφα",
  "εγγραφα",
  "eggrafa",
  "αίτηση",
  "αιτηση",
  "aitisi",
  "φορητότητα",
  "φορητοτητα",
  "foritotita",
  "νέος αριθμός",
  "νεος αριθμος",
  "neos arithmos",
  "thelo neo arithmo",
  "sim",
  "ενεργοποίηση",
  "ενεργοποιηση",
  "energopoiisi",
  "energopoiw",
  "iban",
  "κατάθεση",
  "καταθεση",
  "katathesi",
  "email",
  "mail",
  "τηλέφωνο",
  "τηλεφωνο",
  "tilefono",
  "επικοινωνία",
  "επικοινωνια",
  "επικοινωνώ",
  "επικοινωνω",
  "επικοινωνήσω",
  "επικοινωνησω",
  "epikoinonia",
  "epikoinon",
  "epikoinoniso",
  "διεύθυνση",
  "διευθυνση",
  "diefthinsi",
  "dieuthinsi",
  "viber",
  "υγεία",
  "υγεια",
  "igeia",
  "cookies",
  "cookie",
  "προσωπικά δεδομένα",
  "προσωπικα δεδομενα",
  "prosopika dedomena",
  "χρήση σελίδας",
  "χρηση σελιδας",
  "xrisi selidas",
  "πού πατάω",
  "που παταω",
  "pou patao",
  "πού στέλνω",
  "που στελνω",
  "pou stelno",
  "πώς κάνω",
  "πως κανω",
  "pos kano",
  "καλύτερη προσφορά",
  "καλυτερη προσφορα",
  "kaliteri prosfora",
  "ποια προσφορά",
  "poia prosfora"
];

const GENERAL_CONTEXT_FAQ_IDS = new Set([
  "site-pksaa-overview",
  "site-offers-overview",
  "site-use-page",
  "site-application-steps",
  "site-contact-current",
  "documents-general-checklist"
]);

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
  return isClearlyOutOfScope(message);
}

function shouldUseGeminiForWebsiteAdvice(message) {
  const normalizedMessage = toSearchKey(message);

  const asksForAdviceOrComparison =
    /(kaliteri|kalyteri|katallili|protini|protein|simbouli|gia emena|gia mena|poia prosfora|pia prosfora|poia|pia|axizi|aksizi|axizei|aksizei|simferi|symferi|sigkrine|sigkrisi|sigrine|sigrisi|sugkrine|sugkrisi|sygkrine|sygkrisi|singkrine|singrisi|sigrino|sigkrino|sugkrino|sygkrino|xamilo kostos|xamilo|fthino|fthinotero|ti na dialexo|ti na epilexo|ti na prosexo|prosexo)/.test(normalizedMessage);

  const mentionsOfferTopic =
    /(prosfora|prosfores|paketo|programma|vodafone|cu|nova|q|kinito|kinita|kiniti|kartokinito|tilefonia|internet|eon|cosmote)/.test(normalizedMessage);

  return asksForAdviceOrComparison && mentionsOfferTopic;
}

function isWebsiteRelatedQuestion(message) {
  const normalizedMessage = toSearchKey(message);
  if (!normalizedMessage) return false;

  return WEBSITE_RELATED_KEYWORDS.some((keyword) => {
    const normalizedKeyword = toSearchKey(keyword);
    return normalizedKeyword.length >= 2 && normalizedMessage.includes(normalizedKeyword);
  });
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
    if (/(dikaiologitika|dikeologitika)/.test(normalizedMessage)
      && /(dikaiologitika|dikeologitika)/.test(searchableText)) {
      score += 3;
    }
    if (normalizedMessage.includes("katathesi") && searchableText.includes("katathesi")) score += 3;
    if (normalizedMessage.includes("foritotita") && searchableText.includes("foritotita")) score += 3;
    if (normalizedMessage.includes("energopoi") && searchableText.includes("energopoi")) score += 3;
    if (/(epikoinonia|epikoinon|epikinonia|epikinon|tilefono|kinito|email|dieuth|diefth|dieth|dith|viber|xartis|maps|brisketai)/.test(normalizedMessage)
      && /(epikoinonia|epikoinon|epikinonia|epikinon|tilefono|kinito|email|dieuth|diefth|dieth|dith|viber|xartis|maps|karistou|brisketai)/.test(searchableText)) {
      score += 8;
    }
    if (/(epikoinon|epikinon|tilefono|email)/.test(normalizedMessage)
      && faq.id === "site-contact-current") {
      score += 18;
    }
    if (/(aitisi|vima|diadikasia|xrisimopoi|pato|anoigo|stelno|steln|apostol)/.test(normalizedMessage)
      && /(aitisi|vima|diadikasia|xrisimopoi|pato|apostoli|steln|email)/.test(searchableText)) {
      score += 6;
    }
    if (/(pksaa|sinetairismos|synetairismos|sineterismos|poios eisai|ti einai)/.test(normalizedMessage)
      && /(pksaa|sinetairismos|synetairismos|sineterismos|promitheftikos|katanalotikos)/.test(searchableText)) {
      score += 10;
    }
    if (/(sinetairism|synetairism|sineterism|pksaa)/.test(normalizedMessage)
      && faq.id === "site-pksaa-overview") {
      score += 18;
    }
    if (/(pou|pu|brisketai|vrisket|xartis|maps|dieuth|diefth)/.test(normalizedMessage)
      && /(sinetairism|synetairism|sineterism|pksaa)/.test(normalizedMessage)
      && faq.id === "site-location-map") {
      score += 24;
    }
    if (/(pata|pato|patis|katalev|xrisimopoi|pou)/.test(normalizedMessage)
      && /(prosfora|prosfores)/.test(normalizedMessage)
      && faq.id === "site-use-page") {
      score += 20;
    }
    if (/(cookies|dedomena|prosopika)/.test(normalizedMessage)
      && /(cookies|dedomena|prosopika)/.test(searchableText)) {
      score += 10;
    }
    if (/(igeia|asfalisi|interamerican|nosokomeiaki|perithalpsi)/.test(normalizedMessage)
      && /(igeia|asfalisi|interamerican|nosokomeiaki|perithalpsi)/.test(searchableText)) {
      score += 8;
    }

    const wantsPrice = /(prosfora|timi|times|poso|kostos|pagio)/.test(normalizedMessage);
    const isPriceFaq = /(price|program|offer)/.test(faq.id)
      || /(prosfora|timi|times|kostos|pagio|17 90|20 90)/.test(searchableText);

    if (wantsPrice && isPriceFaq) {
      score += 12;
    } else if (wantsPrice && /(prosfora|timi|times|kostos|pagio|17 90|20 90)/.test(searchableText)) {
      score += 7;
    }

    if (/(dikaiologitika|dikeologitika|xartia|eggrafa)/.test(normalizedMessage)
      && /(dikaiologitika|dikeologitika|tautotita|eggrafa|apodeiktiko|dilosi)/.test(searchableText)) {
      score += 5;
    }

    if (/vodafone/.test(normalizedMessage)
      && /cu/.test(normalizedMessage)
      && /(dikaiologitika|dikeologitika|xartia|eggrafa)/.test(normalizedMessage)
      && faq.id === "vodafone-cu-documents-overview") {
      score += 20;
    }

    const asksForDocuments = /(dikaiologitika|dikeologitika|xartia|eggrafa|ti xartia|poia xartia)/.test(normalizedMessage);
    const mentionsVodafoneMobile = /vodafone/.test(normalizedMessage)
      && /(cu|kinito|kiniti|kinita|kartokinito|sim|arithmo|arithmos|foritotita)/.test(normalizedMessage);
    const mentionsAnyMobile = /(kinito|kiniti|kinita|kartokinito|sim|arithmo|arithmos|foritotita|vodafone|cu|nova|q)/.test(normalizedMessage);

    if (asksForDocuments && mentionsVodafoneMobile && faq.id === "vodafone-cu-documents-overview") {
      score += 90;
    }

    if (asksForDocuments && mentionsAnyMobile && /(mobile|vodafone|nova|documents|portability|new-number)/.test(faq.id)) {
      score += 35;
    }

    if (asksForDocuments && faq.id === "site-offers-overview") {
      score -= 100;
    }

    const asksBotToSendDocuments = /(steile mou|steil mou|stile mou|stile mi|tile mou|tile mi|teile mou|teile mi|dose mou|dos mou|ta xartia gia|xartia gia kiniti|xartia gia kinito)/.test(normalizedMessage);
    const wantsSubmissionEmail = !asksBotToSendDocuments
      && /(email|emel|mail|mel|apostol|steln|stelno|steil)/.test(normalizedMessage);
    const wantsOfferInfo = /(prosfora|prosfores|paketo|programma|timi|times|kostos|pagio|xamilo|fthino)/.test(normalizedMessage);
    const mentionsPhoneService = /(tilefono|thlefono|tilefonia|kinito|kinita|kiniti|kartokinito|stathero|statheri|internet|vodafone|cu|nova|q|eon|cosmote)/.test(normalizedMessage);
    const wantsContactPhone = !wantsOfferInfo && /(tilefono|thlefono|epikoinonia|epikoinon|epikinonia|epikinon)/.test(normalizedMessage);
    const mentionsMobileProvider = /(vodafone|cu|nova|q|kartokinit|kinito|sim|foritotita|dikaiologitika|dikeologitika)/.test(normalizedMessage);

    if (wantsSubmissionEmail && faq.id === "mobile-submit-email") {
      score += 60;
    }

    if (wantsSubmissionEmail && mentionsMobileProvider && /synetelas2011@gmail\.com/.test(searchableText)) {
      score += 50;
    }

    if (wantsContactPhone && faq.id === "site-contact-current") {
      score += 80;
    }

    if (wantsOfferInfo && mentionsPhoneService && faq.id === "site-contact-current") {
      score -= 100;
    }

    if (wantsOfferInfo && mentionsPhoneService && /(offer|offers|price|program|mobile|fixed|vodafone|nova|cu|q|eon|internet)/.test(faq.id)) {
      score += 18;
    }

    // INTENT CORRECTION GUARD
    // Κρατάμε ξεχωριστά intents που μπερδεύονται εύκολα:
    // - προσφορά τηλεφωνίας != τηλέφωνο επικοινωνίας
    // - τι χαρτιά χρειάζονται != πού στέλνω τα χαρτιά
    // - σύγκριση/τι αξίζει/χαμηλό κόστος -> Gemini
    const intentWantsAdvice = shouldUseGeminiForWebsiteAdvice(message);

    const intentWantsOfferInfo =
      /(prosfora|prosfores|paketo|programma|timi|times|kostos|pagio|xamilo|fthino|axizi|axizei|aksizi|simferi|symferi)/.test(normalizedMessage);

    const intentMentionsPhoneService =
      /(tilefono|thlefono|tilefonia|kinito|kinita|kiniti|kartokinito|stathero|statheri|internet|vodafone|cu|nova|q|eon|cosmote)/.test(normalizedMessage);

    const intentAsksContactPhone =
      !intentWantsOfferInfo
      && (
        /(tilefono epikoinonias|thlefono epikoinonias|arithmos epikoinonias)/.test(normalizedMessage)
        || (/(tilefono|thlefono)/.test(normalizedMessage) && /(epikoinonia|epikoinon|epikinonia|epikinon)/.test(normalizedMessage))
      );

    const intentAsksWhereToSendDocuments =
      /(pou|pu|pos|pws|se poio|se poia)/.test(normalizedMessage)
      && /(steln|stelno|steil|steal|apostol|email|mail)/.test(normalizedMessage)
      && /(xartia|eggrafa|dikaiologitika|dikeologitika)/.test(normalizedMessage);

    const intentAsksWhatDocuments =
      !intentAsksWhereToSendDocuments
      && /(ti xartia|poia xartia|ti dikaiologitika|poia dikaiologitika|xartia gia|dikaiologitika gia|dikeologitika gia|steile mou|teile mou|stile mou|dose mou|dos mou|xreiazomai xartia|xreiazete xartia)/.test(normalizedMessage);

    const intentMentionsMobile =
      /(kinito|kiniti|kinita|kartokinito|mobile|vodafone|cu|nova|q|sim|arithmo|arithmos|foritotita)/.test(normalizedMessage);

    const intentMentionsVodafoneMobile =
      /vodafone/.test(normalizedMessage)
      && /(cu|kinito|kiniti|kinita|kartokinito|sim|arithmo|arithmos|foritotita)/.test(normalizedMessage);

    const intentMentionsTv =
      /(eon|cosmote|tv|tileorasi)/.test(normalizedMessage);

    // Σύγκριση / τι αξίζει / χαμηλό κόστος: να μην απαντά email/τηλέφωνο/άσχετο TV FAQ.
    if (intentWantsAdvice) {
      if (faq.id === "mobile-submit-email" || faq.id === "site-contact-current" || faq.id === "site-offers-overview") {
        score -= 200;
      }

      if (intentMentionsMobile && /(eon|tv|cosmote)/.test(faq.id)) {
        score -= 200;
      }

      if (intentMentionsMobile && /(mobile|vodafone|nova|cu|q|price|program|offer)/.test(faq.id)) {
        score += 60;
      }
    }

    // Προσφορά τηλεφωνίας: να μην το περνάει ως τηλέφωνο επικοινωνίας.
    if (intentWantsOfferInfo && intentMentionsPhoneService && faq.id === "site-contact-current") {
      score -= 180;
    }

    // Απλή ερώτηση τύπου "prosfora tilefono": απάντηση από overview προσφορών, όχι Gemini.
    if (!intentWantsAdvice && intentWantsOfferInfo && intentMentionsPhoneService && faq.id === "site-offers-overview") {
      score += 120;
    }

    // Πραγματική ερώτηση για τηλέφωνο επικοινωνίας.
    if (intentAsksContactPhone && faq.id === "site-contact-current") {
      score += 140;
    }

    // "Τι χαρτιά για Vodafone κινητό": να προτιμά δικαιολογητικά, όχι γενική λίστα προσφορών ή email αποστολής.
    if (intentAsksWhatDocuments && intentMentionsVodafoneMobile && /(vodafone|mobile|documents|document|new-number|portability)/.test(faq.id)) {
      score += 110;
    }

    if (intentAsksWhatDocuments && intentMentionsMobile && /(mobile|documents|document|vodafone|nova|new-number|portability)/.test(faq.id)) {
      score += 65;
    }

    if (intentAsksWhatDocuments && (faq.id === "mobile-submit-email" || faq.id === "site-offers-overview")) {
      score -= 140;
    }

    // "Πού στέλνω χαρτιά": εδώ όντως θέλουμε το email αποστολής.
    if (intentAsksWhereToSendDocuments && faq.id === "mobile-submit-email") {
      score += 120;
    }

    return { faq, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function isAllowedFaq(faq) {
  return !INTERNAL_FAQ_CATEGORIES.has(faq.category);
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

function buildGeneralSiteContext() {
  return [
    "Η Sofia είναι ψηφιακή βοηθός της ιστοσελίδας synetairismos-astynomikon.gr.",
    "Βοηθά τους χρήστες με πληροφορίες για προσφορές, δικαιολογητικά, διαδικασίες, επικοινωνία και χρήση της ιστοσελίδας.",
    "Δεν εφευρίσκει τιμές, όρους, IBAN, τηλέφωνα ή έγγραφα.",
    `Αν δεν υπάρχει σίγουρη πληροφορία, απαντά: "${UNKNOWN_REPLY}"`
  ].join(" ");
}

function getGeneralContextFaqs(limit = 3) {
  return faqs
    .filter((faq) => GENERAL_CONTEXT_FAQ_IDS.has(faq.id))
    .slice(0, limit);
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

  if (isFollowUpQuestion(message)) return true;
  if (words.length <= 6) return true;

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

function buildGeminiPrompt({ faqContext, generalContext, historyContext, message }) {
  return [
    GEMINI_SYSTEM_RULES,
    generalContext ? `Website context:\n${generalContext}` : "",
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

function rememberTurn(userId, message, reply) {
  if (!userId || !message || !reply) return;

  let history = memory.get(userId) || [];
  history = history.slice(-MAX_HISTORY_MESSAGES);

  history.push({
    role: "user",
    parts: [{ text: String(message) }]
  });

  history.push({
    role: "model",
    parts: [{ text: String(reply) }]
  });

  if (history.length > MAX_HISTORY_MESSAGES) {
    history = history.slice(-MAX_HISTORY_MESSAGES);
  }

  memory.set(userId, history);
}

function hasPriorMemory(userId) {
  return (memory.get(userId) || []).length > 0;
}

function isFollowUpQuestion(message) {
  const normalizedMessage = toSearchKey(message);
  const words = normalizedMessage.split(" ").filter(Boolean);

  if (!normalizedMessage || words.length > 6) return false;

  return /(ine idia|einai idia|idia|idio|to idio|same|diafora|diafer|diaforet|afto|auto|ayto|auta|afta|ekeino)/.test(normalizedMessage);
}

/* =========================================
   5. RATE LIMITS
   ========================================= */
function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

function normalizeRateLimitPart(value) {
  return String(value || "unknown")
    .replace(/[^\w:.-]/g, "_")
    .slice(0, 120);
}

function checkRateLimitBucket(key, now) {
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
    return Math.ceil((current.resetAt - now) / 1000);
  }

  return 0;
}

function checkRateLimit(req, userId) {
  const ip = normalizeRateLimitPart(getClientIp(req));
  const safeUserId = normalizeRateLimitPart(userId);
  const userAgent = normalizeRateLimitPart(req.headers["user-agent"] || "unknown").slice(0, 80);
  const now = Date.now();
  const key = `${ip}:${safeUserId}:${userAgent}`;
  const retryAfterSeconds = checkRateLimitBucket(key, now);

  return {
    allowed: retryAfterSeconds === 0,
    retryAfterSeconds,
    key
  };
}

function getOffTopicPlayCountKey(req, userId) {
  const ip = normalizeRateLimitPart(getClientIp(req));
  const safeUserId = normalizeRateLimitPart(userId).slice(0, 60);
  return `${ip}:${safeUserId}`;
}

function getPlayfulOffTopicReply(message, count) {
  const replies = [
    "Καλή ερώτηση, αλλά εγώ είμαι εδώ κυρίως για να βοηθάω με τις προσφορές και τις διαδικασίες του Συνεταιρισμού. Θέλετε να σας δείξω ποιες προσφορές υπάρχουν;",
    "Μπορώ να βοηθήσω καλύτερα σε θέματα της ιστοσελίδας, όπως προσφορές, δικαιολογητικά, αιτήσεις και επικοινωνία. Για ποια προσφορά ενδιαφέρεστε;",
    "Αυτό είναι λίγο έξω από τον ρόλο μου 😄 Είμαι η Sofia και γνωρίζω πληροφορίες για τον Π.Κ.Σ.Α.Α., τις προσφορές και τα βήματα αίτησης.",
    "Δεν θέλω να σας δώσω άσχετη ή λάθος απάντηση. Μπορώ όμως να σας βοηθήσω με κινητή, σταθερή, internet, τηλεόραση, υγεία ή δικαιολογητικά.",
    "Ας το γυρίσουμε λίγο στο πρακτικό κομμάτι 😊 Θέλετε πληροφορίες για προσφορές, αίτηση, δικαιολογητικά ή στοιχεία επικοινωνίας;"
  ];

  if (count > MAX_OFF_TOPIC_PLAYFUL_REPLIES) {
    return "Μπορώ να βοηθήσω κυρίως με πληροφορίες για τις προσφορές, τα δικαιολογητικά, τις διαδικασίες και την ιστοσελίδα του Συνεταιρισμού.";
  }

  return replies[(count - 1) % replies.length];
}

function sendLocalOffTopicReply(req, res, userId, message, source = "local_off_topic_playful") {
  const key = getOffTopicPlayCountKey(req, userId);
  const count = (offTopicPlayStore.get(key) || 0) + 1;
  offTopicPlayStore.set(key, count);

  return sendJson(res, 200, {
    reply: getPlayfulOffTopicReply(message, count),
    usedGemini: false
  }, {
    source,
    offTopicCount: count
  });
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

    if (req.method === "GET") {
      return sendJson(res, 200, {
        ok: true,
        service: "Sofia Chat API",
        message: "Χρησιμοποίησε POST /api/chat με { message, userId }."
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Method not allowed. Use POST /api/chat." });
    }

    const { message, userId } = req.body || {};
    const safeMessage = typeof message === "string" ? message.trim() : "";

    if (!safeMessage || !userId) {
      return sendJson(res, 400, { error: "Λείπει μήνυμα ή αναγνωριστικό χρήστη." });
    }

    if (safeMessage.length > MAX_MESSAGE_LENGTH) {
      return sendJson(res, 400, {
        error: `Το μήνυμα είναι πολύ μεγάλο. Παρακαλώ γράψτε μέχρι ${MAX_MESSAGE_LENGTH} χαρακτήρες.`
      });
    }

    const rateLimit = checkRateLimit(req, userId);

    if (!rateLimit.allowed) {
      return sendJson(res, 429, {
        error: "Πολλά μηνύματα σε μικρό χρόνο. Δοκιμάστε ξανά σε λίγο."
      }, {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        rateLimitKey: rateLimit.key
      });
    }

    const localReply = getLocalSmallTalkReply(safeMessage);
    if (localReply) {
      rememberTurn(userId, safeMessage, localReply);

      return sendJson(res, 200, {
        reply: localReply,
        usedGemini: false
      }, {
        source: "local_small_talk",
        estimatedTokensUsed: 0
      });
    }

    if (shouldBlockForScope(safeMessage)) {
      return sendLocalOffTopicReply(req, res, userId, safeMessage);
    }

    const scoredFaqs = getRelevantFaqs(safeMessage);
    let relevantFaqs = [];
    let generalContext = "";
    let geminiContextSource = "faq_chunks";

    if (!shouldUseGeminiForWebsiteAdvice(safeMessage) && shouldAnswerDirectly(scoredFaqs)) {
      const directReply = scoredFaqs[0].faq.answer;
      rememberTurn(userId, safeMessage, directReply);

      return sendJson(res, 200, {
        reply: directReply,
        usedGemini: false
      }, {
        source: "direct_faq",
        estimatedTokensUsed: 0,
        matchedFaqId: scoredFaqs[0].faq.id,
        score: scoredFaqs[0].score
      });
    }

    if (scoredFaqs.length && scoredFaqs[0].score >= MIN_RELEVANT_SCORE_FOR_GEMINI) {
      relevantFaqs = scoredFaqs.map((item) => item.faq);
    } else if (isWebsiteRelatedQuestion(safeMessage)) {
      relevantFaqs = scoredFaqs.length
        ? scoredFaqs.map((item) => item.faq)
        : getGeneralContextFaqs(3);
      generalContext = buildGeneralSiteContext();
      geminiContextSource = "general_site_context";
    } else if (isFollowUpQuestion(safeMessage) && hasPriorMemory(userId)) {
      relevantFaqs = getGeneralContextFaqs(3);
      generalContext = buildGeneralSiteContext();
      geminiContextSource = "history_followup";
    } else if (isFollowUpQuestion(safeMessage) && hasPriorMemory(userId)) {
      relevantFaqs = getGeneralContextFaqs(3);
      generalContext = buildGeneralSiteContext();
      geminiContextSource = "history_followup";
    } else {
      return sendLocalOffTopicReply(req, res, userId, safeMessage);
    }

    if (!model) {
      return sendJson(res, 500, {
        error: "Το chatbot δεν έχει ρυθμιστεί σωστά. Λείπει το GEMINI_API_KEY στο Vercel."
      }, {
        source: "gemini_unconfigured",
        usedGemini: true,
        contextSource: geminiContextSource,
        sentFaqs: relevantFaqs.length,
        matchedFaqIds: scoredFaqs.map((item) => item.faq.id)
      });
    }

    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
      return sendJson(res, 503, {
        error: "Υπάρχει μεγάλη κίνηση αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο."
      });
    }

    activeRequests += 1;

    try {
      let history = memory.get(userId) || [];
      history = history.slice(-MAX_HISTORY_MESSAGES);

      const faqContext = buildFaqContext(relevantFaqs);
      const historyContext = buildHistoryContext(history, safeMessage);
      const contextMessage = buildGeminiPrompt({
        faqContext,
        generalContext,
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
      const reply = cleanReply(result.response.text()) || UNKNOWN_REPLY;
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
        contextSource: geminiContextSource,
        sentHistory: Boolean(historyContext),
        messagePreview: safeMessage.slice(0, 80),
        ...cost
      });

      return sendJson(res, 200, {
        reply,
        usedGemini: true
      }, {
        source: "gemini",
        model: GEMINI_MODEL,
        matchedFaqIds: scoredFaqs.map((item) => item.faq.id),
        contextSource: geminiContextSource,
        ...cost
      });
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
    }
  } catch (err) {
    console.error("Σφάλμα στο backend:", err);
    return sendJson(res, 500, {
      error: "Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά σε λίγο."
    });
  }
}
