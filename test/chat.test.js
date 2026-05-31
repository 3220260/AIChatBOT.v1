import assert from "node:assert/strict";
import test from "node:test";

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

async function loadHandler({ debug = false } = {}) {
  const previousDebug = process.env.DEBUG;

  if (debug) {
    process.env.DEBUG = "true";
  } else {
    process.env.DEBUG = "false";
  }

  const moduleUrl = new URL(`../api/chat.js?debug=${debug}&t=${Date.now()}-${Math.random()}`, import.meta.url);
  const mod = await import(moduleUrl.href);

  if (previousDebug === undefined) {
    delete process.env.DEBUG;
  } else {
    process.env.DEBUG = previousDebug;
  }

  return mod.default;
}

async function postChat(message, options = {}) {
  const handler = await loadHandler({ debug: options.debug });
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
  assert.equal(response.body.contextSource, "parent_context");
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
  assert.equal(response.body.contextSource, "parent_context");
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
  assert.equal(response.body.contextSource, "parent_context");
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
  assert.equal(response.body.contextSource, "parent_context");
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
  await assertDirectFaq("πού στέλνω έγγραφα", /synetelas2025@gmail\.com/);
});

test("IBAN answers payment FAQ", async () => {
  await assertDirectFaq("ποιο είναι το IBAN για κατάθεση;", /GR5801720500005050099524664/);
});

test("υγεία answers from health section instead of scope block", async () => {
  await assertDirectFaq("υγεία και περίθαλψη", /Interamerican|νοσοκομειακή περίθαλψη|παροχές υγείας/);
});

test("cookies answers privacy FAQ", async () => {
  await assertDirectFaq("cookies και προσωπικά δεδομένα", /απαραίτητα cookies/);
});

test("πες μου ανέκδοτο blocks locally without Gemini", async () => {
  const response = await postChat("πες μου ανέκδοτο", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "local_off_topic_playful");
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.offTopicCount, 1);
});

test("καιρός αύριο blocks locally without Gemini", async () => {
  const response = await postChat("καιρός αύριο", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "local_off_topic_playful");
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.offTopicCount, 1);
});

test("medium relevant query is routed to Gemini path when no direct FAQ is clear", async () => {
  const response = await postChat("θέλω πληροφορίες για παροχές και δικαιολογητικά", { debug: true });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.match(response.body.error, /GEMINI_API_KEY/);
});

test("website-related question without exact FAQ uses Gemini fallback", async () => {
  const response = await postChat("Πώς μπορώ να κάνω αίτηση;", { debug: true });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.equal(response.body.contextSource, "faq_chunks");
});

test("website-related question with no relevant FAQ uses general site context", async () => {
  const response = await postChat("pos kano kati sto site", { debug: true });

  assert.equal(response.status, 500);
  assert.equal(response.body.source, "gemini_unconfigured");
  assert.equal(response.body.usedGemini, true);
  assert.equal(response.body.contextSource, "general_site_context");
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
  assert.equal(response.body.source, "local_off_topic_playful");
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.offTopicCount, 1);
});

test("off-topic questions use five playful redirects then the firm redirect", async () => {
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
    assert.equal(response.body.source, "local_off_topic_playful");
    assert.equal(response.body.usedGemini, false);
    assert.equal(response.body.offTopicCount, index + 1);
  });

  const firstFiveReplies = responses.slice(0, 5).map((response) => response.body.reply);
  assert.equal(new Set(firstFiveReplies).size, 5);
  assert.match(responses[0].body.reply, /Καλή ερώτηση/);
  assert.match(responses[1].body.reply, /Για ποια προσφορά ενδιαφέρεστε/);
  assert.match(responses[2].body.reply, /έξω από τον ρόλο μου/);
  assert.match(responses[3].body.reply, /Δεν θέλω να σας δώσω άσχετη/);
  assert.match(responses[4].body.reply, /πρακτικό κομμάτι/);
  assert.equal(
    responses[5].body.reply,
    "Μπορώ να βοηθήσω κυρίως με πληροφορίες για τις προσφορές, τα δικαιολογητικά, τις διαδικασίες και την ιστοσελίδα του Συνεταιρισμού."
  );
});

test("off-topic production response hides playful debug metadata", async () => {
  const response = await postChat("Πες μου ένα ανέκδοτο");

  assert.equal(response.status, 200);
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.source, undefined);
  assert.equal(response.body.offTopicCount, undefined);
  assert.match(response.body.reply, /Καλή ερώτηση/);
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

  assert.equal(second.status, 500);
  assert.equal(second.body.source, "gemini_unconfigured");
  assert.equal(second.body.usedGemini, true);
  assert.equal(second.body.contextSource, "history_followup");
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

  assert.equal(second.status, 500);
  assert.equal(second.body.source, "gemini_unconfigured");
  assert.equal(second.body.usedGemini, true);
  assert.equal(second.body.contextSource, "history_followup");
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
  await assertDirectFaq("eon cosmote tv", /20,90€\/μήνα|EON \+ Cosmote TV Full Pack/);
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

  assert.equal(second.status, 500);
  assert.equal(second.body.source, "gemini_unconfigured");
  assert.equal(second.body.usedGemini, true);
  assert.equal(second.body.contextSource, "history_followup");
});
