import { Platform, View, type ViewProps } from "react-native";
import { requireNativeViewManager } from "expo-modules-core";

export type LiveTrack = {
  id: number;
  x: number;
  y: number;
  speedPxPerSec: number;
  observations: number;
  missedFrames: number;
};

export type LiveAnalysisFrame = {
  timestampNs: number;
  imageWidth: number;
  imageHeight: number;
  analysisFps: number;
  processingMs: number;
  candidateCount: number;
  activeTrackCount: number;
  detectionMethod: string;
  tracks: LiveTrack[];
};

type NativeEvent<T> = { nativeEvent: T };

export type LiveCameraProps = ViewProps & {
  cameraFacing: "back" | "front";
  analysisIntervalMs: number;
  analysisWidth: number;
  analysisHeight: number;
  onAnalysis?: (event: NativeEvent<LiveAnalysisFrame>) => void;
  onCameraState?: (event: NativeEvent<{ status: string; message?: string }>) => void;
};

let NativeLiveCamera: React.ComponentType<LiveCameraProps> | null = null;
if (Platform.OS === "android") {
  try {
    NativeLiveCamera = requireNativeViewManager<LiveCameraProps>("SemenAssistLiveCamera");
  } catch {
    NativeLiveCamera = null;
  }
}

export function LiveCameraView(props: LiveCameraProps) {
  if (!NativeLiveCamera) {
    return (
      <View
        {...props}
        style={[{ backgroundColor: "#071521", alignItems: "center", justifyContent: "center" }, props.style]}
      />
    );
  }
  return <NativeLiveCamera {...props} />;
}
