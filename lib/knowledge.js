import { faqs } from "../faqs.js";
import { scoreKnowledgeItems } from "./faq-search.js";

const DEFAULT_LOCAL_SEARCH_LIMIT = 5;

export function getKnowledgeItems() {
  return faqs;
}

export function getKnowledgeById(id) {
  if (!id) return null;
  return getKnowledgeItems().find((item) => item.id === id) || null;
}

export function searchKnowledgeLocal(message, options = {}) {
  const items = Array.isArray(options.items) ? options.items : getKnowledgeItems();
  const limit = Number.isInteger(options.limit) && options.limit > 0
    ? options.limit
    : DEFAULT_LOCAL_SEARCH_LIMIT;

  const scored = scoreKnowledgeItems(message, items, limit);
  const minScore = Number.isFinite(options.minScore) ? Number(options.minScore) : null;

  const filtered = minScore === null
    ? scored
    : scored.filter((entry) => entry.score >= minScore);

  // TODO(vector-search): Replace local lexical scoring with embedding similarity retrieval.
  // TODO(vector-search): Add provider adapters for Supabase pgvector or Upstash Vector.
  // TODO(vector-search): Support configurable topK retrieval per query type.
  // TODO(vector-search): Enforce confidence threshold before direct answers/fallback prompts.
  return filtered;
}
