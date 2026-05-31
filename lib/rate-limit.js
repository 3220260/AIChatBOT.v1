const DEFAULT_MAX_MESSAGES_PER_WINDOW = 8;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

const rateLimitStore = new Map();
const offTopicPlayStore = new Map();

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

export function checkRateLimitBucket(key, now, options = {}) {
  const store = options.store || rateLimitStore;
  const maxMessagesPerWindow = options.maxMessagesPerWindow ?? DEFAULT_MAX_MESSAGES_PER_WINDOW;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;

  const current = store.get(key) || {
    count: 0,
    resetAt: now + rateLimitWindowMs
  };

  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + rateLimitWindowMs;
  }

  current.count += 1;
  store.set(key, current);

  if (current.count > maxMessagesPerWindow) {
    return Math.ceil((current.resetAt - now) / 1000);
  }

  return 0;
}

export function checkRateLimit(req, userId, options = {}) {
  const ip = normalizeRateLimitPart(getClientIp(req));
  const safeUserId = normalizeRateLimitPart(userId);
  const userAgent = normalizeRateLimitPart(req.headers["user-agent"] || "unknown").slice(0, 80);
  const now = Date.now();
  const key = `${ip}:${safeUserId}:${userAgent}`;
  const retryAfterSeconds = checkRateLimitBucket(key, now, options);

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

export function incrementOffTopicPlayCount(req, userId, options = {}) {
  const store = options.store || offTopicPlayStore;
  const key = getOffTopicPlayCountKey(req, userId);
  const count = (store.get(key) || 0) + 1;
  store.set(key, count);

  return { key, count };
}
