import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
  // Επιτρέπουμε μόνο POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'API key not configured',
        message: 'Παρακαλώ ρυθμίστε το GEMINI_API_KEY στο Vercel'
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // 1. Το System Prompt ορίζεται ΞΕΧΩΡΙΣΤΑ ως configuration του μοντέλου
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-flash-preview',
      systemInstruction: `Είσαι ένας εξυπηρετικός chatbot για μια επιχείρηση.
Απάντα με φιλικό και επαγγελματικό τρόπο στα ελληνικά.
Δίνε σύντομες και χρήσιμες απαντήσεις.
Αν δεν ξέρεις κάτι, πες ότι μπορούν να επικοινωνήσουν με το τμήμα εξυπηρέτησης πελατών.`
    });

    // 2. Μετατρέπουμε το ιστορικό στο format που περιμένει το API
    // Οι ρόλοι πρέπει να είναι αυστηρά 'user' (ο χρήστης) και 'model' (το bot)
    const formattedHistory = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // 3. Ξεκινάμε ένα επίσημο "Chat Session" με το ιστορικό φορτωμένο
    const chat = model.startChat({
      history: formattedHistory,
    });

    // 4. Στέλνουμε ΜΟΝΟ το νέο μήνυμα
    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ 
      response: text,
      source: 'gemini'
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to get response from AI',
      message: 'Λυπούμαστε, κάτι πήγε στραβά. Παρακαλώ δοκιμάστε ξανά.'
    });
  }
}