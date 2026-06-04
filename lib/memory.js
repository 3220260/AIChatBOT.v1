import {
  isRedisEnabled,
  runRedisCommand,
  warnRedisUnavailable
} from "./upstash-redis.js";

// Increase the default history to allow Sofia to remember a longer conversation.
export const DEFAULT_MAX_HISTORY_MESSAGES = 6;

const MEMORY_KEY_PREFIX = "sofia:memory:";
const MEMORY_TTL_SECONDS = readIntEnv("MEMORY_TTL_SECONDS", 0, 0, 60 * 60 * 24 * 365);

const memoryStore = new Map();

function readIntEnv(name, fallback, min, max) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

function sanitizeMemoryKeyPart(value) {
  return String(value || "unknown")
    .replace(/[^\w:.-]/g, "_")
    .slice(0, 120);
}

function toMemoryKey(userId) {
  return `${MEMORY_KEY_PREFIX}${sanitizeMemoryKeyPart(userId)}`;
}

const mapMemoryAdapter = {
  async get(userId) {
    return memoryStore.get(userId);
  },
  async set(userId, history) {
    memoryStore.set(userId, history);
  }
};

const redisMemoryAdapter = {
  async get(userId) {
    const key = toMemoryKey(userId);

    try {
      const raw = await runRedisCommand(["GET", key]);
      if (raw === null || raw === undefined || raw === "") {
        return mapMemoryAdapter.get(userId);
      }

      const parsed = JSON.parse(String(raw));
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed;
    } catch (error) {
      warnRedisUnavailable(error);
      return mapMemoryAdapter.get(userId);
    }
  },

  async set(userId, history) {
    const key = toMemoryKey(userId);
    const payload = JSON.stringify(history);

    try {
      if (MEMORY_TTL_SECONDS > 0) {
        await runRedisCommand(["SET", key, payload, "EX", String(MEMORY_TTL_SECONDS)]);
      } else {
        await runRedisCommand(["SET", key, payload]);
      }
    } catch (error) {
      warnRedisUnavailable(error);
    }

    await mapMemoryAdapter.set(userId, history);
  }
};

let memoryAdapter = null;

function getDefaultMemoryAdapter() {
  if (isRedisEnabled()) {
    return redisMemoryAdapter;
  }

  return mapMemoryAdapter;
}

function getMemoryAdapter() {
  return memoryAdapter || getDefaultMemoryAdapter();
}

export function setMemoryAdapter(adapter) {
  if (!adapter || typeof adapter.get !== "function" || typeof adapter.set !== "function") {
    throw new TypeError("Memory adapter must provide get(userId) and set(userId, history).");
  }

  memoryAdapter = adapter;
}

export function resetMemoryAdapter() {
  memoryAdapter = null;
}

export async function getUserHistory(userId) {
  if (!userId) return [];

  try {
    const history = await getMemoryAdapter().get(userId);
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

export async function setUserHistory(userId, history, maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES) {
  if (!userId) return;

  const safeHistory = Array.isArray(history) ? history : [];
  const trimmedHistory = safeHistory.length > maxHistoryMessages
    ? safeHistory.slice(-maxHistoryMessages)
    : safeHistory;

  await getMemoryAdapter().set(userId, trimmedHistory);
}

export async function rememberTurn(userId, message, reply, maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES) {
  if (!userId || !message || !reply) return;

  let history = await getUserHistory(userId);
  history = history.slice(-maxHistoryMessages);

  history.push({
    role: "user",
    parts: [{ text: String(message) }]
  });

  history.push({
    role: "model",
    parts: [{ text: String(reply) }]
  });

  if (history.length > maxHistoryMessages) {
    history = history.slice(-maxHistoryMessages);
  }

  await setUserHistory(userId, history, maxHistoryMessages);
}

export async function hasPriorMemory(userId) {
  return (await getUserHistory(userId)).length > 0;
}
