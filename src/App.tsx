/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, Loader2, Trash2, Info, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

// ΑΡΧΙΚΟΠΟΙΗΣΗ ΤΟΥ GEMINI API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BOT_INSTRUCTIONS = `
Είσαι ο επίσημος ψηφιακός βοηθός εξυπηρέτησης για τα μέλη του "Προμηθευτικού & Καταναλωτικού Συνεταιρισμού Αστυνομικών Αττικής".
Ο ρόλος σου είναι να καθοδηγείς τα μέλη με ευγένεια, αμεσότητα και απόλυτη ακρίβεια σχετικά με τις διαδικασίες αιτήσεων για σταθερή/κινητή τηλεφωνία, τηλεόραση, και ασφαλιστικά προγράμματα. 

Στο καλωσόρισμα μίλα λακωνικά, ΜΗΝ αναφέρεις ποιος είσαι (παρά μόνο αν στο ζητήσουν). Να μιλάς φιλικά σαν να είσαι άνθρωπος. Το όνομά σου είναι "Αστυνόμος Σαΐνης", αλλά ΜΗΝ το αναφέρεις ΠΟΤΕ, παρά μόνο αν σε ζορίζουν, δεν σε σέβονται ή σου μιλάνε απότομα.

🚨 ΒΑΣΙΚΟΙ ΚΑΝΟΝΕΣ & ΔΙΑΛΟΓΙΚΗ ΡΟΗ (STEP-BY-STEP):
1. ΜΙΚΡΕΣ ΑΠΑΝΤΗΣΕΙΣ: ΠΟΤΕ μην γράφεις "σεντόνια" κειμένου. ΠΟΤΕ μην δίνεις όλες τις πληροφορίες μαζεμένες.
2. ΠΗΓΑΙΝΕ ΒΗΜΑ-ΒΗΜΑ: Να δίνεις μόνο τη βασική πληροφορία και να ρωτάς τον χρήστη τι θέλει να κάνει μετά. 
   - ΠΑΡΑΔΕΙΓΜΑ ΚΙΝΗΤΗΣ (ΑΥΣΤΗΡΟ): Αν ο χρήστης ρωτήσει για κινητή τηλεφωνία, ΜΗΝ πεις παροχές ή διαδικασίες. Πες ΑΚΡΙΒΩΣ: "Έχουμε 2 εταιρίες με 100€ τον χρόνο: Vodafone CU και Nova Q. Ποια από τις 2 προτιμάτε;" και ΠΕΡΙΜΕΝΕ την απάντησή του.
   - Αν ρωτήσει για Υγεία, πες: "Έχουμε προγράμματα για Ομαδική Ασφάλιση (Interamerican) και έκπτωση σε οχήματα (Anytime). Για ποιο από τα δύο θέλετε λεπτομέρειες;"
3. ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ & IBAN: ΜΗΝ στέλνεις οδηγίες εγγράφων ή τραπεζικούς λογαριασμούς αν ο χρήστης δεν έχει πρώτα επιλέξει πάροχο και δεν έχει πει "ναι, θέλω να προχωρήσω".

