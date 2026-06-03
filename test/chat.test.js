import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { UNKNOWN_REPLY } from "../lib/prompt.js";

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end(payload = "") {
      this.ended = true;
      this.payload = payload;
      return this;
    }
  };
}

async function loadHandler({ debug = false, geminiApiKey } = {}) {
  const previousDebug = process.env.DEBUG;
  const previousGeminiApiKey = process.env.GEMINI_API_KEY;

  if (debug) {
    process.env.DEBUG = "true";
  } else {
    process.env.DEBUG = "false";
  }

  if (geminiApiKey) {
    process.env.GEMINI_API_KEY = geminiApiKey;
  } else {
    delete process.env.GEMINI_API_KEY;
  }

  const moduleUrl = new URL(`../api/chat.js?debug=${debug}&t=${Date.now()}-${Math.random()}`, import.meta.url);
  const mod = await import(moduleUrl.href);

  if (previousDebug === undefined) {
    delete process.env.DEBUG;
  } else {
    process.env.DEBUG = previousDebug;
  }

  if (previousGeminiApiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = previousGeminiApiKey;
  }

  return mod.default;
}

function createGeminiStub(replyText = UNKNOWN_REPLY) {
  const generateContent = mock.fn(async (request) => {
    return {
      response: {
        text: () => replyText,
        usageMetadata: {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          thoughtsTokenCount: 0,
          totalTokenCount: 0
        }
      },
      request
    };
  });

  const getGenerativeModel = mock.method(
    GoogleGenerativeAI.prototype,
    "getGenerativeModel",
    () => ({
      generateContent
    })
  );

  return {
    generateContent,
    restore() {
      getGenerativeModel.mock.restore();
    }
  };
}

function createFailingGeminiStub(error = new Error("Gemini request failed")) {
  const generateContent = mock.fn(async () => {
    throw error;
  });

  const getGenerativeModel = mock.method(
    GoogleGenerativeAI.prototype,
    "getGenerativeModel",
    () => ({
      generateContent
    })
  );

  return {
    generateContent,
    restore() {
      getGenerativeModel.mock.restore();
    }
  };
}

async function postChat(message, options = {}) {
  const handler = await loadHandler({ debug: options.debug, geminiApiKey: options.geminiApiKey });
  return postChatWithHandler(handler, message, options);
}

async function postChatWithHandler(handler, message, options = {}) {
  const userId = options.userId || `test-${Date.now()}-${Math.random()}`;
  const req = {
    method: "POST",
    headers: {
      "user-agent": options.userAgent || "node-test-agent",
      "x-forwarded-for": options.ip || "127.0.0.1"
    },
    socket: { remoteAddress: options.ip || "127.0.0.1" },
    body: {
      message,
      userId,
      ...(options.context ? { context: options.context } : {})
    }
  };
  const res = createResponse();

  await handler(req, res);

  return {
    status: res.statusCode,
    body: res.payload
  };
}

