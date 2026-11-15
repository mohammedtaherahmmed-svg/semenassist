import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, MetricCard, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { loadSamples } from "@/lib/sample-store";
import type { SampleRecord } from "@/lib/sample-types";

export default function ValidationDashboardScreen() {
  const router = useRouter();
  const [samples, setSamples] = useState<SampleRecord[]>([]);
  useFocusEffect(useCallback(() => {
    let active = true;
    loadSamples().then((items) => active && setSamples(items));
    return () => { active = false; };
  }, []));

  const exported = samples.filter((sample) => (sample.trackObservations?.length ?? 0) > 0).length;
  const withSourceTiming = samples.filter((sample) => sample.fps != null && sample.sampleRateHz != null).length;
  const withConcentrationGeometry = samples.filter((sample) => (sample.calibration.countingAreaMm2 ?? 0) > 0 && (sample.calibration.dilutionFactor ?? 0) > 0).length;
  const researchMorphology = samples.filter((sample) => sample.morphology?.method === "opencv-track-median-shape-proxy-v2").length;

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="Quality engineering" title="لوحة التحقق العلمي" />
    <MedicalBanner compact />
    <View style={styles.notice}><MaterialIcons name="science" size={20} color={COLORS.tealDark} /><Text style={styles.noticeText}>هذه اللوحة تتابع اكتمال بيانات الاختبار. لا تعرض اعتمادًا سريريًا أو دقة طبية.</Text></View>
    <View style={styles.grid}>
      <MetricCard label="إجمالي العينات" value={String(samples.length)} unit="سجل" icon="inventory-2" />
      <MetricCard label="عينات بمسارات مصدّرة" value={String(exported)} unit="عينة" icon="timeline" tone="teal" />
      <MetricCard label="بيانات توقيت مكتملة" value={String(withSourceTiming)} unit="عينة" icon="schedule" />
      <MetricCard label="هندسة تركيز مدخلة" value={String(withConcentrationGeometry)} unit="عينة" icon="straighten" />
    </View>
    <SectionTitle title="حالة التحقق لكل عينة" detail="افتح التقرير لتصدير المسارات ومراجعة المؤشرات" />
    {samples.length === 0 ? <Text style={styles.empty}>لا توجد عينات محفوظة.</Text> : samples.map((sample) => <Pressable key={sample.id} onPress={() => router.push({ pathname: "/sample/[id]", params: { id: sample.id } })} style={styles.card}>
      <View style={styles.cardTop}><Text style={styles.sampleId}>{sample.id}</Text><StatusPill label={(sample.trackObservations?.length ?? 0) > 0 ? "المسارات متاحة" : "لا يوجد تصدير"} tone={(sample.trackObservations?.length ?? 0) > 0 ? "success" : "warning"} /></View>
      <Text style={styles.line}>المصدر: {sample.sourceFrameCount ?? "غير متاح"} إطار · {sample.fps ?? "—"} FPS</Text>
      <Text style={styles.line}>العينات المحللة: {sample.framesAnalyzed} · معدل أخذ العينات: {sample.sampleRateHz ?? "—"} Hz</Text>
      <Text style={styles.line}>نقاط التتبع: {sample.trackObservations?.length ?? 0} · المسارات: {sample.trackingDiagnostics?.validTracks ?? "—"}</Text>
      <Text style={styles.line}>التركيز: {sample.concentrationStatus === "provisional-counting-area-estimate" ? "تقدير هندسي مبدئي" : "غير محسوب"}</Text>
      <Text style={styles.line}>المورفولوجي: {sample.morphology?.method === "opencv-track-median-shape-proxy-v2" ? "Shape proxy بحثي فقط" : "غير مقيم آليًا على الهاتف"}</Text>
      <Text style={styles.pending}>IDF1 / Precision / Recall: يلزم تشغيل benchmark على Ground Truth معتمد.</Text>
    </Pressable>)}
    <SectionTitle title="بوابة مورفولوجي" detail="لا يوجد نموذج Deep Learning مدرّب ضمن هذا الفرع" />
    <View style={styles.card}><Text style={styles.line}>عدد التقارير التي تحمل مؤشرات shape-proxy بحثية: {researchMorphology}</Text><Text style={styles.pending}>يلزم صور مصبوغة ووسوم رأس/ذيل راجعها خبراء قبل تدريب أو اعتماد أي نموذج مورفولوجي.</Text></View>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 42 },
  notice: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#EAF4F2", borderRadius: 14, padding: 12, marginBottom: 18 },
  noticeText: { flex: 1, color: COLORS.navySoft, fontSize: 11, lineHeight: 17, textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10, marginBottom: 22 },
  card: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 17, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  sampleId: { color: COLORS.navy, fontSize: 14, fontWeight: "800" },
  line: { color: COLORS.navySoft, fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 3 },
  pending: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 7 },
  empty: { color: COLORS.muted, textAlign: "center", padding: 25 },
});
