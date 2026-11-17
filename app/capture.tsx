import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { AppHeader, COLORS, MedicalBanner, PrimaryButton, SecondaryButton, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { addMorphologyImages, type MorphologyImageRecord } from "@/lib/morphology-store";
import { loadCalibration, type CalibrationRecord } from "@/lib/sample-store";

export default function CaptureScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [sampleId, setSampleId] = useState(`SEM-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
  const [reviewerId, setReviewerId] = useState("TECH-01");
  const [preparation, setPreparation] = useState<"stained" | "unstained" | "unknown">("stained");
  const [recording, setRecording] = useState(false);
  const [cameraMode, setCameraMode] = useState<"picture" | "video">("picture");
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [cameraReady, setCameraReady] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationRecord | null>(null);

  useEffect(() => { void loadCalibration().then(setCalibration); }, []);

  async function saveImage(uri: string, fileName: string, sizeBytes: number, width: number | null, height: number | null) {
    if (!sampleId.trim() || !reviewerId.trim()) throw new Error("أدخل معرّف العينة ومعرّف المراجع أولًا.");
    const record: MorphologyImageRecord = {
      id: `MOR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      uri, fileName, fileSizeBytes: sizeBytes, importedAt: new Date().toISOString(), preparation,
      objectiveMagnification: null, pixelSizeUm: calibration?.micronsPerPixel ?? null, imageWidthPx: width, imageHeightPx: height,
      microscopeId: calibration?.setupLabel,
      pseudonymousSampleId: sampleId.trim(), reviewerId: reviewerId.trim(),
      adjudicationStatus: "single-review", objects: [],
    };
    await addMorphologyImages([record]);
  }

  async function takePhoto() {
    if (!cameraReady || !cameraRef.current || busy) return;
    setBusy(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.92, skipProcessing: false });
      if (!picture?.uri) throw new Error("لم تُنتج الكاميرا ملف صورة.");
      const pictureInfo = await FileSystem.getInfoAsync(picture.uri);
      await saveImage(picture.uri, `capture-${Date.now()}.jpg`, pictureInfo.exists && "size" in pictureInfo ? pictureInfo.size ?? 0 : 0, picture.width ?? null, picture.height ?? null);
      Alert.alert("تم حفظ الصورة", "أُضيفت الصورة إلى مجموعة Morphology المحلية وربطت بمعرّف العينة. يلزم إدخال حجم الملف/التحقق منه قبل اعتماد بيانات المجموعة.");
    } catch (error) {
      Alert.alert("تعذر التقاط الصورة", error instanceof Error ? error.message : "حاول مرة أخرى.");
    } finally { setBusy(false); }
  }

  async function importImages() {
    if (!sampleId.trim() || !reviewerId.trim()) return Alert.alert("بيانات ناقصة", "أدخل معرّف العينة ومعرّف المراجع.");
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp", "image/*"], multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const accepted = result.assets.filter((asset) => Boolean(asset.uri) && (!asset.mimeType || asset.mimeType.startsWith("image/")) && (asset.size ?? 0) <= 20 * 1024 * 1024);
      const importedAt = new Date().toISOString();
      const records: MorphologyImageRecord[] = accepted.map((asset, index) => ({
        id: `MOR-${Date.now()}-${index}`, uri: asset.uri, fileName: asset.name || `microscopy-${index + 1}`,
        fileSizeBytes: asset.size ?? 0, importedAt, preparation, objectiveMagnification: null, pixelSizeUm: null,
        imageWidthPx: null, imageHeightPx: null, pixelSizeUm: calibration?.micronsPerPixel ?? null, microscopeId: calibration?.setupLabel,
        pseudonymousSampleId: sampleId.trim(), reviewerId: reviewerId.trim(),
        adjudicationStatus: "single-review", objects: [],
      }));
      await addMorphologyImages(records);
      Alert.alert("اكتمل الاستيراد", `تمت إضافة ${records.length} صورة. الملفات غير المطابقة أو الأكبر من 20 MB تم استبعادها.`);
    } catch (error) {
      Alert.alert("تعذر استيراد الصور", error instanceof Error ? error.message : "تحقق من الملف وحاول مرة أخرى.");
    } finally { setBusy(false); }
  }

  async function importVideo() {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["video/mp4", "video/quicktime", "video/*"], multiple: false, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.mimeType && !asset.mimeType.startsWith("video/")) throw new Error("الملف المختار ليس فيديو.");
      if (!asset.uri) throw new Error("تعذر الحصول على مسار الفيديو.");
      if ((asset.size ?? 0) > 50 * 1024 * 1024) throw new Error("حجم الفيديو يتجاوز 50 MB.");
      router.push({ pathname: "/sample/new", params: { videoUri: asset.uri, videoName: asset.name || "microscope-video.mp4", videoSizeMb: String(Number(((asset.size ?? 0) / 1_000_000).toFixed(2))), sampleId: sampleId.trim() } });
    } catch (error) {
      Alert.alert("تعذر اختيار الفيديو", error instanceof Error ? error.message : "حاول مرة أخرى.");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!recording || cameraMode !== "video" || !cameraReady) return;
    let mounted = true;
    const start = async () => {
      try {
        const result = await cameraRef.current?.recordAsync({ maxDuration: 30 });
        if (!mounted || !result?.uri) return;
        const videoInfo = await FileSystem.getInfoAsync(result.uri);
        const videoSizeMb = videoInfo.exists && "size" in videoInfo ? Number(((videoInfo.size ?? 0) / 1_000_000).toFixed(2)) : 0;
        router.push({ pathname: "/sample/new", params: { videoUri: result.uri, videoName: `camera-${Date.now()}.mp4`, videoSizeMb: String(videoSizeMb), sampleId: sampleId.trim() } });
      } catch (error) {
        if (mounted) Alert.alert("تعذر تسجيل الفيديو", error instanceof Error ? error.message : "تحقق من الكاميرا وحاول مرة أخرى.");
      } finally {
        if (mounted) { setRecording(false); setCameraMode("picture"); }
      }
    };
    void start();
    return () => { mounted = false; };
  }, [recording, cameraMode, cameraReady, router, sampleId]);

  function startRecording() {
    if (!cameraReady || !cameraRef.current || recording || busy) return;
    if (!sampleId.trim()) return Alert.alert("معرّف العينة مطلوب", "أدخل معرّف العينة قبل التصوير.");
    setCameraMode("video");
    setRecording(true);
  }

  function stopRecording() {
    if (recording) cameraRef.current?.stopRecording();
  }

  if (!permission) return <ScreenContainer><View style={styles.center}><Text style={styles.body}>جارٍ التحقق من صلاحية الكاميرا…</Text></View></ScreenContainer>;
  if (!permission.granted) return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><AppHeader eyebrow="مصدر التصوير" title="كاميرا المجهر" /><MedicalBanner compact /><View style={styles.card}><MaterialIcons name="no-photography" size={42} color={COLORS.tealDark} /><Text style={styles.title}>نحتاج إذن الكاميرا</Text><Text style={styles.body}>لن يتم تشغيل الكاميرا إلا بعد موافقتك. يمكن استيراد ملفات الصور والفيديو دون فتح الكاميرا.</Text><PrimaryButton label="السماح باستخدام الكاميرا" icon="photo-camera" onPress={() => { void requestPermission(); }} /></View><SecondaryButton label="استيراد صور" icon="image" onPress={importImages} /><SecondaryButton label="استيراد فيديو للتحليل" icon="movie" onPress={importVideo} /></ScrollView></ScreenContainer>;

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <AppHeader eyebrow="CASA · التقاط الوسائط" title="التصوير والاستيراد" action={<Pressable onPress={() => router.back()}><MaterialIcons name="close" size={23} color={COLORS.navy} /></Pressable>} />
    <MedicalBanner compact />
    <View style={styles.card}>
      <Field label="معرّف العينة" value={sampleId} onChangeText={setSampleId} />
      <Field label="معرّف المراجع" value={reviewerId} onChangeText={setReviewerId} />
      <View style={styles.row}><Text style={styles.label}>تحضير العينة</Text>{(["stained", "unstained", "unknown"] as const).map((value) => <Pressable key={value} onPress={() => setPreparation(value)} style={[styles.chip, preparation === value && styles.activeChip]}><Text style={styles.chipText}>{value === "stained" ? "مصبوغة" : value === "unstained" ? "غير مصبوغة" : "غير محدد"}</Text></Pressable>)}</View>
    </View>
    <View style={styles.calibrationNotice}><MaterialIcons name={calibration ? "verified" : "warning-amber"} size={17} color={calibration ? COLORS.success : COLORS.warning} /><Text style={styles.body}>{calibration ? `سيتم ربط الصور بمعايرة ${calibration.micronsPerPixel} µm/px · ${calibration.setupLabel}` : "لا توجد معايرة محفوظة؛ ستُحفظ الصور دون مقياس بكسلي، ولا يمكن استخدامها لقياسات طولية موثوقة."}</Text></View>
    <SectionTitle title="كاميرا الهاتف" detail="استخدم الكاميرا الخلفية وثبّت الهاتف والعدسة والإضاءة قبل الالتقاط" />
    <View style={styles.cameraFrame}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode={cameraMode} mute onCameraReady={() => setCameraReady(true)} />
      <View pointerEvents="none" style={styles.crosshair}><View style={styles.crosshairBox} /></View>
      <View style={styles.cameraBadge}><StatusPill label={recording ? "يسجل الآن" : cameraReady ? "الكاميرا جاهزة" : "جارٍ تهيئة الكاميرا"} tone={recording ? "warning" : "success"} /></View>
    </View>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" disabled={!cameraReady || recording || busy} onPress={() => setFacing((value) => value === "back" ? "front" : "back")} style={styles.control}><MaterialIcons name="flip-camera-android" size={20} color={COLORS.navy} /><Text style={styles.controlText}>تبديل الكاميرا</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!cameraReady || recording || busy} onPress={takePhoto} style={[styles.captureButton, (!cameraReady || recording || busy) && styles.disabled]}><MaterialIcons name="camera-alt" size={23} color="#FFFFFF" /><Text style={styles.captureText}>التقاط صورة</Text></Pressable>
    </View>
    {recording ? <PrimaryButton label="إيقاف التسجيل واستخدام الفيديو" icon="stop-circle" onPress={stopRecording} /> : <SecondaryButton label="بدء تسجيل فيديو (حتى 30 ثانية)" icon="videocam" onPress={startRecording} />}
    <SectionTitle title="استيراد من الجهاز" detail="اختيار الصور أو الفيديو من المعرض/منتقي الملفات" />
    <SecondaryButton label="استيراد صور للمورفولوجي" icon="photo-library" onPress={importImages} />
    <SecondaryButton label="استيراد فيديو للتحليل" icon="video-library" onPress={importVideo} />
    <View style={styles.note}><MaterialIcons name="info-outline" size={18} color={COLORS.warning} /><Text style={styles.body}>الصور تُحفظ محليًا ضمن مجموعة Morphology للمراجعة البشرية. الفيديو ينتقل إلى شاشة إنشاء العينة ويُحلل فقط عبر محرك Android المحلي عند توفر المعايرة. لا يوجد تصنيف Morphology آلي معتمد في هذه النسخة.</Text></View>
  </ScrollView></ScreenContainer>;
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={label} placeholderTextColor="#91A0AD" style={styles.input} textAlign="right" /></View>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 38, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: COLORS.paper, borderColor: COLORS.line, borderWidth: 1, borderRadius: 18, padding: 15, gap: 11, alignItems: "stretch" },
  title: { color: COLORS.navy, fontSize: 17, fontWeight: "900", textAlign: "center" },
  body: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: "right" },
  field: { gap: 5 },
  label: { color: COLORS.ink, fontSize: 12, fontWeight: "800", textAlign: "right" },
  input: { borderColor: COLORS.line, borderWidth: 1, borderRadius: 10, backgroundColor: "#F8FAFC", padding: 11, color: COLORS.navy },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.line },
  activeChip: { backgroundColor: "#EAF7F5", borderColor: COLORS.tealDark },
  chipText: { color: COLORS.navy, fontSize: 11, fontWeight: "700" },
  calibrationNotice: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F0F7FA", padding: 11, borderRadius: 12 },
  cameraFrame: { height: 330, borderRadius: 18, overflow: "hidden", backgroundColor: "#071521", position: "relative" },
  crosshair: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  crosshairBox: { width: "76%", height: "62%", borderColor: "rgba(255,255,255,0.65)", borderWidth: 1, borderRadius: 8 },
  cameraBadge: { position: "absolute", top: 10, right: 10 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
  control: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, backgroundColor: COLORS.paper, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line },
  controlText: { color: COLORS.navy, fontSize: 11, fontWeight: "800" },
  captureButton: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, backgroundColor: COLORS.tealDark },
  captureText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  disabled: { opacity: 0.45 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FFF5E6", padding: 12, borderRadius: 12 },
});
