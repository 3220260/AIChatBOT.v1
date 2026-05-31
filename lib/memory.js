export const DEFAULT_MAX_HISTORY_MESSAGES = 4;

const memoryStore = new Map();

let memoryAdapter = {
  get(userId) {
    return memoryStore.get(userId);
  },
  set(userId, history) {
    memoryStore.set(userId, history);
  }
};

export function setMemoryAdapter(adapter) {
  if (!adapter || typeof adapter.get !== "function" || typeof adapter.set !== "function") {
    throw new TypeError("Memory adapter must provide get(userId) and set(userId, history).");
  }

  memoryAdapter = adapter;
}

export function getUserHistory(userId) {
  if (!userId) return [];

  const history = memoryAdapter.get(userId);
  return Array.isArray(history) ? history : [];
}

export function setUserHistory(userId, history, maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES) {
  if (!userId) return;

  const safeHistory = Array.isArray(history) ? history : [];
  const trimmedHistory = safeHistory.length > maxHistoryMessages
    ? safeHistory.slice(-maxHistoryMessages)
    : safeHistory;

  memoryAdapter.set(userId, trimmedHistory);
}

export function rememberTurn(userId, message, reply, maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES) {
  if (!userId || !message || !reply) return;

  let history = getUserHistory(userId);
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

  setUserHistory(userId, history, maxHistoryMessages);
}

export function hasPriorMemory(userId) {
  return getUserHistory(userId).length > 0;
}
