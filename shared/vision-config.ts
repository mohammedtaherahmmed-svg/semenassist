// Single source of truth for video-analysis limits and engine identity.
// Used by the client (lib/vision.ts), the HTTP layer (server/_core/index.ts)
// and the job cache (server/vision/jobs.ts).

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_LABEL = "50 ميجابايت";
export const VISION_ENGINE_VERSION = "android-local-cv-screening-0.3.0";
export const POLL_MIN_MS = 700;
export const POLL_MAX_MS = 2000;
export const JOB_TTL_MS = 30 * 60 * 1000;
export const MAX_CACHE_ENTRIES = 200;

// Polling starts fast and backs off, so long analyses don't hammer the API.
export function nextPollDelay(attempt: number): number {
  return Math.min(POLL_MAX_MS, POLL_MIN_MS + Math.max(0, attempt) * 150);
}
