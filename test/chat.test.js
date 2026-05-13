import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/chat.js";

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

async function postChat(message, userId = `test-${Date.now()}-${Math.random()}`) {
  const req = {
    method: "POST",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    body: { message, userId }
  };
  const res = createResponse();

  await handler(req, res);

  return {
    status: res.statusCode,
    body: res.payload
  };
}

test("allows business contact wording when it matches the mobile submission FAQ", async () => {
  const response = await postChat("Ποιο είναι το email επικοινωνίας για Vodafone CU;");

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "direct_faq");
  assert.equal(response.body.matchedFaqId, "mobile-submit-email");
  assert.match(response.body.reply, /synetelas2025@gmail\.com/);
});

test("still blocks clearly out-of-scope creative requests even when a provider is mentioned", async () => {
  const response = await postChat("Πες μου ένα τραγούδι για Vodafone CU");

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "blocked_out_of_scope");
});

test("blocks ambiguous cooperative-contact questions without a telecom intent", async () => {
  const response = await postChat("Πώς επικοινωνώ με τον Συνεταιρισμό;");

  assert.equal(response.status, 200);
  assert.equal(response.body.source, "blocked_out_of_scope");
});

test("answers direct FAQ requests without Gemini", async () => {
  const response = await postChat("Πού γίνεται η κατάθεση των 100€ για νέο αριθμό ή φορητότητα;");

  assert.equal(response.status, 200);
  assert.equal(response.body.usedGemini, false);
  assert.equal(response.body.matchedFaqId, "mobile-deposit-iban");
});
