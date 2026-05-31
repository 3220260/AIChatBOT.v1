import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  buildFaqContext,
  buildGeneralSiteContext,
  getGeneralContextFaqs,
  getLocalSmallTalkReply,
  isFollowUpQuestion,
  isTvPackContentQuestion,
  isWebsiteRelatedQuestion,
  shouldAnswerDirectly,
  shouldBlockForScope,
  shouldUseGeminiForWebsiteAdvice
} from "../lib/faq-search.js";
import { searchKnowledgeLocal } from "../lib/knowledge.js";
import {
  buildAssistantContextText,
  buildGeminiPrompt,
  buildHistoryContext,
  cleanReply,
  UNKNOWN_REPLY
} from "../lib/prompt.js";
import {
  checkRateLimit,
  incrementOffTopicPlayCount
} from "../lib/rate-limit.js";
import {
  DEFAULT_MAX_HISTORY_MESSAGES,
  getUserHistory,
  hasPriorMemory,
  rememberTurn,
  setUserHistory
} from "../lib/memory.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const DEBUG = process.env.DEBUG === "true";

const MAX_MESSAGE_LENGTH = 500;
const MAX_ACTIVE_REQUESTS = 20;
const MAX_HISTORY_MESSAGES = DEFAULT_MAX_HISTORY_MESSAGES;
const MAX_OFF_TOPIC_PLAYFUL_REPLIES = 5;
const MIN_RELEVANT_SCORE_FOR_GEMINI = 2;
const MAX_RELEVANT_KNOWLEDGE_RESULTS = 5;
const MIN_SUGGESTED_QUESTIONS = 2;
const MAX_SUGGESTED_QUESTIONS = 4;
const MAX_OUTPUT_TOKENS = readIntEnv("GEMINI_MAX_OUTPUT_TOKENS", 220, 80, 600);
const GEMINI_THINKING_BUDGET = readIntEnv("GEMINI_THINKING_BUDGET", 0, -1, 24576);

const GEMINI_GENERATION_CONFIG = buildGenerationConfig(GEMINI_MODEL);

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: GEMINI_MODEL }) : null;

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

  if (normalizedModel.startsWith("gemini-3")) {
    return baseConfig;
  }

  return baseConfig;
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

async function sendLocalOffTopicReply(req, res, userId, message, source = "local_off_topic_playful") {
  const { count } = await incrementOffTopicPlayCount(req, userId);

  return sendJson(res, 200, {
    reply: getPlayfulOffTopicReply(message, count),
    usedGemini: false
  }, {
    source,
    offTopicCount: count
  });
}

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

