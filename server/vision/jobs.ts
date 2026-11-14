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
  try {
    job.status = "processing";
    job.progress = 15;
    job.stage = "جاري تجهيز الفيديو";
    job.updatedAt = Date.now();
    await new Promise((resolve) => setImmediate(resolve));
    if (job.cancelled) return;
    job.progress = 35;
    job.stage = "جاري فحص الإطارات والمسارات";
    job.updatedAt = Date.now();
    const result = await Promise.race([
      analyzeVideoBuffer(buffer, calibration, extension),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("انتهت مهلة تحليل الفيديو؛ جرّب فيديو أقصر أو بدقة أقل.")), 5 * 60 * 1000)),
    ]);
    if (job.cancelled) return;
    job.result = result;
    cache.set(cacheKey, result);
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
    job.status = "completed";
    job.progress = 100;
    job.stage = "اكتمل التحليل";
    job.updatedAt = Date.now();
  } catch (error) {
    job.status = "failed";
    job.progress = 100;
    job.stage = "فشل التحليل";
    job.error = error instanceof Error ? error.message : "تعذر تحليل الفيديو";
    job.updatedAt = Date.now();
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
