import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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
  confidenceInterpretation?: string;
  coefficientOfVariation?: number;
  kinematics?: { vcl: number; vsl: number; vap: number; lin: number; str: number; wob: number; alh: number; bcf: number | null };
  morphology?: {
    method: string;
    totalExamined: number;
    normalForms: number;
    roundHeads: number;
    elongatedHeads: number;
    irregularHeads: number;
    coiledTails: number;
    bentTails: number;
    doubleTails: number;
    acrosomeAbnormal: number;
    midpieceDefects: number;
    tzi: number;
    sdi: number;
    automaticConfidence: number;
    confidenceInterpretation: string;
    uniqueTrackedObjects: number;
    krugerScreening: { normalPercent: number; abnormalPercent: number; thresholdPercent: number; status: "screening-only" };
    automaticLimitations: string[];
  };
  thresholds: Record<string, number>;
};

export async function analyzeVideoBuffer(
  buffer: Buffer,
  calibration: { micronsPerPixel: number; chamberDepth: number },
  extension = ".mp4",
  signal?: AbortSignal,
): Promise<VisionAnalysis> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "semenassist-"));
  const safeExtension = /^\.(mp4|mov|avi|mkv|webm)$/i.test(extension) ? extension.toLowerCase() : ".mp4";
  const videoPath = path.join(tempDir, `sample${safeExtension}`);
  try {
    await fs.writeFile(videoPath, buffer);
    const scriptPath = path.join(process.cwd(), "server/vision/analyze_video.py");
    const output = await runProcess("/usr/bin/python3", ["-S", scriptPath, videoPath, String(calibration.micronsPerPixel), String(calibration.chamberDepth)], signal);
    const parsed = JSON.parse(output) as VisionAnalysis | { ok: false; error: string };
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function runProcess(command: string, args: string[], signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("تم إيقاف عملية التحليل"));
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONPATH: "/usr/lib/python3/dist-packages" } });
    let stdout = "";
    let stderr = "";
    const onAbort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code, childSignal) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) return reject(new Error("تم إيقاف عملية التحليل"));
      if (code === 0) return resolve(stdout.trim());
      reject(new Error(stderr.trim() || `OpenCV process exited with ${code ?? childSignal ?? "unknown"}`));
    });
  });
}