async function assertDirectFaq(message, pattern) {
  const response = await postChat(message, { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "direct_faq");
  assert.equal(response.body.usedGemini, false);
  assert.match(response.body.reply, pattern);
}

async function assertDirectFaqId(message, expectedFaqId, pattern) {
  const response = await postChat(message, { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "direct_faq");
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.matchedFaqId, expectedFaqId);
  assert.match(response.body.reply, pattern);
}

async function assertUnknownReply(message) {
  const response = await postChat(message, { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.source, "local_unknown_reply");
  assert.equal(response.body.reply, UNKNOWN_REPLY);
}

test("production chat response hides internal debug fields", async () => {
  const response = await postChat("Ποιο είναι το email επικοινωνίας για Vodafone CU;");

  assert.equal(response.status, 200);
  assert.match(response.body.reply, /synetelas2011@gmail\.com/);
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.source, undefined);
  assert.equal(response.body.matchedFaqId, undefined);
  assert.equal(response.body.score, undefined);
  assert.equal(response.body.estimatedCostUsd, undefined);
  assert.ok(Array.isArray(response.body.suggestedQuestions));
  assert.ok(response.body.suggestedQuestions.length >= 2);
  assert.ok(response.body.suggestedQuestions.length <= 4);
});

test("direct FAQ response returns suggestedQuestions", async () => {
  const response = await postChat("Πού στέλνω έγγραφα;", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "direct_faq");
  assert.equal(response.body.usedGemini, false);
  assert.ok(Array.isArray(response.body.suggestedQuestions));
  assert.ok(response.body.suggestedQuestions.length >= 2);
  assert.ok(response.body.suggestedQuestions.length <= 4);
  response.body.suggestedQuestions.forEach((question) => {
    assert.equal(typeof question, "string");
    assert.ok(question.trim().length > 0);
  });
});

test("old reply field still works", async () => {
  const response = await postChat("τηλέφωνο επικοινωνίας", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(typeof response.body.reply, "string");
  assert.ok(response.body.reply.length > 0);
});

test("short contextual price question (Greek) routes to Gemini with offer KB context", async () => {
  const response = await postChat("Πόσο κοστίζει;", {
    debug: true,
    context: {
      title: "Νέος αριθμός",
      provider: "Vodafone CU",
      processType: "new-number",
      summary: "Προσφορά κινητής για νέο αριθμό Vodafone CU με 100€ για 12 μήνες."
    }
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.equal(response.body.contextSource, "faq_chunks");
  assert.ok(Array.isArray(response.body.matchedFaqIds));
  assert.ok(response.body.matchedFaqIds.includes("mobile-offer-summary"));
  assert.ok(response.body.matchedFaqIds.includes("site-offer-prices-summary"));
});

test("poso kostizei with Vodafone CU context avoids documents FAQ and routes to Gemini", async () => {
  const response = await postChat("poso kostizei", {
    debug: true,
    context: {
      title: "Νέος αριθμός",
      provider: "Vodafone CU",
      processType: "new-number",
      summary: "Προσφορά κινητής για νέο αριθμό Vodafone CU με 100€ για 12 μήνες."
    }
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.equal(response.body.contextSource, "faq_chunks");
  assert.ok(Array.isArray(response.body.matchedFaqIds));
  assert.ok(response.body.matchedFaqIds.includes("mobile-offer-summary"));
  assert.ok(response.body.matchedFaqIds.includes("site-offer-prices-summary"));
  assert.ok(!response.body.matchedFaqIds.includes("vodafone-cu-documents-overview"));
});

test("short contextual NOVA Q price question routes to Gemini with offer KB context", async () => {
  const response = await postChat("Πόσο κοστίζει;", {
    debug: true,
    context: {
      title: "Νέος αριθμός",
      provider: "NOVA Q",
      processType: "new-number",
      summary: "Προσφορά κινητής για νέο αριθμό NOVA Q με 100€ για 12 μήνες."
    }
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.equal(response.body.contextSource, "faq_chunks");
  assert.ok(Array.isArray(response.body.matchedFaqIds));
  assert.ok(response.body.matchedFaqIds.includes("mobile-offer-summary"));
  assert.ok(response.body.matchedFaqIds.includes("site-offer-prices-summary"));
});

test("contextual Vodafone CU documents question routes via Gemini and keeps documents KB", async () => {
  const response = await postChat("Τι δικαιολογητικά χρειάζονται;", {
    debug: true,
    context: {
      title: "Νέος αριθμός",
      provider: "Vodafone CU",
      processType: "new-number",
      summary: "Προσφορά κινητής για νέο αριθμό Vodafone CU με 100€ για 12 μήνες."
    }
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.equal(response.body.contextSource, "faq_chunks");
  assert.ok(Array.isArray(response.body.matchedFaqIds));
  assert.ok(
    response.body.matchedFaqIds.includes("vodafone-cu-documents-overview")
    || response.body.matchedFaqIds.includes("mobile-new-number-documents-generic")
  );
  assert.notEqual(response.body.source, "local_off_topic_playful");
});

test("γεια answers locally without Gemini", async () => {
  const response = await postChat("Γεια", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "local_small_talk");
  assert.equal(response.body.usedGemini, false);
});

test("τι είναι ο ΠΚΣΑΑ answers from FAQ", async () => {
  await assertDirectFaq("Τι είναι ο ΠΚΣΑΑ;", /Προμηθευτικός και Καταναλωτικός Συνεταιρισμός Αστυνομικών Αττικής/);
});

test("synetairismos astynomikon answers from FAQ", async () => {
  await assertDirectFaq("synetairismos astynomikon", /Συνεταιρισμός Αστυνομικών Αττικής/);
});

test("τηλέφωνο επικοινωνίας answers from FAQ", async () => {
  await assertDirectFaq("τηλέφωνο επικοινωνίας", /210 5245210/);
});

test("πού βρίσκεται answers address and map info", async () => {
  await assertDirectFaq("πού βρίσκεται ο Συνεταιρισμός;", /Καρύστου 3, Αθήνα 115 23/);
});

test("ποιες προσφορές υπάρχουν answers from site scope", async () => {
  await assertDirectFaq("ποιες προσφορές υπάρχουν;", /Vodafone CU.*NOVA Q|NOVA Q.*Vodafone CU/);
});

test("δικαιολογητικά για Vodafone CU answers checklist-like FAQ", async () => {
  await assertDirectFaq("δικαιολογητικά για Vodafone CU", /υπεύθυνη δήλωση/);
});

test("φορητότητα answers from FAQ", async () => {
  await assertDirectFaq("τι χρειάζεται για φορητότητα", /έντυπο φορητότητας/);
});

test("νέος αριθμός answers from FAQ", async () => {
  await assertDirectFaq("θέλω νέο αριθμό", /νέο αριθμό/);
});

test("πού στέλνω έγγραφα answers email FAQ", async () => {
  await assertDirectFaq("πού στέλνω έγγραφα", /synetelas2011@gmail\.com/);
});

test("IBAN answers payment FAQ", async () => {
  await assertDirectFaq("ποιο είναι το IBAN για κατάθεση;", /GR5801720500005050099524664/);
});

test("Greeklish site offers query routes to the offer overview FAQ", async () => {
  await assertDirectFaqId("pws exei prosfores sto site", "site-offers-overview", /Vodafone CU.*NOVA Q|NOVA Q.*Vodafone CU/);
});

test("Greeklish Vodafone fixed offer query routes to the Vodafone offer FAQ", async () => {
  await assertDirectFaqId("vodafone 16 euro", "vodafone-fixed-offer-current", /16,00€/);
});

test("Greeklish Nova fixed offer query routes to the Nova offer FAQ", async () => {
  await assertDirectFaqId("nova 17,90", "nova-fixed-offer-current", /17,90€/);
});

test("Greeklish EON price query routes to the EON price FAQ", async () => {
  await assertDirectFaqId("eon 20,90", "eon-price-offer", /20,90€/);
});

test("Greeklish TV pack query routes to the EON full pack FAQ", async () => {
  await assertDirectFaqId("cosmote tv full pack", "eon-cosmote-tv-offer-current", /Full Pack|20,90€/);
});

test("Greeklish fixed internet query routes to the internet offers FAQ", async () => {
  await assertDirectFaqId("pws exei stathero internet", "fixed-internet-offers-overview", /Vodafone.*Nova|Nova.*Vodafone/);
});

test("Greeklish short site-use query routes to the page guide FAQ", async () => {
  await assertDirectFaqId("pws vlepo tis prosfores apo to menu", "site-use-page", /Μενού Επιλογών/);
});

test("Greeklish internet application query routes to the steps FAQ", async () => {
  await assertDirectFaqId("pws ypovallo aitisi gia stathero internet gov gr", "fixed-internet-application-steps", /gov\.gr|ΚΕΠ/);
});

test("Greeklish new number query routes to the generic mobile FAQ", async () => {
  await assertDirectFaqId("neo noumero", "mobile-new-number-documents-generic", /κατάθεση 100€/);
});

test("Greeklish portability query routes to the generic portability FAQ", async () => {
  await assertDirectFaqId("pws kratao ton arithmo mou", "mobile-portability-documents-generic", /έντυπο φορητότητας/);
});

test("email queries use the updated sending address and subject", async () => {
  const queries = [
    "που στελνω τα δικαιολογητικα",
    "pou stelno ta xartia",
    "ποιο email στέλνω τα χαρτιά"
  ];

  for (const query of queries) {
    const response = await postChat(query, { debug: true });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, "direct_faq");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.matchedFaqId, "mobile-submit-email");
    assert.match(response.body.reply, /synetelas2011@gmail\.com/);
    assert.match(response.body.reply, /Ονοματεπώνυμο.*Πάροχος.*Είδος αίτησης/);
    assert.doesNotMatch(response.body.reply, /synetelas2025@gmail\.com/);
  }
});

test("new number queries route to the provider-specific FAQs", async () => {
  const cases = [
    {
      message: "neos arithmos vodafone ti xreiazetai",
      expectedFaqId: "vodafone-new-number-documents",
      expectedPattern: /υπεύθυνη δήλωση|προσωπικά δεδομένα|SIM/
    },
    {
      message: "νεος αριθμος nova q",
      expectedFaqId: "nova-new-number-documents",
      expectedPattern: /υπεύθυνη δήλωση|SIM/
    },
    {
      message: "τι χαρτιά θέλω για νέο αριθμό Vodafone",
      expectedFaqId: "vodafone-new-number-documents",
      expectedPattern: /υπεύθυνη δήλωση|προσωπικά δεδομένα|SIM/
    },
    {
      message: "τι δικαιολογητικά θέλω για νέο αριθμό Nova",
      expectedFaqId: "nova-new-number-documents",
      expectedPattern: /υπεύθυνη δήλωση|SIM/
    }
  ];

  for (const testCase of cases) {
    const response = await postChat(testCase.message, { debug: true });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, "direct_faq");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.matchedFaqId, testCase.expectedFaqId);
    assert.match(response.body.reply, testCase.expectedPattern);
  }
});

test("price on new number queries stays on the mobile offer FAQ", async () => {
  const cases = [
    "πόσο κοστίζει ο νέος αριθμός;",
    "poso kostizi o neos aritimos"
  ];

  for (const message of cases) {
    const response = await postChat(message, { debug: true });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, "direct_faq");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.matchedFaqId, "mobile-offer-summary");
    assert.match(response.body.reply, /100€|100 ευρώ/);
  }
});

test("portability queries keep the applicant-name warning and form details", async () => {
  const cases = [
    {
      message: "τι χαρτιά θέλω για φορητότητα vodafone",
      expectedFaqId: "vodafone-portability-documents",
      expectedPattern: /όνομα του αιτούντος|αλλαγή κατόχου/
    },
    {
      message: "μεταφορά αριθμού Vodafone",
      expectedFaqId: "vodafone-portability-documents",
      expectedPattern: /όνομα του αιτούντος|αλλαγή κατόχου/
    },
    {
      message: "metafora arithmou vodafone",
      expectedFaqId: "vodafone-portability-documents",
      expectedPattern: /όνομα του αιτούντος|αλλαγή κατόχου/
    },
    {
      message: "ti xartia thelo gia foritotita vodafone",
      expectedFaqId: "vodafone-portability-documents",
      expectedPattern: /όνομα του αιτούντος|αλλαγή κατόχου/
    },
    {
      message: "foritotita vodafone se allo onoma ginetai",
      expectedFaqId: "vodafone-portability-documents",
      expectedPattern: /όνομα του αιτούντος|αλλαγή κατόχου/
    },
    {
      message: "ο αριθμός είναι στο όνομα της μητέρας μου γίνεται;",
      expectedFaqId: "mobile-portability-documents-generic",
      expectedPattern: /όνομα του αιτούντος|αλλαγή κατόχου/
    },
    {
      message: "φορητότητα nova τι χρειάζεται",
      expectedFaqId: "nova-portability-documents",
      expectedPattern: /όνομα του αιτούντος|αλλαγή κατόχου/
    },
    {
      message: "κρατάω τον αριθμό μου Nova",
      expectedFaqId: "nova-portability-documents",
      expectedPattern: /όνομα του αιτούντος|αλλαγή κατόχου/
    },
    {
      message: "τι γράφω στο αίτημα φορητότητας",
      expectedFaqId: "mobile-portability-documents-generic",
      expectedPattern: /ονοματεπώνυμο συνδρομητή|ΑΦΜ|αριθμό που θα ενεργοποιηθεί/
    }
  ];

  for (const testCase of cases) {
    const response = await postChat(testCase.message, { debug: true });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, "direct_faq");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.matchedFaqId, testCase.expectedFaqId);
    assert.match(response.body.reply, testCase.expectedPattern);
  }
});

test("gov declaration and SIM photo queries route to the updated FAQs", async () => {
  const cases = [
    {
      message: "ypefthini dilosi gov ti grafo",
      expectedFaqId: "mobile-gov-kep",
      expectedPattern: /όνομα πατέρα|όνομα μητέρας|ΑΦΜ|αριθμό κινητού/
    },
    {
      message: "τι γράφω στην υπεύθυνη δήλωση gov.gr",
      expectedFaqId: "mobile-gov-kep",
      expectedPattern: /όνομα πατέρα|όνομα μητέρας|ΑΦΜ|αριθμό κινητού/
    },
    {
      message: "fotografia sim ti prepei na fainetai",
      expectedFaqId: "mobile-sim-photo-details",
      expectedPattern: /barcode|λογότυπο|αριθμός SIM/
    }
  ];

  for (const testCase of cases) {
    const response = await postChat(testCase.message, { debug: true });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, "direct_faq");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.matchedFaqId, testCase.expectedFaqId);
    assert.match(response.body.reply, testCase.expectedPattern);
  }
});

