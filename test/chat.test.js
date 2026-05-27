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
  const userId = options.userId || `test-${Date.now()}-${Math.random()}`;
  const req = {
    method: "POST",
    headers: {
      "user-agent": options.userAgent || "node-test-agent",
      "x-forwarded-for": options.ip || "127.0.0.1"
    },
    socket: { remoteAddress: options.ip || "127.0.0.1" },
    body: { message, userId }
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

test("υγεία answers from health section instead of scope block", async () => {
  await assertDirectFaq("υγεία και περίθαλψη", /Interamerican|νοσοκομειακή περίθαλψη|παροχές υγείας/);
});

test("cookies answers privacy FAQ", async () => {
  await assertDirectFaq("cookies και προσωπικά δεδομένα", /απαραίτητα cookies/);
});

test("πες μου ανέκδοτο blocks locally without Gemini", async () => {
  const response = await postChat("πες μου ανέκδοτο", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "blocked_out_of_scope");
  assert.equal(response.body.usedGemini, false);
});

test("καιρός αύριο blocks locally without Gemini", async () => {
  const response = await postChat("καιρός αύριο", { debug: true });

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "blocked_out_of_scope");
  assert.equal(response.body.usedGemini, false);
});

test("medium relevant query is routed to Gemini path when no direct FAQ is clear", async () => {
  const response = await postChat("θέλω πληροφορίες για παροχές και δικαιολογητικά", { debug: true });

  assert.equal(response.status, 500);
  assert.match(response.body.error, /GEMINI_API_KEY/);
});
