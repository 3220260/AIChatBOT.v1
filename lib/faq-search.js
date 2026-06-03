import { faqs } from "../faqs.js";
import { toSearchKey, toSmallTalkKey } from "./normalize.js";

const MAX_RELEVANT_FAQS_FOR_GEMINI = 5;
const MAX_FAQ_ANSWER_CHARS_FOR_GEMINI = 420;
const DIRECT_FAQ_SCORE = 7;
const DIRECT_FAQ_SCORE_GAP = 2;
const STRONG_DIRECT_FAQ_SCORE = 15;

const STOP_WORDS = new Set([
  "τι",
  "ποια",
  "ποιο",
  "ποιος",
  "πως",
  "που",
  "για",
  "και",
  "να",
  "το",
  "τη",
  "την",
  "τον",
  "τα",
  "στο",
  "στη",
  "στην",
  "με",
  "σε",
  "απο",
  "είναι",
  "ειναι",
  "χρειάζεται",
  "χρειαζεται",
  "χρειάζονται",
  "χρειαζονται",
  "the",
  "what",
  "how",
  "where",
  "for",
  "and"
].map(toSearchKey));

const LOCAL_SMALL_TALK = [
  {
    patterns: ["γεια", "γειά", "καλημερα", "καλησπερα", "καληνυχτα", "hello", "geia", "kalimera", "kalispera", "gia sou", "hi", "χαι", "γεια σου", "μιλα", "μιλα μου", "τι κανεις", "τι κανεισ", "ti kaneis", "mila", "mila mou", "mila moy"],
    reply: "Γεια σας! Είμαι η Sofia και μπορώ να βοηθήσω με προσφορές, δικαιολογητικά, διαδικασίες και στοιχεία επικοινωνίας του Π.Κ.Σ.Α.Α."
  },
  {
    patterns: ["ευχαριστω", "ευχαριστώ", "thanks", "thank you", "euxaristo", "efxaristo", "kleise", "klise", "off", "of", "οφ", "κλεισε"],
    reply: "Παρακαλώ! Είμαι στη διάθεσή σας για πληροφορίες της ιστοσελίδας του Π.Κ.Σ.Α.Α."
  },
  {
    patterns: [
      "ποιος εισαι",
      "ποιος είσαι",
      "τι εισαι",
      "τι είσαι",
      "πως σε λενε",
      "πώς σε λένε",
      "ποιο ειναι το ονομα σου",
      "ποιο είναι το όνομά σου",
      "ονομα σου",
      "όνομα σου",
      "ανθρωπος",
      "ρομποτ",
      "bot",
      "poios eisai",
      "ti eisai",
      "pos se lene",
      "pos se lene?",
      "pio einai to onoma sou",
      "poio einai to onoma sou",
      "onoma sou",
      "onomazesai",
      "robot"
    ],
    reply: "Είμαι η Sofia, η ψηφιακή βοηθός του Π.Κ.Σ.Α.Α., και απαντώ με πληροφορίες από την ιστοσελίδα για προσφορές, διαδικασίες και επικοινωνία."
  }
];

const INTERNAL_FAQ_CATEGORIES = new Set(["Οδηγίες bot"]);

