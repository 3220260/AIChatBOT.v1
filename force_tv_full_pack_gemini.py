from pathlib import Path

api_path = Path("api/chat.js")
faqs_path = Path("faqs.js")

api = api_path.read_text(encoding="utf-8")
faqs = faqs_path.read_text(encoding="utf-8")

# Backup
api_path.with_suffix(".js.bak").write_text(api, encoding="utf-8")
faqs_path.with_suffix(".js.bak").write_text(faqs, encoding="utf-8")

# 1) Helper: detect TV Full Pack content questions
helper = '''
function isTvPackContentQuestion(message) {
  const normalizedMessage = toSearchKey(message);

  const mentionsTvPack =
    /(tv|tileorasi|eon|cosmote|full pack|fullpack)/.test(normalizedMessage);

  const asksContents =
    /(ti ex|ti periex|periex|mesa|perilamvan|kanal|channel|athlitik|taini|series|seir|on demand|content|periexomen)/.test(normalizedMessage);

  return mentionsTvPack && asksContents;
}

'''

if "function isTvPackContentQuestion" not in api:
    marker = "/* =========================================\n   5. RATE LIMITS"
    if marker not in api:
        raise SystemExit("ERROR: Δεν βρήκα το section '5. RATE LIMITS' για να βάλω helper.")
    api = api.replace(marker, helper + marker, 1)
    print("✅ Added isTvPackContentQuestion()")
else:
    print("ℹ️ isTvPackContentQuestion() already exists")

# 2) Force Gemini flag before direct FAQ answer
old_direct_if = '''if (!shouldUseGeminiForWebsiteAdvice(safeMessage) && shouldAnswerDirectly(scoredFaqs)) {'''

new_direct_if = '''const forceGeminiForTvPackContents = isTvPackContentQuestion(safeMessage);

    if (
      !forceGeminiForTvPackContents &&
      !shouldUseGeminiForWebsiteAdvice(safeMessage) &&
      shouldAnswerDirectly(scoredFaqs)
    ) {'''

if "const forceGeminiForTvPackContents = isTvPackContentQuestion(safeMessage);" not in api:
    if old_direct_if not in api:
        raise SystemExit("ERROR: Δεν βρήκα το direct FAQ if για αντικατάσταση.")
    api = api.replace(old_direct_if, new_direct_if, 1)
    print("✅ Updated direct FAQ guard")
else:
    print("ℹ️ direct FAQ guard already updated")

# 3) Make TV Pack content questions enter Gemini route with context
old_route = '''if (scoredFaqs.length && scoredFaqs[0].score >= MIN_RELEVANT_SCORE_FOR_GEMINI) {
      relevantFaqs = scoredFaqs.map((item) => item.faq);
    } else if (isWebsiteRelatedQuestion(safeMessage)) {'''

new_route = '''if (forceGeminiForTvPackContents) {
      relevantFaqs = scoredFaqs.length
        ? scoredFaqs.map((item) => item.faq)
        : getGeneralContextFaqs(3);
      generalContext = buildGeneralSiteContext();
      geminiContextSource = "tv_pack_content_question";
    } else if (scoredFaqs.length && scoredFaqs[0].score >= MIN_RELEVANT_SCORE_FOR_GEMINI) {
      relevantFaqs = scoredFaqs.map((item) => item.faq);
    } else if (isWebsiteRelatedQuestion(safeMessage)) {'''

if 'geminiContextSource = "tv_pack_content_question";' not in api:
    if old_route not in api:
        raise SystemExit("ERROR: Δεν βρήκα το FAQ/Gemini routing block για αντικατάσταση.")
    api = api.replace(old_route, new_route, 1)
    print("✅ Updated Gemini routing")
else:
    print("ℹ️ Gemini routing already updated")

api_path.write_text(api, encoding="utf-8")

# 4) Add FAQ context so Gemini has correct information
tv_faq = '''  {
    "id": "tv-full-pack-contents",
    "category": "Nova & Cosmote TV",
    "source": "Κάρτα προσφοράς EON + Cosmote TV Full Pack",
    "keywords": [
      "TV Full Pack",
      "Cosmote TV Full Pack",
      "EON Full Pack",
      "EON + Cosmote TV",
      "τι έχει μέσα το TV Full Pack",
      "τι περιλαμβάνει το Full Pack",
      "ti exei mesa to tv full pack",
      "ti exi mesa to tv full pack",
      "ti periexei to full pack",
      "kanalia",
      "κανάλια",
      "ταινίες",
      "σειρές",
      "αθλητικά",
      "on demand"
    ],
    "question": "Τι περιλαμβάνει το EON + Cosmote TV Full Pack;",
    "answer": "Στη σελίδα αναφέρεται ότι η προσφορά EON + Cosmote TV Full Pack στα 20,90€/μήνα περιλαμβάνει premium τηλεοπτικό πακέτο με αθλητικά, ταινίες και on demand περιεχόμενο, καθώς και πάνω από 6.000 ταινίες και σειρές on demand. Δεν αναφέρονται αναλυτικά όλα τα κανάλια του πακέτου στη σελίδα."
  }'''

if '"id": "tv-full-pack-contents"' not in faqs:
    if "\n];" not in faqs:
        raise SystemExit("ERROR: Δεν βρήκα το τέλος του faqs array.")
    faqs = faqs.replace("\n];", ",\n" + tv_faq + "\n];", 1)
    faqs_path.write_text(faqs, encoding="utf-8")
    print("✅ Added TV Full Pack FAQ context")
else:
    print("ℹ️ TV Full Pack FAQ already exists")

print("✅ Done. TV Full Pack content questions will now go through Gemini.")
