# VerBot Synetelas

Έτοιμο Vercel chatbot για Synetelas.

## Αρχεία

```text
.env.example
.gitignore
README.md
api/chat.js
faqs.js
scripts/dev-server.js
public/index.html
package.json
package-lock.json
```

## Deploy στο Vercel

1. Ανέβασε όλα τα αρχεία στο GitHub repo.
2. Σύνδεσε το repo στο Vercel.
3. Στο Vercel βάλε Environment Variable:

```text
GEMINI_API_KEY=το_api_key_σου
```

Προαιρετικά:

```text
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_MAX_OUTPUT_TOKENS=220
GEMINI_THINKING_BUDGET=0
```

Υπάρχει και αρχείο `.env.example` με τις ίδιες μεταβλητές για τοπικό στήσιμο.

4. Κάνε Deploy.

## Τοπική εκκίνηση

```bash
npm install
npm run dev
```

Το local chat ανοίγει στο:

```text
http://localhost:3000
```

## URL

Το chat frontend ανοίγει στο root:

```text
https://το-project.vercel.app/
```

Το backend endpoint είναι:

```text
https://το-project.vercel.app/api/chat
```

## Τι κάνει

- Απαντά τοπικά σε απλές ερωτήσεις και καθαρά FAQ matches με 0 Gemini tokens.
- Αναγνωρίζει ελληνικά και greeklish.
- Κόβει άσχετες ερωτήσεις πριν πάνε στο Gemini.
- Απαντά μόνο για τηλεφωνία, τηλεόραση και σταθερό internet. Οι παλιές πληροφορίες για ασφάλιση/υγεία/Anytime δεν χρησιμοποιούνται από το API.
- Χρησιμοποιεί compact FAQ context, μέχρι 3 σχετικά FAQ και μικρό output budget για χαμηλότερο κόστος Gemini.
- Χρησιμοποιεί ως default το `gemini-2.5-flash-lite`, που είναι το οικονομικό Flash-Lite μοντέλο.
- Περιορίζει μηνύματα ανά χρήστη/IP.
- Έχει mobile-first UI για iPhone/Android με safe-area, αποθήκευση συνομιλίας στη συσκευή, διακοπή απάντησης και φωνητική εισαγωγή όπου υποστηρίζεται από το browser.


## Σημείωση για Vercel Output Directory

Το frontend βρίσκεται στο `public/index.html`.
Το `vercel.json` ορίζει:

```json
{
  "buildCommand": null,
  "outputDirectory": "public"
}
```

Άρα στο Vercel δεν χρειάζεται build για το frontend. Τα API functions παραμένουν στο `/api`.
