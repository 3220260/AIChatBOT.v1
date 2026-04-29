# VerBot Synetelas

Έτοιμο Vercel chatbot για Synetelas.

## Αρχεία

```text
index.html
api/chat.js
faqs.js
package.json
.gitignore
README.md
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
GEMINI_MODEL=gemini-2.5-flash
```

4. Κάνε Deploy.

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
- Περιορίζει μηνύματα ανά χρήστη/IP.
- Έχει mobile-friendly UI με σωστή συμπεριφορά όταν ανοίγει το πληκτρολόγιο.
