import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, PrimaryButton, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import {
  addMorphologyImages,
  deleteMorphologyImage,
  loadMorphologyImages,
  updateMorphologyImage,
  type HeadShape,
  type MorphologyImageRecord,
  type MorphologyObjectAnnotation,
  type MorphologyPreparation,
  type TailStatus,
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

export default function MorphologyScreen() {
  const [records, setRecords] = useState<MorphologyImageRecord[]>([]);
  const [sampleId, setSampleId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [magnification, setMagnification] = useState("100");
  const [pixelSize, setPixelSize] = useState("");
  const [microscopeId, setMicroscopeId] = useState("");
  const [preparation, setPreparation] = useState<MorphologyPreparation>("stained");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [headShape, setHeadShape] = useState<HeadShape>("not-assessable");
  const [tailStatus, setTailStatus] = useState<TailStatus>("not-assessable");
  const [overlap, setOverlap] = useState(false);
  const [debris, setDebris] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setRecords(await loadMorphologyImages()), []);
  useEffect(() => { refresh(); }, [refresh]);

  async function importImages() {
    if (!sampleId.trim() || !reviewerId.trim()) {
      Alert.alert("بيانات ناقصة", "أدخل معرّف عينة مستعارًا ومعرّف المراجع قبل استيراد الصور.");
      return;
    }
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp", "image/*"],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const accepted = result.assets.filter((asset) => {
        const mimeOk = !asset.mimeType || asset.mimeType.startsWith("image/");
        const sizeOk = (asset.size ?? 0) <= 20 * 1024 * 1024;
        return mimeOk && sizeOk && Boolean(asset.uri);
      });
      const rejected = result.assets.length - accepted.length;
      const importedAt = new Date().toISOString();
      const newRecords: MorphologyImageRecord[] = accepted.map((asset, index) => ({
        id: `MOR-${Date.now()}-${index}`,
        uri: asset.uri,
        fileName: asset.name || `microscopy-image-${index + 1}`,
        fileSizeBytes: asset.size ?? 0,
        importedAt,
        preparation,
        objectiveMagnification: Number(magnification) > 0 ? Number(magnification) : null,
        pixelSizeUm: Number(pixelSize) > 0 ? Number(pixelSize) : null,
        microscopeId: microscopeId.trim() || undefined,
        pseudonymousSampleId: sampleId.trim(),
        reviewerId: reviewerId.trim(),
        adjudicationStatus: "single-review",
        objects: [],
      }));
      const next = await addMorphologyImages(newRecords);
      setRecords(next);
      if (newRecords[0]) setSelectedId(newRecords[0].id);
      if (rejected) Alert.alert("تم الاستيراد مع استبعاد بعض الملفات", `تمت إضافة ${accepted.length} صورة. استُبعد ${rejected} ملف بسبب النوع أو تجاوز حد 20 MB.`);
    } catch (error) {
      Alert.alert("تعذر استيراد الصور", error instanceof Error ? error.message : "تحقق من صلاحية الوصول للملفات.");
    } finally {
      setBusy(false);
    }
  }

  async function addObjectAnnotation(record: MorphologyImageRecord) {
    const annotation: MorphologyObjectAnnotation = {
      objectId: `OBJ-${record.objects.length + 1}`,
      headShape,
      tailStatus,
      overlap,
      debris,
      annotatedAt: new Date().toISOString(),
    };
    const next = await updateMorphologyImage({ ...record, objects: [...record.objects, annotation] });
    setRecords(next);
    setHeadShape("not-assessable");
    setTailStatus("not-assessable");
    setOverlap(false);
    setDebris(false);
  }

  async function removeImage(id: string) {
    const next = await deleteMorphologyImage(id);
    setRecords(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  }

  const selected = records.find((record) => record.id === selectedId) ?? null;
  const annotatedObjects = records.reduce((sum, record) => sum + record.objects.length, 0);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <AppHeader eyebrow="Research workflow · Image morphology" title="صور المورفولوجي" />
        <MedicalBanner compact />
        <View style={styles.notice}>
          <MaterialIcons name="science" size={20} color={COLORS.warning} />
          <Text style={styles.noticeText}>هذه المرحلة تجمع الصور والوسوم اليدوية التي يدخلها المراجع. لا يوجد تصنيف AI تلقائي أو درجة Kruger أو نتيجة تشخيصية.</Text>
        </View>

        <SectionTitle title="إعداد مجموعة الصور" detail="لا تدخل اسم المريض أو أي بيانات تعريفية مباشرة" />
        <View style={styles.form}>
          <Field label="معرّف العينة المستعار" value={sampleId} onChangeText={setSampleId} placeholder="مثال: MOR-SAMPLE-001" />
          <Field label="معرّف المراجع" value={reviewerId} onChangeText={setReviewerId} placeholder="رمز فني/خبير غير معرّف" />
          <Field label="تكبير العدسة الشيئية (×)" value={magnification} onChangeText={setMagnification} placeholder="مثال: 100" keyboardType="numeric" />
          <Field label="حجم البكسل µm/px (اختياري)" value={pixelSize} onChangeText={setPixelSize} placeholder="أدخل قيمة من معايرة مرجعية" keyboardType="decimal-pad" />
          <Field label="معرّف الميكروسكوب (اختياري)" value={microscopeId} onChangeText={setMicroscopeId} placeholder="رمز الجهاز" />
          <Text style={styles.label}>تحضير الشريحة</Text>
          <View style={styles.optionRow}>
            <Choice label="مصبوغة" active={preparation === "stained"} onPress={() => setPreparation("stained")} />
            <Choice label="غير مصبوغة" active={preparation === "unstained"} onPress={() => setPreparation("unstained")} />
            <Choice label="غير معروف" active={preparation === "unknown"} onPress={() => setPreparation("unknown")} />
          </View>
          <PrimaryButton label={busy ? "جاري استيراد الصور…" : "إضافة صور من الجهاز"} icon="add-photo-alternate" onPress={importImages} loading={busy} />
          <Text style={styles.helper}>JPEG / PNG / WebP · حتى 20 MB للصورة · الاستيراد إلى مساحة التطبيق المحلية.</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat label="الصور" value={String(records.length)} />
          <Stat label="وسوم الأجسام" value={String(annotatedObjects)} />
          <Stat label="تحتاج مراجعة" value={String(records.filter((item) => item.objects.length === 0).length)} />
        </View>

        <SectionTitle title="الصور المستوردة" detail="اختر صورة لإضافة وسوم مراجعة يدوية" />
        {records.length === 0 ? <View style={styles.empty}><MaterialIcons name="image-search" size={34} color={COLORS.muted} /><Text style={styles.emptyText}>لم تتم إضافة صور بعد.</Text></View> : records.map((record) => (
          <Pressable key={record.id} onPress={() => setSelectedId(record.id)} style={[styles.imageCard, selectedId === record.id && styles.imageCardSelected]}>
            <Image source={{ uri: record.uri }} style={styles.thumbnail} resizeMode="contain" />
            <View style={styles.imageCopy}>
              <Text style={styles.imageName} numberOfLines={1}>{record.fileName}</Text>
              <Text style={styles.imageMeta}>{record.pseudonymousSampleId} · {record.preparation === "stained" ? "مصبوغة" : record.preparation === "unstained" ? "غير مصبوغة" : "تحضير غير معروف"}</Text>
              <Text style={styles.imageMeta}>{record.objects.length} وسم يدوي · المراجع: {record.reviewerId}</Text>
              <StatusPill label={record.objects.length ? "بدأت الوسوم" : "بانتظار الوسم"} tone={record.objects.length ? "success" : "warning"} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="حذف الصورة من مجموعة العمل" onPress={() => removeImage(record.id)} hitSlop={8} style={styles.deleteButton}>
              <MaterialIcons name="delete-outline" size={20} color={COLORS.danger} />
            </Pressable>
          </Pressable>
        ))}

        {selected ? (
          <>
            <SectionTitle title="وسم يدوي لجسم ظاهر" detail={selected.fileName} />
            <View style={styles.annotationCard}>
              <Image source={{ uri: selected.uri }} style={styles.preview} resizeMode="contain" />
              <Text style={styles.label}>شكل الرأس وفق تقييم المراجع</Text>
              <View style={styles.chipWrap}>{HEAD_OPTIONS.map((item) => <Choice key={item.value} label={item.label} active={headShape === item.value} onPress={() => setHeadShape(item.value)} />)}</View>
              <Text style={styles.label}>حالة الذيل</Text>
              <View style={styles.chipWrap}>{TAIL_OPTIONS.map((item) => <Choice key={item.value} label={item.label} active={tailStatus === item.value} onPress={() => setTailStatus(item.value)} />)}</View>
              <View style={styles.optionRow}>
                <Choice label={overlap ? "تداخل: نعم" : "تداخل: لا"} active={overlap} onPress={() => setOverlap((value) => !value)} />
                <Choice label={debris ? "حطام: نعم" : "حطام: لا"} active={debris} onPress={() => setDebris((value) => !value)} />
              </View>
              <PrimaryButton label="حفظ وسم الجسم" icon="fact-check" onPress={() => addObjectAnnotation(selected)} />
              {selected.objects.length > 0 ? (
                <View style={styles.annotationList}>
                  <Text style={styles.label}>الوسوم المسجلة لهذه الصورة</Text>
                  {selected.objects.map((item) => (
                    <View key={item.objectId} style={styles.annotationRow}>
                      <Text style={styles.annotationText}>{item.objectId} · الرأس: {HEAD_OPTIONS.find((option) => option.value === item.headShape)?.label} · الذيل: {TAIL_OPTIONS.find((option) => option.value === item.tailStatus)?.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.helper}>كل وسم يمثل جسمًا واحدًا يحدده الخبير بصريًا. لا يتم إنشاء حدود أو أقنعة segmentation تلقائيًا في هذه المرحلة.</Text>
            </View>
          </>
        ) : null}
        <Text style={styles.footer}>الصور وبيانات الوسم تُحفظ محليًا في مساحة التطبيق. مسارات الملفات المستوردة قد تتأثر بمسح ذاكرة التخزين المؤقت أو حذف التطبيق؛ صدّر/أرشف مجموعة البيانات قبل استخدامها في دراسة.</Text>
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
  content: { padding: 20, paddingBottom: 42 },
  notice: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: COLORS.warningBg, borderRadius: 14, padding: 12, marginBottom: 18 },
  noticeText: { flex: 1, color: "#7A4A08", fontSize: 11, lineHeight: 17, textAlign: "right" },
  form: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 15, marginBottom: 14 },
  field: { marginBottom: 12 },
  label: { color: COLORS.navy, fontSize: 12, fontWeight: "800", textAlign: "right", marginBottom: 7 },
  input: { minHeight: 45, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, backgroundColor: "#FCFBF9", paddingHorizontal: 12, color: COLORS.navy, fontSize: 13 },
  optionRow: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 7, marginBottom: 13 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7, marginBottom: 14 },
  chip: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: COLORS.paper },
  chipActive: { borderColor: COLORS.tealDark, backgroundColor: "#E6F8F5" },
  chipText: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  chipTextActive: { color: COLORS.tealDark },
  helper: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 9 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 22 },
  stat: { flex: 1, backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 12, alignItems: "center" },
  statValue: { color: COLORS.navy, fontSize: 19, fontWeight: "800" },
  statLabel: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  empty: { alignItems: "center", padding: 28, backgroundColor: COLORS.paper, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line },
  emptyText: { color: COLORS.muted, marginTop: 9, fontSize: 12 },
  imageCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 15, backgroundColor: COLORS.paper, marginBottom: 9 },
  imageCardSelected: { borderColor: COLORS.tealDark, backgroundColor: "#F5FBFA" },
  thumbnail: { width: 70, height: 70, borderRadius: 10, backgroundColor: "#F0F0F0" },
  imageCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  imageName: { color: COLORS.navy, fontWeight: "800", fontSize: 11, maxWidth: "100%" },
  imageMeta: { color: COLORS.muted, fontSize: 9, textAlign: "right" },
  deleteButton: { padding: 3 },
  annotationCard: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 14 },
  preview: { width: "100%", height: 210, backgroundColor: "#F3F3F3", borderRadius: 12, marginBottom: 14 },
  annotationList: { marginTop: 15, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 12 },
  annotationRow: { backgroundColor: "#F5F8F8", padding: 9, borderRadius: 9, marginTop: 6 },
  annotationText: { color: COLORS.navySoft, fontSize: 10, textAlign: "right" },
  footer: { color: COLORS.muted, fontSize: 10, lineHeight: 17, textAlign: "center", marginTop: 18 },
});
