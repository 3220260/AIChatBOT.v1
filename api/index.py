from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google import genai
from google.genai import types
import json
import os

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key) if api_key else None

app = FastAPI()

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

# Το System Instruction από τη γνωσιακή σου βάση
SYSTEM_INSTRUCTION = """
Είσαι ο ψηφιακός βοηθός του Προμηθευτικού Συνεταιρισμού Αστυνομικών Αττικής. 
Καθοδηγείς τους χρήστες βήμα-βήμα.
ΓΝΩΣΙΑΚΗ ΒΑΣΗ: Κινητή (Vodafone CU, Nova Q), Ρεύμα (Enerwave), Τηλεόραση (EON), Υγεία.
"""

CHAT_HISTORIES = {}

@app.get("/", response_class=HTMLResponse)
async def get_ui():
    # Επιστρέφει το HTML που ακολουθεί παρακάτω
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    sid = request.session_id
    user_msg = request.message
    
    if not client:
        return {"text": "⚠️ Σφάλμα API Key.", "uiOptions": None}

    if sid not in CHAT_HISTORIES:
        CHAT_HISTORIES[sid] = client.chats.create(
            model="gemini-1.5-flash", # Διόρθωση μοντέλου
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
            )
        )

    chat = CHAT_HISTORIES[sid]
    
    # Διαχείριση μενού
    if user_msg.lower() in ["menu", "γεια", "γεια σου"]:
        user_msg = "Καλωσόρισέ με και δώσε μου 4 κουμπιά: Κινητή, Ρεύμα, Τηλεόραση, Υγεία."

    try:
        response = chat.send_message(user_msg)
        bot_reply = json.loads(response.text)
        return bot_reply
    except Exception as e:
        return {"text": f"Σφάλμα: {str(e)}", "uiOptions": None}