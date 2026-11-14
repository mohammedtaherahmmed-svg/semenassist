import { apiCall } from "@/lib/_core/api";
import { MAX_VIDEO_BYTES, MAX_VIDEO_LABEL, nextPollDelay } from "../shared/vision-config";

export type VisionAnalysis = {
  ok: true;
  engine: string;
  engineVersion: string;
  framesAnalyzed: number;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  analyzedDurationSec: number;
  coveragePct: number;
  objectsDetected: number;
  averageObjectsPerFrame: number;
  concentration: number;
  totalMotility: number;
  progressiveMotility: number;
  nonProgressiveMotility: number;
  immotile: number;
  confidence: number;
  qualityScore: number;
  qualityIssues: string[];
  thresholds: Record<string, number>;
  coefficientOfVariation: number;
  kinematics: { vcl: number; vsl: number; vap: number; lin: number; str: number; wob: number; alh: number; bcf: number | null };
  morphology: import("@/lib/sample-types").MorphologyRecord;
};

type AnalysisJobResponse = {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  stage: string;
  result?: VisionAnalysis;
  error?: string;
};

export type AnalysisProgress = Pick<AnalysisJobResponse, "status" | "progress" | "stage">;

export async function analyzeVideoUri(
  uri: string,
  calibration: { micronsPerPixel: number; chamberDepth: number },
  extension = ".mp4",
  onProgress?: (progress: AnalysisProgress) => void,
) {
  if (!uri || (!uri.startsWith("file:") && !uri.startsWith("content:") && !uri.startsWith("blob:") && !uri.startsWith("http"))) {
    throw new Error("مسار الفيديو غير صالح. أعد اختيار الملف من الجهاز.");
  }
  const body = await readVideoBlob(uri);
  if (body.byteLength > MAX_VIDEO_BYTES) throw new Error(`حجم الفيديو أكبر من الحد المسموح ${MAX_VIDEO_LABEL}.`);
  if (body.byteLength < 1024) throw new Error("ملف الفيديو فارغ أو لم تتم قراءته من الجهاز. أعد اختيار الملف.");
  const safeExtension = normalizeExtension(extension);
  const contentType = mimeForExtension(safeExtension);
  const created = await uploadWithRetry(body, contentType, safeExtension, calibration);
  let state = created;
  onProgress?.(state);
  let attempt = 0;
  while (state.status !== "completed" && state.status !== "failed" && state.status !== "cancelled") {
    await new Promise((resolve) => setTimeout(resolve, nextPollDelay(attempt)));
    attempt += 1;
    state = await apiCall<AnalysisJobResponse>(`/api/analyze-video/${created.jobId}`);
    onProgress?.(state);
  }
  if (state.status === "cancelled") throw new Error("تم إلغاء تحليل الفيديو.");
  if (state.status === "failed" || !state.result) throw new Error(state.error || "تعذر تحليل الفيديو.");
  return state.result;
}

async function readVideoBlob(uri: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      const response = await fetch(uri, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`تعذر قراءة الفيديو من الجهاز (${response.status}).`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 0) return bytes;
      throw new Error("تمت قراءة فيديو بحجم صفر.");
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  if (lastError instanceof Error && lastError.name === "AbortError") throw new Error("انتهت مهلة قراءة الفيديو من الجهاز. اختر فيديو أقصر أو انسخه إلى ذاكرة الهاتف.");
  throw new Error(lastError instanceof Error ? lastError.message : "تعذر قراءة ملف الفيديو من الجهاز. أعد اختياره.");
}

function normalizeExtension(value: string) {
  const extension = value.toLowerCase().startsWith(".") ? value.toLowerCase() : `.${value.toLowerCase()}`;
  return [".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"].includes(extension) ? extension : ".mp4";
}

function mimeForExtension(extension: string) {
  return ({ ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska", ".webm": "video/webm" } as Record<string, string>)[extension] || "application/octet-stream";
}

async function uploadWithRetry(body: ArrayBuffer, contentType: string, extension: string, calibration: { micronsPerPixel: number; chamberDepth: number }) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await apiCall<AnalysisJobResponse>("/api/analyze-video", {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "x-microns-per-pixel": String(calibration.micronsPerPixel),
          "x-chamber-depth": String(calibration.chamberDepth),
          "x-video-extension": extension,
        },
        body,
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (attempt >= 2 || /حجم|معايرة|لم يصل|ملف الفيديو|400|413/.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("تعذر رفع الفيديو بعد عدة محاولات.");
}
