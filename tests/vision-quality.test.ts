import { describe, expect, it } from "vitest";
import { calculateMicronsPerPixel, frameQualityIssues, validateCalibration } from "../shared/vision-quality";

describe("calibration quality helpers", () => {
  it("calculates microns per pixel from a known reference", () => {
    expect(calculateMicronsPerPixel(10, 200)).toBe(0.05);
  });

  it("rejects invalid reference measurements", () => {
    expect(() => calculateMicronsPerPixel(0, 200)).toThrow();
    expect(() => calculateMicronsPerPixel(10, 0)).toThrow();
    expect(() => calculateMicronsPerPixel(Number.NaN, 10)).toThrow();
  });

  it("requires positive calibration values and a setup label", () => {
    expect(validateCalibration({ micronsPerPixel: 0.42, chamberDepth: 20, setupLabel: "40x" })).toBeNull();
    expect(validateCalibration({ micronsPerPixel: 0, chamberDepth: 20, setupLabel: "40x" })).not.toBeNull();
    expect(validateCalibration({ micronsPerPixel: 0.42, chamberDepth: -1, setupLabel: "40x" })).not.toBeNull();
    expect(validateCalibration({ micronsPerPixel: 0.42, chamberDepth: 20, setupLabel: " " })).not.toBeNull();
  });

  it("does not flag a well-lit, contrasted, sharp frame", () => {
    expect(frameQualityIssues({ meanBrightness: 110, contrastStdDev: 42, sharpnessVariance: 80 })).toEqual([]);
  });

  it("flags dark, low-contrast and blurred frames", () => {
    expect(frameQualityIssues({ meanBrightness: 20, contrastStdDev: 8, sharpnessVariance: 2 })).toHaveLength(3);
  });

  it("flags overexposure", () => {
    expect(frameQualityIssues({ meanBrightness: 240, contrastStdDev: 30, sharpnessVariance: 40 })).toContain("الإطارات شديدة السطوع؛ قد تكون تفاصيل الخلايا مفقودة.");
  });
});