test("Greeklish SIM change query routes to the generic SIM activation FAQ", async () => {
  await assertDirectFaqId("pote mpainei i nea sim", "mobile-when-to-change-sim", /κλήση ενεργοποίησης/);
});

test("Greeklish Nova Q SIM query routes to the Nova activation FAQ", async () => {
  await assertDirectFaqId("pote vazw sim nova q", "nova-activation", /12200/);
});

test("email attachment query routes to the send-email FAQ", async () => {
  await assertDirectFaqId("pou stelno eggrafa", "mobile-submit-email", /synetelas2011@gmail\.com/);
});

test("υγεία is treated as off-topic after cleanup", async () => {
  const response = await postChat("υγεία και περίθαλψη", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.source, "local_unknown_reply");
  assert.equal(response.body.reply, UNKNOWN_REPLY);
});

test("cookies answers privacy FAQ", async () => {
  await assertDirectFaq("cookies και προσωπικά δεδομένα", /απαραίτητα cookies/);
});

test("πες μου ανέκδοτο blocks locally without Gemini", async () => {
  const response = await postChat("πες μου ανέκδοτο", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "local_unknown_reply");
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.reply, UNKNOWN_REPLY);
});

test("καιρός αύριο blocks locally without Gemini", async () => {
  const response = await postChat("καιρός αύριο", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "local_unknown_reply");
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.reply, UNKNOWN_REPLY);
});

