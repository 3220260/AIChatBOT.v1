from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
import json
import os

# Ρύθμιση API Key από το Vercel Dashboard (Environment Variables)
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

app = FastAPI()

# Επιτρέπουμε στο nyxlabs.gr να επικοινωνεί με το Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    session_id: str

# Απαραίτητο για να μην βγάζει 404 ο browser
@app.get("/")
async def root():
    return {"status": "online", "message": "NyxLabs AI is running on Vercel!"}

# Η "προσωπικότητα" και οι γνώσεις του Bot
SYSTEM_INSTRUCTION = """
Είσαι ο ψηφιακός βοηθός του Προμηθευτικού Συνεταιρισμού Αστυνομικών Αττικής (nyxlabs.gr).
Σκοπός σου είναι να βοηθάς τα μέλη να βρουν τις καλύτερες προσφορές.

ΓΝΩΣΕΙΣ ΑΠΟ ΦΥΛΛΑΔΙΟ:
- ΚΙΝΗΤΗ: 
    * Vodafone CU: 300GB/μήνα (τα GB μεταφέρονται αν δεν καταναλωθούν), Απεριόριστα λεπτά. Κόστος περίπου 100€ το χρόνο.
    * Nova Q: Απεριόριστα Data & Ομιλία.
- ΕΝΕΡΓΕΙΑ: Ειδικά τιμολόγια ρεύματος με ΗΡΩΝ και Zeniθ.
- ΤΗΛΕΟΡΑΣΗ: Εκπτώσεις σε Cosmote TV και EON (Nova).
- ΥΓΕΙΑ: Προνόμια σε πρωτοβάθμια περίθαλψη για αστυνομικούς.

ΟΔΗΓΙΕΣ:
1. Απάντα σύντομα και στα Ελληνικά.
2. Μην δίνεις όλες τις λεπτομέρειες μαζί, ρώτα τον χρήστη για τι ενδιαφέρεται.
3. Πάντα να απαντάς σε JSON μορφή όπως το παράδειγμα:
{
  "text": "Η απάντησή σου εδώ",
  "uiOptions": [
    {"label": "📱 Κινητή", "action": "send_msg", "target": "Θέλω πληροφορίες για κινητή"},
    {"label": "⚡ Ρεύμα", "action": "send_msg", "target": "Πες μου για το ρεύμα"}
  ]
}
"""

CHAT_HISTORIES = {}

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    sid = request.session_id
    user_msg = request.message
    
    if not client:
        return {"text": "⚠️ Λείπει το API Key στις ρυθμίσεις του Vercel.", "uiOptions": []}

    if sid not in CHAT_HISTORIES:
        CHAT_HISTORIES[sid] = client.chats.create(
            model="gemini-1.5-flash",
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
            )
        )

    # Αν ο χρήστης ξεκινάει τώρα
    if user_msg.lower() in ["γεια", "menu", "start", "καλημέρα"]:
        return {
            "text": "Γεια σας! Είμαι ο βοηθός του nyxlabs.gr. Πώς μπορώ να σας εξυπηρετήσω;",
            "uiOptions": [
                {"label": "📱 Κινητή", "action": "send_msg", "target": "Κινητή τηλεφωνία"},
                {"label": "⚡ Ρεύμα", "action": "send_msg", "target": "Ρεύμα & Ενέργεια"},
                {"label": "📺 Τηλεόραση", "action": "send_msg", "target": "Τηλεόραση"},
                {"label": "🏥 Υγεία", "action": "send_msg", "target": "Υγεία"}
            ]
        }

    try:
        response = CHAT_HISTORIES[sid].send_message(user_msg)
        return json.loads(response.text)
    except Exception as e:
        return {"text": "Συγγνώμη, κάτι πήγε στραβά. Δοκιμάστε ξανά.", "uiOptions": []}