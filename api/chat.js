import { GoogleGenerativeAI } from "@google/generative-ai";
import { faqs } from "../faqs.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
// const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 🧠 memory per user
const memory = new Map();

export default async function handler(req, res) {
  try {
    const { message, userId } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ error: "Missing data" });
    }

    // 1. Φορτώνουμε το ιστορικό του χρήστη
    let history = memory.get(userId) || [];

    // 2. Μετατρέπουμε τα FAQs σε απλό κείμενο (ΧΩΡΙΣ embeddings!)
    const faqContext = faqs
      .map(f => `Ερώτηση: ${f.question}\nΑπάντηση: ${f.answer}`)
      .join("\n\n");

    // 3. Ενώνουμε τις οδηγίες, τα FAQs και το μήνυμα του χρήστη
    const contextMessage = `
Είσαι ένα φιλικό chatbot εξυπηρέτησης πελατών.
Χρησιμοποίησε τις παρακάτω πληροφορίες για να απαντήσεις αν σχετίζονται με την ερώτηση. Αν δεν σχετίζονται, απάντα ευγενικά βάσει των γνώσεών σου.
Να απαντάς στα ελληνικά, σύντομα και κατανοητά.

ΠΛΗΡΟΦΟΡΙΕΣ (FAQs):
${faqContext}

ΜΗΝΥΜΑ ΠΕΛΑΤΗ: 
${message}
`;

    // 4. Στέλνουμε το ιστορικό + το νέο μήνυμα στη Gemini
    const currentChat = [
      ...history,
      {
        role: "user",
        parts: [{ text: contextMessage }]
      }
    ];

    const result = await model.generateContent({ contents: currentChat });
    const reply = result.response.text();

    // 5. Αποθηκεύουμε το κανονικό μήνυμα και την απάντηση στο ιστορικό
    history.push({
      role: "user",
      parts: [{ text: message }]
    });
    history.push({
      role: "model",
      parts: [{ text: reply }]
    });

    // Κρατάμε μόνο τα τελευταία 10 μηνύματα για να μην γεμίζει η μνήμη
    if (history.length > 10) {
      history = history.slice(-10);
    }
    
    memory.set(userId, history);

    // 6. Στέλνουμε την απάντηση πίσω στο Frontend (app.js)
    res.json({ reply });

  } catch (err) {
    console.error("Σφάλμα στο backend:", err);
    res.status(500).json({ error: "Server error" });
  }
}