const BUSINESS_KEYWORDS = [
  "vodafone",
  "cu",
  "nova",
  "q",
  "nova q",
  "vodafone cu",
  "5g home internet",
  "eon tv",
  "google maps pin",
  "gps",
  "smart box",
  "gov.gr",
  "gov gr",
  "eon",
  "tv",
  "τηλεφωνία",
  "τηλεφωνια",
  "tilefonia",
  "τηλέφωνο",
  "τηλεφωνο",
  "tilefono",
  "κινητή",
  "κινητη",
  "kinhth",
  "kinito",
  "σταθερή",
  "σταθερο",
  "statheri",
  "stathero",
  "internet",
  "ίντερνετ",
  "ιντερνετ",
  "τηλεόραση",
  "τηλεοραση",
  "tileorasi",
  "φορητότητα",
  "φορητοτητα",
  "foritotita",
  "metafora arithmou",
  "μεταφορά αριθμού",
  "νεος αριθμος",
  "νέος αριθμός",
  "neos arithmos",
  "neo noumero",
  "sim",
  "κάρτα",
  "καρτα",
  "karta",
  "καρτοκινητή",
  "καρτοκινητη",
  "kartokinito",
  "δικαιολογητικά",
  "δικαιολογητικα",
  "dikaiologitika",
  "χαρτια",
  "xartia",
  "eggrafa",
  "ταυτότητα",
  "ταυτοτητα",
  "tautotita",
  "taftotita",
  "gov",
  "κεπ",
  "kep",
  "κατάθεση",
  "καταθεση",
  "katathesi",
  "pliromi",
  "iban",
  "προσφορά",
  "προσφορα",
  "prosfora",
  "τιμή",
  "τιμη",
  "timi",
  "συνεταιρισμός",
  "συνεταιρισμος",
  "synetairismos",
  "sinetairismos",
  "πκσαα",
  "pksaa",
  "προσφορές",
  "προσφορες",
  "prosfores",
  "επικοινωνία",
  "επικοινωνια",
  "epikoinonia",
  "viber",
  "χάρτης",
  "χαρτης",
  "xartis",
  "maps",
  "google maps",
  "cosmote",
  "cookies",
  "δεδομένα",
  "δεδομενα",
  "dedomena"
];

const OUT_OF_SCOPE_KEYWORDS = [
  "ανέκδοτο",
  "ανεκδοτο",
  "anekdoto",
  "τραγούδι",
  "τραγουδι",
  "tragoudi",
  "ποίημα",
  "ποιημα",
  "poiima",
  "καιρός",
  "καιρος",
  "καιρό",
  "καιρο",
  "kero",
  "kairos",
  "ποδόσφαιρο",
  "ποδοσφαιρο",
  "podosfairo",
  "πρωτάθλημα",
  "πρωταθλημα",
  "protathlima",
  "στοίχημα",
  "στοιχημα",
  "stoixima",
  "μαγειρική",
  "μαγειρικη",
  "mageiriki",
  "συνταγή",
  "συνταγη",
  "syntagi",
  "μακαρόνια",
  "μακαρονια",
  "makaronia",
  "ταινία",
  "ταινια",
  "tainia",
  "πολιτική",
  "πολιτικη",
  "politiki",
  "minecraft",
  "fortnite",
  "instagram",
  "tiktok",
  "facebook",
  "διάγνωση",
  "διαγνωση",
  "diagnosi",
  "φαρμακο",
  "φαρμακο",
  "επένδυση",
  "επενδυση",
  "ependysi",
  "μετοχές",
  "μετοχες",
  "metoxes",
  "δικηγόρος",
  "δικηγορος",
  "dikigoros"
];

const AMBIGUOUS_SCOPE_KEYWORDS = [
  "συνεταιρισμός",
  "συνεταιρισμος",
  "sinetairismos",
  "synetelas",
  "πκσαα",
  "pksaa",
  "επικοινωνία",
  "επικοινωνια",
  "επικοινων",
  "επικοινωνώ",
  "επικοινωνω",
  "epikoinonia",
  "epikoinon"
];

