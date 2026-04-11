import type { Express } from "express";
import { createApp } from "./app";

let appPromise: Promise<Express> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveClient: false, seed: false })
      .then(({ app }) => app)
      .catch((error: unknown) => {
        console.error("Failed to initialize Vercel API handler:", error);
        throw error;
      });
  }

  return appPromise;
}

export default async function handler(req: unknown, res: unknown) {
  try {
    const app = await getApp();
    return app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
  } catch (error) {
    const response = res as Parameters<Express>[1];

    console.error("Vercel API handler failed:", error);
    return response.status(500).json({ message: "Failed to initialize API handler" });
  }
}
