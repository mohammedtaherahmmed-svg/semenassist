import { describe, expect, it } from "vitest";
import { selectLiveAnalysisProfile } from "../shared/live-analysis-profile";

describe("selectLiveAnalysisProfile", () => {
  it("selects performance mode for a high-memory cool device", () => {
    expect(selectLiveAnalysisProfile({ totalRamMb: 8192, cpuCores: 8, thermalStatus: 0 }).id).toBe("performance");
  });

  it("selects balanced mode for a typical modern device", () => {
    expect(selectLiveAnalysisProfile({ totalRamMb: 6144, cpuCores: 8, thermalStatus: 1 }).id).toBe("balanced");
  });

  it("reduces workload under thermal pressure", () => {
    const profile = selectLiveAnalysisProfile({ totalRamMb: 12288, cpuCores: 12, thermalStatus: 3 });
    expect(profile.id).toBe("efficiency");
    expect(profile.analysisIntervalMs).toBeGreaterThan(100);
  });

  it("uses conservative defaults when capability data is unavailable", () => {
    expect(selectLiveAnalysisProfile({}).id).toBe("efficiency");
  });
});
