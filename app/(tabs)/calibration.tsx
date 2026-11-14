import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, PrimaryButton, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { loadCalibration, saveCalibration, type CalibrationRecord } from "@/lib/sample-store";
import { formatDate } from "@/lib/sample-types";
import { calculateMicronsPerPixel, validateCalibration } from "@/shared/vision-quality";

export default function CalibrationScreen() {
  const [calibration, setCalibration] = useState<CalibrationRecord | null>(null);
  const [microns, setMicrons] = useState("");
  const [depth, setDepth] = useState("20");
  const [setupLabel, setSetupLabel] = useState("هاتف المختبر · عدسة 40x");
  const [referenceLength, setReferenceLength] = useState("10");
  const [measuredPixels, setMeasuredPixels] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    loadCalibration().then((value) => {
      if (!active) return;
      setCalibration(value);
      if (value) {
        setMicrons(String(value.micronsPerPixel));
        setDepth(String(value.chamberDepth));
        setSetupLabel(value.setupLabel);
      }
    });
    return () => { active = false; };
  }, []));

  function calculateScale() {
    try {
      const result = calculateMicronsPerPixel(Number(referenceLength.replace(",", ".")), Number(measuredPixels.replace(",", ".")));
      setMicrons(String(Number(result.toPrecision(8))));
      setError("");
    } catch (calculationError) {
      setError(calculationError instanceof Error ? calculationError.message : "تعذر حساب مقياس الصورة.");
    }
  }

  async function handleSave() {
    const record: CalibrationRecord = {
      micronsPerPixel: Number(microns.replace(",", ".")),
      chamberDepth: Number(depth.replace(",", ".")),
      setupLabel,
      calibratedAt: new Date().toISOString(),
    };
    const validationError = validateCalibration(record);
    if (validationError) {
      setError(validationError);
      setSaved(false);
      return;
    }
    await saveCalibration(record);
    setCalibration(record);
    setError("");
    setSaved(true);
  }

  function clearCalibration() {
    setCalibration(null);
    setMicrons("");
    setDepth("20");
    setError("");
    setSaved(false);
  }

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="إعداد قبل القياس" title="المعايرة" />
    <MedicalBanner compact />
    <View style={styles.statusCard}>
      <View style={styles.statusIcon}><MaterialIcons name="tune" size={25} color={COLORS.tealDark} /></View>
      <View style={styles.statusCopy}>
        <StatusPill label={calibration ? "معايرة محفوظة" : "المعايرة مطلوبة"} tone={calibration ? "success" : "warning"} />
        <Text style={styles.statusTitle}>{calibration ? "إعداد محفوظ — تحقق من ثبات المنظومة" : "عاير النظام باستخدام مرجع معلوم"}</Text>
        <Text style={styles.statusBody}>{calibration ? `آخر معايرة: ${formatDate(calibration.calibratedAt)} · ${calibration.setupLabel}` : "لا تستخدم قيمة افتراضية. احسب المقياس من شريحة معايرة أو مرجع ميكرومتري معلوم."}</Text>
      </View>
    </View>

    <SectionTitle title="حساب المقياس من مرجع" detail="الطول الحقيقي بالميكرومتر ÷ طوله المقاس بالبكسل" />
    <View style={styles.formCard}>
      <Field label="طول المرجع المعروف (µm)" value={referenceLength} onChangeText={setReferenceLength} hint="مثال: 10" />
      <Field label="طول المرجع على الصورة (pixel)" value={measuredPixels} onChangeText={setMeasuredPixels} hint="مثال: 200" />
      <Pressable onPress={calculateScale} style={styles.calculateButton}><MaterialIcons name="calculate" size={18} color={COLORS.paper} /><Text style={styles.calculateText}>حساب µm / pixel</Text></Pressable>
      <View style={styles.resultBox}><Text style={styles.resultLabel}>المقياس المحسوب</Text><Text style={styles.resultValue}>{microns ? `${microns} µm/pixel` : "لم يتم الحساب بعد"}</Text></View>
    </View>

    <SectionTitle title="إعداد غرفة القياس" detail="احفظ القيم بعد تثبيت العدسة والكاميرا وغرفة العد" />
    <View style={styles.formCard}>
      <Field label="ميكرومتر / بكسل" value={microns} onChangeText={setMicrons} hint="يُحسب من المرجع أعلاه" />
      <Field label="عمق الحجرة (µm)" value={depth} onChangeText={setDepth} hint="أدخل العمق الفعلي للحجرة" />
      <Field label="اسم الإعداد" value={setupLabel} onChangeText={setSetupLabel} hint="الهاتف · العدسة · الحجرة" />
      <PrimaryButton label="حفظ المعايرة" icon="save" onPress={handleSave} />
      {error ? <View style={styles.errorRow}><MaterialIcons name="error-outline" size={17} color={COLORS.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
      {saved ? <View style={styles.savedRow}><MaterialIcons name="check-circle" size={17} color={COLORS.success} /><Text style={styles.savedText}>تم حفظ المعايرة المحلية</Text></View> : null}
    </View>

    <View style={styles.stepsCard}>
      <Text style={styles.stepsTitle}>إجراء المعايرة</Text>
      {["استخدم شريحة stage micrometer أو مرجعًا معلوم الأبعاد.", "قِس عدة تدريجات في الصورة لتقليل خطأ تحديد الحافة.", "استخدم نفس الهاتف والعدسة والتكبير وغرفة العد أثناء التحليل.", "أعد المعايرة بعد تغيير أي عنصر بصري أو ميكانيكي."].map((step, index) => <View key={step} style={styles.stepRow}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View><Text style={styles.stepText}>{step}</Text></View>)}
    </View>
    <Pressable onPress={clearCalibration} style={styles.resetButton}><MaterialIcons name="refresh" size={17} color={COLORS.danger} /><Text style={styles.resetText}>إلغاء المعايرة المحفوظة</Text></Pressable>
  </ScrollView></ScreenContainer>;
}

function Field({ label, value, onChangeText, hint }: { label: string; value: string; onChangeText: (value: string) => void; hint: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={hint} placeholderTextColor="#A0ACB6" keyboardType="decimal-pad" style={styles.input} textAlign="right" /></View>;
}

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
  calculateButton: { minHeight: 46, borderRadius: 13, backgroundColor: COLORS.navy, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  calculateText: { color: COLORS.paper, fontSize: 13, fontWeight: "800" },
  resultBox: { backgroundColor: "#F0F6F5", borderRadius: 12, padding: 12, marginTop: 12 },
  resultLabel: { color: COLORS.muted, fontSize: 11, textAlign: "right" },
  resultValue: { color: COLORS.navy, fontSize: 16, fontWeight: "800", textAlign: "right", marginTop: 4 },
  errorRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 12 },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 12, textAlign: "right" },
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