const WEBSITE_RELATED_KEYWORDS = [
  "συνεταιρισμός",
  "συνεταιρισμος",
  "synetairismos",
  "sinetairismos",
  "synetelas",
  "πκσαα",
  "pksaa",
  "προσφορά",
  "προσφορα",
  "προσφορές",
  "προσφορες",
  "prosfora",
  "prosfores",
  "vodafone",
  "cu",
  "nova",
  "q",
  "eon",
  "tv",
  "internet",
  "ίντερνετ",
  "ιντερνετ",
  "σταθερή",
  "σταθερη",
  "σταθερό",
  "σταθερο",
  "statheri",
  "stathero",
  "κινητή",
  "κινητη",
  "kinito",
  "kinita",
  "δικαιολογητικά",
  "δικαιολογητικα",
  "dikaiologitika",
  "dikeologitika",
  "xartia",
  "έγγραφα",
  "εγγραφα",
  "eggrafa",
  "αίτηση",
  "αιτηση",
  "aitisi",
  "φορητότητα",
  "φορητοτητα",
  "foritotita",
  "νέος αριθμός",
  "νεος αριθμος",
  "neos arithmos",
  "thelo neo arithmo",
  "sim",
  "ενεργοποίηση",
  "ενεργοποιηση",
  "energopoiisi",
  "energopoiw",
  "iban",
  "κατάθεση",
  "καταθεση",
  "katathesi",
  "email",
  "mail",
  "τηλέφωνο",
  "τηλεφωνο",
  "tilefono",
  "επικοινωνία",
  "επικοινωνια",
  "επικοινωνώ",
  "επικοινωνω",
  "επικοινωνήσω",
  "επικοινωνησω",
  "epikoinonia",
  "epikoinon",
  "epikoinoniso",
  "διεύθυνση",
  "διευθυνση",
  "diefthinsi",
  "dieuthinsi",
  "viber",
  "cookies",
  "cookie",
  "προσωπικά δεδομένα",
  "προσωπικα δεδομενα",
  "prosopika dedomena",
  "χρήση σελίδας",
  "χρηση σελιδας",
  "xrisi selidas",
  "πού πατάω",
  "που παταω",
  "pou patao",
  "πού στέλνω",
  "που στελνω",
  "pou stelno",
  "πώς κάνω",
  "πως κανω",
  "pos kano",
  "καλύτερη προσφορά",
  "καλυτερη προσφορα",
  "kaliteri prosfora",
  "ποια προσφορά",
  "poia prosfora"
];

const GENERAL_CONTEXT_FAQ_IDS = new Set([
  "site-pksaa-overview",
  "site-offers-overview",
  "site-use-page",
  "site-application-steps",
  "site-contact-current",
  "documents-general-checklist"
]);

export function getLocalSmallTalkReply(message) {
  const normalized = toSmallTalkKey(message);
  const words = new Set(normalized.split(" ").filter(Boolean));

  for (const item of LOCAL_SMALL_TALK) {
    if (item.patterns.some((pattern) => {
      const normalizedPattern = toSmallTalkKey(pattern);
      if (!normalizedPattern) return false;
      if (normalizedPattern.includes(" ")) return normalized.includes(normalizedPattern);
      return words.has(normalizedPattern);
    })) {
      return item.reply;
    }
  }

  return null;
}

export function hasBusinessKeyword(message) {
  const normalizedMessage = toSearchKey(message);
  return BUSINESS_KEYWORDS.some((keyword) => normalizedMessage.includes(toSearchKey(keyword)));
}

export function isClearlyOutOfScope(message) {
  const normalizedMessage = toSearchKey(message);
  return OUT_OF_SCOPE_KEYWORDS.some((keyword) => normalizedMessage.includes(toSearchKey(keyword)));
}

export function hasAmbiguousScopeKeyword(message) {
  const normalizedMessage = toSearchKey(message);
  return AMBIGUOUS_SCOPE_KEYWORDS.some((keyword) => normalizedMessage.includes(toSearchKey(keyword)));
}

export function shouldBlockForScope(message) {
  return isClearlyOutOfScope(message);
}

