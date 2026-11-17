import { describe, expect, it } from "vitest";

import { calculateConcentrationMillionPerMl, summarizeMorphologyCount } from "../lib/casa-workspace";

describe("CASA workspace calculations", () => {
  it("calculates concentration in million per mL from count, area, depth and dilution", () => {
    expect(calculateConcentrationMillionPerMl({
      spermCount: 120,
      countedAreaMm2: 1,
      chamberDepthUm: 20,
      dilutionFactor: 2,
    })).toBe(12);
  });

  it("rejects missing or non-physical chamber geometry", () => {
    expect(() => calculateConcentrationMillionPerMl({
      spermCount: 120,
      countedAreaMm2: 0,
      chamberDepthUm: 20,
      dilutionFactor: 2,
    })).toThrow();
  });

  it("summarizes manual morphology counts without treating unassessable cells as normal or abnormal", () => {
    const result = summarizeMorphologyCount({
      sampleId: "S-1",
      imagesReviewed: 2,
      totalExamined: 100,
      normalForms: 8,
      abnormalForms: 72,
      notAssessable: 20,
      updatedAt: "2026-11-17T00:00:00.000Z",
    });
    expect(result.normalPercent).toBe(10);
    expect(result.abnormalPercent).toBe(90);
    expect(result.completionPercent).toBe(80);
  });
});
