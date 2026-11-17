import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, MetricCard, PrimaryButton, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { loadSamples, upsertSample } from "@/lib/sample-store";
import { type SampleRecord } from "@/lib/sample-types";
import { calculateConcentrationMillionPerMl, loadMorphologyCounts, saveMorphologyCount, summarizeMorphologyCount, type MorphologyCount } from "@/lib/casa-workspace";

function NumberField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor="#94A3B8" style={styles.input} /></View>;
}

export default function CasaWorkspaceScreen() {
  const [samples, setSamples] = useState<SampleRecord[]>([]);
  const [counts, setCounts] = useState<MorphologyCount[]>([]);
  const [sampleId, setSampleId] = useState("");
  const [imagesReviewed, setImagesReviewed] = useState("1");
  const [totalExamined, setTotalExamined] = useState("100");
  const [normalForms, setNormalForms] = useState("0");
  const [abnormalForms, setAbnormalForms] = useState("0");
  const [notAssessable, setNotAssessable] = useState("0");
  const [spermCount, setSpermCount] = useState("");
  const [area, setArea] = useState("");
  const [depth, setDepth] = useState("");
  const [dilution, setDilution] = useState("1");
  const [concentration, setConcentration] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [nextSamples, nextCounts] = await Promise.all([loadSamples(), loadMorphologyCounts()]);
    setSamples(nextSamples);
    setCounts(nextCounts);
    if (!sampleId && nextSamples[0]) setSampleId(nextSamples[0].id);
  }, [sampleId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const latest = samples[0];
  const reviewed = counts.reduce((sum, item) => sum + item.imagesReviewed, 0);
  const examined = counts.reduce((sum, item) => sum + item.totalExamined, 0);
  const selectedCount = useMemo(() => counts.find((item) => item.sampleId === sampleId), [counts, sampleId]);

  async function saveCount() {
    const values = [imagesReviewed, totalExamined, normalForms, abnormalForms, notAssessable].map(Number);
    if (!sampleId.trim() || values.some((v) => !Number.isInteger(v) || v < 0) || Number(imagesReviewed) < 1) {
      Alert.alert("بيانات غير صالحة", "اختر العينة وأدخل أعدادًا صحيحة غير سالبة، مع صورة واحدة على الأقل.");
      return;
    }
    const [images, total, normal, abnormal, unassessable] = values;
    if (normal + abnormal + unassessable !== total) {
      Alert.alert("الأعداد غير متطابقة", "يجب أن يساوي مجموع الطبيعي وغير الطبيعي وغير القابل للتقييم إجمالي المفحوص.");
      return;
    }
    const next = await saveMorphologyCount({ sampleId, imagesReviewed: images, totalExamined: total, normalForms: normal, abnormalForms: abnormal, notAssessable: unassessable, updatedAt: new Date().toISOString() });
    setCounts(next);
    const linkedSample = samples.find((item) => item.id === sampleId);
    if (linkedSample) {
      await upsertSample({ ...linkedSample, manualMorphologyCount: { imagesReviewed: images, totalExamined: total, normalForms: normal, abnormalForms: abnormal, notAssessable: unassessable, updatedAt: new Date().toISOString() } });
      setSamples(await loadSamples());
    }
    Alert.alert("تم الحفظ", "تم حفظ العدّ اليدوي محليًا وربطه بتقرير العينة. لم يتم إنشاء تصنيف آلي.");
  }

  function calculateConcentration() {
    try {
      const result = calculateConcentrationMillionPerMl({ spermCount: Number(spermCount), countedAreaMm2: Number(area), chamberDepthUm: Number(depth), dilutionFactor: Number(dilution) });
      setConcentration(result);
      setError("");
    } catch (e) {
      setConcentration(null);
      setError(e instanceof Error ? e.message : "تعذر الحساب.");
    }
  }

  const summary = selectedCount ? summarizeMorphologyCount(selectedCount) : null;

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="CASA · Advanced workspace" title="مساحة عمل CASA" />
    <MedicalBanner compact />
    <View style={styles.hero}><View style={styles.heroHeader}><StatusPill label="معالجة محلية" tone="success" icon="lock" /><MaterialIcons name="biotech" size={26} color="#8FE3D7" /></View><Text style={styles.heroTitle}>لوحة موحدة للتحليل والمراجعة</Text><Text style={styles.heroBody}>تجميع مؤشرات العينات، العدّ اليدوي متعدد الصور، وحساب التركيز مع اشتراط هندسة غرفة العد.</Text></View>

    <SectionTitle title="ملخص CASA" detail="مؤشرات من سجلات العينات المحفوظة على الجهاز" />
    <View style={styles.grid}><MetricCard label="العينات المسجلة" value={String(samples.length)} unit="عينة" icon="science" /><MetricCard label="الصور التي تمت مراجعتها" value={String(reviewed)} unit="صورة" tone="teal" icon="image-search" /><MetricCard label="إجمالي العدّ اليدوي" value={String(examined)} unit="خلية" tone="navy" icon="biotech" /><MetricCard label="عينات بانتظار المراجعة" value={String(samples.filter((s) => s.reviewStatus === "pending").length)} unit="عينة" tone="orange" icon="rate-review" /></View>
    {latest ? <View style={styles.latest}><Text style={styles.latestTitle}>أحدث عينة · {latest.id}</Text><Text style={styles.latestText}>الحركة التقدمية: {latest.progressiveMotility.toFixed(1)}% · إجمالي الحركة: {latest.totalMotility.toFixed(1)}%</Text><Text style={styles.latestText}>المحرك: {latest.analysisEngine ?? "غير محدد"} · جودة البيانات: {latest.qualityScore}%</Text></View> : null}

    <SectionTitle title="العدّ اليدوي للمورفولوجي" detail="سجّل النتيجة المجمعة من صور متعددة بعد مراجعتها بشريًا" />
    <View style={styles.card}>
      <Text style={styles.fieldLabel}>معرّف العينة</Text>
      <View style={styles.chips}>{samples.slice(0, 8).map((sample) => <Pressable key={sample.id} onPress={() => setSampleId(sample.id)} style={[styles.chip, sampleId === sample.id && styles.chipActive]}><Text style={[styles.chipText, sampleId === sample.id && styles.chipTextActive]}>{sample.id}</Text></Pressable>)}</View>
      <NumberField label="عدد الصور التي تمت مراجعتها" value={imagesReviewed} onChangeText={setImagesReviewed} placeholder="1" />
      <NumberField label="إجمالي الحيوانات المنوية المفحوصة" value={totalExamined} onChangeText={setTotalExamined} placeholder="100" />
      <NumberField label="الأشكال الطبيعية" value={normalForms} onChangeText={setNormalForms} placeholder="0" />
      <NumberField label="الأشكال غير الطبيعية" value={abnormalForms} onChangeText={setAbnormalForms} placeholder="0" />
      <NumberField label="غير قابلة للتقييم" value={notAssessable} onChangeText={setNotAssessable} placeholder="0" />
      <PrimaryButton label="حفظ العدّ اليدوي" icon="save" onPress={saveCount} />
      {summary ? <View style={styles.summary}><Text style={styles.summaryTitle}>آخر سجل محفوظ · {selectedCount?.totalExamined} مفحوص</Text><Text style={styles.summaryText}>طبيعي: {summary.normalPercent?.toFixed(1) ?? "—"}% · غير طبيعي: {summary.abnormalPercent?.toFixed(1) ?? "—"}% · اكتمال التصنيف: {summary.completionPercent.toFixed(1)}%</Text></View> : null}
      <Text style={styles.helper}>العدّ اليدوي منفصل عن وسم الصور والأقنعة البحثية. لا يتم استنتاج النسب من الصور تلقائيًا.</Text>
    </View>

    <SectionTitle title="حاسبة التركيز" detail="لا تعرض قيمة قبل إدخال جميع معلمات غرفة العد" />
    <View style={styles.card}>
      <NumberField label="عدد الخلايا المعدودة" value={spermCount} onChangeText={setSpermCount} placeholder="مثال: 120" />
      <NumberField label="مساحة العد الفعلية (mm²)" value={area} onChangeText={setArea} placeholder="المساحة المجمعة التي تم عدّها" />
      <NumberField label="عمق الحجرة (µm)" value={depth} onChangeText={setDepth} placeholder="من مواصفات الحجرة" />
      <NumberField label="معامل التخفيف" value={dilution} onChangeText={setDilution} placeholder="1" />
      <PrimaryButton label="حساب التركيز" icon="calculate" onPress={calculateConcentration} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {concentration !== null ? <View style={styles.result}><Text style={styles.resultValue}>{concentration.toFixed(2)} مليون/مل</Text><Text style={styles.helper}>قيمة حسابية مشروطة بصحة العدّ والهندسة والتخفيف، وليست نتيجة سريرية معتمدة.</Text></View> : <Text style={styles.helper}>المعادلة: العدد × معامل التخفيف ÷ (مساحة العد mm² × عمق الحجرة µm). لا تستخدم أبعاد إطار الفيديو بدل مساحة غرفة العد.</Text>}
    </View>

    <View style={styles.notice}><MaterialIcons name="videocam-off" size={19} color={COLORS.warning} /><Text style={styles.noticeText}>البث المباشر من ميكروسكوب USB/OTG غير مفعّل بعد. يتطلب اختبار توافق مصدر الكاميرا وتعريف UVC على أجهزة Android المستهدفة قبل إظهاره كميزة جاهزة.</Text></View>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 42, gap: 10 },
  hero: { backgroundColor: COLORS.navy, borderRadius: 20, padding: 18, gap: 9, marginBottom: 8 },
  heroHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", textAlign: "right" },
  heroBody: { color: "#D5E4EC", fontSize: 12, lineHeight: 20, textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  latest: { backgroundColor: "#EAF7F5", borderRadius: 14, padding: 13, gap: 5, marginBottom: 10 },
  latestTitle: { color: COLORS.navy, fontWeight: "900", textAlign: "right" },
  latestText: { color: COLORS.ink, fontSize: 11, textAlign: "right" },
  card: { backgroundColor: COLORS.paper, borderColor: COLORS.line, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10, marginBottom: 14 },
  field: { gap: 5 },
  fieldLabel: { color: COLORS.ink, fontSize: 12, fontWeight: "800", textAlign: "right" },
  input: { backgroundColor: "#F8FAFC", borderColor: COLORS.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.navy, textAlign: "right" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 8 },
  chip: { borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: "#FFFFFF" },
  chipActive: { borderColor: COLORS.tealDark, backgroundColor: "#EAF7F5" },
  chipText: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: COLORS.tealDark },
  summary: { backgroundColor: "#F0F7FA", borderRadius: 12, padding: 12, gap: 5 },
  summaryTitle: { color: COLORS.navy, fontWeight: "900", textAlign: "right" },
  summaryText: { color: COLORS.ink, fontSize: 11, textAlign: "right" },
  helper: { color: COLORS.muted, fontSize: 10, lineHeight: 17, textAlign: "right" },
  result: { backgroundColor: "#EAF7F5", padding: 13, borderRadius: 12, gap: 5 },
  resultValue: { color: COLORS.tealDark, fontSize: 21, fontWeight: "900", textAlign: "center" },
  error: { color: COLORS.danger, fontSize: 12, textAlign: "right" },
  notice: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#FFF5E6", borderColor: "#F5D8A8", borderWidth: 1, borderRadius: 13, padding: 12 },
  noticeText: { flex: 1, color: "#754B12", fontSize: 11, lineHeight: 18, textAlign: "right" },
});
