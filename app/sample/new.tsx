import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, PrimaryButton, SecondaryButton, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { loadCalibration, upsertSample, type CalibrationRecord } from "@/lib/sample-store";
import { createDemoSample, type SampleRecord } from "@/lib/sample-types";
import { analyzeVideoUri, type AnalysisProgress } from "@/lib/vision";
import { validateCalibration } from "@/shared/vision-quality";

type Stage = "idle" | "uploading" | "processing" | "saving";

export default function NewSampleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ videoUri?: string; videoName?: string; videoSizeMb?: string; sampleId?: string }>();
  const [sampleId, setSampleId] = useState(() => `SEM-2026-${String(Math.floor(Math.random() * 800) + 120)}`);
  const [sampleType, setSampleType] = useState("عينة كاملة");
  const [collectedAt, setCollectedAt] = useState(new Date().toISOString());
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString());
  const [notes, setNotes] = useState("");
  const [researchOptIn, setResearchOptIn] = useState(false);
  const [video, setVideo] = useState<{ name: string; sizeMb: number; durationSec: number; uri?: string } | null>(null);
  const [calibration, setCalibration] = useState<CalibrationRecord | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const { user } = useAuth();
  const saveRemote = trpc.samples.save.useMutation();

  useEffect(() => { loadCalibration().then(setCalibration); }, []);
  useEffect(() => {
    if (!params.videoUri) return;
    const name = params.videoName || "microscope-capture.mp4";
    const sizeMb = Number(params.videoSizeMb || 0);
    setVideo({ name, sizeMb: Number.isFinite(sizeMb) ? sizeMb : 0, durationSec: 0, uri: params.videoUri });
    if (params.sampleId) setSampleId(params.sampleId);
  }, [params.videoUri, params.videoName, params.videoSizeMb, params.sampleId]);

  async function chooseVideo() {
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["video/*", "video/mp4", "video/quicktime"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.mimeType && !asset.mimeType.startsWith("video/")) {
        setError("الملف المختار ليس فيديو. اختر ملف MP4 أو MOV أو فيديو مدعومًا.");
        return;
      }
      const sizeMb = Number(((asset.size ?? 0) / 1_000_000).toFixed(1));
      if (sizeMb > 50) {
        setError("حجم الفيديو أكبر من 50 ميجابايت. اختر فيديو أقصر أو مضغوطًا.");
        return;
      }
      if (!asset.uri) {
        setError("لم يتمكن الهاتف من توفير مسار الفيديو. انسخ الملف إلى ذاكرة الجهاز ثم أعد اختياره.");
        return;
      }
      setVideo({ name: asset.name || "sample-video.mp4", sizeMb, durationSec: 0, uri: asset.uri });
    } catch {
      setError("تعذر فتح ملفات الفيديو. تحقق من صلاحية الوصول للملفات وحاول مرة أخرى.");
    }
  }

  async function runAnalysis() {
    if (!sampleId.trim()) return setError("أدخل معرّف العينة أولًا.");
    if (!calibration) return setError("أكمل المعايرة قبل بدء التحليل.");
    const calibrationError = validateCalibration(calibration);
    if (calibrationError) return setError(calibrationError);
    if (!video?.uri) return setError("اختر ملف فيديو حقيقيًا قبل بدء التحليل. لا يمكن إنشاء تقرير من بيانات تجريبية.");
    setError("");
    setStage("uploading");
    setAnalysisProgress({ status: "queued", progress: 5, stage: "جاري تجهيز الفيديو" });
    let visionResult: Awaited<ReturnType<typeof analyzeVideoUri>> | null = null;
    if (video.uri) {
      try {
        visionResult = await analyzeVideoUri(video.uri, calibration, video.name.includes(".") ? video.name.slice(video.name.lastIndexOf(".")) : ".mp4", (progress) => {
          setAnalysisProgress(progress);
          setStage(progress.status === "queued" ? "uploading" : "processing");
        });
      } catch (analysisError) {
        setStage("idle");
        setError(analysisError instanceof Error ? analysisError.message : "تعذر تحليل الفيديو الحقيقي.");
        return;
      }
    }
    if (!visionResult) {
      setStage("idle");
      setError("لم تُنتج عملية التحليل نتيجة صالحة؛ لم يتم حفظ تقرير.");
      return;
    }
    setStage("saving");
    const sampleMetadata = createDemoSample({ id: sampleId.trim(), collectedAt, receivedAt, sampleType, notes, researchOptIn, videoName: video.name, videoSizeMb: video.sizeMb, videoDurationSec: video.durationSec });
    const sample: SampleRecord = {
      ...sampleMetadata,
      framesAnalyzed: visionResult.framesAnalyzed,
      analyzedDurationSec: visionResult.analyzedDurationSec,
      coveragePct: visionResult.coveragePct,
      videoDurationSec: visionResult.durationSec,
      concentration: visionResult.concentration,
      concentrationStatus: visionResult.concentrationStatus,
      trackObservations: visionResult.trackObservations,
      trackingDiagnostics: visionResult.trackingDiagnostics,
      progressiveMotility: visionResult.progressiveMotility,
      nonProgressiveMotility: visionResult.nonProgressiveMotility,
      immotile: visionResult.immotile,
      totalMotility: visionResult.totalMotility,
      confidence: visionResult.confidence,
      qualityScore: visionResult.qualityScore,
      qualityLabel: visionResult.qualityScore >= 75 ? "good" : visionResult.qualityScore >= 55 ? "needs_attention" : "insufficient",
      qualityIssues: visionResult.qualityIssues,
      analysisEngine: visionResult.engine,
      analysisVersion: visionResult.engineVersion,
      processingLocation: visionResult.processingLocation,
      objectsDetected: visionResult.objectsDetected,
      fps: visionResult.fps,
      sourceFrameCount: visionResult.frameCount,
      fpsSource: visionResult.fpsSource,
      sampleRateHz: visionResult.sampleRateHz,
      coefficientOfVariation: visionResult.coefficientOfVariation,
      qualityMetrics: visionResult.qualityMetrics,
      qualityGate: visionResult.qualityGate,
      tracking: visionResult.tracking,
      kinematics: visionResult.kinematics,
      morphology: visionResult.morphology,
      calibration: {
        micronsPerPixel: calibration.micronsPerPixel,
        chamberDepth: calibration.chamberDepth,
        countingAreaMm2: calibration.countingAreaMm2,
        dilutionFactor: calibration.dilutionFactor,
        calibratedAt: calibration.calibratedAt,
      },
    };
    await upsertSample(sample);
    if (user) {
      try {
        await saveRemote.mutateAsync({ sampleId: sample.id, reviewStatus: sample.reviewStatus, analysisEngine: sample.analysisEngine, analysisVersion: sample.analysisVersion, sample });
      } catch {
        setError("تم حفظ التقرير على الجهاز، لكن تعذرت المزامنة. يمكنك إعادة المحاولة من نفس التقرير لاحقًا.");
      }
    }
    router.replace({ pathname: "/sample/[id]", params: { id: sample.id } });
    setStage("idle");
  }

  const busy = stage !== "idle";
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <AppHeader eyebrow="سجل جديد" title="إنشاء عينة" action={<Pressable onPress={() => router.back()}><MaterialIcons name="close" size={24} color={COLORS.navy} /></Pressable>} />
    <MedicalBanner />
    <View style={styles.progressRow}><View style={styles.progressDotActive}><Text style={styles.progressTextActive}>1</Text></View><View style={styles.progressLine} /><View style={styles.progressDot}><Text style={styles.progressText}>2</Text></View><View style={styles.progressLine} /><View style={styles.progressDot}><Text style={styles.progressText}>3</Text></View><Text style={styles.progressLabel}>بيانات ← فيديو ← تقرير</Text></View>

    <View style={styles.formCard}><Field label="معرّف العينة" value={sampleId} onChangeText={setSampleId} placeholder="مثال: SEM-2026-104" /><View style={styles.field}><Text style={styles.label}>نوع العينة</Text><View style={styles.chips}>{["عينة كاملة", "بعد الامتناع", "أخرى"].map((item) => <Pressable key={item} onPress={() => setSampleType(item)} style={[styles.chip, sampleType === item && styles.chipActive]}><Text style={[styles.chipText, sampleType === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View></View><Field label="وقت الجمع" value={toLocalInput(collectedAt)} onChangeText={(value) => setCollectedAt(new Date(value).toISOString())} placeholder="YYYY-MM-DD HH:mm" /><Field label="وقت الاستلام" value={toLocalInput(receivedAt)} onChangeText={(value) => setReceivedAt(new Date(value).toISOString())} placeholder="YYYY-MM-DD HH:mm" /><View style={styles.field}><Text style={styles.label}>ملاحظة فنية (اختياري)</Text><TextInput value={notes} onChangeText={setNotes} placeholder="إضاءة، تحضير، ملاحظة على الشريحة…" placeholderTextColor="#A0ACB6" style={[styles.input, styles.textArea]} textAlign="right" multiline /></View></View>

    <View style={styles.videoCard}><View style={styles.videoHeader}><StatusPill label={video ? "ملف جاهز" : "لم يتم الاختيار"} tone={video ? "success" : "neutral"} icon={video ? "check-circle" : "movie"} /><Text style={styles.cardTitle}>فيديو العينة</Text></View>{video ? <View style={styles.fileRow}><View style={styles.fileIcon}><MaterialIcons name="movie" size={22} color={COLORS.tealDark} /></View><View style={styles.fileCopy}><Text style={styles.fileName}>{video.name}</Text><Text style={styles.fileMeta}>{video.sizeMb} MB · {video.durationSec > 0 ? `المدة ${video.durationSec} ثانية` : "سيتم قراءة المدة محليًا"}</Text></View><MaterialIcons name="verified" size={20} color={COLORS.success} /></View> : <View style={styles.emptyVideo}><MaterialIcons name="videocam" size={32} color={COLORS.teal} /><Text style={styles.emptyVideoTitle}>اربط فيديو قصير وواضح</Text><Text style={styles.emptyVideoText}>يفضّل 12–20 ثانية مع مجال رؤية ثابت وإضاءة غير متغيرة.</Text></View>}<SecondaryButton label={video ? "اختيار فيديو آخر" : "اختيار فيديو من الجهاز"} icon="upload-file" onPress={chooseVideo} /></View>

    <View style={styles.calibrationRow}><MaterialIcons name={calibration ? "verified" : "warning-amber"} size={20} color={calibration ? COLORS.success : COLORS.warning} /><Text style={styles.calibrationText}>{calibration ? "المعايرة موجودة — جاهز للتحليل" : "المعايرة غير موجودة — اذهب إلى تبويب المعايرة أولًا"}</Text></View>
    <Pressable onPress={() => setResearchOptIn((value) => !value)} style={styles.consentRow}><View style={[styles.checkbox, researchOptIn && styles.checkboxActive]}>{researchOptIn ? <MaterialIcons name="check" size={15} color={COLORS.paper} /> : null}</View><Text style={styles.consentText}>أوافق اختياريًا على استخدام هذه البيانات المراجعة لتحسين النموذج البحثي.</Text></Pressable>
    {error ? <View style={styles.errorRow}><MaterialIcons name="error-outline" size={18} color={COLORS.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
    <PrimaryButton label={stage === "idle" ? "بدء التحليل المحلي" : stage === "uploading" ? "جاري تجهيز الفيديو…" : stage === "processing" ? `تحليل محلي على الهاتف ${analysisProgress?.progress ?? 0}%` : "حفظ التقرير…"} icon="analytics" onPress={runAnalysis} loading={busy} disabled={!calibration || !video} />
    {analysisProgress && busy ? <View style={styles.progressStatus}><Text style={styles.progressStatusText}>{analysisProgress.stage} · {analysisProgress.progress}%</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${analysisProgress.progress}%` }]} /></View></View> : null}
    <Text style={styles.helper}>{user ? "بعد الحفظ ستتم مزامنة التقرير مع قاعدة المختبر وتسجيل العملية." : "الوضع الحالي محلي؛ سجّل الدخول لحفظ التقرير على قاعدة المختبر."} التحليل يعمل على الهاتف ولا يرفع الفيديو. هذا محرك رؤية حاسوبية تجريبي وليس نموذج AI مدربًا أو أداة تشخيص؛ راجع النتائج فنيًا.</Text>
  </ScrollView></ScreenContainer>;
}

function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#A0ACB6" style={styles.input} textAlign="right" /></View>; }
function toLocalInput(value: string) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 42 },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginBottom: 18, gap: 6 },
  progressDotActive: { width: 25, height: 25, borderRadius: 13, backgroundColor: COLORS.teal, alignItems: "center", justifyContent: "center" },
  progressDot: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#E8ECEE", alignItems: "center", justifyContent: "center" },
  progressTextActive: { color: COLORS.paper, fontSize: 11, fontWeight: "800" },
  progressText: { color: COLORS.muted, fontSize: 11, fontWeight: "800" },
  progressLine: { width: 22, height: 1, backgroundColor: COLORS.line },
  progressLabel: { color: COLORS.muted, fontSize: 11, marginRight: 5 },
  formCard: { backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, padding: 16, marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { color: COLORS.navy, fontSize: 13, fontWeight: "700", textAlign: "right", marginBottom: 7 },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: "#FCFBF9", color: COLORS.navy, paddingHorizontal: 13, fontSize: 14 },
  textArea: { minHeight: 76, paddingTop: 12, textAlignVertical: "top" },
  chips: { flexDirection: "row", gap: 7, justifyContent: "flex-end" },
  chip: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
  chipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  chipText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: COLORS.paper },
  videoCard: { backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, padding: 16, marginBottom: 14 },
  videoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  cardTitle: { color: COLORS.navy, fontSize: 16, fontWeight: "800" },
  emptyVideo: { alignItems: "center", paddingVertical: 13 },
  emptyVideoTitle: { color: COLORS.navy, fontSize: 15, fontWeight: "800", marginTop: 9 },
  emptyVideoText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4, marginBottom: 15 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16, backgroundColor: "#F5FBFA", padding: 11, borderRadius: 14 },
  fileIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#DDF6F1", alignItems: "center", justifyContent: "center" },
  fileCopy: { flex: 1, alignItems: "flex-end" },
  fileName: { color: COLORS.navy, fontWeight: "800", fontSize: 13 },
  fileMeta: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  calibrationRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, marginBottom: 14 },
  calibrationText: { color: COLORS.muted, fontSize: 12, textAlign: "right" },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 15 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.paper, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  consentText: { flex: 1, color: COLORS.muted, fontSize: 11, lineHeight: 17, textAlign: "right" },
  errorRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 6, backgroundColor: COLORS.dangerBg, padding: 11, borderRadius: 12, marginBottom: 12 },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 12, textAlign: "right" },
  helper: { color: COLORS.muted, fontSize: 11, lineHeight: 18, textAlign: "center", marginTop: 10 },
  progressStatus: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: "#EEF8F6" },
  progressStatusText: { color: COLORS.tealDark, fontSize: 12, textAlign: "right", fontWeight: "700" },
  progressTrack: { height: 7, backgroundColor: "#D7E9E6", borderRadius: 99, overflow: "hidden", marginTop: 8 },
  progressFill: { height: 7, backgroundColor: COLORS.teal, borderRadius: 99 },
});
