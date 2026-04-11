import { createApp, log } from "./app";

(async () => {
  const seed =
    process.env.SEED_DATABASE === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.SEED_DATABASE !== "false");
  const { httpServer } = await createApp({ serveClient: true, seed });

  // Replit and local development expect a long-running server. Vercel imports
  // the app through api/index.ts instead, so it never reaches this listener.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