export function shouldUseGeminiForWebsiteAdvice(message) {
  const normalizedMessage = toSearchKey(message);

  const asksForAdviceOrComparison =
    /(kaliteri|kalyteri|katallili|protini|protein|simbouli|gia emena|gia mena|poia prosfora|pia prosfora|poia|pia|axizi|aksizi|axizei|aksizei|simferi|symferi|sigkrine|sigkrisi|sigrine|sigrisi|sugkrine|sugkrisi|sygkrine|sygkrisi|singkrine|singrisi|sigrino|sigkrino|sugkrino|sygkrino|xamilo kostos|xamilo|fthino|fthinotero|ti na dialexo|ti na epilexo|ti na prosexo|prosexo)/.test(normalizedMessage);

  const mentionsOfferTopic =
    /(prosfora|prosfores|paketo|programma|vodafone|cu|nova|q|kinito|kinita|kiniti|kartokinito|tilefonia|internet|eon|cosmote)/.test(normalizedMessage);

  return asksForAdviceOrComparison && mentionsOfferTopic;
}

export function isWebsiteRelatedQuestion(message) {
  const normalizedMessage = toSearchKey(message);
  if (!normalizedMessage) return false;

  return WEBSITE_RELATED_KEYWORDS.some((keyword) => {
    const normalizedKeyword = toSearchKey(keyword);
    return normalizedKeyword.length >= 2 && normalizedMessage.includes(normalizedKeyword);
  });
}

function buildFaqSearchText(faq) {
  return toSearchKey([
    faq.category,
    faq.question,
    faq.answer,
    ...(faq.keywords || [])
  ].join(" "));
}

function buildFaqMetaSearchText(faq) {
  return toSearchKey([
    faq.category,
    faq.source,
    faq.question
  ].filter(Boolean).join(" "));
}

function scoreLexicalFaqMatches({ normalizedMessage, searchableText, normalizedQuestion, faq, messageWords }) {
  let score = 0;

  for (const word of messageWords) {
    if (searchableText.includes(word)) {
      score += 1;
    }
  }

  for (const keyword of faq.keywords || []) {
    const normalizedKeyword = toSearchKey(keyword);
    if (normalizedKeyword.length >= 3 && normalizedMessage.includes(normalizedKeyword)) {
      score += normalizedKeyword.includes(" ") ? 6 : 4;
    }
  }

  if (normalizedQuestion.includes(normalizedMessage) || normalizedMessage.includes(normalizedQuestion)) {
    score += 8;
  }

  if (/(dikaiologitika|dikeologitika)/.test(normalizedMessage)
    && /(dikaiologitika|dikeologitika)/.test(searchableText)) {
    score += 3;
  }

  if (normalizedMessage.includes("katathesi") && searchableText.includes("katathesi")) score += 3;
  if (normalizedMessage.includes("foritotita") && searchableText.includes("foritotita")) score += 3;
  if (normalizedMessage.includes("energopoi") && searchableText.includes("energopoi")) score += 3;

  return score;
}

function scoreTopicFaqMatches({ normalizedMessage, searchableText, faq }) {
  let score = 0;

  if (/(epikoinonia|epikoinon|epikinonia|epikinon|tilefono|kinito|email|dieuth|diefth|dieth|dith|viber|xartis|maps|brisketai)/.test(normalizedMessage)
    && /(epikoinonia|epikoinon|epikinonia|epikinon|tilefono|kinito|email|dieuth|diefth|dieth|dith|viber|xartis|maps|karistou|brisketai)/.test(searchableText)) {
    score += 8;
  }

  if (/(epikoinon|epikinon|tilefono|email)/.test(normalizedMessage)
    && faq.id === "site-contact-current") {
    score += 18;
  }

  if (/(aitisi|vima|diadikasia|xrisimopoi|pato|anoigo|stelno|steln|apostol)/.test(normalizedMessage)
    && /(aitisi|vima|diadikasia|xrisimopoi|pato|apostoli|steln|email)/.test(searchableText)) {
    score += 6;
  }

  if (/(pksaa|sinetairismos|synetairismos|sineterismos|poios eisai|ti einai)/.test(normalizedMessage)
    && /(pksaa|sinetairismos|synetairismos|sineterismos|promitheftikos|katanalotikos)/.test(searchableText)) {
    score += 10;
  }

  if (/(sinetairism|synetairism|sineterism|pksaa)/.test(normalizedMessage)
    && faq.id === "site-pksaa-overview") {
    score += 18;
  }

  if (/(pou|pu|brisketai|vrisket|xartis|maps|dieuth|diefth)/.test(normalizedMessage)
    && /(sinetairism|synetairism|sineterism|pksaa)/.test(normalizedMessage)
    && faq.id === "site-location-map") {
    score += 24;
  }

  if (/(pata|pato|patis|katalev|xrisimopoi|pou)/.test(normalizedMessage)
    && /(prosfora|prosfores)/.test(normalizedMessage)
    && faq.id === "site-use-page") {
    score += 20;
  }

  if (/(cookies|dedomena|prosopika)/.test(normalizedMessage)
    && /(cookies|dedomena|prosopika)/.test(searchableText)) {
    score += 10;
  }

  return score;
}

