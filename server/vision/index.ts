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
  thresholds: Record<string, number>;
};

export async function analyzeVideoBuffer(
  buffer: Buffer,
  calibration: { micronsPerPixel: number; chamberDepth: number },
  extension = ".mp4",
): Promise<VisionAnalysis> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "semenassist-"));
  const videoPath = path.join(tempDir, `sample${extension.startsWith(".") ? extension : `.${extension}`}`);
  await fs.writeFile(videoPath, buffer);
  try {
    const scriptPath = path.join(process.cwd(), "server/vision/analyze_video.py");
    const output = await runProcess("/usr/bin/python3", ["-S", scriptPath, videoPath, String(calibration.micronsPerPixel), String(calibration.chamberDepth)]);
    const parsed = JSON.parse(output) as VisionAnalysis | { ok: false; error: string };
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function runProcess(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONPATH: "/usr/lib/python3/dist-packages" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(stdout.trim());
      reject(new Error(stderr.trim() || `OpenCV process exited with ${code}`));
    });
  });
}
