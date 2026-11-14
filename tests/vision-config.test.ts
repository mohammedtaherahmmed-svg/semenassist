import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, POLL_MAX_MS, POLL_MIN_MS, nextPollDelay } from "../shared/vision-config";

describe("vision config", () => {
  it("keeps the upload limit at 50 MB", () => {
    expect(MAX_VIDEO_BYTES).toBe(50 * 1024 * 1024);
  });

  it("starts polling fast and never exceeds the max delay", () => {
    expect(nextPollDelay(0)).toBe(POLL_MIN_MS);
    expect(nextPollDelay(1)).toBeGreaterThan(nextPollDelay(0));
    expect(nextPollDelay(1000)).toBe(POLL_MAX_MS);
  });
});
