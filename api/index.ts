import type { Express } from "express";
import { createApp } from "../server/app.ts";

let appPromise: Promise<Express> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp({ serveClient: false, seed: false }).then(({ app }) => app);
  }

  return appPromise;
}

export default async function handler(req: unknown, res: unknown) {
  const app = await getApp();
  return app(req as Parameters<Express>[0], res as Parameters<Express>[1]);
}
