import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, MetricCard, PrimaryButton, QualityBar, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { loadCalibration, loadSamples, type CalibrationRecord } from "@/lib/sample-store";
import { formatDate, qualityLabelText, type SampleRecord } from "@/lib/sample-types";

export default function HomeScreen() {
  const router = useRouter();
  const [samples, setSamples] = useState<SampleRecord[]>([]);
  const [calibration, setCalibration] = useState<CalibrationRecord | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadSamples(), loadCalibration()]).then(([nextSamples, nextCalibration]) => {
        if (!active) return;
        setSamples(nextSamples);
        setCalibration(nextCalibration);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const pendingCount = samples.filter((sample) => sample.reviewStatus === "pending").length;
  const recent = samples[0];
  const hasCalibration = Boolean(calibration);

  return (
    <ScreenContainer containerClassName="bg-background" safeAreaClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader eyebrow="CASA · مساحة عمل المختبر" title="لوحة المختبر" />
        <MedicalBanner />

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <StatusPill label={hasCalibration ? "معايرة محفوظة" : "المعايرة مطلوبة"} tone={hasCalibration ? "success" : "warning"} icon={hasCalibration ? "save" : "tune"} />
            <View style={styles.heroIcon}><MaterialIcons name="biotech" size={25} color={COLORS.teal} /></View>
          </View>
          <Text style={styles.heroTitle}>ابدأ من جودة العينة</Text>
          <Text style={styles.heroBody}>
            {hasCalibration
              ? "توجد معايرة محفوظة لهذا الإعداد. تأكد من مطابقة الهاتف والعدسة وغرفة القياس قبل بدء التحليل."
              : "أدخل قيم المعايرة من مرجع ميكرومتري معلوم قبل أول تحليل، ولا تستخدم قيمًا افتراضية."}
          </Text>
          <PrimaryButton label="إنشاء عينة جديدة" icon="add-circle-outline" onPress={() => router.push("/sample/new")} />
          <Pressable accessibilityRole="button" onPress={() => router.push("/capture")} style={styles.inlineAction}><MaterialIcons name="photo-camera" size={17} color="#9CE6DD" /><Text style={styles.inlineActionText}>التصوير المباشر واستيراد الصور والفيديو</Text><MaterialIcons name="arrow-back" size={16} color="#9CE6DD" /></Pressable>
          {!hasCalibration ? <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/calibration")} style={styles.inlineAction}><Text style={styles.inlineActionText}>إتمام المعايرة الآن</Text><MaterialIcons name="arrow-back" size={16} color="#9CE6DD" /></Pressable> : null}
        </View>

        <SectionTitle title="ملخص العينات" detail="مؤشرات تنظيمية وليست نتائج تشخيصية" />
        <View style={styles.metricsGrid}>
          <MetricCard label="إجمالي العينات" value={String(samples.length)} unit="عينة" icon="inventory-2" />
          <MetricCard label="بانتظار المراجعة" value={String(pendingCount)} unit="مراجعة" tone="orange" icon="rate-review" note={pendingCount ? "تتطلب مراجعة بشرية" : "لا توجد مراجعات معلقة"} />
          <MetricCard label="المعايرة" value={hasCalibration ? "محفوظة" : "مطلوبة"} tone="teal" icon="tune" />
          <MetricCard label="آخر سجل" value={recent ? recent.id.split("-").pop() ?? "—" : "—"} unit={recent ? "معرّف" : ""} icon="analytics" />
        </View>

        {recent ? (
          <>
            <SectionTitle title="أحدث عينة" detail={formatDate(recent.receivedAt)} />
            <Pressable accessibilityRole="button" accessibilityLabel={`فتح تقرير العينة ${recent.id}`} onPress={() => router.push({ pathname: "/sample/[id]", params: { id: recent.id } })} style={styles.recentCard}>
              <View style={styles.recentTop}>
                <StatusPill label={recent.reviewStatus === "reviewed" ? "تمت المراجعة" : "تحتاج مراجعة"} tone={recent.reviewStatus === "reviewed" ? "success" : "warning"} />
                <View style={styles.recentIdRow}><Text style={styles.recentId}>{recent.id}</Text><MaterialIcons name="description" size={18} color={COLORS.tealDark} /></View>
              </View>
              <View style={styles.recentMetrics}>
                <View style={styles.recentMetric}><Text adjustsFontSizeToFit numberOfLines={1} style={styles.recentValue}>{recent.concentrationStatus === "not-calculated-missing-counting-area-or-dilution" ? "—" : recent.concentration}</Text><Text style={styles.recentLabel}>{recent.concentrationStatus === "not-calculated-missing-counting-area-or-dilution" ? "التركيز غير محسوب" : "مليون/مل"}</Text></View>
                <View style={styles.recentMetric}><Text style={styles.recentValue}>{recent.totalMotility}%</Text><Text style={styles.recentLabel}>إجمالي الحركة</Text></View>
                <View style={styles.recentMetric}><Text style={styles.recentValue}>{recent.qualityScore}%</Text><Text style={styles.recentLabel}>جودة البيانات</Text></View>
              </View>
              <QualityBar score={recent.qualityScore} label={qualityLabelText(recent.qualityLabel)} />
              <View style={styles.openReport}><Text style={styles.openReportText}>عرض تفاصيل العينة</Text><MaterialIcons name="arrow-back" size={16} color={COLORS.navy} /></View>
            </Pressable>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><MaterialIcons name="science" size={25} color={COLORS.tealDark} /></View>
            <Text style={styles.emptyTitle}>لا توجد عينات مسجلة بعد</Text>
            <Text style={styles.emptyBody}>ابدأ بإنشاء سجل عينة لإرفاق الفيديو ومتابعة خطوات التحليل والمراجعة.</Text>
          </View>
        )}

        <View style={styles.footerNote}><MaterialIcons name="lock-outline" size={15} color={COLORS.muted} /><Text style={styles.footerNoteText}>بيانات العرض محفوظة محليًا على الجهاز في هذه النسخة.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 38 },
  heroCard: { backgroundColor: COLORS.navy, borderRadius: 22, padding: 19, overflow: "hidden", marginBottom: 25, position: "relative", shadowColor: "#102A43", shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  heroGlow: { width: 180, height: 180, borderRadius: 180, backgroundColor: "#1B4B68", position: "absolute", top: -95, left: -70, opacity: 0.8 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#193C55", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: COLORS.paper, fontSize: 23, fontWeight: "900", textAlign: "right" },
  heroBody: { color: "#D2E0E8", fontSize: 13, lineHeight: 21, textAlign: "right", marginTop: 8, marginBottom: 17 },
  inlineAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 13, minHeight: 34 },
  inlineActionText: { color: "#B5EEE6", fontWeight: "800", fontSize: 12 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 9, marginBottom: 25 },
  recentCard: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 14, marginBottom: 20, shadowColor: "#17324A", shadowOpacity: 0.04, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  recentTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8 },
  recentIdRow: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 },
  recentId: { color: COLORS.navy, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  recentMetrics: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line, paddingVertical: 13, marginBottom: 13, gap: 5 },
  recentMetric: { flex: 1, alignItems: "flex-end", minWidth: 0 },
  recentValue: { color: COLORS.navy, fontSize: 18, fontWeight: "900", textAlign: "right" },
  recentLabel: { color: COLORS.muted, fontSize: 9, marginTop: 4, textAlign: "right" },
  openReport: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 13, minHeight: 28 },
  openReportText: { color: COLORS.navy, fontSize: 12, fontWeight: "800" },
  emptyCard: { alignItems: "center", backgroundColor: COLORS.paper, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 22, marginBottom: 20 },
  emptyIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: "#EAF7F5", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  emptyTitle: { color: COLORS.navy, fontSize: 15, fontWeight: "800", textAlign: "center" },
  emptyBody: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 6 },
  footerNote: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 4 },
  footerNoteText: { color: COLORS.muted, fontSize: 10, textAlign: "center" },
});
