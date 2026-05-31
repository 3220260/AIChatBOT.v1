# Sofia / VerBot

Sofia (VerBot) is a Greek-speaking chatbot for the P.K.S.A.A. website.  
It answers FAQ-style questions directly from project knowledge and falls back to Gemini when needed, while keeping scope/safety rules and basic chat memory.

## What The Chatbot Does

- Answers common questions about offers, procedures, documents, and contact info.
- Supports Greek and Greeklish input normalization.
- Uses local FAQ matching first (fast/direct answers).
- Uses Gemini as fallback for broader website-related questions.
- Includes frontend chat history and assistant UX features.

## Install Dependencies

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Then open the local URL printed by the dev server.

## Environment Variables

Required:

- `GEMINI_API_KEY`

Optional:

- `GEMINI_MODEL` (defaults to a Gemini flash-lite model in code)
- `DEBUG` (`true` to include debug fields in API responses, otherwise hidden)

You can create a local `.env` file (or use your shell environment) before running `npm run dev`.

## Run Checks

```bash
npm run check
```

This runs syntax checks and tests.

## Deploy On Vercel

1. Push this repository to GitHub.
2. In Vercel, click **New Project** and import the repo.
3. Set environment variables in Vercel Project Settings:
   - `GEMINI_API_KEY` (required)
   - `GEMINI_MODEL` (optional)
   - `DEBUG` (optional)
4. Deploy.
5. After deploy, test `POST /api/chat` and the frontend page.

`vercel.json` is already included in this repo for project configuration.

## Add Or Update FAQs (`faqs.js`)

The app imports FAQs through `faqs.js`.  
Currently, `faqs.js` re-exports data from `data/knowledge.json`.

To add/update FAQ entries:

1. Edit `data/knowledge.json`.
2. Keep each item shape consistent:
   - `id`
   - `category`
   - `source`
   - `question`
   - `answer`
   - `keywords` (array)
   - `updatedAt`
3. Save and run:
   ```bash
   npm run check
   ```
4. Commit your changes.
