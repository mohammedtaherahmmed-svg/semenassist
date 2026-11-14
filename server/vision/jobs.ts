import { createHash } from "crypto";
import { analyzeVideoBuffer, type VisionAnalysis } from "./index";
import { JOB_TTL_MS, MAX_CACHE_ENTRIES, VISION_ENGINE_VERSION } from "../../shared/vision-config";

type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

type Job = {
  id: string;
  ownerOpenId: string;
  status: JobStatus;
  progress: number;
  stage: string;
  createdAt: number;
  updatedAt: number;
  result?: VisionAnalysis;
  error?: string;
  cancelled?: boolean;
};

const jobs = new Map<string, Job>();
const cache = new Map<string, VisionAnalysis>();
const MAX_JOBS = 100;
const MAX_CONCURRENT_ANALYSES = 2;
const MAX_PENDING_ANALYSES = 20;
const abortControllers = new Map<string, AbortController>();
const waitingJobs: Array<{ jobId: string; resolve: (acquired: boolean) => void }> = [];
let activeJobs = 0;

export function hasAnalysisCapacity() {
  const pending = [...jobs.values()].filter((job) => job.status === "queued" || job.status === "processing").length;
  return pending < MAX_CONCURRENT_ANALYSES + MAX_PENDING_ANALYSES;
}

function acquireSlot(jobId: string): Promise<boolean> {
  if (activeJobs < MAX_CONCURRENT_ANALYSES) {
    activeJobs += 1;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => waitingJobs.push({ jobId, resolve }));
}

function releaseSlot() {
  activeJobs = Math.max(0, activeJobs - 1);
  while (waitingJobs.length) {
    const next = waitingJobs.shift()!;
    const job = jobs.get(next.jobId);
    if (!job || job.cancelled || job.status !== "queued") {
      next.resolve(false);
      continue;
    }
    activeJobs += 1;
    next.resolve(true);
    return;
  }
}

export function createVideoAnalysisJob(
  buffer: Buffer,
  calibration: { micronsPerPixel: number; chamberDepth: number },
  extension: string,
  ownerOpenId: string,
) {
  const id = `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = { id, ownerOpenId, status: "queued", progress: 5, stage: "تم استلام الفيديو", createdAt: Date.now(), updatedAt: Date.now() };
  jobs.set(id, job);
  trimJobs();

  const cacheKey = createHash("sha256")
    .update(buffer)
    .update(JSON.stringify(calibration))
    .update(VISION_ENGINE_VERSION)
    .digest("hex");
  const cached = cache.get(cacheKey);
  if (cached) {
    job.status = "completed";
    job.progress = 100;
    job.stage = "تم استرجاع نتيجة محفوظة";
    job.result = cached;
    job.updatedAt = Date.now();
    return job;
  }

  void runJob(job, buffer, calibration, extension, cacheKey);
  return job;
}

export function getVideoAnalysisJob(id: string) {
  return jobs.get(id) ?? null;
}

export function cancelVideoAnalysisJob(id: string) {
  const job = jobs.get(id);
  if (!job || job.status === "completed" || job.status === "failed") return false;
  job.cancelled = true;
  job.status = "cancelled";
  const waitingIndex = waitingJobs.findIndex((entry) => entry.jobId === id);
  if (waitingIndex >= 0) waitingJobs.splice(waitingIndex, 1)[0].resolve(false);
  abortControllers.get(id)?.abort();
  job.stage = "تم إلغاء التحليل";
  job.updatedAt = Date.now();
  return true;
}

async function runJob(
  job: Job,
  buffer: Buffer,
  calibration: { micronsPerPixel: number; chamberDepth: number },
  extension: string,
  cacheKey: string,
) {
  const acquired = await acquireSlot(job.id);
  if (!acquired || job.cancelled) return;
  const controller = new AbortController();
  abortControllers.set(job.id, controller);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5 * 60 * 1000);

  try {
    if (job.cancelled) return;
    job.status = "processing";
    job.progress = 15;
    job.stage = "جاري تجهيز الفيديو";
    job.updatedAt = Date.now();
    await new Promise((resolve) => setImmediate(resolve));
    if (job.cancelled) return;
    job.progress = 35;
    job.stage = "جاري فحص الإطارات والمسارات";
    job.updatedAt = Date.now();
    const result = await analyzeVideoBuffer(buffer, calibration, extension, controller.signal);
    if (job.cancelled) return;
    if (timedOut) throw new Error("انتهت مهلة تحليل الفيديو؛ تم إيقاف عملية التحليل. جرّب فيديو أقصر أو بدقة أقل.");
    job.result = result;
    cache.set(cacheKey, result);
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
    job.status = "completed";
    job.progress = 100;
    job.stage = "اكتمل التحليل";
    job.updatedAt = Date.now();
  } catch (error) {
    if (job.cancelled) return;
    job.status = "failed";
    job.progress = 100;
    job.stage = "فشل التحليل";
    job.error = timedOut
      ? "انتهت مهلة تحليل الفيديو وتم إيقاف العملية."
      : error instanceof Error ? error.message : "تعذر تحليل الفيديو";
    job.updatedAt = Date.now();
  } finally {
    clearTimeout(timeout);
    abortControllers.delete(job.id);
    releaseSlot();
  }
}

function trimJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const job of jobs.values()) if (job.updatedAt < cutoff) jobs.delete(job.id);
  if (jobs.size <= MAX_JOBS) return;
  const oldest = [...jobs.values()].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, jobs.size - MAX_JOBS);
  for (const job of oldest) jobs.delete(job.id);
}

export type VideoAnalysisJob = Job;
