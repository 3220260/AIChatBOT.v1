import { GoogleGenerativeAI } from "@google/generative-ai";
import { faqs } from "../faqs.js";
import { getEmbedding } from "../embeddings.js";
import { cosineSimilarity } from "../cosine.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 🧠 memory per user
const memory = new Map();

// 🧠 vector cache
let faqVectors = [];

async function initVectors() {
  if (faqVectors.length > 0) return;

  for (let faq of faqs) {
    const embedding = await getEmbedding(faq.question);
    faqVectors.push({ ...faq, embedding });
  }
}

async function findRelevantFAQs(message) {
  const queryEmbedding = await getEmbedding(message);

  const scored = faqVectors.map(faq => ({
    ...faq,
    score: cosineSimilarity(queryEmbedding, faq.embedding)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

export default async function handler(req, res) {
  try {
    const { message, userId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ error: "Missing data" });
    }

    await initVectors();

    // 🧠 memory
    let history = memory.get(userId) || [];

    history.push({
      role: "user",
      parts: [{ text: message }]
    });

    if (history.length > 10) {
      history = history.slice(-10);
    }

    // 🔍 vector search
    const relevantFAQs = await findRelevantFAQs(message);

    const faqContext = relevantFAQs
      .map(f => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");

    const systemPrompt = `
Είσαι chatbot εξυπηρέτησης πελατών.

Χρησιμοποίησε αυτές τις πληροφορίες αν σχετίζονται:

${faqContext}

Απάντα στα ελληνικά, σύντομα και φιλικά.
`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt }]
        },
        ...history,
        {
          role: "user",
          parts: [{ text: message }]
        }
      ]
    });

    const reply = result.response.text();

    history.push({
      role: "model",
      parts: [{ text: reply }]
    });

    memory.set(userId, history);

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}