test("strong FAQ match answers direct even with nearby alternatives", async () => {
  const response = await postChat("θέλω πληροφορίες για παροχές και δικαιολογητικά", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "direct_faq");
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.matchedFaqId, "mobile-new-number-documents-generic");
});

test("website-related question without exact FAQ uses Gemini fallback", async () => {
  const response = await postChat("Πώς μπορώ να κάνω αίτηση;", { debug: true });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.equal(response.body.contextSource, "faq_chunks");
});

test("website-related question with no relevant FAQ returns UNKNOWN_REPLY locally", async () => {
  await assertUnknownReply("pos kano kati sto site");
});

test("empty search results do not call Gemini", async () => {
  await assertUnknownReply("abc xyz");
});

test("related but not direct FAQ calls Gemini only with KB context", async () => {
  const gemini = createGeminiStub(UNKNOWN_REPLY);

  try {
    const response = await postChat("Πώς μπορώ να κάνω αίτηση;", {
      debug: true,
      geminiApiKey: "test-gemini-key"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, "gemini");
    assert.equal(response.body.usedGemini, true);
    assert.equal(gemini.generateContent.mock.calls.length, 1);

    const prompt = gemini.generateContent.mock.calls[0].arguments[0].contents[0].parts[0].text;
    assert.match(prompt, /KB:\n/);
    assert.doesNotMatch(prompt, /Page context:/);
    assert.doesNotMatch(prompt, /Η Sofia είναι ψηφιακή βοηθός/);
  } finally {
    gemini.restore();
  }
});

test("Gemini request failures fall back to UNKNOWN_REPLY locally", async () => {
  const gemini = createFailingGeminiStub();

  try {
    const response = await postChat("Πώς μπορώ να κάνω αίτηση;", {
      debug: true,
      geminiApiKey: "test-gemini-key"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, "local_unknown_reply");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.reply, UNKNOWN_REPLY);
    assert.equal(gemini.generateContent.mock.calls.length, 1);
  } finally {
    gemini.restore();
  }
});

test("out of knowledge question does not call Gemini", async () => {
  const gemini = createGeminiStub(UNKNOWN_REPLY);

  try {
    const response = await postChat("abc xyz", {
      debug: true,
      geminiApiKey: "test-gemini-key"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, "local_unknown_reply");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.reply, UNKNOWN_REPLY);
    assert.equal(gemini.generateContent.mock.calls.length, 0);
  } finally {
    gemini.restore();
  }
});

test("confused offer navigation gets helpful site-use answer", async () => {
  await assertDirectFaq("Δεν καταλαβαίνω πού να πατήσω για προσφορές", /Μενού Επιλογών/);
});

test("cooperative overview wording answers locally", async () => {
  await assertDirectFaq("Θέλω να μάθω για τον Συνεταιρισμό", /Προμηθευτικός και Καταναλωτικός Συνεταιρισμός/);
});

test("contact wording answers locally", async () => {
  await assertDirectFaq("Πού μπορώ να επικοινωνήσω;", /210 5245210/);
});

test("personal best-offer advice is routed to Gemini instead of a random price FAQ", async () => {
  const response = await postChat("Ποια προσφορά είναι καλύτερη για εμένα;", { debug: true });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.equal(response.body.contextSource, "faq_chunks");
});

test("unrelated but not explicitly blocked wording stays local scope reply", async () => {
  const response = await postChat("τι είναι η κβαντική φυσική;", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "local_unknown_reply");
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.reply, UNKNOWN_REPLY);
});

