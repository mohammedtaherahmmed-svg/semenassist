import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import Svg, { Circle, Polygon } from "react-native-svg";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, PrimaryButton, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import {
  addMorphologyImages, deleteMorphologyImage, exportMorphologyDataset, loadMorphologyImages,
  shareMorphologyImage, updateMorphologyImage, type ExpertMask, type HeadShape,
  type MaskRegion, type MorphologyImageRecord, type MorphologyObjectAnnotation,
  type MorphologyPreparation, type TailStatus,
} from "@/lib/morphology-store";

const HEAD_OPTIONS: { value: HeadShape; label: string }[] = [
  { value: "normal", label: "طبيعي" }, { value: "round", label: "مستدير" },
  { value: "tapered", label: "مدبب" }, { value: "amorphous", label: "غير منتظم" },
  { value: "small", label: "صغير" }, { value: "large", label: "كبير" },
  { value: "vacuolated", label: "به فجوات" }, { value: "not-assessable", label: "غير قابل للتقييم" },
];
const TAIL_OPTIONS: { value: TailStatus; label: string }[] = [
  { value: "normal", label: "طبيعي" }, { value: "bent", label: "منحني" },
  { value: "coiled", label: "ملتـف" }, { value: "multiple", label: "متعدد" },
  { value: "absent", label: "غير ظاهر" }, { value: "not-assessable", label: "غير قابل للتقييم" },
];
const MASK_REGIONS: { value: MaskRegion; label: string }[] = [
  { value: "head", label: "قناع الرأس" }, { value: "midpiece", label: "قناع القطعة الوسطى" }, { value: "tail", label: "قناع الذيل" },
];
const VIEW_W = 320;
const VIEW_H = 220;

