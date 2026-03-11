import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { generalApiLimiter, authLimiter, safeErrorMessage, sanitiseForLog } from "./security";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ─── Security headers (server-only, never sent as secrets to client) ──────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ─── Request body size cap (prevents memory-exhaustion attacks) ───────────────
app.use(
  express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// auth routes get a stricter per-IP cap
app.use("/api/auth", authLimiter);
// all other API routes get the general cap
app.use("/api", generalApiLimiter);

// ─── Request / Response logger (sanitised — never logs secrets or bodies) ─────
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

const SENSITIVE_PATHS = ["/api/auth/callback", "/api/auth/token"];

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;

    const duration = Date.now() - start;
    const status = res.statusCode;

    // Never log response bodies for auth routes (they may contain tokens/cookies).
    // For other routes log only 4xx/5xx to avoid flooding logs with success payloads.
    const isSensitivePath = SENSITIVE_PATHS.some((p) => path.startsWith(p));
    const shouldLogBody = !isSensitivePath && (status >= 400);

    let logLine = `${req.method} ${path} ${status} in ${duration}ms`;

    if (shouldLogBody) {
      // Log sanitised metadata only (no raw values)
      const meta = sanitiseForLog({ status, path, method: req.method });
      logLine += ` :: ${JSON.stringify(meta)}`;
    }

    log(logLine);
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // ─── Global error handler ─────────────────────────────────────────────────
  // Returns a safe message to the client; logs full error server-side only.
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    // Log the real error server-side (not to client)
    if (status >= 500) {
      // Strip Authorization/Cookie headers before logging
      console.error("[error]", status, safeErrorMessage(err, status), err.stack || "");
    }

    if (res.headersSent) return next(err);

    // Only expose a safe message to the caller
    res.status(status).json({ message: safeErrorMessage(err, status) });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    { port, host: "0.0.0.0", reusePort: true },
    () => { log(`serving on port ${port}`); }
  );
})();
