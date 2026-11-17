import { requireNativeModule } from "expo-modules-core";
import { FALLBACK_LIVE_DEVICE, type LiveDeviceCapabilities } from "@/shared/live-analysis-profile";

type NativeLiveModule = {
  getDeviceCapabilities: () => Promise<LiveDeviceCapabilities>;
};

let nativeModule: NativeLiveModule | null = null;
try {
  nativeModule = requireNativeModule<NativeLiveModule>("SemenAssistLiveCamera");
} catch {
  nativeModule = null;
}

export async function getLiveDeviceCapabilities(): Promise<LiveDeviceCapabilities> {
  if (!nativeModule) return FALLBACK_LIVE_DEVICE;
  try {
    return await nativeModule.getDeviceCapabilities();
  } catch {
    return FALLBACK_LIVE_DEVICE;
  }
}
