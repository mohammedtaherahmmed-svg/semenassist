import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { clearDiagnostics, readDiagnostics, type DiagnosticEntry, recordDiagnostic } from "@/lib/diagnostics";

export default function DiagnosticsScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setEntries(await readDiagnostics());
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const exportLogs = async () => {
    const latest = await readDiagnostics();
    const report = [
      "SemenAssist diagnostic report",
      `Exported: ${new Date().toISOString()}`,
      `Platform: ${latest.at(-1)?.platform ?? "unknown"}`,
      "",
      ...latest.map((entry) => [
        `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.event}`,
        entry.message ? `Message: ${entry.message}` : "",
        entry.stack ? `Stack:\\n${entry.stack}` : "",
        entry.fatal ? "Fatal: yes" : "",
      ].filter(Boolean).join("\\n")),
    ].join("\\n\\n");
    await Share.share({ title: "SemenAssist diagnostic logs", message: report });
  };

  const clearLogs = async () => {
    await clearDiagnostics();
    await recordDiagnostic("diagnostics.cleared-by-user");
    await refresh();
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>رجوع</Text></Pressable>
        <Text style={styles.title}>سجل تشخيص التطبيق</Text>
        <Text style={styles.subtitle}>يُحفظ السجل محليًا على الهاتف، ويمكن مشاركته عند حدوث مشكلة لمراجعة وقت الخطأ ومصدره.</Text>
        <View style={styles.summary}>
          <Text style={styles.summaryNumber}>{entries.length}</Text>
          <Text style={styles.summaryLabel}>حدث محفوظ</Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={() => void exportLogs()} style={styles.primary}><Text style={styles.primaryText}>تصدير / مشاركة السجل</Text></Pressable>
          <Pressable onPress={() => void refresh()} style={styles.secondary}><Text style={styles.secondaryText}>تحديث</Text></Pressable>
          <Pressable onPress={() => void clearLogs()} style={styles.secondary}><Text style={styles.secondaryText}>مسح السجل</Text></Pressable>
        </View>
        {loading ? <ActivityIndicator /> : entries.length === 0 ? <Text style={styles.empty}>لا توجد أحداث مسجلة بعد.</Text> : [...entries].reverse().map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <View style={styles.entryHeader}>
              <Text style={styles.event}>{entry.event}</Text>
              <Text style={[styles.level, entry.level === "error" && styles.error]}>{entry.level === "error" ? "خطأ" : "معلومة"}</Text>
            </View>
            <Text style={styles.date}>{entry.timestamp} · {entry.platform}</Text>
            {!!entry.message && <Text selectable style={styles.message}>{entry.message}</Text>}
            {!!entry.stack && <Text selectable style={styles.stack}>{entry.stack}</Text>}
            {entry.fatal && <Text style={styles.fatal}>توقف حرج (Fatal)</Text>}
          </View>
        ))}
        <Text style={styles.note}>ملاحظة: السجل يلتقط أخطاء JavaScript ومراحل بدء التطبيق. الأعطال الأصلية التي تُنهي Android process بالكامل قد تتطلب Android Logcat.</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { color: "#147D78", fontWeight: "700" },
  title: { color: "#102A43", fontSize: 23, fontWeight: "800", textAlign: "right", marginTop: 10 },
  subtitle: { color: "#627D98", fontSize: 13, lineHeight: 21, textAlign: "right", marginTop: 8 },
  summary: { backgroundColor: "#E6F8F5", borderRadius: 16, padding: 16, marginTop: 18, alignItems: "center" },
  summaryNumber: { color: "#102A43", fontSize: 28, fontWeight: "800" },
  summaryLabel: { color: "#486581", fontSize: 12 },
  actions: { gap: 9, marginVertical: 16 },
  primary: { backgroundColor: "#147D78", borderRadius: 12, padding: 14, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontWeight: "800" },
  secondary: { borderColor: "#BCCCDC", borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  secondaryText: { color: "#243B53", fontWeight: "700" },
  empty: { color: "#627D98", textAlign: "center", padding: 24 },
  entry: { backgroundColor: "#FFFFFF", borderColor: "#D9E2EC", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 9 },
  entryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  event: { color: "#102A43", fontWeight: "800", flex: 1, textAlign: "right" },
  level: { color: "#147D78", fontSize: 11, fontWeight: "800" },
  error: { color: "#B42318" },
  date: { color: "#829AB1", fontSize: 10, marginTop: 6, textAlign: "right" },
  message: { color: "#334E68", fontSize: 12, marginTop: 8, textAlign: "left" },
  stack: { color: "#627D98", fontSize: 10, marginTop: 6, textAlign: "left" },
  fatal: { color: "#B42318", fontSize: 11, fontWeight: "800", marginTop: 6 },
  note: { color: "#627D98", fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 16 },
});
