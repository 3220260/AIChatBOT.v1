import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { faqs } from "../faqs.js";
import { shouldAnswerDirectly } from "../lib/faq-search.js";

const KNOWLEDGE_PATH = new URL("../data/knowledge.json", import.meta.url);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXPECTED_CATEGORIES = new Set([
  "Cookies / Προσωπικά δεδομένα",
  "Nova & Cosmote TV",
  "Nova Q",
  "Nova σταθερό / Internet",
  "Vodafone CU",
  "Vodafone σταθερή / Internet",
  "Γενικές πληροφορίες Π.Κ.Σ.Α.Α.",
  "Δικαιολογητικά",
  "Επικοινωνία",
  "Κινητή / Καρτοκινητή",
  "Οδηγίες bot",
  "Πληρωμές / IBAN",
  "Προσφορές",
  "Σταθερή τηλεφωνία / Internet",
  "Τηλεόραση",
  "Χρήση ιστοσελίδας"
]);

function loadKnowledgeItems() {
  const raw = readFileSync(KNOWLEDGE_PATH, "utf8");
  return JSON.parse(raw);
}

test("knowledge data has valid shape and unique ids", () => {
  const items = loadKnowledgeItems();
  const seenIds = new Set();

  assert.ok(Array.isArray(items));
  assert.ok(items.length > 0);

  for (const [index, item] of items.entries()) {
    assert.equal(typeof item, "object", `Item ${index} must be an object`);
    assert.ok(item, `Item ${index} must not be null`);

    assert.equal(typeof item.id, "string", `Item ${index} is missing id`);
    assert.ok(item.id.trim().length > 0, `Item ${index} has an empty id`);
    assert.equal(seenIds.has(item.id), false, `Duplicate knowledge id: ${item.id}`);
    seenIds.add(item.id);

    assert.equal(typeof item.category, "string", `Item ${item.id} is missing category`);
    assert.ok(item.category.trim().length > 0, `Item ${item.id} has an empty category`);

    assert.equal(typeof item.source, "string", `Item ${item.id} is missing source`);
    assert.ok(item.source.trim().length > 0, `Item ${item.id} has an empty source`);

    assert.equal(typeof item.question, "string", `Item ${item.id} is missing question`);
    assert.ok(item.question.trim().length > 0, `Item ${item.id} has an empty question`);

    assert.equal(typeof item.answer, "string", `Item ${item.id} is missing answer`);
    assert.ok(item.answer.trim().length > 0, `Item ${item.id} has an empty answer`);

    assert.ok(Array.isArray(item.keywords), `Item ${item.id} must have keywords array`);
    item.keywords.forEach((keyword, keywordIndex) => {
      assert.equal(typeof keyword, "string", `Item ${item.id} keyword ${keywordIndex} must be a string`);
      assert.ok(keyword.trim().length > 0, `Item ${item.id} keyword ${keywordIndex} must not be empty`);
    });

    assert.equal(typeof item.updatedAt, "string", `Item ${item.id} is missing updatedAt`);
    assert.match(item.updatedAt, ISO_DATE_RE, `Item ${item.id} has invalid updatedAt format`);
  }
});

test("faqs.js exports the same knowledge dataset", () => {
  const knowledgeItems = loadKnowledgeItems();

  assert.ok(Array.isArray(faqs));
  assert.deepEqual(faqs, knowledgeItems);
});

test("knowledge questions stay unique", () => {
  const items = loadKnowledgeItems();
  const questions = new Set();

  for (const item of items) {
    assert.equal(questions.has(item.question), false, `Duplicate knowledge question: ${item.question}`);
    questions.add(item.question);
  }
});

test("knowledge categories stay within the expected set", () => {
  const items = loadKnowledgeItems();
  const seenCategories = new Set(items.map((item) => item.category));

  for (const category of seenCategories) {
    assert.equal(EXPECTED_CATEGORIES.has(category), true, `Unexpected knowledge category: ${category}`);
  }

  for (const category of EXPECTED_CATEGORIES) {
    assert.equal(seenCategories.has(category), true, `Missing expected knowledge category: ${category}`);
  }
});

test("shouldAnswerDirectly accepts a very strong top score", () => {
  assert.equal(shouldAnswerDirectly([
    { score: 16 },
    { score: 15 }
  ]), true);
});

test("shouldAnswerDirectly still requires a gap for medium scores", () => {
  assert.equal(shouldAnswerDirectly([
    { score: 10 },
    { score: 9 }
  ]), false);
  assert.equal(shouldAnswerDirectly([
    { score: 10 },
    { score: 7 }
  ]), true);
});
