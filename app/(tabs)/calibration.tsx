import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, PrimaryButton, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { loadCalibration, saveCalibration, type CalibrationRecord } from "@/lib/sample-store";
import { formatDate } from "@/lib/sample-types";

export default function CalibrationScreen() {
  const [calibration, setCalibration] = useState<CalibrationRecord | null>(null);
  const [microns, setMicrons] = useState("0.42");
  const [depth, setDepth] = useState("20");
  const [setupLabel, setSetupLabel] = useState("هاتف المختبر · عدسة 40x");
  const [saved, setSaved] = useState(false);

  useFocusEffect(useCallback(() => { loadCalibration().then((value) => { if (value) { setCalibration(value); setMicrons(String(value.micronsPerPixel)); setDepth(String(value.chamberDepth)); setSetupLabel(value.setupLabel); } }); }, []));

  async function handleSave() {
    const mpp = Number(microns.replace(",", "."));
    const chamber = Number(depth.replace(",", "."));
    if (!Number.isFinite(mpp) || mpp <= 0 || !Number.isFinite(chamber) || chamber <= 0) return;
    const record: CalibrationRecord = { micronsPerPixel: mpp, chamberDepth: chamber, setupLabel, calibratedAt: new Date().toISOString() };
    await saveCalibration(record);
    setCalibration(record);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="إعداد قبل القياس" title="المعايرة" />
    <MedicalBanner compact />
    <View style={styles.statusCard}><View style={styles.statusIcon}><MaterialIcons name="tune" size={25} color={COLORS.tealDark} /></View><View style={styles.statusCopy}><StatusPill label={calibration ? "معايرة محفوظة" : "المعايرة مطلوبة"} tone={calibration ? "success" : "warning"} /><Text style={styles.statusTitle}>{calibration ? "الإعداد الحالي جاهز للتحليل" : "ثبّت إعداد الميكروسكوب أولًا"}</Text><Text style={styles.statusBody}>{calibration ? `آخر حفظ: ${formatDate(calibration.calibratedAt)}` : "تغيّر الهاتف أو التكبير أو الإضاءة يعني أن النسبة قد تحتاج إعادة ضبط."}</Text></View></View>
    <SectionTitle title="قيم القياس" detail="القيم الموجبة فقط تُحفظ كمعايرة صالحة" />
    <View style={styles.formCard}>
      <Field label="ميكرومتر / بكسل" value={microns} onChangeText={setMicrons} hint="مثال: 0.42" />
      <Field label="عمق الحجرة (ميكرومتر)" value={depth} onChangeText={setDepth} hint="Makler الافتراضي: 20" />
      <Field label="اسم الإعداد" value={setupLabel} onChangeText={setSetupLabel} hint="لتمييز أكثر من جهاز" />
      <PrimaryButton label="حفظ المعايرة" icon="save" onPress={handleSave} />
      {saved ? <View style={styles.savedRow}><MaterialIcons name="check-circle" size={17} color={COLORS.success} /><Text style={styles.savedText}>تم الحفظ — يمكنك بدء تحليل جديد</Text></View> : null}
    </View>
    <View style={styles.stepsCard}><Text style={styles.stepsTitle}>قبل الضغط على حفظ</Text>{["ثبّت الهاتف فوق مجال الرؤية بدون اهتزاز.", "استخدم شريحة معايرة معروفة ومجال إضاءة ثابت.", "أعد المعايرة عند تغيير العدسة أو الجهاز."].map((step, index) => <View key={step} style={styles.stepRow}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View><Text style={styles.stepText}>{step}</Text></View>)}</View>
    <Pressable onPress={() => { setCalibration(null); setMicrons(""); setDepth("20"); }} style={styles.resetButton}><MaterialIcons name="refresh" size={17} color={COLORS.danger} /><Text style={styles.resetText}>مسح المعايرة المحلية</Text></Pressable>
  </ScrollView></ScreenContainer>;
}

function Field({ label, value, onChangeText, hint }: { label: string; value: string; onChangeText: (value: string) => void; hint: string }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={hint} placeholderTextColor="#A0ACB6" keyboardType="decimal-pad" style={styles.input} textAlign="right" /></View>; }

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 42 },
  statusCard: { backgroundColor: "#EAF8F2", borderRadius: 20, padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 25 },
  statusIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.paper, alignItems: "center", justifyContent: "center" },
  statusCopy: { flex: 1, alignItems: "flex-end" },
  statusTitle: { color: COLORS.navy, fontSize: 16, fontWeight: "800", marginTop: 10, textAlign: "right" },
  statusBody: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginTop: 5, textAlign: "right" },
  formCard: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 20, padding: 16, marginBottom: 16 },
  field: { marginBottom: 14 },
  fieldLabel: { color: COLORS.navy, fontSize: 13, fontWeight: "700", textAlign: "right", marginBottom: 7 },
  input: { height: 48, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: "#FCFBF9", color: COLORS.navy, paddingHorizontal: 13, fontSize: 14 },
  savedRow: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", marginTop: 13 },
  savedText: { color: COLORS.success, fontSize: 12, fontWeight: "700" },
  stepsCard: { backgroundColor: COLORS.navy, borderRadius: 20, padding: 18, marginTop: 4 },
  stepsTitle: { color: COLORS.paper, fontSize: 16, fontWeight: "800", textAlign: "right", marginBottom: 14 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#2C596B", alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: "#AEE9E1", fontWeight: "800", fontSize: 12 },
  stepText: { flex: 1, color: "#D6E2E7", fontSize: 12, lineHeight: 19, textAlign: "right" },
  resetButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 18 },
  resetText: { color: COLORS.danger, fontSize: 12, fontWeight: "700" },
});
