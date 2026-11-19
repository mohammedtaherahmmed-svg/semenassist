import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import { MAX_VIDEO_BYTES, MAX_VIDEO_LABEL } from "../shared/vision-config";
import type { MorphologyRecord } from "@/lib/sample-types";

export type VisionAnalysis = {
  ok: true;
  engine: string;
  engineVersion: string;
  framesAnalyzed: number;
  frameCount: number;
  fps: number;
  fpsSource: string;
  sampleRateHz: number;
  width: number;
  height: number;
  durationSec: number;
  analyzedDurationSec: number;
  coveragePct: number;
  objectsDetected: number;
  averageObjectsPerFrame: number;
  concentration: number;
  concentrationStatus: string;
  countingAreaMm2: number;
  dilutionFactor: number;
  trackObservations: Array<{ trackId: number; sampleSlot: number; timeSec: number; xPx: number; yPx: number }>;
  trackingDiagnostics: { totalTracksCreated: number; validTracks: number; minimumTrackLength: number; maxGapSamples: number; identitySwitches: number | null; fragmentation: number | null; note: string };
  totalMotility: number;
  progressiveMotility: number;
  nonProgressiveMotility: number;
  immotile: number;
  confidence: number;
  qualityScore: number;
  qualityIssues: string[];
  thresholds: Record<string, number>;
  coefficientOfVariation: number;
  qualityMetrics: { meanBrightness: number; contrastStdDev: number; sharpnessVariance: number; decodedFrameCoveragePct: number };
  kinematics: { vcl: number; vsl: number; vap: number; lin: number; str: number; wob: number; alh: number; bcf: number | null };
  morphology: MorphologyRecord;
  processingLocation?: "on-device";
};

export type LicenseIdentity = { installationId: string; publicKeyPem: string; keyAlgorithm: "RSA-2048" };

type NativeVisionModule = {
  analyzeVideo(uri: string, micronsPerPixel: number, chamberDepth: number, countingAreaMm2: number, dilutionFactor: number): Promise<VisionAnalysis>;
  getLicenseIdentity(): Promise<LicenseIdentity>;
  signLicenseChallenge(nonceBase64Url: string): Promise<string>;
  verifyUpdateManifest(manifestJson: string, signatureBase64: string, publicKeyPem: string): Promise<boolean>;
  downloadUpdateApk(apkUrl: string, expectedSha256: string): Promise<{ downloadId: number }>;
  getUpdateDownloadStatus(downloadId: number): Promise<{ state: string; bytesDownloaded: number; totalBytes: number }>;
  installVerifiedApk(downloadId: number, expectedSha256: string): Promise<{ needsInstallPermission?: boolean; installerLaunched?: boolean; sha256Verified?: boolean }>;
};

export async function getDeviceLicenseIdentity(): Promise<LicenseIdentity> {
  return getNativeVision().getLicenseIdentity();
}

export async function signDeviceLicenseChallenge(nonceBase64Url: string): Promise<string> {
  if (!nonceBase64Url || !/^[A-Za-z0-9_-]+$/.test(nonceBase64Url)) {
    throw new Error("تحدي الترخيص غير صالح.");
  }
  return getNativeVision().signLicenseChallenge(nonceBase64Url);
}

export async function verifySignedUpdateManifest(manifestJson: string, signature: string, publicKeyPem: string): Promise<boolean> {
  if (!manifestJson || !signature || !publicKeyPem.includes("BEGIN PUBLIC KEY")) {
    throw new Error("بيانات التحقق من التحديث غير مكتملة.");
  }
  return getNativeVision().verifyUpdateManifest(manifestJson, signature, publicKeyPem);
}

export type AnalysisProgress = {
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  stage: string;
};

let nativeVision: NativeVisionModule | null = null;
function getNativeVision() {
  if (Platform.OS !== "android") {
    throw new Error("التحليل المحلي متاح حاليًا على Android فقط. لم يتم إرسال الفيديو إلى أي خادم.");
  }
  if (!nativeVision) nativeVision = requireNativeModule<NativeVisionModule>("SemenAssistVision");
  return nativeVision;
}

/**
 * Runs the first local computer-vision screening implementation.
 * Video bytes and frames remain on the Android device; no analysis API is called.
 * This is a classical-CV prototype, not a trained AI/diagnostic model.
 */
export async function analyzeVideoUri(
  uri: string,
  calibration: { micronsPerPixel: number; chamberDepth: number; countingAreaMm2?: number; dilutionFactor?: number },
  _extension = ".mp4",
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<VisionAnalysis> {
  if (!uri || (!uri.startsWith("file:") && !uri.startsWith("content:"))) {
    throw new Error("مسار الفيديو غير صالح. اختر ملفًا محفوظًا على الهاتف.");
  }
  if (!Number.isFinite(calibration.micronsPerPixel) || calibration.micronsPerPixel <= 0 ||
      !Number.isFinite(calibration.chamberDepth) || calibration.chamberDepth <= 0 ||
      (calibration.countingAreaMm2 != null && (!Number.isFinite(calibration.countingAreaMm2) || calibration.countingAreaMm2 < 0)) ||
      (calibration.dilutionFactor != null && (!Number.isFinite(calibration.dilutionFactor) || calibration.dilutionFactor < 0))) {
    throw new Error("بيانات المعايرة غير صالحة.");
  }
  onProgress?.({ status: "processing", progress: 8, stage: "بدء التحليل محليًا على الهاتف" });
  try {
    const result = await getNativeVision().analyzeVideo(uri, calibration.micronsPerPixel, calibration.chamberDepth, calibration.countingAreaMm2 ?? 0, calibration.dilutionFactor ?? 0);
    if (!result?.ok || result.processingLocation !== "on-device") {
      throw new Error("لم يؤكد محرك الهاتف إتمام التحليل محليًا.");
    }
    onProgress?.({ status: "completed", progress: 100, stage: "اكتمل التحليل المحلي" });
    return result;
  } catch (error) {
    onProgress?.({ status: "failed", progress: 0, stage: "تعذر التحليل المحلي" });
    if (error instanceof Error) throw error;
    throw new Error("حدث خطأ أثناء التحليل المحلي للفيديو.");
  }
}

export function validateLocalVideoSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new Error("حجم ملف الفيديو غير صالح.");
  if (sizeBytes > MAX_VIDEO_BYTES) throw new Error(`حجم الفيديو أكبر من الحد المسموح ${MAX_VIDEO_LABEL}.`);
  return true;
}

export async function startNativeUpdateDownload(apkUrl: string, sha256: string) {
  return getNativeVision().downloadUpdateApk(apkUrl, sha256);
}

export async function getNativeUpdateDownloadStatus(downloadId: number) {
  return getNativeVision().getUpdateDownloadStatus(downloadId);
}

export async function installNativeVerifiedApk(downloadId: number, sha256: string) {
  return getNativeVision().installVerifiedApk(downloadId, sha256);
}