function normalizeSuggestedQuestion(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function buildSuggestedQuestions(scoredFaqs, options = {}) {
  const exclude = new Set(
    (options.excludeQuestions || [])
      .map((question) => normalizeSuggestedQuestion(question).toLowerCase())
      .filter(Boolean)
  );
  const collected = [];
  const seen = new Set(exclude);
  const fallbackFaqs = getGeneralContextFaqs(6);

  const candidates = [
    ...scoredFaqs.map((item) => item?.faq).filter(Boolean),
    ...fallbackFaqs
  ];

  for (const faq of candidates) {
    const question = normalizeSuggestedQuestion(faq.question);
    if (!question) continue;

    const key = question.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    collected.push(question);

    if (collected.length >= MAX_SUGGESTED_QUESTIONS) {
      break;
    }
  }

  if (collected.length < MIN_SUGGESTED_QUESTIONS) {
    return [];
  }

  return collected.slice(0, MAX_SUGGESTED_QUESTIONS);
}

function shouldSearchWithAssistantContext(message, assistantContextText) {
  if (!assistantContextText) return false;

  const normalizedMessage = String(message || "").toLowerCase();
  const wordCount = normalizedMessage.split(/\s+/).filter(Boolean).length;

  return wordCount <= 6
    || /(πόσο|ποσο|κοστίζει|κοστιζει|κόστος|κοστος|τιμή|τιμη|δικαιολογητικά|δικαιολογητικα|χαρτιά|χαρτια|πού|που|στέλνω|στελνω|email|mail)/i.test(normalizedMessage);
}

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

    const { message, userId, context } = req.body || {};
    const safeMessage = typeof message === "string" ? message.trim() : "";
    const assistantContextText = buildAssistantContextText(context);
    const hasAssistantContext = Boolean(assistantContextText);

    if (!safeMessage || !userId) {
      return sendJson(res, 400, { error: "Λείπει μήνυμα ή αναγνωριστικό χρήστη." });
    }

    if (safeMessage.length > MAX_MESSAGE_LENGTH) {
      return sendJson(res, 400, {
        error: `Το μήνυμα είναι πολύ μεγάλο. Παρακαλώ γράψτε μέχρι ${MAX_MESSAGE_LENGTH} χαρακτήρες.`
      });
    }

    const rateLimit = await checkRateLimit(req, userId);

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
      await rememberTurn(userId, safeMessage, localReply, MAX_HISTORY_MESSAGES);

      return sendJson(res, 200, {
        reply: localReply,
        usedGemini: false
      }, {
        source: "local_small_talk",
        estimatedTokensUsed: 0
      });
    }

    if (shouldBlockForScope(safeMessage) && !hasAssistantContext) {
      return await sendLocalOffTopicReply(req, res, userId, safeMessage);
    }

    const searchMessage = shouldSearchWithAssistantContext(safeMessage, assistantContextText)
      ? `${safeMessage}\n${assistantContextText}`
      : safeMessage;

    const scoredFaqs = searchKnowledgeLocal(searchMessage, {
      limit: MAX_RELEVANT_KNOWLEDGE_RESULTS
    });
    let relevantFaqs = [];
    let generalContext = "";
    let geminiContextSource = "faq_chunks";

    const forceGeminiForTvPackContents = isTvPackContentQuestion(safeMessage);

    if (
      !forceGeminiForTvPackContents
      && !shouldUseGeminiForWebsiteAdvice(safeMessage)
      && shouldAnswerDirectly(scoredFaqs)
    ) {
      const directReply = scoredFaqs[0].faq.answer;
      const suggestedQuestions = buildSuggestedQuestions(scoredFaqs, {
        excludeQuestions: [scoredFaqs[0].faq.question, safeMessage]
      });
      await rememberTurn(userId, safeMessage, directReply, MAX_HISTORY_MESSAGES);

      return sendJson(res, 200, {
        reply: directReply,
        usedGemini: false,
        suggestedQuestions
      }, {
        source: "direct_faq",
        estimatedTokensUsed: 0,
        matchedFaqId: scoredFaqs[0].faq.id,
        score: scoredFaqs[0].score
      });
    }

    if (forceGeminiForTvPackContents) {
      relevantFaqs = scoredFaqs.length
        ? scoredFaqs.map((item) => item.faq)
        : getGeneralContextFaqs(3);
      generalContext = buildGeneralSiteContext(UNKNOWN_REPLY);
      geminiContextSource = "tv_pack_content_question";
    } else if (scoredFaqs.length && scoredFaqs[0].score >= MIN_RELEVANT_SCORE_FOR_GEMINI) {
      relevantFaqs = scoredFaqs.map((item) => item.faq);
    } else if (hasAssistantContext) {
      relevantFaqs = scoredFaqs.length
        ? scoredFaqs.map((item) => item.faq)
        : getGeneralContextFaqs(3);
      generalContext = buildGeneralSiteContext(UNKNOWN_REPLY);
      geminiContextSource = "parent_context";
    } else if (isWebsiteRelatedQuestion(safeMessage)) {
      relevantFaqs = scoredFaqs.length
        ? scoredFaqs.map((item) => item.faq)
        : getGeneralContextFaqs(3);
      generalContext = buildGeneralSiteContext(UNKNOWN_REPLY);
      geminiContextSource = "general_site_context";
    } else if (isFollowUpQuestion(safeMessage) && await hasPriorMemory(userId)) {
      relevantFaqs = getGeneralContextFaqs(3);
      generalContext = buildGeneralSiteContext(UNKNOWN_REPLY);
      geminiContextSource = "history_followup";
    } else {
      return await sendLocalOffTopicReply(req, res, userId, safeMessage);
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
      let history = await getUserHistory(userId) || [];
      history = history.slice(-MAX_HISTORY_MESSAGES);

      const faqContext = buildFaqContext(relevantFaqs);
      const historyContext = buildHistoryContext(history, safeMessage);
      const contextMessage = buildGeminiPrompt({
        faqContext,
        generalContext,
        historyContext,
        assistantContext: assistantContextText,
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
      const suggestedQuestions = buildSuggestedQuestions(scoredFaqs, {
        excludeQuestions: [safeMessage]
      });
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

      await setUserHistory(userId, history, MAX_HISTORY_MESSAGES);

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
        usedGemini: true,
        suggestedQuestions
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