ΟΔΗΓΙΕΣ ΜΟΡΦΟΠΟΙΗΣΗΣ (MARKDOWN):
- Χρησιμοποίησε Έντονη Γραφή (Bold) για Τιμές (π.χ. **100€**), Τηλέφωνα (π.χ. **210 5245210**) και ονόματα παρόχων.
- IBAN & Κωδικοί: Όταν γράφεις ένα IBAN, να τον βάζεις ΠΑΝΤΑ μέσα σε backticks ( \` ), π.χ. \`GR5801720500005050099524664\`, για να αντιγράφεται εύκολα στο κινητό.
- Χρησιμοποίησε Emojis διακριτικά (π.χ. 💶, ☎️, 📍, ⚡).

--- 📦 ΠΛΗΡΟΦΟΡΙΕΣ ΠΑΚΕΤΩΝ (Χρησιμοποίησέ τα ΜΟΝΟ όταν στα ζητήσουν) ---

| 📱 Πάροχος | 💰 Κόστος | 🎁 Παροχές |
| :--- | :--- | :--- |
| **Vodafone CU** | **100€ / έτος** | Απεριόριστα Λεπτά, SMS & Data (Προπληρωμένο) |
| **Nova Q** | **100€ / έτος** | Απεριόριστα Λεπτά, SMS & Data (Προπληρωμένο) |
| **Nova Σταθερό** | **17,90€ / μήνα** | Internet & Σταθερή Τηλεφωνία |
| **Nova EON TV** | **20,90€ / μήνα** | EON TV + Cosmote TV (Full Pack) |
| **Enerwave** | **0,0999€ / kWh** | Ρεύμα χωρίς πάγιο ή δεσμεύσεις |

--- 📝 ΟΔΗΓΙΕΣ ΣΥΜΠΛΗΡΩΣΗΣ ΕΓΓΡΑΦΩΝ ---
(Προσοχή: Η αίτηση υποβάλλεται ΜΟΝΟ από τον κάτοχο του αριθμού, αλλιώς απορρίπτεται).
Δώσε αυτές τις οδηγίες ΜΟΝΟ αν ο χρήστης ρωτήσει πώς συμπληρώνονται:

# [BOT_INSTRUCTIONS_TELECOM_FORMS_GR]
# Version: 1.0
## 0. GENERAL SYSTEM RULES (CRITICAL)
- IDENTITY: You are a specialized assistant helping users correctly fill out official telecommunication forms in Greece.
- CONTEXT OF EXAMPLES: All provided image templates contain FICTIONAL DATA. You MUST explicitly warn the user NEVER to copy this fictional data.
- LEGALITY: Remind users that forms based on Law 1599/1986 (Υπεύθυνη Δήλωση) require a real date and a PHYSICAL, handwritten signature.

## 1. FORM TYPE: NOVA - Υπεύθυνη Δήλωση Καρτοκινητού
* **Personal Info:** Must exactly match the official ID/Passport.
* **[CRITICAL WARNING] SIM Limit:** The text "διατηρώ συνολικά [ ] συνδέσεις..." MUST be filled with the actual number of prepaid SIMs they own (limit is 20).
* **Services / GDPR:** Recommend NO for Directory, YES for 112 Emergency.

## 2. FORM TYPE: VODAFONE - Υπεύθυνη Δήλωση Καρτοκινητού
* **SIM Data:** Requires BOTH the 10-digit phone number AND the ICCID starting with 8930...
* **[CRITICAL WARNING] SIM Limit:** Must fill in the actual number they own.
* **112 Emergency:** Must check "ΕΠΙΘΥΜΩ".

## 3. FORM TYPE: VODAFONE - Χρήση Προσωπικών Δεδομένων (GDPR)
* **112 Emergency:** Instruct user to ignore the template's "Δεν Επιθυμώ" and explicitly check **"Επιθυμώ"**.

## 4. FORM TYPE: NOVA & VODAFONE - Αίτηση Φορητότητας
* **Data Match:** Name, ID, AFM MUST exactly match the OLD provider's records.
* **[CRITICAL WARNING] Waiver of Rights (14-Day Rule):** * If "ΑΜΕΣΑ" is checked: Porting is fast, but user LOSES the 14-day right of withdrawal.
    * If "ΜΕΤΑ ΑΠΟ 14 ΗΜΕΡΕΣ" is checked: Porting is delayed, allowing cancellation without penalty.

--- 💳 ΤΡΑΠΕΖΙΚΟΙ ΛΟΓΑΡΙΑΣΜΟΙ (SOUTH ATTICA TELECOMMUNICATIONS) ---
Δώσε τα ΜΟΝΟ όταν ο χρήστης είναι έτοιμος να πληρώσει (100€ για ετήσια κινητή).
- Όνομα δικαιούχου: \`SOUTH ATTICA TELECOMMUNICATIONS\`
- Τράπεζα Πειραιώς: \`GR1601720500005050085444333\`
- Eurobank: \`GR2102602070000920201222444\`
- Αιτιολογία: Ονοματεπώνυμο & Αριθμός Κινητού.

--- 📧 ΕΠΙΚΟΙΝΩΝΙΑ ---
Δικαιολογητικά στο: **info@synetelas.gr**

--- 🏥 ΒΑΣΗ ΔΕΔΟΜΕΝΩΝ ΥΓΕΙΑΣ (KNOWLEDGE BASE) ---
(Δώσε πληροφορίες ΜΟΝΟ σπαστά και ανάλογα με το τι ρωτάει ο χρήστης).

ΕΝΟΤΗΤΑ 1: ΕΠΕΙΓΟΝΤΑ 
Γραμμή Υγείας (24/7): **1010**. Εξωτερικό: **+30 210 946 1999**. Affidea (ραντεβού): **216-0000013**.

ΕΝΟΤΗΤΑ 2: ANYTIME
Έκπτωση 5%. Κωδικός: \`1001065000000018\`. Υπεύθυνος: Φιλιππίδης Ιωάννης (**6932 313051**).

ΕΝΟΤΗΤΑ 3: ΟΜΑΔΙΚΟ ΥΓΕΙΑΣ
Μηνιαίο: Κυρίως 47,17€ | Σύζυγος 47,95€ | Παιδί 40,95€. 
Νοσηλεία: Έως 50.000€ (απαλλασσόμενο 500€/έτος).

ΕΝΟΤΗΤΑ 4 & 5: ΝΟΣΗΛΕΙΑ / ΕΞΕΤΑΣΕΙΣ
Αθηναϊκή Κλινική: 100%. Ειδικά συμβεβλημένα (π.χ. Ευρωκλινική): 85% χωρίς ταμείο, 100% της διαφοράς με χρήση ταμείου.
Εξωτερικά: 10€ συμμετοχή σε συνεργαζόμενα (Affidea μόνο εκτός Αττικής).

ΕΝΟΤΗΤΑ 6: ΕΠΙΔΟΜΑΤΑ
Τοκετού: 650€. Νοσοκομειακό: 60€/μέρα. Χειρουργικό: Έως 3.000€.

💬 ΠΑΡΑΔΕΙΓΜΑΤΑ ΕΡΩΤΗΣΕΩΝ-ΑΠΑΝΤΗΣΕΩΝ (ΣΤΥΛ MICRO-RESPONSE)
User: Γεια σας, θέλω πληροφορίες για κινητό.
AI: Γεια σας! Έχουμε 2 εταιρίες με 100€ τον χρόνο: Vodafone CU και Nova Q. Ποια από τις 2 προτιμάτε;

User: Τη Vodafone. Τι δίνει;
AI: Το πακέτο της Vodafone CU με 100€/έτος προσφέρει Απεριόριστα Λεπτά, Απεριόριστα SMS και Απεριόριστα Data. Θέλετε να σας εξηγήσω τη διαδικασία για να το ενεργοποιήσετε;

User: Ναι, πώς το κάνω;
AI: Πολύ ωραία. Θα χρειαστείτε την Ταυτότητά σας και να συμπληρώσετε κάποια έγγραφα (Υπεύθυνη Δήλωση & Αίτηση). Είναι νέος αριθμός ή θέλετε να μεταφέρετε το νούμερό σας από άλλη εταιρεία (φορητότητα);
`;

// QUICK REPLIES
const QUICK_REPLIES: Record<string, string[]> = {
  "Αρχική Σελίδα": ["Κινητή", "Σταθερή Τηλεφωνία", "EON TV", "Υγεία"],
  "Επιλογή Κινητής": ["Ποια είναι η διαφορά Vodafone με Nova;", "Πόσο κοστίζει το ετήσιο πακέτο;"],
  "Vodafone CU (100€)": ["Τι δικαιολογητικά χρειάζομαι;", "Σε ποιο IBAN πρέπει να βάλω τα χρήματα;", "Είναι για φορητότητα ή νέο αριθμό;"],
  "NOVA Q (100€)": ["Τι δικαιολογητικά χρειάζομαι;", "Πόσα GB μου δίνει η Nova Q;", "Σε ποιο email στέλνω τα χαρτιά;"],
  "Σταθερή & Internet NOVA": ["Ποια είναι η τιμή του παγίου;", "Χρειάζεται να έχω ήδη γραμμή;", "Τι γίνεται αν είμαι εκτός σχεδίου;"],
  "Nova EON TV": ["Τι κανάλια περιλαμβάνει;", "Χρειάζεται πιάτο ή είναι μέσω Internet;"],

  "Υγεία & Περίθαλψη": ["Τι ακριβώς καλύπτει η Interamerican;", "Πόσο κοστίζει για τα παιδιά;"],
  "Κάρτα GProtasis": ["Είναι εντελώς δωρεάν;", "Σε ποια νοσοκομεία μπορώ να πάω;"]
};

export default function App() {
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [contextLabel, setContextLabel] = useState<string>('Αρχική Σελίδα');
  const [contextInstruction, setContextInstruction] = useState<string>('Ο χρήστης βρίσκεται στην αρχική σελίδα και βλέπει γενικά τις προσφορές.');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'focus-input') inputRef.current?.focus();
      if (event.data && event.data.type === 'UPDATE_PAGE_CONTEXT') {
        setContextLabel(event.data.payload.label);
        setContextInstruction(event.data.payload.instruction);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleClearChat = () => {
    if (window.confirm("Είστε σίγουροι ότι θέλετε να διαγράψετε το ιστορικό της συνομιλίας;")) {
      setMessages([]);
      setInput('');
    }
  };

 const handleSend = async (textToSend?: string) => {
    // Αν της περάσουμε κείμενο (π.χ. από quick reply) παίρνει αυτό, 
    // αλλιώς παίρνει ό,τι έχει πληκτρολογήσει ο χρήστης στο input.
    const userMessage = (typeof textToSend === 'string' ? textToSend : input).trim();
    
    if (!userMessage) return;

    setInput(''); // Αδειάζουμε το input αμέσως
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const dynamicInstructions = BOT_INSTRUCTIONS + 
        (contextInstruction ? `\n\n--- CURRENT USER CONTEXT --- \n${contextInstruction}\nΧρησιμοποίησε αυτή την πληροφορία αν ο χρήστης ρωτήσει αόριστα "πώς το κάνω;", "τι χρειάζομαι;", κλπ.` : "");

      const chatHistory = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [...chatHistory, { role: 'user', parts: [{ text: userMessage }] }],
        config: { systemInstruction: dynamicInstructions }
      });

      if (response.text) {
        setMessages(prev => [...prev, { role: 'model', text: response.text }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "Υπήρξε ένα σφάλμα. Παρακαλώ δοκιμάστε ξανά." }]);
    } finally {
      setIsLoading(false);
      window.parent.postMessage('message-sent', '*'); 
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-white font-sans text-slate-800 overflow-hidden">  
      <header className="bg-white border-b border-slate-100 p-3 flex justify-between items-center shrink-0">
        
        
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-colors border border-red-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Καθαρισμός</span>
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-5 bg-white custom-scroll">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-slate-500 opacity-80">
            <div className="w-16 h-16 bg-[#0f2b5c]/10 text-[#0f2b5c] rounded-full flex items-center justify-center">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-slate-700 text-lg">Γεια σας!</p>
              <p className="text-sm max-w-[250px] mx-auto mt-1">Είμαι το ΑΙ του Συνεταιρισμού. Πώς μπορώ να σας εξυπηρετήσω σήμερα;</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-[#0f2b5c] flex items-center justify-center shrink-0 shadow-sm mr-2 mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            
            <div className={`max-w-[85%] ${
              message.role === 'user' 
                ? 'bg-[#0f2b5c] text-white p-4 rounded-2xl rounded-tr-none shadow-md' 
                : 'bg-[#f8fafc] text-slate-800 p-4 rounded-2xl rounded-tl-none border border-slate-200'
            }`}>
              {message.role === 'user' ? (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.text}</p>
              ) : (
                <div className="markdown-body text-[14px] leading-relaxed">
                  <ReactMarkdown
                    components={{
                      code(props) {
                        const {children, className, ...rest} = props;
                        const text = String(children).replace(/\n$/, '');
                        const match = /language-(\w+)/.exec(className || '');
                        
                        if (!match) {
                          return (
                            <span 
                              onClick={() => handleCopy(text)}
                              className="group relative inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-mono text-[13px] font-bold border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors shadow-sm mx-0.5"
                            >
                              {children}
                              {copiedText === text ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-600 transition-colors" />}
                            </span>
                          );
                        }
                        return <code className={className} {...rest}>{children}</code>;
                      }
                    }}
                  >
                    {message.text}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full bg-[#0f2b5c] flex items-center justify-center shrink-0 shadow-sm mr-2">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-[#f8fafc] p-4 rounded-2xl rounded-tl-none border border-slate-200 flex items-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#0f2b5c]" />
              <span className="ml-2 text-xs text-slate-500 font-medium tracking-wide animate-pulse">Επεξεργασία...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t border-slate-200 shrink-0">
        <AnimatePresence>
          {contextLabel && contextLabel !== "Αρχική Σελίδα" && (
            <motion.div initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: 10, height: 0 }} className="mb-2.5 flex items-center overflow-hidden">
              <div className="bg-blue-50 text-blue-700 text-[11px] px-3 py-1.5 rounded-full font-bold flex items-center border border-blue-100 shadow-sm w-fit uppercase tracking-wide">
                <Info className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                Σχετικά με: {contextLabel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-1">
          {(QUICK_REPLIES[contextLabel || "Αρχική Σελίδα"] || QUICK_REPLIES["Αρχική Σελίδα"]).map((reply, index) => (
            <button key={index} onClick={() => handleSend(reply)} className="whitespace-nowrap bg-slate-50 hover:bg-slate-100 text-slate-700 text-[13px] py-2 px-4 rounded-full transition-colors border border-slate-200 shrink-0 shadow-sm font-medium">
              {reply}
            </button>
          ))}
        </div>

        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
  if (e.key === 'Enter') {
    handleSend();
    inputRef.current?.blur(); // Κλείνει το πληκτρολόγιο αφαιρώντας το focus
  }
}}
            placeholder="Πληκτρολογήστε το μήνυμά σας..."
            style={{ fontSize: '16px' }} 
            className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-3 pl-5 pr-12 text-base focus:ring-2 focus:ring-[#0f2b5c] focus:border-transparent transition-all outline-none"
          />
          <button
            onClick={() => {
  handleSend();
  inputRef.current?.blur();
}}
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 p-2 bg-[#0f2b5c] text-white rounded-xl hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}