test("off-topic questions return UNKNOWN_REPLY locally", async () => {
  const handler = await loadHandler({ debug: true });
  const options = {
    userId: "off-topic-sequence",
    ip: "127.0.0.55",
    userAgent: "off-topic-test-agent"
  };
  const messages = [
    "Πες μου ένα ανέκδοτο",
    "Τι καιρό θα κάνει αύριο;",
    "Ποιος θα πάρει το πρωτάθλημα;",
    "Πες μου συνταγή για μακαρόνια",
    "Τι είναι το TikTok;",
    "Πες μου πάλι κάτι άσχετο"
  ];

  const responses = [];
  for (const message of messages) {
    responses.push(await postChatWithHandler(handler, message, options));
  }

  responses.forEach((response, index) => {
    assert.equal(response.status, 200);
    assert.equal(response.body.source, "local_unknown_reply");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.reply, UNKNOWN_REPLY);
  });
});

test("off-topic production response hides debug metadata", async () => {
  const response = await postChat("Πες μου ένα ανέκδοτο");

  assert.equal(response.status, 200);
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.source, undefined);
  assert.equal(response.body.offTopicCount, undefined);
  assert.equal(response.body.reply, UNKNOWN_REPLY);
});


test("Greeklish identity question answers locally", async () => {
  const response = await postChat("pos se lene?", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "local_small_talk");
  assert.equal(response.body.usedGemini, false);
  assert.match(response.body.reply, /Sofia|Σοφία/);
});