export default function MorphologyScreen() {
  const [records, setRecords] = useState<MorphologyImageRecord[]>([]);
  const [sampleId, setSampleId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [secondReviewerId, setSecondReviewerId] = useState("");
  const [magnification, setMagnification] = useState("100");
  const [pixelSize, setPixelSize] = useState("");
  const [microscopeId, setMicroscopeId] = useState("");
  const [preparation, setPreparation] = useState<MorphologyPreparation>("stained");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [headShape, setHeadShape] = useState<HeadShape>("not-assessable");
  const [tailStatus, setTailStatus] = useState<TailStatus>("not-assessable");
  const [overlap, setOverlap] = useState(false);
  const [debris, setDebris] = useState(false);
  const [reviewMode, setReviewMode] = useState<"primary" | "second">("primary");
  const [maskRegion, setMaskRegion] = useState<MaskRegion>("head");
  const [maskPoints, setMaskPoints] = useState<{x:number;y:number}[]>([]);
  const [maskDrafts, setMaskDrafts] = useState<ExpertMask[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(VIEW_W);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setRecords(await loadMorphologyImages()), []);
  useEffect(() => { refresh(); }, [refresh]);

  async function importImages() {
    if (!sampleId.trim() || !reviewerId.trim()) {
      Alert.alert("بيانات ناقصة", "أدخل معرّف عينة مستعارًا ومعرّف المراجع الأول.");
      return;
    }
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["image/jpeg", "image/png", "image/webp", "image/*"], multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const accepted = result.assets.filter((asset) => (!asset.mimeType || asset.mimeType.startsWith("image/")) && (asset.size ?? 0) <= 20 * 1024 * 1024 && Boolean(asset.uri));
      const rejected = result.assets.length - accepted.length;
      const importedAt = new Date().toISOString();
      const newRecords: MorphologyImageRecord[] = accepted.map((asset, index) => ({
        id: `MOR-${Date.now()}-${index}`, uri: asset.uri, fileName: asset.name || `microscopy-image-${index + 1}`,
        fileSizeBytes: asset.size ?? 0, importedAt, preparation,
        objectiveMagnification: Number(magnification) > 0 ? Number(magnification) : null,
        pixelSizeUm: Number(pixelSize) > 0 ? Number(pixelSize) : null,
        imageWidthPx: null, imageHeightPx: null, microscopeId: microscopeId.trim() || undefined,
        pseudonymousSampleId: sampleId.trim(), reviewerId: reviewerId.trim(),
        secondReviewerId: secondReviewerId.trim() || undefined, adjudicationStatus: "single-review", objects: [],
      }));
      const next = await addMorphologyImages(newRecords);
      setRecords(next);
      if (newRecords[0]) setSelectedId(newRecords[0].id);
      if (rejected) Alert.alert("استيراد جزئي", `تمت إضافة ${accepted.length} صورة. استُبعد ${rejected} ملفًا.`);
    } catch (error) {
      Alert.alert("تعذر استيراد الصور", error instanceof Error ? error.message : "تحقق من صلاحية الوصول والتخزين.");
    } finally { setBusy(false); }
  }

  function resetLabelForm() {
    setHeadShape("not-assessable"); setTailStatus("not-assessable");
    setOverlap(false); setDebris(false); setMaskPoints([]); setMaskDrafts([]);
  }

  async function savePrimaryObject(record: MorphologyImageRecord) {
    const annotation: MorphologyObjectAnnotation = {
      objectId: `OBJ-${record.objects.length + 1}`, headShape, tailStatus, overlap, debris,
      masks: [...maskDrafts, ...(maskPoints.length >= 3 ? [{ region: maskRegion, points: maskPoints, createdAt: new Date().toISOString(), reviewerId: reviewerId.trim() }] : [])],
      annotatedAt: new Date().toISOString(), reviewerId: reviewerId.trim(),
    };
    const next = await updateMorphologyImage({ ...record, objects: [...record.objects, annotation] });
    setRecords(next); setSelectedObjectId(annotation.objectId); resetLabelForm();
  }

  async function saveSecondReview(record: MorphologyImageRecord) {
    const existing = record.objects.find((item) => item.objectId === selectedObjectId);
    if (!existing) { Alert.alert("اختر جسمًا", "اختر وسمًا سابقًا من القائمة لإضافة المراجعة الثانية."); return; }
    if (!record.secondReviewerId || record.secondReviewerId === existing.reviewerId) {
      Alert.alert("معرّف المراجع الثاني مطلوب", "أدخل معرّفًا مختلفًا للمراجع الثاني في إعدادات مجموعة الصور.");
      return;
    }
    const secondReview = {
      reviewerId: record.secondReviewerId, headShape, tailStatus, overlap, debris,
      masks: [...maskDrafts, ...(maskPoints.length >= 3 ? [{ region: maskRegion, points: maskPoints, createdAt: new Date().toISOString(), reviewerId: record.secondReviewerId }] : [])],
      reviewedAt: new Date().toISOString(),
    };
    const objects = record.objects.map((item) => item.objectId === selectedObjectId ? { ...item, secondReview } : item);
    const next = await updateMorphologyImage({ ...record, objects, adjudicationStatus: "unresolved" });
    setRecords(next); resetLabelForm();
  }

  async function adjudicate(record: MorphologyImageRecord) {
    const missingReview = record.objects.some((item) => !item.secondReview);
    const disagreements = record.objects.filter((item) => item.secondReview && (
      item.headShape !== item.secondReview.headShape || item.tailStatus !== item.secondReview.tailStatus ||
      item.overlap !== item.secondReview.overlap || item.debris !== item.secondReview.debris
    ));
    if (missingReview || !record.objects.length) {
      Alert.alert("المراجعة غير مكتملة", "يجب إضافة مراجعة ثانية مستقلة لكل جسم قبل طلب اعتماد المجموعة.");
      return;
    }
    if (disagreements.length) {
      Alert.alert("اختلافات تحتاج حسمًا", `يوجد اختلاف في ${disagreements.length} جسم. راجع الوسوم وسجل مراجعة ثانية مصححة قبل الاعتماد.`);
      const next = await updateMorphologyImage({ ...record, adjudicationStatus: "unresolved" });
      setRecords(next);
      return;
    }
    Alert.alert(
      "تأكيد الاعتماد البشري",
      "تطابقت الوسوم الوصفية للمراجعين. هل راجعت الأقنعة بصريًا وتؤكد اعتماد مجموعة الصور؟ هذا التأكيد مسؤولية الخبير وليس حكمًا آليًا على الجودة.",
      [
        { text: "إلغاء", style: "cancel" },
        { text: "تأكيد الاعتماد", onPress: () => {
          updateMorphologyImage({ ...record, adjudicationStatus: "adjudicated" }).then(setRecords).catch((error) => Alert.alert("تعذر الحفظ", String(error)));
        } },
      ],
    );
  }

  async function removeImage(id: string) {
    const next = await deleteMorphologyImage(id);
    setRecords(next);
    if (selectedId === id) { setSelectedId(next[0]?.id ?? null); setSelectedObjectId(null); }
  }

  async function exportDataset() {
    setBusy(true);
    try {
      const result = await exportMorphologyDataset(records);
      Alert.alert("تم إنشاء ملف البيان", `تم تجهيز Manifest لعدد ${result.imageCount} صورة. شارك الصور الأصلية كل صورة على حدة من قائمة الصور؛ ملف البيان وحده لا يحتوي على بايتات الصور.`);
    } catch (error) { Alert.alert("تعذر التصدير", error instanceof Error ? error.message : "حدث خطأ أثناء التصدير."); }
    finally { setBusy(false); }
  }

  const selected = records.find((record) => record.id === selectedId) ?? null;
  const annotatedObjects = records.reduce((sum, record) => sum + record.objects.length, 0);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="Research workflow · Image morphology" title="صور المورفولوجي" />
        <MedicalBanner compact />
        <View style={styles.notice}><MaterialIcons name="science" size={20} color={COLORS.warning} /><Text style={styles.noticeText}>أداة جمع بيانات ووسم بحثي. لا يوجد مصنف AI مدرّب أو درجة Kruger تلقائية أو نتيجة تشخيصية.</Text></View>

        <SectionTitle title="إعداد مجموعة الصور" detail="استخدم رموزًا مستعارة ولا تدخل بيانات تعريفية للمريض" />
        <View style={styles.form}>
          <Field label="معرّف العينة المستعار" value={sampleId} onChangeText={setSampleId} placeholder="MOR-SAMPLE-001" />
          <Field label="معرّف المراجع الأول" value={reviewerId} onChangeText={setReviewerId} placeholder="Reviewer-A" />
          <Field label="معرّف المراجع الثاني (اختياري)" value={secondReviewerId} onChangeText={setSecondReviewerId} placeholder="Reviewer-B" />
          <Field label="تكبير العدسة الشيئية (×)" value={magnification} onChangeText={setMagnification} placeholder="100" keyboardType="numeric" />
          <Field label="حجم البكسل µm/px (اختياري)" value={pixelSize} onChangeText={setPixelSize} placeholder="قيمة من معايرة مرجعية" keyboardType="decimal-pad" />
          <Field label="معرّف الميكروسكوب (اختياري)" value={microscopeId} onChangeText={setMicroscopeId} placeholder="Microscope-ID" />
          <Text style={styles.label}>تحضير الشريحة</Text>
          <View style={styles.optionRow}>
            <Choice label="مصبوغة" active={preparation === "stained"} onPress={() => setPreparation("stained")} />
            <Choice label="غير مصبوغة" active={preparation === "unstained"} onPress={() => setPreparation("unstained")} />
            <Choice label="غير معروف" active={preparation === "unknown"} onPress={() => setPreparation("unknown")} />
          </View>
          <PrimaryButton label={busy ? "جاري العمل…" : "إضافة صور من الجهاز"} icon="add-photo-alternate" onPress={importImages} loading={busy} />
          <Text style={styles.helper}>JPEG / PNG / WebP · حتى 20 MB للصورة · تُنسخ الصور إلى مجلد دائم داخل مساحة التطبيق.</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat label="الصور" value={String(records.length)} /><Stat label="وسوم الأجسام" value={String(annotatedObjects)} />
          <Stat label="مراجعة معلّقة" value={String(records.filter((item) => item.adjudicationStatus !== "adjudicated").length)} />
        </View>
        <PrimaryButton label="تصدير Manifest لمجموعة البيانات" icon="file-download" onPress={exportDataset} loading={busy} />
        <Text style={styles.helper}>التصدير الحالي ينشئ ملف JSON للبيانات والوسوم. شارك ملفات الصور منفردة من زر المشاركة لكل صورة؛ لا يُنشأ ZIP بعد.</Text>

        <SectionTitle title="الصور المستوردة" detail="حدد صورة للوسم والمراجعة" />
        {records.length === 0 ? <View style={styles.empty}><MaterialIcons name="image-search" size={34} color={COLORS.muted} /><Text style={styles.emptyText}>لم تتم إضافة صور بعد.</Text></View> : records.map((record) => (
          <View key={record.id} style={[styles.imageCard, selectedId === record.id && styles.imageCardSelected]}>
            <Pressable onPress={() => { setSelectedId(record.id); setSelectedObjectId(null); setReviewMode("primary"); }} style={styles.imageMain}>
              <Image source={{ uri: record.uri }} style={styles.thumbnail} resizeMode="contain" />
              <View style={styles.imageCopy}>
                <Text style={styles.imageName} numberOfLines={1}>{record.fileName}</Text>
                <Text style={styles.imageMeta}>{record.pseudonymousSampleId} · {record.objects.length} جسم موسوم</Text>
                <StatusPill label={record.adjudicationStatus === "adjudicated" ? "متفق عليه" : record.adjudicationStatus === "unresolved" ? "اختلافات تحتاج حسم" : "مراجعة واحدة"} tone={record.adjudicationStatus === "adjudicated" ? "success" : "warning"} />
              </View>
            </Pressable>
            <View style={styles.iconActions}>
              <Pressable accessibilityLabel="مشاركة ملف الصورة" onPress={() => shareMorphologyImage(record).catch((e) => Alert.alert("تعذر المشاركة", String(e)))}><MaterialIcons name="share" size={20} color={COLORS.tealDark} /></Pressable>
              <Pressable accessibilityLabel="حذف الصورة" onPress={() => removeImage(record.id)}><MaterialIcons name="delete-outline" size={20} color={COLORS.danger} /></Pressable>
            </View>
          </View>
        ))}

        {selected ? (
          <>
            <SectionTitle title="وسم الأجسام والأقنعة" detail="حدد جسمًا واحدًا ثم ارسم حدود أجزائه بالنقر على الصورة" />
            <View style={styles.annotationCard}>
              <View style={styles.modeRow}>
                <Choice label="المراجع الأول" active={reviewMode === "primary"} onPress={() => setReviewMode("primary")} />
                <Choice label="المراجع الثاني" active={reviewMode === "second"} onPress={() => setReviewMode("second")} />
              </View>
              {reviewMode === "second" ? <Text style={styles.helper}>المراجع الثاني: {selected.secondReviewerId || "غير محدد"}. يجب أن يختلف عن المراجع الأول.</Text> : null}
              <Text style={styles.label}>الأجسام المسجلة</Text>
              <View style={styles.chipWrap}>{selected.objects.map((item) => <Choice key={item.objectId} label={item.objectId} active={selectedObjectId === item.objectId} onPress={() => { setSelectedObjectId(item.objectId); resetLabelForm(); }} />)}</View>
              <Text style={styles.label}>شكل الرأس</Text>
              <View style={styles.chipWrap}>{HEAD_OPTIONS.map((item) => <Choice key={item.value} label={item.label} active={headShape === item.value} onPress={() => setHeadShape(item.value)} />)}</View>
              <Text style={styles.label}>حالة الذيل</Text>
              <View style={styles.chipWrap}>{TAIL_OPTIONS.map((item) => <Choice key={item.value} label={item.label} active={tailStatus === item.value} onPress={() => setTailStatus(item.value)} />)}</View>
              <View style={styles.optionRow}>
                <Choice label={overlap ? "تداخل: نعم" : "تداخل: لا"} active={overlap} onPress={() => setOverlap((v) => !v)} />
                <Choice label={debris ? "حطام: نعم" : "حطام: لا"} active={debris} onPress={() => setDebris((v) => !v)} />
              </View>
              <Text style={styles.label}>تحديد قناع الجزء (ارسم 3 نقاط أو أكثر)</Text>
              <View style={styles.chipWrap}>{MASK_REGIONS.map((item) => <Choice key={item.value} label={item.label} active={maskRegion === item.value} onPress={() => { setMaskRegion(item.value); setMaskPoints([]); }} />)}</View>
              <View style={styles.maskCanvas} onLayout={(event) => setCanvasWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} onResponderRelease={(event) => {
                const x = Math.max(0, Math.min(1, event.nativeEvent.locationX / canvasWidth));
                const y = Math.max(0, Math.min(1, event.nativeEvent.locationY / VIEW_H));
                setMaskPoints((points) => [...points, { x, y }]);
              }}>
                <Image source={{ uri: selected.uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" onLoad={(event) => {
                  const { width, height } = event.nativeEvent.source;
                  if (width > 0 && height > 0 && (selected.imageWidthPx !== width || selected.imageHeightPx !== height)) {
                    updateMorphologyImage({ ...selected, imageWidthPx: width, imageHeightPx: height }).then(setRecords).catch(() => undefined);
                  }
                }} />
                <Svg width="100%" height="100%" viewBox={`0 0 ${canvasWidth} ${VIEW_H}`} preserveAspectRatio="none">
                  {maskDrafts.map((mask, index) => <Polygon key={index} points={mask.points.map((p) => `${p.x*canvasWidth},${p.y*VIEW_H}`).join(" ")} fill="rgba(16,130,170,0.14)" stroke="#1682AA" strokeWidth="2" />)}
                  {maskPoints.length >= 3 ? <Polygon points={maskPoints.map((p) => `${p.x*canvasWidth},${p.y*VIEW_H}`).join(" ")} fill="rgba(0,160,140,0.18)" stroke="#00A08C" strokeWidth="2" /> : null}
                  {maskPoints.map((p, i) => <Circle key={i} cx={p.x*canvasWidth} cy={p.y*VIEW_H} r="4" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="1" />)}
                </Svg>
              </View>
              <Text style={styles.helper}>النقاط محفوظة كإحداثيات نسبية إلى الصورة المعروضة. وضع العرض يمدد الصورة لتسهيل رسم الحدود؛ راجع الأقنعة بصريًا قبل اعتمادها.</Text>
              <View style={styles.optionRow}>
                <Choice label={`النقاط: ${maskPoints.length}`} active={false} onPress={() => {}} />
                <Choice label={`أقنعة جاهزة: ${maskDrafts.length}`} active={false} onPress={() => {}} />
                <Choice label="اعتماد القناع الحالي" active={false} onPress={() => {
                  if (maskPoints.length < 3) { Alert.alert("نقاط غير كافية", "أضف ثلاث نقاط على الأقل لتكوين قناع."); return; }
                  const reviewer = reviewMode === "primary" ? reviewerId.trim() : (selected.secondReviewerId ?? "");
                  if (!reviewer) { Alert.alert("المراجع غير محدد", "أدخل معرف المراجع قبل حفظ القناع."); return; }
                  setMaskDrafts((items) => [...items, { region: maskRegion, points: maskPoints, createdAt: new Date().toISOString(), reviewerId: reviewer }]);
                  setMaskPoints([]);
                }} />
                <Choice label="مسح النقاط" active={false} onPress={() => setMaskPoints([])} />
              </View>
              {reviewMode === "primary" ? (
                <PrimaryButton label="حفظ وسم جسم جديد" icon="fact-check" onPress={() => savePrimaryObject(selected)} />
              ) : (
                <PrimaryButton label="حفظ مراجعة ثانية للجسم المحدد" icon="fact-check" onPress={() => saveSecondReview(selected)} />
              )}
              {selected.objects.map((item) => <View key={item.objectId} style={styles.annotationRow}>
                <Pressable onPress={() => setSelectedObjectId(item.objectId)}><Text style={styles.annotationText}>{item.objectId} · الرأس: {HEAD_OPTIONS.find((o) => o.value === item.headShape)?.label} · الذيل: {TAIL_OPTIONS.find((o) => o.value === item.tailStatus)?.label} · أقنعة: {item.masks.length} · مراجعة ثانية: {item.secondReview ? "نعم" : "لا"}</Text></Pressable>
              </View>)}
              <PrimaryButton label="مراجعة الاختلافات وطلب الاعتماد البشري" icon="verified" onPress={() => adjudicate(selected)} />
              <Text style={styles.helper}>يتم اعتبار المجموعة متفقًا عليها فقط إذا تمت مراجعة كل جسم مرتين وتطابقت الوسوم الأساسية. الاختلافات لا تُحسم آليًا.</Text>
            </View>
          </>
        ) : null}
        <Text style={styles.footer}>الصور محفوظة في مجلد مستندات التطبيق. احذف التطبيق أو بياناته يؤدي إلى حذفها؛ احتفظ بتصدير خارجي مشفر. لا ترفع صورًا أو بيانات يمكن أن تكشف هوية المريض.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "default" | "numeric" | "decimal-pad" }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#A0ACB6" keyboardType={keyboardType ?? "default"} style={styles.input} textAlign="right" /></View>;
}
function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}
const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 42 }, notice: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: COLORS.warningBg, borderRadius: 14, padding: 12, marginBottom: 18 },
  noticeText: { flex: 1, color: "#7A4A08", fontSize: 11, lineHeight: 17, textAlign: "right" }, form: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 15, marginBottom: 14 },
  field: { marginBottom: 12 }, label: { color: COLORS.navy, fontSize: 12, fontWeight: "800", textAlign: "right", marginBottom: 7 },
  input: { minHeight: 45, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: "#FCFBF9", paddingHorizontal: 12, color: COLORS.navy, fontSize: 13 },
  optionRow: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 7, marginBottom: 13 }, chipWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7, marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: COLORS.paper }, chipActive: { borderColor: COLORS.tealDark, backgroundColor: "#E6F8F5" },
  chipText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" }, chipTextActive: { color: COLORS.tealDark }, helper: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 9, marginBottom: 8 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 }, stat: { flex: 1, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 12, alignItems: "center" },
  statValue: { color: COLORS.navy, fontSize: 19, fontWeight: "800" }, statLabel: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  empty: { alignItems: "center", padding: 28, backgroundColor: COLORS.paper, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line }, emptyText: { color: COLORS.muted, marginTop: 9, fontSize: 12 },
  imageCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, backgroundColor: COLORS.paper, marginBottom: 9 },
  imageCardSelected: { borderColor: COLORS.tealDark, backgroundColor: "#F5FBFA" }, imageMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  thumbnail: { width: 70, height: 70, borderRadius: 10, backgroundColor: "#F0F0F0" }, imageCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  imageName: { color: COLORS.navy, fontWeight: "800", fontSize: 11, maxWidth: "100%" }, imageMeta: { color: COLORS.muted, fontSize: 9, textAlign: "right" },
  iconActions: { gap: 12, paddingHorizontal: 5 }, annotationCard: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 14 },
  modeRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginBottom: 12 }, maskCanvas: { width: "100%", height: VIEW_H, backgroundColor: "#E7E7E7", borderRadius: 12, overflow: "hidden" },
  annotationRow: { backgroundColor: "#F5F8F8", padding: 9, borderRadius: 9, marginTop: 6 }, annotationText: { color: COLORS.navySoft, fontSize: 10, textAlign: "right" },
  footer: { color: COLORS.muted, fontSize: 10, lineHeight: 17, textAlign: "center", marginTop: 18 },
});
