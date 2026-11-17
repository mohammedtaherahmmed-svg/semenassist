export type LiveDeviceCapabilities = {
  totalRamMb: number;
  availableRamMb: number;
  cpuCores: number;
  sdkInt: number;
  supportedAbis: string[];
  hasCamera: boolean;
  thermalStatus: number;
};

export type LiveAnalysisProfile = {
  id: "performance" | "balanced" | "efficiency";
  label: string;
  analysisIntervalMs: number;
  analysisWidth: number;
  analysisHeight: number;
  description: string;
};

export function selectLiveAnalysisProfile(
  device: Partial<LiveDeviceCapabilities>,
): LiveAnalysisProfile {
  const ram = Number.isFinite(device.totalRamMb) ? Number(device.totalRamMb) : 0;
  const cores = Number.isFinite(device.cpuCores) ? Number(device.cpuCores) : 0;
  const thermal = Number.isFinite(device.thermalStatus) ? Number(device.thermalStatus) : 0;

  if (thermal >= 3 || ram < 3000 || cores < 4) {
    return {
      id: "efficiency",
      label: "موفر للطاقة",
      analysisIntervalMs: 300,
      analysisWidth: 320,
      analysisHeight: 240,
      description: "تحليل أخف لتقليل الحمل والحرارة؛ قد ينخفض معدل تحديث التتبع.",
    };
  }
  if (ram >= 7000 && cores >= 8 && thermal < 2) {
    return {
      id: "performance",
      label: "أداء مرتفع",
      analysisIntervalMs: 100,
      analysisWidth: 640,
      analysisHeight: 480,
      description: "دقة تحليل أعلى وفواصل أقصر حسب قدرة الكاميرا والجهاز.",
    };
  }
  return {
    id: "balanced",
    label: "متوازن",
    analysisIntervalMs: 180,
    analysisWidth: 480,
    analysisHeight: 360,
    description: "موازنة بين تفاصيل الإطار والحمل الحراري واستهلاك الطاقة.",
  };
}

export const FALLBACK_LIVE_DEVICE: LiveDeviceCapabilities = {
  totalRamMb: 0,
  availableRamMb: 0,
  cpuCores: 0,
  sdkInt: 0,
  supportedAbis: [],
  hasCamera: false,
  thermalStatus: 0,
};