test("Greeklish mobile offer advice routes to Gemini", async () => {
  const response = await postChat("pia prosfora axizei sta kinita", { debug: true });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
});

test("Greeklish comparison routes to Gemini instead of email FAQ", async () => {
  const response = await postChat("Είμαι μέλος και θέλω κινητή με χαμηλό κόστος. Σύγκρινε Vodafone CU και NOVA Q.", { debug: true });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
});

test("Greeklish Vodafone mobile documents question answers documents", async () => {
  await assertDirectFaq("ti xartia na steal gia vodafone kinito", /υπεύθυνη δήλωση|ταυτότητα|SIM|κάρτα SIM/);
});

test("Greeklish send me mobile documents does not answer only submission email", async () => {
  const response = await postChat("teile moy ta xartia gia kiniti se mail", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "direct_faq");
  assert.equal(response.body.usedGemini, false);
  assert.notEqual(response.body.matchedFaqId, "mobile-submit-email");
  assert.match(response.body.reply, /υπεύθυνη δήλωση|ταυτότητα|SIM|κάρτα SIM|δικαιολογητικά/);
});

test("Greeklish phone offer does not return contact details", async () => {
  const response = await postChat("prosfora tilefono", { debug: true });

  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body.reply, /Καρύστου 3|210 5245210|6936799908/);
});