function scorePriceFaqMatches({ normalizedMessage, searchableText, faq, faqMetaSearchText }) {
  let score = 0;

  const asksForDocuments = /(dikaiologitika|dikeologitika|xartia|eggrafa|ti xartia|poia xartia)/.test(normalizedMessage);
  const hasPriceIntent = /(poso|kostiz|kostos|\btimi\b|pagio)/.test(normalizedMessage);
  const hasMobileOfferContext = /(vodafone|cu|nova|q|kinito|kiniti|kartokinito|aritim|new number|neos aritimos|neos aritimo)/.test(normalizedMessage);
  const hasPortabilityIntent = /(foritotita|portability|metafora aritim|metatora aritim|fora aritim|retain my number|kratao ton aritim)/.test(normalizedMessage);
  const isDocumentOrProcedureFaq = /(dikaiologitika|dikeologitika|eggrafa|xartia|document|documents|diadikasia|aitisi|vima)/.test(faqMetaSearchText);
  const mentionsVodafoneProvider = /vodafone|cu/.test(normalizedMessage);
  const mentionsNovaProvider = /nova|q/.test(normalizedMessage);

  const wantsPrice = /(prosfora|\btimi\b|times|poso|kostos|pagio)/.test(normalizedMessage);
  const isPriceFaq = /(price|program|offer)/.test(faq.id)
    || /(prosfora|timi|times|kostos|pagio|17 90|20 90)/.test(searchableText);

  if (wantsPrice && isPriceFaq) {
    score += 12;
  } else if (wantsPrice && /(prosfora|timi|times|kostos|pagio|17 90|20 90)/.test(searchableText)) {
    score += 7;
  }

  if (hasPriceIntent && !asksForDocuments && isDocumentOrProcedureFaq) {
    score -= 140;
  }

  if (hasPriceIntent && hasMobileOfferContext && faq.id === "mobile-offer-summary") {
    score += 220;
  }

  if (hasPriceIntent && hasMobileOfferContext && faq.id === "site-offer-prices-summary") {
    score += 180;
  }

  if (hasPriceIntent && hasMobileOfferContext && faq.id === "site-offers-overview") {
    score -= 60;
  }

  if (hasPortabilityIntent && mentionsVodafoneProvider && faq.id === "vodafone-portability-documents") {
    score += 25;
  }

  if (hasPortabilityIntent && mentionsNovaProvider && faq.id === "nova-portability-documents") {
    score += 25;
  }

  if (hasPortabilityIntent && faq.id === "mobile-portability-documents-generic") {
    score += 10;
  }

  if (hasPortabilityIntent && faq.id === "vodafone-cu-documents-overview") {
    score -= 120;
  }

  if (/(dikaiologitika|dikeologitika|xartia|eggrafa)/.test(normalizedMessage)
    && /(dikaiologitika|dikeologitika|tautotita|eggrafa|apodeiktiko|dilosi)/.test(searchableText)) {
    score += 5;
  }

  if (/vodafone/.test(normalizedMessage)
    && /cu/.test(normalizedMessage)
    && /(dikaiologitika|dikeologitika|xartia|eggrafa)/.test(normalizedMessage)
    && faq.id === "vodafone-cu-documents-overview") {
    score += 20;
  }

  const mentionsVodafoneMobile = /vodafone/.test(normalizedMessage)
    && /(cu|kinito|kiniti|kinita|kartokinito|sim|aritim|foritotita)/.test(normalizedMessage);
  const mentionsAnyMobile = /(kinito|kiniti|kinita|kartokinito|sim|aritim|foritotita|vodafone|cu|nova|q)/.test(normalizedMessage);
  const hasNewNumberIntent = /(new number|neo aritimo|neos aritimo|neo aritimos|neos aritimos|neo noumero|neos noumero)/.test(normalizedMessage);
  if (asksForDocuments && mentionsVodafoneMobile && faq.id === "vodafone-cu-documents-overview") {
    score += 90;
  }

  if (hasNewNumberIntent && mentionsVodafoneProvider && faq.id === "vodafone-new-number-documents") {
    score += 120;
  }

  if (hasNewNumberIntent && mentionsVodafoneProvider && faq.id === "vodafone-cu-documents-overview") {
    score -= 80;
  }

  if (hasNewNumberIntent && mentionsNovaProvider && faq.id === "nova-new-number-documents") {
    score += 120;
  }

  if (asksForDocuments && mentionsAnyMobile && /(mobile|vodafone|nova|documents|portability|new-number)/.test(faq.id)) {
    score += 35;
  }

  if (asksForDocuments && faq.id === "site-offers-overview") {
    score -= 100;
  }

  return score;
}

