# VerBot Synetelas

Mobile-first chatbot για το `synetairismos-astynomikon.gr`. Η Sofia απαντά μόνο με πληροφορίες της ιστοσελίδας για προσφορές, δικαιολογητικά, διαδικασίες, επικοινωνία, προσωπικά δεδομένα και cookies.

## Τοπική Εκκίνηση

```bash
npm install
npm run dev
```

Το chat ανοίγει στο `http://localhost:3000` και το backend παραμένει στο `POST /api/chat`.

Για στατικό έλεγχο και tests:

```bash
npm run check
```

## Deploy Στο Vercel

1. Συνδέστε το GitHub repo στο Vercel.
2. Ορίστε τα Environment Variables στο Vercel.
3. Κάντε deploy. Το frontend σερβίρεται από το `public/index.html` και το API από το `/api/chat`.

Απαραίτητο:

```text
GEMINI_API_KEY=το_api_key_σου
```

Προαιρετικά:

```text
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_MAX_OUTPUT_TOKENS=220
GEMINI_THINKING_BUDGET=0
DEBUG=false
```

Προτεινόμενες τιμές παραγωγής:

```text
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_MAX_OUTPUT_TOKENS=220
GEMINI_THINKING_BUDGET=0
DEBUG=false
```

Το backend υποστηρίζει αλλαγή μοντέλου από `GEMINI_MODEL`. Το default μένει `gemini-2.5-flash-lite` για σταθερότητα και χαμηλό κόστος. Για μοντέλα `gemini-2.5*` στέλνεται `thinkingBudget=0`; για `gemini-3*` δεν στέλνεται thinking budget ώστε να μην υπάρξει ασυμβατότητα SDK.

Το `GEMINI_API_KEY` δεν μπαίνει ποτέ στο frontend. Μένει μόνο στα Vercel Environment Variables ή σε τοπικό περιβάλλον για ανάπτυξη.

## Βάση Γνώσης

Η γνώση βρίσκεται στο `faqs.js`. Κάθε εγγραφή είναι δομημένη με:

```js
{
  id: "unique-id",
  category: "Κατηγορία",
  question: "Ερώτηση",
  answer: "Απάντηση",
  keywords: ["λέξεις", "greeklish"],
  source: "Προαιρετική ενότητα σελίδας"
}
```

Για ενημέρωση, προσθέστε ή αλλάξτε εγγραφές στο `faqs.js` με πραγματικές πληροφορίες από τη σελίδα. Μην βάζετε εικασίες για τιμές, όρους, πακέτα ή δικαιολογητικά.

## Συμπεριφορά

- Πρώτα γίνεται τοπικό FAQ matching, χωρίς Gemini.
- Αναγνωρίζονται ελληνικά, χωρίς τόνους και greeklish.
- Αν υπάρχει σχετική αλλά όχι καθαρή πληροφορία, στέλνονται στο Gemini μόνο τα 3-5 πιο σχετικά αποσπάσματα.
- Δεν χρησιμοποιείται Google Search grounding. Οι απαντήσεις βασίζονται μόνο στο `faqs.js`.
- Οι απαντήσεις Gemini κρατιούνται σύντομες με μικρό output budget.
- Αν δεν υπάρχει σίγουρη πληροφορία, η Sofia προτείνει επικοινωνία με τον Συνεταιρισμό.
- Άσχετες ερωτήσεις απαντώνται με μήνυμα περιορισμού στο περιεχόμενο της ιστοσελίδας.
- Σε production το API επιστρέφει `{ reply, usedGemini }`, χωρίς scores, matched IDs ή κόστος tokens. Αυτά εμφανίζονται μόνο με `DEBUG=true`.
- Το rate limit είναι 8 μηνύματα ανά λεπτό ανά client key που συνδυάζει IP, `userId` και user-agent.

## Ασφάλεια

Το `vercel.json` περιορίζει το `frame-ancestors` στο επίσημο site, το GitHub Pages origin και τα local origins ανάπτυξης. Το frontend δεν στέλνει προσωπικά δεδομένα μέσω `postMessage`.