test("short Greeklish follow-up uses previous FAQ history", async () => {
  const handler = await loadHandler({ debug: true });
  const options = {
    userId: "followup-history-test",
    ip: "127.0.0.88",
    userAgent: "followup-history-agent"
  };

  const first = await postChatWithHandler(handler, "ποιες προσφορές υπάρχουν;", options);

  assert.equal(first.status, 200);
  assert.equal(first.body.source, "direct_faq");
  assert.equal(first.body.usedGemini, false);

  const second = await postChatWithHandler(handler, "einai idia?", options);

  assert.equal(second.status, 200);
  assert.equal(second.body.source, "local_unknown_reply");
  assert.equal(second.body.usedGemini, false);
  assert.equal(second.body.reply, UNKNOWN_REPLY);
});


test("Greeklish follow-up difference question uses previous direct FAQ history", async () => {
  const handler = await loadHandler({ debug: true });
  const options = {
    userId: "followup-difference-test",
    ip: "127.0.0.92",
    userAgent: "followup-difference-agent"
  };

  const first = await postChatWithHandler(handler, "ποιες προσφορές υπάρχουν;", options);

  assert.equal(first.status, 200);
  assert.equal(first.body.source, "direct_faq");
  assert.equal(first.body.usedGemini, false);

  const second = await postChatWithHandler(handler, "ti diafora exoun", options);

  assert.equal(second.status, 200);
  assert.equal(second.body.source, "local_unknown_reply");
  assert.equal(second.body.usedGemini, false);
  assert.equal(second.body.reply, UNKNOWN_REPLY);
});

test("Greeklish νέο Vodafone απαντά ελληνικά", async () => {
  await assertDirectFaq("ti xreiazetai gia neo arithmo vodafone cu", /παράρτημα προσωπικών δεδομένων|υπεύθυνη δήλωση/);
});