function scoreSupportFaqMatches({ normalizedMessage, searchableText, faq }) {
  let score = 0;

  const asksBotToSendDocuments = /(steile mou|steil mou|stile mou|stile mi|tile mou|tile mi|teile mou|teile mi|dose mou|dos mou|ta xartia gia|xartia gia kiniti|xartia gia kinito)/.test(normalizedMessage);
  const wantsSubmissionEmail = !asksBotToSendDocuments
    && /(email|emel|mail|mel|apostol|steln|stelno|steil)/.test(normalizedMessage);
  const wantsOfferInfo = /(prosfora|prosfores|paketo|programma|timi|times|kostos|pagio|xamilo|fthino)/.test(normalizedMessage);
  const mentionsPhoneService = /(tilefono|thlefono|tilefonia|kinito|kinita|kiniti|kartokinito|stathero|statheri|internet|vodafone|cu|nova|q|eon|cosmote)/.test(normalizedMessage);
  const wantsContactPhone = !wantsOfferInfo && /(tilefono|thlefono|epikoinonia|epikoinon|epikinonia|epikinon)/.test(normalizedMessage);
  const mentionsMobileProvider = /(vodafone|cu|nova|q|kartokinit|kinito|sim|foritotita|dikaiologitika|dikeologitika)/.test(normalizedMessage);

  if (wantsSubmissionEmail && faq.id === "mobile-submit-email") {
    score += 60;
  }

  if (wantsSubmissionEmail && mentionsMobileProvider && /synetelas2011@gmail\.com/.test(searchableText)) {
    score += 50;
  }

  if (wantsContactPhone && faq.id === "site-contact-current") {
    score += 80;
  }

  if (wantsOfferInfo && mentionsPhoneService && faq.id === "site-contact-current") {
    score -= 100;
  }

  if (wantsOfferInfo && mentionsPhoneService && /(offer|offers|price|program|mobile|fixed|vodafone|nova|cu|q|eon|internet)/.test(faq.id)) {
    score += 18;
  }

  return score;
}

