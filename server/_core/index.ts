import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { clearLegacySessionCookie } from "./cookies";
import { checkDatabaseConnection } from "../db";
import { cancelVideoAnalysisJob, createVideoAnalysisJob, getVideoAnalysisJob, hasAnalysisCapacity } from "../vision/jobs";
import { MAX_VIDEO_BYTES, MAX_VIDEO_LABEL } from "../../shared/vision-config";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

// Video analysis routes are outside tRPC, so they must check the session themselves.
async function requireApiUser(req: express.Request, res: express.Response): Promise<string | null> {
  const ctx = await createContext({ req, res } as CreateExpressContextOptions);
  if (!ctx.user) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً لتحليل الفيديو." });
    return null;
  }
  return ctx.user.openId;
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(createCorsMiddleware());
  app.use(clearLegacySessionCookie());

  // Android content:// providers may send application/octet-stream or omit the video MIME.
  // This endpoint is isolated and validates the raw byte payload itself, so accept any type here.
  app.post(
    "/api/analyze-video",
    async (req, res, next) => {
      const ownerOpenId = await requireApiUser(req, res);
      if (!ownerOpenId) return;
      if (!hasAnalysisCapacity()) {
        res.setHeader("Retry-After", "30");
        res.status(429).json({ error: "وصل الخادم إلى الحد المؤقت لعمليات تحليل الفيديو. حاول مرة أخرى بعد قليل." });
        return;
      }
      (req as express.Request & { apiUserOpenId?: string }).apiUserOpenId = ownerOpenId;
      next();
    },
    express.raw({ type: "*/*", limit: MAX_VIDEO_BYTES }),
    async (req, res) => {
      const ownerOpenId = (req as express.Request & { apiUserOpenId?: string }).apiUserOpenId;
      if (!ownerOpenId) return;
    const micronsPerPixel = Number(req.header("x-microns-per-pixel"));
    const chamberDepth = Number(req.header("x-chamber-depth"));
    const contentLength = Number(req.header("content-length") || 0);
    if (contentLength > MAX_VIDEO_BYTES) {
      res.status(413).json({ error: `حجم الفيديو أكبر من ${MAX_VIDEO_LABEL}. اختر فيديو أقصر أو مضغوطًا.` });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "لم يصل ملف الفيديو إلى الخادم. أعد اختيار الفيديو وتأكد من صلاحية الملفات." });
      return;
    }
    if (!Number.isFinite(micronsPerPixel) || micronsPerPixel <= 0 || !Number.isFinite(chamberDepth) || chamberDepth <= 0) {
      res.status(400).json({ error: "بيانات المعايرة غير صالحة" });
      return;
    }
    // Re-check after the body has been read to close the race between concurrent uploads.
    if (!hasAnalysisCapacity()) {
      res.setHeader("Retry-After", "30");
      res.status(429).json({ error: "وصل الخادم إلى الحد المؤقت لعمليات تحليل الفيديو. حاول مرة أخرى بعد قليل." });
      return;
    }
    const job = createVideoAnalysisJob(req.body, { micronsPerPixel, chamberDepth }, req.header("x-video-extension") || ".mp4", ownerOpenId);
    res.status(202).json({ jobId: job.id, status: job.status, progress: job.progress, stage: job.stage });
    },
  );

  app.get("/api/analyze-video/:jobId", async (req, res) => {
    const ownerOpenId = await requireApiUser(req, res);
    if (!ownerOpenId) return;
    const job = getVideoAnalysisJob(req.params.jobId);
    if (!job || job.ownerOpenId !== ownerOpenId) {
      res.status(404).json({ error: "وظيفة التحليل غير موجودة أو انتهت صلاحيتها" });
      return;
    }
    const { ownerOpenId: _ownerOpenId, ...publicJob } = job;
    res.json(publicJob);
  });

  app.post("/api/analyze-video/:jobId/cancel", async (req, res) => {
    const ownerOpenId = await requireApiUser(req, res);
    if (!ownerOpenId) return;
    const job = getVideoAnalysisJob(req.params.jobId);
    if (!job || job.ownerOpenId !== ownerOpenId) {
      res.status(404).json({ error: "وظيفة التحليل غير موجودة أو انتهت صلاحيتها" });
      return;
    }
    res.json({ cancelled: cancelVideoAnalysisJob(req.params.jobId) });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "تعذر استقبال الفيديو";
    if (/entity too large|request entity too large|limit/i.test(message)) {
      res.status(413).json({ error: `حجم الفيديو أكبر من ${MAX_VIDEO_LABEL}. اختر فيديو أقصر أو مضغوطًا.` });
      return;
    }
    res.status(400).json({ error: `تعذر استقبال الفيديو: ${message}` });
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Render readiness probe: report ready only when the external MySQL service responds.
  app.get("/api/health/ready", async (_req, res) => {
    const databaseReady = await checkDatabaseConnection();
    if (!databaseReady) {
      res.status(503).json({ ok: false, database: "unavailable" });
      return;
    }
    res.json({ ok: true, database: "connected" });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log("[api] server listening");
  });
}

startServer().catch(() => {
  console.error("[api] server failed to start");
});
