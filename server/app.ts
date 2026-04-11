import express, { type Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

interface CreateAppOptions {
  serveClient?: boolean;
  seed?: boolean;
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export async function createApp(options: CreateAppOptions = {}) {
  const { serveClient = true, seed = false } = options;
  const app = express();
  const httpServer = createServer(app);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(httpServer, app);

  if (seed) {
    await seedDatabase();
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status =
      typeof err === "object" && err && "status" in err && typeof err.status === "number"
        ? err.status
        : typeof err === "object" && err && "statusCode" in err && typeof err.statusCode === "number"
          ? err.statusCode
          : 500;
    const message =
      typeof err === "object" && err && "message" in err && typeof err.message === "string"
        ? err.message
        : "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (serveClient) {
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
  }

  return { app, httpServer };
}

export type CreatedApp = Awaited<ReturnType<typeof createApp>>;
