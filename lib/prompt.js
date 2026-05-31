import { isFollowUpQuestion } from "./faq-search.js";
import { toSearchKey } from "./normalize.js";

const MAX_HISTORY_CHARS_FOR_GEMINI = 360;

export const UNKNOWN_REPLY = "Δεν έχω σίγουρη πληροφορία γι’ αυτό. Καλύτερα να επικοινωνήσετε με τον Συνεταιρισμό.";
export const SCOPE_REPLY = "Μπορώ να βοηθήσω με πληροφορίες για τις προσφορές, τις διαδικασίες και την ιστοσελίδα του Συνεταιρισμού.";

export const GEMINI_SYSTEM_RULES = [
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

export function buildAssistantContextText(context) {
  if (!context || typeof context !== "object") return "";

  const title = typeof context.title === "string" ? context.title.trim() : "";
  const subtitle = typeof context.subtitle === "string" ? context.subtitle.trim() : "";
  const summary = typeof context.summary === "string" ? context.summary.trim() : "";
  const provider = typeof context.provider === "string" ? context.provider.trim() : "";
  const processType = typeof context.processType === "string" ? context.processType.trim() : "";
  const stepTitle = typeof context.stepTitle === "string" ? context.stepTitle.trim() : "";
  const prompts = Array.isArray(context.prompts)
    ? context.prompts.map((prompt) => String(prompt || "").trim()).filter(Boolean).slice(0, 4)
    : [];

  const sections = [];
  if (title) sections.push(`Καρτέλα: ${title}`);
  if (subtitle) sections.push(`Βήμα: ${subtitle}`);
  if (provider || processType) {
    sections.push(`Διαδικασία: ${[provider, processType].filter(Boolean).join(" · ")}`.trim());
  }
  if (stepTitle && stepTitle !== subtitle) sections.push(`Συγκεκριμένο βήμα: ${stepTitle}`);
  if (summary) sections.push(`Σύντομο πλαίσιο: ${summary}`);
  if (prompts.length) sections.push(`Προτεινόμενες ερωτήσεις:\n- ${prompts.join("\n- ")}`);

  return sections.join("\n");
}

export function buildGeminiPrompt({ faqContext, generalContext, historyContext, assistantContext, message }) {
  return [
    GEMINI_SYSTEM_RULES,
    assistantContext ? `Page context:\n${assistantContext}` : "",
    generalContext ? `Website context:\n${generalContext}` : "",
    historyContext ? `Previous turn:\n${historyContext}` : "",
    `KB:\n${faqContext}`,
    `Customer: ${message}`
  ].filter(Boolean).join("\n\n");
}

export function cleanReply(text = "") {
  return String(text)
    .replace(/\[cite:\s*[^\]]+\]/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

export function shouldIncludeHistory(message) {
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

export function buildHistoryContext(history, message, maxHistoryChars = MAX_HISTORY_CHARS_FOR_GEMINI) {
  if (!history.length || !shouldIncludeHistory(message)) return "";

  return history
    .slice(-2)
    .map((item) => {
      const role = item.role === "model" ? "Bot" : "User";
      const text = compactText(item.parts?.[0]?.text || "", Math.floor(maxHistoryChars / 2));
      return `${role}: ${text}`;
    })
    .join("\n")
    .slice(0, maxHistoryChars);
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
