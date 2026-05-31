const REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const HAS_REDIS_CONFIG = Boolean(REST_URL && REST_TOKEN);

let warnedUnavailable = false;

function getRedisEndpoint() {
  return REST_URL.endsWith("/") ? REST_URL.slice(0, -1) : REST_URL;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${REST_TOKEN}`,
    "Content-Type": "application/json"
  };
}

export function isRedisEnabled() {
  return HAS_REDIS_CONFIG;
}

export async function runRedisCommand(command) {
  if (!HAS_REDIS_CONFIG) {
    throw new Error("UPSTASH_REDIS_NOT_CONFIGURED");
  }

  const response = await fetch(getRedisEndpoint(), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`UPSTASH_REDIS_HTTP_${response.status}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(`UPSTASH_REDIS_ERROR_${payload.error}`);
  }

  return payload?.result;
}

export function warnRedisUnavailable(error) {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn("UPSTASH_REDIS_UNAVAILABLE_FALLBACK", {
    message: error?.message || String(error || "unknown")
  });
}