function scoreAdviceFaqMatches({ normalizedMessage, faq, message }) {
  let score = 0;

  const intentWantsAdvice = shouldUseGeminiForWebsiteAdvice(message);
  const intentWantsOfferInfo =
    /(prosfora|prosfores|paketo|programma|\btimi\b|times|kostos|pagio|xamilo|fthino|axizi|axizei|aksizi|simferi|symferi)/.test(normalizedMessage);

  const intentMentionsPhoneService =
    /(tilefono|thlefono|tilefonia|kinito|kinita|kiniti|kartokinito|stathero|statheri|internet|vodafone|cu|nova|q|eon|cosmote)/.test(normalizedMessage);

  const intentAsksContactPhone =
    !intentWantsOfferInfo
    && (
      /(tilefono epikoinonias|thlefono epikoinonias|aritim(?:os|i)? epikoinonias)/.test(normalizedMessage)
      || (/(tilefono|thlefono)/.test(normalizedMessage) && /(epikoinonia|epikoinon|epikinonia|epikinon)/.test(normalizedMessage))
    );

  const intentAsksWhereToSendDocuments =
    /(pou|pu|pos|pws|se poio|se poia)/.test(normalizedMessage)
    && /(steln|stelno|steil|steal|apostol|email|mail)/.test(normalizedMessage)
    && /(xartia|eggrafa|dikaiologitika|dikeologitika)/.test(normalizedMessage);

  const intentAsksWhatDocuments =
    !intentAsksWhereToSendDocuments
    && /(ti xartia|poia xartia|ti dikaiologitika|poia dikaiologitika|xartia gia|dikaiologitika gia|dikeologitika gia|steile mou|teile mou|stile mou|dose mou|dos mou|xreiazomai xartia|xreiazete xartia)/.test(normalizedMessage);

  const intentMentionsMobile =
    /(kinito|kiniti|kinita|kartokinito|mobile|vodafone|cu|nova|q|sim|aritim|foritotita)/.test(normalizedMessage);

  const intentMentionsVodafoneMobile =
    /vodafone/.test(normalizedMessage)
    && /(cu|kinito|kiniti|kinita|kartokinito|sim|aritim|foritotita)/.test(normalizedMessage);

  if (intentWantsAdvice) {
    if (faq.id === "mobile-submit-email" || faq.id === "site-contact-current" || faq.id === "site-offers-overview") {
      score -= 200;
    }

    if (intentMentionsMobile && /(eon|tv|cosmote)/.test(faq.id)) {
      score -= 200;
    }

    if (intentMentionsMobile && /(mobile|vodafone|nova|cu|q|price|program|offer)/.test(faq.id)) {
      score += 60;
    }
  }

  if (intentWantsOfferInfo && intentMentionsPhoneService && faq.id === "site-contact-current") {
    score -= 180;
  }

  if (!intentWantsAdvice && intentWantsOfferInfo && intentMentionsPhoneService && faq.id === "site-offers-overview") {
    score += 120;
  }

  if (intentAsksContactPhone && faq.id === "site-contact-current") {
    score += 140;
  }

  if (intentAsksWhatDocuments && intentMentionsVodafoneMobile && /(vodafone|mobile|documents|document|new-number|portability)/.test(faq.id)) {
    score += 110;
  }

  if (intentAsksWhatDocuments && intentMentionsMobile && /(mobile|documents|document|vodafone|nova|new-number|portability)/.test(faq.id)) {
    score += 65;
  }

  if (intentAsksWhatDocuments && (faq.id === "mobile-submit-email" || faq.id === "site-offers-overview")) {
    score -= 140;
  }

  if (intentAsksWhereToSendDocuments && faq.id === "mobile-submit-email") {
    score += 120;
  }

  return score;
}

