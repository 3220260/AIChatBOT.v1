import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const knowledgePath = resolve(currentDir, "data/knowledge.json");
const knowledgeItems = JSON.parse(readFileSync(knowledgePath, "utf8"));

export const faqs = knowledgeItems;
