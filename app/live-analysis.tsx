import React from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import { AppHeader, COLORS, MedicalBanner, PrimaryButton, SecondaryButton, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { LiveCameraView, type LiveAnalysisFrame } from "@/components/live-camera-view";
import { getLiveDeviceCapabilities } from "@/lib/live-vision";
import { selectLiveAnalysisProfile, FALLBACK_LIVE_DEVICE, type LiveAnalysisProfile } from "@/shared/live-analysis-profile";
import { useRouter } from "expo-router";

export default function LiveAnalysisScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [profile, setProfile] = useState<LiveAnalysisProfile>(() => selectLiveAnalysisProfile(FALLBACK_LIVE_DEVICE));
  const [frame, setFrame] = useState<LiveAnalysisFrame | null>(null);
  const [cameraState, setCameraState] = useState("starting");
  const [cameraMessage, setCameraMessage] = useState("");
  const [facing, setFacing] = useState<"back" | "front">("back");

  useEffect(() => {
    let active = true;
    void getLiveDeviceCapabilities().then((capabilities) => {
      if (active) setProfile(selectLiveAnalysisProfile(capabilities));
    });
    return () => { active = false; };
  }, []);

  function handleAnalysis(event: { nativeEvent: LiveAnalysisFrame }) {
    setFrame(event.nativeEvent);
  }

  function handleCameraState(event: { nativeEvent: { status: string; message?: string } }) {
    setCameraState(event.nativeEvent.status);
    setCameraMessage(event.nativeEvent.message ?? "");
  }

  if (!permission?.granted) {
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={styles.content}>
          <AppHeader eyebrow="CASA · LIVE ENGINE" title="تتبع الحيوانات المنوية الحي" action={<Pressable onPress={() => router.back()}><MaterialIcons name="close" size={23} color={COLORS.navy} /></Pressable>} />
          <MedicalBanner compact />
          <View style={styles.card}>
            <MaterialIcons name="photo-camera" size={42} color={COLORS.tealDark} />
            <Text style={styles.title}>إذن الكاميرا مطلوب</Text>
            <Text style={styles.body}>يستخدم التحليل الحي كاميرا الهاتف الخلفية مباشرة. لا يتم رفع إطارات الكاميرا إلى الخادم.</Text>
            <PrimaryButton label="السماح باستخدام الكاميرا" icon="camera-alt" onPress={() => { void requestPermission(); }} />
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <AppHeader eyebrow="CASA · LIVE ENGINE" title="تتبع الحيوانات المنوية الحي" action={<Pressable onPress={() => router.back()}><MaterialIcons name="close" size={23} color={COLORS.navy} /></Pressable>} />
        <MedicalBanner compact />
        <View style={styles.statusRow}>
          <StatusPill label={cameraState === "ready" ? "الكاميرا تعمل" : cameraState === "error" ? "تعذر تشغيل الكاميرا" : "جارٍ تشغيل الكاميرا"} tone={cameraState === "ready" ? "success" : cameraState === "error" ? "warning" : "neutral"} />
          <StatusPill label={profile.label} tone="teal" />
        </View>
        <View style={styles.cameraFrame}>
          <LiveCameraView
            style={StyleSheet.absoluteFill}
            cameraFacing={facing}
            analysisIntervalMs={profile.analysisIntervalMs}
            analysisWidth={profile.analysisWidth}
            analysisHeight={profile.analysisHeight}
            onAnalysis={handleAnalysis}
            onCameraState={handleCameraState}
          />
          {frame && frame.imageWidth > 0 && frame.imageHeight > 0 ? (
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox={`0 0 ${frame.imageWidth} ${frame.imageHeight}`} preserveAspectRatio="xMidYMid slice">
              {frame.tracks.map((track) => (
                <React.Fragment key={track.id}>
                  <Circle cx={track.x} cy={track.y} r={7} stroke="#34D399" strokeWidth={2} fill="rgba(52,211,153,0.15)" />
                  <SvgText x={track.x + 9} y={track.y - 8} fill="#FFFFFF" fontSize={12} fontWeight="bold">{track.id}</SvgText>
                </React.Fragment>
              ))}
            </Svg>
          ) : null}
        </View>
        {cameraMessage ? <Text style={styles.warning}>{cameraMessage}</Text> : null}
        <View style={styles.metricsGrid}>
          <Metric label="المسارات النشطة" value={frame?.activeTrackCount ?? 0} />
          <Metric label="المرشحات في الإطار" value={frame?.candidateCount ?? 0} />
          <Metric label="معدل التحليل" value={`${(frame?.analysisFps ?? 0).toFixed(1)} FPS`} />
          <Metric label="زمن المعالجة" value={`${(frame?.processingMs ?? 0).toFixed(1)} ms`} />
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>ضبط الأداء التلقائي</Text>
          <Text style={styles.body}>{profile.description}</Text>
          <Text style={styles.body}>المعالجة: {profile.analysisWidth}×{profile.analysisHeight} · كل {profile.analysisIntervalMs} ms كحد أدنى بين الإطارات المحللة.</Text>
          <Text style={styles.caption}>معدل FPS المعروض هو القياس الفعلي للإطارات التي وصلت إلى المحلل، وليس معدل FPS مضمونًا.</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>حدود النسخة الحالية</Text>
            <StatusPill label="بحثي" tone="warning" />
          </View>
          <Text style={styles.body}>الكشف الحالي يعتمد على التباين والمكونات المتصلة، وليس نموذج YOLO مدربًا. قد يكتشف شوائب أو أجسامًا غير منوية، وقد تتغير معرفات المسارات عند التقاطع أو الحجب. لا تستخدم الأعداد أو السرعات لاتخاذ قرار سريري.</Text>
          <Text style={styles.body}>المورفولوجي الآلي غير مفعل لعدم وجود أوزان نموذج مدرب ومجموعة بيانات خبراء معتمدة. استخدم مساحة المورفولوجي للمراجعة اليدوية والصور عالية الدقة.</Text>
        </View>
        <View style={styles.controls}>
          <SecondaryButton label="تبديل الكاميرا" icon="flip-camera-android" onPress={() => setFacing((value) => value === "back" ? "front" : "back")} />
          <SecondaryButton label="فتح مراجعة Morphology" icon="image-search" onPress={() => router.push("/(tabs)/morphology" as never)} />
        </View>
        <SecondaryButton label="العودة إلى التصوير والاستيراد" icon="photo-camera" onPress={() => router.back()} />
      </ScrollView>
    </ScreenContainer>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 38, gap: 12 },
  card: { backgroundColor: COLORS.paper, borderColor: COLORS.line, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  title: { color: COLORS.navy, fontSize: 15, fontWeight: "900", textAlign: "right" },
  body: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: "right" },
  caption: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "right" },
  warning: { color: COLORS.warning, fontSize: 12, textAlign: "right" },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cameraFrame: { width: "100%", aspectRatio: 4 / 3, overflow: "hidden", borderRadius: 16, backgroundColor: "#071521" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { flexGrow: 1, flexBasis: "45%", backgroundColor: COLORS.paper, borderColor: COLORS.line, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  metricValue: { color: COLORS.navy, fontSize: 20, fontWeight: "900", textAlign: "center" },
  metricLabel: { color: COLORS.muted, fontSize: 11, textAlign: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  controls: { gap: 8 },
});