export function scoreKnowledgeItems(
  message,
  knowledgeItems = faqs,
  limit = MAX_RELEVANT_FAQS_FOR_GEMINI
) {
  const normalizedMessage = toSearchKey(message);
  const messageWords = [...new Set(
    normalizedMessage
      .split(" ")
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
  )];

  const scored = knowledgeItems.filter(isAllowedFaq).map((faq) => {
    const searchableText = buildFaqSearchText(faq);
    const normalizedQuestion = toSearchKey(faq.question);
    const faqMetaSearchText = buildFaqMetaSearchText(faq);

    const score = scoreLexicalFaqMatches({
      normalizedMessage,
      searchableText,
      normalizedQuestion,
      faq,
      messageWords
    }) + scoreTopicFaqMatches({
      normalizedMessage,
      searchableText,
      faq
    }) + scorePriceFaqMatches({
      normalizedMessage,
      searchableText,
      faq,
      faqMetaSearchText
    }) + scoreSupportFaqMatches({
      normalizedMessage,
      searchableText,
      faq
    }) + scoreAdviceFaqMatches({
      normalizedMessage,
      faq,
      message
    });

    return { faq, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function getRelevantFaqs(message, limit = MAX_RELEVANT_FAQS_FOR_GEMINI) {
  return scoreKnowledgeItems(message, faqs, limit);
}

function isAllowedFaq(faq) {
  return !INTERNAL_FAQ_CATEGORIES.has(faq.category);
}

export function shouldAnswerDirectly(scoredFaqs) {
  if (!scoredFaqs.length) return false;
  const [best, second] = scoredFaqs;
  const scoreGap = best.score - (second?.score || 0);

  if (best.score >= STRONG_DIRECT_FAQ_SCORE) {
    return true;
  }

  return best.score >= DIRECT_FAQ_SCORE && scoreGap >= DIRECT_FAQ_SCORE_GAP;
}

export function buildFaqContext(relevantFaqs) {
  return relevantFaqs
    .map((f, index) => {
      const answer = compactText(f.answer, MAX_FAQ_ANSWER_CHARS_FOR_GEMINI);
      return `${index + 1}. ${f.category}\nQ: ${f.question}\nA: ${answer}`;
    })
    .join("\n\n");
}

export function buildGeneralSiteContext(
  unknownReply = "Δεν έχω σίγουρη πληροφορία γι’ αυτό. Καλύτερα να επικοινωνήσετε με τον Συνεταιρισμό."
) {
  return [
    "Η Sofia είναι ψηφιακή βοηθός της ιστοσελίδας synetairismos-astynomikon.gr.",
    "Βοηθά τους χρήστες με πληροφορίες για προσφορές, δικαιολογητικά, διαδικασίες, επικοινωνία και χρήση της ιστοσελίδας.",
    "Δεν εφευρίσκει τιμές, όρους, IBAN, τηλέφωνα ή έγγραφα.",
    `Αν δεν υπάρχει σίγουρη πληροφορία, απαντά: "${unknownReply}"`
  ].join(" ");
}

export function getGeneralContextFaqs(limit = 3) {
  return faqs
    .filter((faq) => GENERAL_CONTEXT_FAQ_IDS.has(faq.id))
    .slice(0, limit);
}

function compactText(text = "", maxChars = 420) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  const clipped = compact.slice(0, maxChars - 1);
  const lastSentence = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf(";"),
    clipped.lastIndexOf("!")
  );
  if (lastSentence > maxChars * 0.55) {
    return `${clipped.slice(0, lastSentence + 1).trim()}`;
  }
  return `${clipped.trim()}…`;
}

export function isFollowUpQuestion(message) {
  const normalizedMessage = toSearchKey(message);
  const words = normalizedMessage.split(" ").filter(Boolean);

  if (!normalizedMessage || words.length > 6) return false;

  return /(ine idia|einai idia|idia|idio|to idio|same|diafora|diafer|diaforet|afto|auto|ayto|auta|afta|ekeino)/.test(normalizedMessage);
}

export function isTvPackContentQuestion(message) {
  const normalizedMessage = toSearchKey(message);

  const mentionsTvPack =
    /(tv|tileorasi|eon|cosmote|full pack|fullpack)/.test(normalizedMessage);

  const asksContents =
    /(ti ex|ti periex|periex|mesa|perilamvan|kanal|channel|athlitik|taini|series|seir|on demand|content|periexomen)/.test(normalizedMessage);

  return mentionsTvPack && asksContents;
}
