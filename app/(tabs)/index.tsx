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
  const isReady = Boolean(calibration);

  return (
    <ScreenContainer containerClassName="bg-background" safeAreaClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader eyebrow="مساحة العمل · فني المختبر" title="صباحك أدق" />
        <MedicalBanner />

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <StatusPill label={isReady ? "الإعداد جاهز" : "المعايرة مطلوبة"} tone={isReady ? "success" : "warning"} icon={isReady ? "verified" : "tune"} />
            <View style={styles.heroIcon}><MaterialIcons name="biotech" size={25} color={COLORS.teal} /></View>
          </View>
          <Text style={styles.heroTitle}>ابدأ من جودة العينة</Text>
          <Text style={styles.heroBody}>
            {isReady ? "المعايرة الحالية صالحة. أنشئ سجلًا جديدًا واربط به فيديو العينة." : "أدخل قيم معايرة إعداد الميكروسكوب قبل أول تحليل للحصول على قراءة قابلة للمراجعة."}
          </Text>
          <PrimaryButton label="إنشاء عينة جديدة" icon="add-circle-outline" onPress={() => router.push("/sample/new")} />
          {!isReady ? <Pressable onPress={() => router.push("/(tabs)/calibration")} style={styles.inlineAction}><Text style={styles.inlineActionText}>إتمام المعايرة الآن</Text><MaterialIcons name="arrow-back" size={16} color={COLORS.tealDark} /></Pressable> : null}
        </View>

        <SectionTitle title="لمحة اليوم" detail="الأرقام للتنظيم وليست حكمًا طبيًا" />
        <View style={styles.metricsGrid}>
          <MetricCard label="إجمالي العينات" value={String(samples.length)} unit="عينة" icon="inventory-2" />
          <MetricCard label="بانتظار المراجعة" value={String(pendingCount)} unit="مراجعة" tone="orange" icon="rate-review" note={pendingCount ? "ابدأ بالمراجعة البشرية" : "كل شيء مراجع"} />
          <MetricCard label="حالة المعايرة" value={isReady ? "صالحة" : "—"} tone="teal" icon="tune" />
          <MetricCard label="آخر تحليل" value={recent ? recent.id.split("-").pop() ?? "—" : "—"} unit={recent ? "عينة" : ""} icon="analytics" />
        </View>

        {recent ? (
          <>
            <SectionTitle title="آخر تحليل" detail={formatDate(recent.receivedAt)} />
            <Pressable onPress={() => router.push({ pathname: "/sample/[id]", params: { id: recent.id } })} style={styles.recentCard}>
              <View style={styles.recentTop}>
                <StatusPill label={recent.reviewStatus === "reviewed" ? "تمت المراجعة" : "تحتاج مراجعة"} tone={recent.reviewStatus === "reviewed" ? "success" : "warning"} />
                <View style={styles.recentIdRow}><Text style={styles.recentId}>{recent.id}</Text><MaterialIcons name="description" size={18} color={COLORS.tealDark} /></View>
              </View>
              <View style={styles.recentMetrics}>
                <View><Text style={styles.recentValue}>{recent.concentration}</Text><Text style={styles.recentLabel}>مليون/مل تركيز</Text></View>
                <View><Text style={styles.recentValue}>{recent.totalMotility}%</Text><Text style={styles.recentLabel}>إجمالي الحركة</Text></View>
                <View><Text style={styles.recentValue}>{recent.qualityScore}%</Text><Text style={styles.recentLabel}>جودة البيانات</Text></View>
              </View>
              <QualityBar score={recent.qualityScore} label={qualityLabelText(recent.qualityLabel)} />
              <View style={styles.openReport}><Text style={styles.openReportText}>فتح التقرير</Text><MaterialIcons name="arrow-back" size={16} color={COLORS.navy} /></View>
            </Pressable>
          </>
        ) : null}

        <View style={styles.footerNote}><MaterialIcons name="lock-outline" size={15} color={COLORS.muted} /><Text style={styles.footerNoteText}>بيانات العرض محفوظة على الجهاز في هذه النسخة التجريبية.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 42 },
  heroCard: { backgroundColor: COLORS.navy, borderRadius: 24, padding: 20, overflow: "hidden", marginBottom: 25, position: "relative" },
  heroGlow: { width: 180, height: 180, borderRadius: 180, backgroundColor: "#1B4B68", position: "absolute", top: -95, left: -70, opacity: 0.8 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#193C55", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: COLORS.paper, fontSize: 24, fontWeight: "800", textAlign: "right" },
  heroBody: { color: "#C4D5DD", fontSize: 14, lineHeight: 22, textAlign: "right", marginTop: 8, marginBottom: 18 },
  inlineAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 },
  inlineActionText: { color: "#9CE6DD", fontWeight: "700", fontSize: 13 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10, marginBottom: 25 },
  recentCard: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, padding: 16, marginBottom: 20 },
  recentTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  recentIdRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  recentId: { color: COLORS.navy, fontSize: 15, fontWeight: "800" },
  recentMetrics: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line, paddingVertical: 14, marginBottom: 14 },
  recentValue: { color: COLORS.navy, fontSize: 20, fontWeight: "800", textAlign: "right" },
  recentLabel: { color: COLORS.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  openReport: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 15 },
  openReportText: { color: COLORS.navy, fontSize: 13, fontWeight: "800" },
  footerNote: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 4 },
  footerNoteText: { color: COLORS.muted, fontSize: 11, textAlign: "center" },
});
