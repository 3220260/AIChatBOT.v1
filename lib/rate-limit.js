import {
  isRedisEnabled,
  runRedisCommand,
  warnRedisUnavailable
} from "./upstash-redis.js";

const DEFAULT_MAX_MESSAGES_PER_WINDOW = 8;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const OFFTOPIC_TTL_SECONDS = readIntEnv("OFFTOPIC_TTL_SECONDS", 0, 0, 60 * 60 * 24 * 365);

const RATE_LIMIT_BUCKET_PREFIX = "sofia:ratelimit:";
const OFFTOPIC_COUNTER_PREFIX = "sofia:offtopic:";

const rateLimitStore = new Map();
const offTopicPlayStore = new Map();

let rateLimitAdapter = null;

function readIntEnv(name, fallback, min, max) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function toRateLimitBucketKey(key) {
  return `${RATE_LIMIT_BUCKET_PREFIX}${key}`;
}

function toOffTopicCounterKey(key) {
  return `${OFFTOPIC_COUNTER_PREFIX}${key}`;
}

function createMapAdapter(bucketStore = rateLimitStore, offTopicStore = offTopicPlayStore) {
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

const mapAdapter = createMapAdapter();

const redisAdapter = {
  async getBucket(key) {
    const redisKey = toRateLimitBucketKey(key);

    try {
      const raw = await runRedisCommand(["GET", redisKey]);
      if (raw === null || raw === undefined || raw === "") {
        return mapAdapter.getBucket(key);
      }

      const parsed = JSON.parse(String(raw));
      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      return {
        count: Number(parsed.count) || 0,
        resetAt: Number(parsed.resetAt) || 0
      };
    } catch (error) {
      warnRedisUnavailable(error);
      return mapAdapter.getBucket(key);
    }
  },

  async setBucket(key, bucket, ttlSeconds = 0) {
    const redisKey = toRateLimitBucketKey(key);
    const payload = JSON.stringify(bucket);

    try {
      if (ttlSeconds > 0) {
        await runRedisCommand(["SET", redisKey, payload, "EX", String(ttlSeconds)]);
      } else {
        await runRedisCommand(["SET", redisKey, payload]);
      }
    } catch (error) {
      warnRedisUnavailable(error);
    }

    await mapAdapter.setBucket(key, bucket);
  },

  async incrementOffTopic(key) {
    const redisKey = toOffTopicCounterKey(key);

    try {
      const count = Number(await runRedisCommand(["INCR", redisKey])) || 0;

      if (count === 1 && OFFTOPIC_TTL_SECONDS > 0) {
        await runRedisCommand(["EXPIRE", redisKey, String(OFFTOPIC_TTL_SECONDS)]);
      }

      offTopicPlayStore.set(key, count);
      return count;
    } catch (error) {
      warnRedisUnavailable(error);
      return mapAdapter.incrementOffTopic(key);
    }
  }
};

function getDefaultRateLimitAdapter() {
  if (isRedisEnabled()) {
    return redisAdapter;
  }

  return mapAdapter;
}

function getRateLimitAdapter() {
  return rateLimitAdapter || getDefaultRateLimitAdapter();
}

function getAdapterFromOptions(options = {}) {
  if (options.adapter) {
    return options.adapter;
  }

  if (options.store && typeof options.store.get === "function" && typeof options.store.set === "function") {
    return createMapAdapter(options.store, options.store);
  }

  return getRateLimitAdapter();
}

export function setRateLimitAdapter(adapter) {
  if (
    !adapter
    || typeof adapter.getBucket !== "function"
    || typeof adapter.setBucket !== "function"
    || typeof adapter.incrementOffTopic !== "function"
  ) {
    throw new TypeError("Rate limit adapter must provide getBucket, setBucket and incrementOffTopic.");
  }

  rateLimitAdapter = adapter;
}

export function resetRateLimitAdapter() {
  rateLimitAdapter = null;
}

export function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

export function normalizeRateLimitPart(value) {
  return String(value || "unknown")
    .replace(/[^\w:.-]/g, "_")
    .slice(0, 120);
}

export async function checkRateLimitBucket(key, now, options = {}) {
  const adapter = getAdapterFromOptions(options);
  const maxMessagesPerWindow = options.maxMessagesPerWindow ?? DEFAULT_MAX_MESSAGES_PER_WINDOW;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;

  const current = await adapter.getBucket(key) || {
    count: 0,
    resetAt: now + rateLimitWindowMs
  };

  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + rateLimitWindowMs;
  }

  current.count += 1;
  const ttlSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000) + 2);
  await adapter.setBucket(key, current, ttlSeconds);

  if (current.count > maxMessagesPerWindow) {
    return Math.ceil((current.resetAt - now) / 1000);
  }

  return 0;
}

export async function checkRateLimit(req, userId, options = {}) {
  const ip = normalizeRateLimitPart(getClientIp(req));
  const safeUserId = normalizeRateLimitPart(userId);
  const userAgent = normalizeRateLimitPart(req.headers["user-agent"] || "unknown").slice(0, 80);
  const now = Date.now();
  const key = `${ip}:${safeUserId}:${userAgent}`;
  const retryAfterSeconds = await checkRateLimitBucket(key, now, options);

  return {
    allowed: retryAfterSeconds === 0,
    retryAfterSeconds,
    key
  };
}

export function getOffTopicPlayCountKey(req, userId) {
  const ip = normalizeRateLimitPart(getClientIp(req));
  const safeUserId = normalizeRateLimitPart(userId).slice(0, 60);
  return `${ip}:${safeUserId}`;
}

export async function incrementOffTopicPlayCount(req, userId, options = {}) {
  const adapter = getAdapterFromOptions(options);
  const key = getOffTopicPlayCountKey(req, userId);
  const count = await adapter.incrementOffTopic(key);

  return { key, count };
}
