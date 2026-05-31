import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 15_000;

function buildEndpoint(baseUrl) {
  const normalizedBase = String(baseUrl || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const baseWithSlash = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;
  return new URL("api/chat", baseWithSlash).toString();
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

async function loadScenarios() {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const scenariosPath = path.resolve(thisDir, "../data/chat-scenarios.json");
  const raw = await readFile(scenariosPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("data/chat-scenarios.json must be a JSON array.");
  }

  return parsed;
}

async function postScenario(endpoint, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const rawBody = await response.text();
    let jsonBody = null;

    try {
      jsonBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      jsonBody = null;
    }

    return { response, rawBody, jsonBody };
  } finally {
    clearTimeout(timeout);
  }
}

function buildRequestPayload(scenario, index) {
  const safeId = String(scenario.id || `scenario-${index + 1}`)
    .replace(/[^\w.-]/g, "_")
    .slice(0, 80);

  return {
    message: String(scenario.message || ""),
    userId: `live-${safeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...(scenario.context && typeof scenario.context === "object" ? { context: scenario.context } : {})
  };
}

function validateScenarioShape(scenario, index) {
  const errors = [];
  const label = `scenario #${index + 1}`;

  if (!scenario || typeof scenario !== "object") {
    errors.push(`${label}: scenario must be an object.`);
    return errors;
  }

  if (!String(scenario.id || "").trim()) {
    errors.push(`${label}: missing "id".`);
  }

  if (!String(scenario.message || "").trim()) {
    errors.push(`${label}: missing "message".`);
  }

  if (scenario.context !== undefined && (typeof scenario.context !== "object" || scenario.context === null)) {
    errors.push(`${label}: "context" must be an object when provided.`);
  }

  if (scenario.mustInclude !== undefined && !Array.isArray(scenario.mustInclude)) {
    errors.push(`${label}: "mustInclude" must be an array when provided.`);
  }

  if (scenario.mustNotInclude !== undefined && !Array.isArray(scenario.mustNotInclude)) {
    errors.push(`${label}: "mustNotInclude" must be an array when provided.`);
  }

  return errors;
}

function formatReplyPreview(reply) {
  const compact = String(reply || "").replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
}

async function run() {
  const baseUrl = process.env.BOT_BASE_URL || DEFAULT_BASE_URL;
  const endpoint = buildEndpoint(baseUrl);
  const scenarios = await loadScenarios();

  console.log(`Running ${scenarios.length} live chat scenarios`);
  console.log(`Endpoint: ${endpoint}`);

  const shapeErrors = scenarios.flatMap((scenario, index) => validateScenarioShape(scenario, index));
  if (shapeErrors.length) {
    console.error("\nScenario file validation failed:");
    for (const error of shapeErrors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  let passCount = 0;
  const failed = [];

  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    const scenarioId = String(scenario.id).trim();
    const mustInclude = normalizeList(scenario.mustInclude);
    const mustNotInclude = normalizeList(scenario.mustNotInclude);
    const payload = buildRequestPayload(scenario, index);
    const startedAt = Date.now();
    const errors = [];

    try {
      const { response, rawBody, jsonBody } = await postScenario(endpoint, payload);
      const durationMs = Date.now() - startedAt;
      const reply = typeof jsonBody?.reply === "string" ? jsonBody.reply.trim() : "";

      if (response.status !== 200) {
        errors.push(`Expected HTTP 200 but got ${response.status}.`);
      }

      if (!reply) {
        errors.push("Reply is empty.");
      }

      for (const value of mustNotInclude) {
        if (reply.includes(value)) {
          errors.push(`Reply must NOT include: "${value}"`);
        }
      }

      for (const value of mustInclude) {
        if (!reply.includes(value)) {
          errors.push(`Reply must include: "${value}"`);
        }
      }

      if (errors.length) {
        console.log(`FAIL ${scenarioId} (${durationMs}ms)`);
        for (const error of errors) {
          console.log(`  - ${error}`);
        }
        if (rawBody && !reply) {
          const preview = formatReplyPreview(rawBody);
          if (preview) console.log(`  - Raw response: ${preview}`);
        }
        failed.push(scenarioId);
      } else {
        console.log(`PASS ${scenarioId} (${durationMs}ms)`);
        console.log(`  reply: ${formatReplyPreview(reply)}`);
        passCount += 1;
      }
    } catch (error) {
      console.log(`FAIL ${scenarioId}`);
      console.log(`  - Request error: ${error?.message || String(error)}`);
      failed.push(scenarioId);
    }
  }

  console.log(`\nSummary: ${passCount}/${scenarios.length} passed, ${failed.length} failed.`);

  if (failed.length) {
    console.log(`Failed scenarios: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("Scenario runner failed:", error?.message || error);
  process.exitCode = 1;
});