test("Greeklish φορητότητα Nova απαντά ελληνικά", async () => {
  await assertDirectFaq("thelo foritotita se nova q", /έντυπο φορητότητας αριθμού Nova/);
});

test("Greeklish φορητότητα Vodafone απαντά ελληνικά", async () => {
  await assertDirectFaq("thelo foritotita vodafone cu", /έντυπο φορητότητας αριθμού Vodafone/);
});

test("ενεργοποίηση Vodafone SIM", async () => {
  await assertDirectFaq("pote vazo tin sim vodafone", /1252/);
});

test("ενεργοποίηση Nova SIM", async () => {
  await assertDirectFaq("pote vazo tin sim nova q", /12200/);
});

test("IBAN κατάθεσης", async () => {
  await assertDirectFaq("poio einai to iban gia katathesi", /GR5801720500005050099524664|GR5302600310000310201070966/);
});

test("EON TV", async () => {
  await assertDirectFaq("eon cosmote tv", /20,90€\/μήνα|EON \+ Cosmote TV Full Pack|Full Pack/);
});

test("EON documents question routes to the documents FAQ", async () => {
  await assertDirectFaqId("eon tv dikaiologitika", "eon-documents-required", /GOV|ΔΕΚΟ/);
});

test("EON missing-address question routes to the no-street FAQ", async () => {
  await assertDirectFaqId("eon xwris arithmo", "eon-address-no-street", /GPS|Google Maps|pin/);
});

test("EON programs question routes to the programs FAQ", async () => {
  await assertDirectFaqId("eon programata", "eon-programs", /EON Entry|EON\+|Adult Pack/);
});

test("EON price question routes to the EON+ offer FAQ", async () => {
  await assertDirectFaqId("eon plus 20.90", "eon-price-offer", /20,90€/);
});

test("EON price list question routes to the EON list FAQ", async () => {
  await assertDirectFaqId("eon price list", "eon-list-prices", /18,18€|27,27€|54,55€/);
});

test("EON contract question routes to the duration FAQ", async () => {
  await assertDirectFaqId("eon 24 months", "eon-contract-duration", /24 μήνες/);
});

test("EON cancellation question routes to the fee FAQ", async () => {
  await assertDirectFaqId("eon cancellation fee", "eon-cancellation-fees", /60€|80€|140€/);
});

test("EON equipment question routes to the equipment FAQ", async () => {
  await assertDirectFaqId("eon smart box", "eon-equipment", /Smart Box|δορυφορικός/);
});

test("EON billing address question routes to the bill address FAQ", async () => {
  await assertDirectFaqId("pou paei o logariasmos eon", "eon-bill-address", /διεύθυνση αποστολής λογαριασμού|email|sms/);
});

test("EON adult pack question routes to the adult pack FAQ", async () => {
  await assertDirectFaqId("eon adult pack", "eon-adult-pack", /18ο έτος|Adult Pack/);
});

test("διεύθυνση χωρίς αριθμό", async () => {
  await assertDirectFaq("i dieuthinsi den exei arithmo", /GPS|Google Maps|pin/);
});

test("Nova 5G Home Internet", async () => {
  await assertDirectFaq("nova 5g home internet", /17,90€|100 Mbps/);
});

test("Greeklish follow-up same question uses previous direct FAQ history", async () => {
  const handler = await loadHandler({ debug: true });
  const options = {
    userId: "followup-same-test",
    ip: "127.0.0.93",
    userAgent: "followup-same-agent"
  };

  await postChatWithHandler(handler, "ποιες προσφορές υπάρχουν;", options);
  const second = await postChatWithHandler(handler, "einai idia?", options);

  assert.equal(second.status, 200);
  assert.equal(second.body.source, "local_unknown_reply");
  assert.equal(second.body.usedGemini, false);
  assert.equal(second.body.reply, UNKNOWN_REPLY);
});
