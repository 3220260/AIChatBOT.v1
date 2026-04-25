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

    // Το API key διαβάζεται από environment variable για ασφάλεια
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'API key not configured',
        message: 'Παρακαλώ ρυθμίστε το GEMINI_API_KEY στο Vercel'
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    // Δημιουργούμε system prompt για τον chatbot
    const systemPrompt = `Είσαι ένας εξυπηρετικός chatbot για μια επιχείρηση.
Απάντα με φιλικό και επαγγελματικό τρόπο στα ελληνικά.
Δίνε σύντομες και χρήσιμες απαντήσεις.
Αν δεν ξέρεις κάτι, πες ότι μπορούν να επικοινωνήσουν με το τμήμα εξυπηρέτησης πελατών.`;

    // Δημιουργούμε το πλήρες prompt με το ιστορικό
    let fullPrompt = systemPrompt + '\n\n';
    
    if (conversationHistory.length > 0) {
      fullPrompt += 'Προηγούμενη συζήτηση:\n';
      conversationHistory.forEach(msg => {
        fullPrompt += `${msg.role === 'user' ? 'Χρήστης' : 'Bot'}: ${msg.content}\n`;
      });
      fullPrompt += '\n';
    }
    
    fullPrompt += `Χρήστης: ${message}\nBot:`;

    // Καλούμε το Gemini API
    const result = await model.generateContent(fullPrompt);
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
