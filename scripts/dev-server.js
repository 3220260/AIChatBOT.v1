import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/chat.js";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ROOT_DIR = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/chat")) {
      req.body = await readJsonBody(req);
      await handler(req, createVercelResponse(res));
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    console.error("Dev server error:", error);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`VerBot dev server: http://localhost:${PORT}`);
});

async function readJsonBody(req) {
  if (!["POST", "PUT", "PATCH"].includes(req.method || "")) return {};

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch (_) {
    return {};
  }
}

function createVercelResponse(res) {
  let statusCode = 200;

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    },
    end(payload = "") {
      res.writeHead(statusCode);
      res.end(payload);
    }
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store"
    });
    res.end(file);
  } catch (_) {
    const index = await readFile(join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, {
      "content-type": MIME_TYPES[".html"],
      "cache-control": "no-store"
    });
    res.end(index);
  }
}
