# 🤖 Smart Chatbot με FAQ System & Gemini AI

Ένας έξυπνος chatbot που **εξοικονομεί tokens** χρησιμοποιώντας προκαθορισμένες απαντήσεις (FAQ) και καταφεύγει στο Gemini AI μόνο όταν χρειάζεται!

## ✨ Χαρακτηριστικά

- ⚡ **Smart FAQ System**: Οι περισσότερες ερωτήσεις απαντώνται αυτόματα χωρίς API calls
- 🤖 **Gemini AI Fallback**: Χρησιμοποιεί το Gemini μόνο για πολύπλοκες ερωτήσεις
- 📊 **Real-time Statistics**: Δείτε πόσα tokens εξοικονομείτε!
- 🎨 **Μοντέρνο UI**: Όμορφο και responsive design
- 🔒 **Ασφαλές**: Το API key είναι κρυμμένο στο backend
- 🚀 **Εύκολο Deploy**: Έτοιμο για Vercel με 2 κλικ

## 📋 Προαπαιτούμενα

1. **GitHub Account**
2. **Vercel Account** (δωρεάν: https://vercel.com)
3. **Gemini API Key** (δωρεάν: https://makersuite.google.com/app/apikey)

## 🚀 Οδηγίες Εγκατάστασης

### Βήμα 1: Προσαρμογή FAQ

Ανοίξτε το αρχείο `public/faq.js` και προσθέστε τις δικές σας ερωτήσεις/απαντήσεις:

```javascript
{
  keywords: ['ωράριο', 'ωραριο', 'ωρες'],
  question: 'Ποιο είναι το ωράριο λειτουργίας;',
  answer: 'Το κατάστημα μας είναι ανοιχτό Δευτέρα-Παρασκευή 9:00-21:00...'
}
```

**💡 Tip**: Όσο περισσότερες ερωτήσεις προσθέσετε, τόσο λιγότερα tokens θα ξοδέψετε!

### Βήμα 2: Ανέβασμα στο GitHub

```bash
# Αρχικοποίηση Git repository
git init

# Προσθήκη όλων των αρχείων
git add .

# Commit
git commit -m "Initial commit: Smart chatbot"

# Σύνδεση με το GitHub repository σας
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push
git push -u origin main
```

### Βήμα 3: Deploy στο Vercel

1. **Συνδεθείτε στο Vercel**: https://vercel.com
2. **Κλικ στο "New Project"**
3. **Import το GitHub repository σας**
4. **Ρυθμίστε το Environment Variable**:
   - Όνομα: `GEMINI_API_KEY`
   - Τιμή: Το Gemini API key σας
5. **Κλικ στο "Deploy"**

🎉 **Έτοιμο!** Το chatbot σας θα είναι live σε λίγα δευτερόλεπτα!

## 📁 Δομή Project

```
chatbot-project/
├── api/
│   └── chat.js              # Vercel serverless function για Gemini
├── public/
│   ├── index.html           # HTML interface
│   ├── style.css            # Styling
│   ├── app.js              # Frontend logic
│   └── faq.js              # FAQ database & matching logic
├── package.json             # Dependencies
├── vercel.json             # Vercel configuration
└── README.md               # Αυτό το αρχείο
```

## 🔧 Προσαρμογή

### Αλλαγή Χρωμάτων

Στο `public/style.css`, γραμμές 1-14:

```css
:root {
  --primary: #6366f1;        /* Κύριο χρώμα */
  --secondary: #10b981;      /* Δευτερεύον χρώμα */
  /* ... */
}
```

### Αλλαγή System Prompt

Στο `api/chat.js`, γραμμές 25-28:

```javascript
const systemPrompt = `Είσαι ένας εξυπηρετικός chatbot...`;
```

### Προσθήκη Περισσότερων FAQ

Στο `public/faq.js`, προσθέστε νέα entries στο `FAQ_DATABASE` array.

## 📊 Πώς Λειτουργεί το FAQ Matching

1. Ο χρήστης στέλνει μήνυμα
2. Το σύστημα ψάχνει για keywords στο μήνυμα
3. Αν βρεθεί match → **Άμεση απάντηση (0 tokens)** ⚡
4. Αν ΔΕΝ βρεθεί match → **Gemini API call** 🤖

### Παράδειγμα:

```
Χρήστης: "Ποιο είναι το τηλέφωνό σας;"
Σύστημα: Βρήκε keywords ["τηλεφωνο", "τηλ"]
Απάντηση: FAQ (0 tokens) ✅

Χρήστης: "Τι γνώμη έχεις για την τεχνητή νοημοσύνη;"
Σύστημα: Δεν βρήκε matching FAQ
Απάντηση: Gemini AI (~100 tokens) 🤖
```

## 💰 Εξοικονόμηση Κόστους

### Χωρίς FAQ System:
- 100 ερωτήσεις/μέρα × 150 tokens/ερώτηση = **15,000 tokens/μέρα**

### Με FAQ System (80% FAQ, 20% AI):
- 80 FAQ απαντήσεις × 0 tokens = **0 tokens**
- 20 AI απαντήσεις × 150 tokens = **3,000 tokens/μέρα**

**📉 Εξοικονόμηση: 80%** (12,000 tokens/μέρα)

## 🔐 Ασφάλεια

- ✅ Το API key είναι κρυμμένο στο backend (Vercel Environment Variables)
- ✅ Δεν εκτίθεται ποτέ στο frontend
- ✅ Το Vercel χειρίζεται αυτόματα το HTTPS

## 🐛 Troubleshooting

### "API key not configured"
Ελέγξτε ότι έχετε ορίσει το `GEMINI_API_KEY` στο Vercel Dashboard → Settings → Environment Variables

### Το chatbot δεν απαντά
1. Ανοίξτε το Developer Console (F12)
2. Δείτε για errors στο Network tab
3. Ελέγξτε ότι το API endpoint `/api/chat` λειτουργεί

### Δεν βρίσκει FAQ απαντήσεις
Προσθέστε περισσότερα keywords στο `faq.js` για κάθε ερώτηση

## 📈 Επόμενα Βήματα

- 🎯 Προσθέστε περισσότερες FAQ (στόχος: 50+ ερωτήσεις)
- 🔍 Βελτιώστε το keyword matching με synonyms
- 📱 Προσθέστε rich content (εικόνες, links, buttons)
- 💾 Προσθέστε conversation history persistence
- 📊 Προσθέστε analytics (Google Analytics, Mixpanel)
- 🌍 Προσθέστε multilingual support

## 📄 License

MIT License - Ελεύθερο για εμπορική χρήση!

## 🤝 Υποστήριξη

Για ερωτήσεις ή βοήθεια, ανοίξτε ένα issue στο GitHub repository.

---

**Φτιαγμένο με ❤️ για εξοικονόμηση tokens!** ⚡
