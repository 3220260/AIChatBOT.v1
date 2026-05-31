import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_HISTORY_MESSAGES,
  getUserHistory,
  hasPriorMemory,
  rememberTurn,
  resetMemoryAdapter,
  setUserHistory
} from "../lib/memory.js";
import {
  checkRateLimit,
  checkRateLimitBucket,
  incrementOffTopicPlayCount,
  resetRateLimitAdapter
} from "../lib/rate-limit.js";

function createRateLimitTestAdapter() {
  const bucketStore = new Map();
  const offTopicStore = new Map();

  return {
    async getBucket(key) {
      return bucketStore.get(key);
    },
    async setBucket(key, bucket) {
      bucketStore.set(key, bucket);
    },
    async incrementOffTopic(key) {
      const count = (offTopicStore.get(key) || 0) + 1;
      offTopicStore.set(key, count);
      return count;
    }
  };
}

test("memory remembers turns and keeps max history window", async () => {
  resetMemoryAdapter();
  const userId = `memory-window-${Date.now()}-${Math.random()}`;

  await rememberTurn(userId, "q1", "a1", DEFAULT_MAX_HISTORY_MESSAGES);
  await rememberTurn(userId, "q2", "a2", DEFAULT_MAX_HISTORY_MESSAGES);
  await rememberTurn(userId, "q3", "a3", DEFAULT_MAX_HISTORY_MESSAGES);

  const history = await getUserHistory(userId);

  assert.equal(history.length, DEFAULT_MAX_HISTORY_MESSAGES);
  assert.deepEqual(
    history.map((item) => item.parts?.[0]?.text),
    ["q2", "a2", "q3", "a3"]
  );
  assert.equal(await hasPriorMemory(userId), true);
});

test("memory setUserHistory trims to max size", async () => {
  resetMemoryAdapter();
  const userId = `memory-trim-${Date.now()}-${Math.random()}`;

  await setUserHistory(userId, [
    { role: "user", parts: [{ text: "u1" }] },
    { role: "model", parts: [{ text: "m1" }] },
    { role: "user", parts: [{ text: "u2" }] },
    { role: "model", parts: [{ text: "m2" }] },
    { role: "user", parts: [{ text: "u3" }] }
  ], 4);

  const history = await getUserHistory(userId);
  assert.equal(history.length, 4);
  assert.deepEqual(
    history.map((item) => item.parts?.[0]?.text),
    ["m1", "u2", "m2", "u3"]
  );
});

test("rate limit bucket blocks after limit and resets after window", async () => {
  resetRateLimitAdapter();
  const adapter = createRateLimitTestAdapter();
  const key = `rate-limit-${Date.now()}-${Math.random()}`;
  const now = Date.now();

  for (let i = 0; i < 3; i += 1) {
    const retry = await checkRateLimitBucket(key, now, {
      adapter,
      maxMessagesPerWindow: 3,
      rateLimitWindowMs: 1000
    });
    assert.equal(retry, 0);
  }

  const blockedRetry = await checkRateLimitBucket(key, now, {
    adapter,
    maxMessagesPerWindow: 3,
    rateLimitWindowMs: 1000
  });

  assert.ok(blockedRetry > 0);

  const retryAfterReset = await checkRateLimitBucket(key, now + 1001, {
    adapter,
    maxMessagesPerWindow: 3,
    rateLimitWindowMs: 1000
  });
  assert.equal(retryAfterReset, 0);
});

test("checkRateLimit and off-topic counters keep current response semantics", async () => {
  resetRateLimitAdapter();
  const adapter = createRateLimitTestAdapter();
  const req = {
    headers: {
      "x-forwarded-for": "127.0.0.10",
      "user-agent": "rate-limit-test-agent"
    },
    socket: { remoteAddress: "127.0.0.10" }
  };

  const first = await checkRateLimit(req, "tester", {
    adapter,
    maxMessagesPerWindow: 2,
    rateLimitWindowMs: 1000
  });
  const second = await checkRateLimit(req, "tester", {
    adapter,
    maxMessagesPerWindow: 2,
    rateLimitWindowMs: 1000
  });
  const third = await checkRateLimit(req, "tester", {
    adapter,
    maxMessagesPerWindow: 2,
    rateLimitWindowMs: 1000
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSeconds > 0);
  assert.equal(typeof third.key, "string");
  assert.ok(third.key.length > 0);

  const firstOffTopic = await incrementOffTopicPlayCount(req, "tester", { adapter });
  const secondOffTopic = await incrementOffTopicPlayCount(req, "tester", { adapter });

  assert.equal(firstOffTopic.count, 1);
  assert.equal(secondOffTopic.count, 2);
  assert.equal(firstOffTopic.key, secondOffTopic.key);
});
