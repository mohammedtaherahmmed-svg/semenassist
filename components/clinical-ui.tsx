import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const COLORS = {
  navy: "#102A43",
  navySoft: "#334E68",
  teal: "#25A99A",
  tealDark: "#087F75",
  sand: "#F4F7F9",
  paper: "#FFFFFF",
  ink: "#142B3B",
  muted: "#617487",
  line: "#DCE5EB",
  warning: "#A96308",
  warningBg: "#FFF6E8",
  danger: "#B33D45",
  dangerBg: "#FFF1F1",
  success: "#13795B",
  successBg: "#EAF7F1",
  info: "#28658A",
  infoBg: "#EEF6FB",
};

type IconName = ComponentProps<typeof MaterialIcons>["name"];

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.mark}>
        <MaterialIcons name="center-focus-strong" size={compact ? 19 : 23} color={COLORS.paper} />
        <View style={styles.markLine} />
      </View>
      {!compact ? (
        <View>
          <Text style={styles.brandTitle}>SemenAssist</Text>
          <Text style={styles.brandCaption}>منصة التحليل المجهري</Text>
        </View>
      ) : null}
    </View>
  );
}

export function AppHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
      </View>
      {action ?? <BrandMark compact />}
    </View>
  );
}

export function MedicalBanner({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.medicalBanner, compact && styles.medicalBannerCompact]}>
      <View style={styles.medicalIcon}>
        <MaterialIcons name="info-outline" size={18} color={COLORS.info} />
      </View>
      <Text style={styles.medicalText}>
        {compact
          ? "أداة بحثية مساعدة — لا تغني عن مراجعة المختص."
          : "تنبيه: التطبيق أداة بحثية مساعدة وليس جهازًا طبيًا معتمدًا. راجع المختص قبل اتخاذ أي قرار."}
      </Text>
    </View>
  );
}

export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionAccent} />
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function StatusPill({ label, tone = "neutral", icon }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "teal"; icon?: IconName }) {
  const toneStyle = { neutral: styles.pillNeutral, success: styles.pillSuccess, warning: styles.pillWarning, danger: styles.pillDanger, teal: styles.pillTeal }[tone];
  const textStyle = { neutral: styles.pillNeutralText, success: styles.pillSuccessText, warning: styles.pillWarningText, danger: styles.pillDangerText, teal: styles.pillTealText }[tone];
  return (
    <View style={[styles.pill, toneStyle]}>
      {icon ? <MaterialIcons name={icon} size={14} color={textStyle.color} /> : null}
      <Text style={[styles.pillText, textStyle]}>{label}</Text>
    </View>
  );
}

export function MetricCard({ label, value, unit, tone = "navy", icon, note }: { label: string; value: string; unit?: string; tone?: "navy" | "teal" | "orange"; icon: IconName; note?: string }) {
  const accent = tone === "teal" ? COLORS.tealDark : tone === "orange" ? COLORS.warning : COLORS.navy;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: tone === "orange" ? COLORS.warningBg : tone === "teal" ? "#EAF7F5" : "#EDF3F7" }]}>
        <MaterialIcons name={icon} size={19} color={accent} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      {note ? <Text style={styles.metricNote}>{note}</Text> : null}
    </View>
  );
}

export function QualityBar({ score, label }: { score: number; label: string }) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const color = safeScore >= 75 ? COLORS.success : safeScore >= 55 ? COLORS.warning : COLORS.danger;
  return (
    <View style={styles.qualityBox} accessibilityLabel={`مؤشر جودة البيانات ${safeScore} بالمئة: ${label}`}>
      <View style={styles.qualityHeader}>
        <Text style={styles.qualityTitle}>مؤشر جودة البيانات</Text>
        <Text style={[styles.qualityScore, { color }]}>{safeScore.toFixed(0)}%</Text>
      </View>
      <View style={styles.qualityTrack}>
        <View style={[styles.qualityFill, { width: `${safeScore}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.qualityLabel}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, disabled = false, loading = false }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && !disabled && !loading && styles.buttonPressed, (disabled || loading) && styles.buttonDisabled]}
    >
      {loading ? <MaterialIcons name="hourglass-top" size={19} color={COLORS.paper} /> : icon ? <MaterialIcons name={icon} size={19} color={COLORS.paper} /> : null}
      <Text style={styles.primaryButtonText}>{loading ? "جاري التنفيذ…" : label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, icon, onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}>
      {icon ? <MaterialIcons name={icon} size={18} color={COLORS.navy} /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.navy, alignItems: "center", justifyContent: "center", position: "relative" },
  markLine: { position: "absolute", width: 20, height: 2, backgroundColor: COLORS.teal, bottom: 8, right: 11, transform: [{ rotate: "-35deg" }] },
  brandTitle: { color: COLORS.navy, fontSize: 16, fontWeight: "800", textAlign: "right", letterSpacing: 0.2 },
  brandCaption: { color: COLORS.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22, paddingTop: 3 },
  headerCopy: { flex: 1, alignItems: "flex-end", paddingLeft: 12 },
  eyebrow: { color: COLORS.tealDark, fontSize: 11, fontWeight: "800", marginBottom: 6, textAlign: "right", letterSpacing: 0.2 },
  headerTitle: { color: COLORS.navy, fontSize: 29, fontWeight: "900", letterSpacing: -0.5, textAlign: "right" },
  medicalBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.infoBg, borderWidth: 1, borderColor: "#D7E8F2", borderRadius: 14, padding: 12, marginBottom: 20 },
  medicalBannerCompact: { marginBottom: 12, padding: 10 },
  medicalIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: "#DDEEF7", alignItems: "center", justifyContent: "center" },
  medicalText: { flex: 1, color: "#31566F", fontSize: 11, lineHeight: 18, textAlign: "right" },
  sectionTitleRow: { flexDirection: "row", alignItems: "stretch", gap: 9, marginBottom: 13 },
  sectionAccent: { width: 3, borderRadius: 3, backgroundColor: COLORS.teal, marginVertical: 2 },
  sectionCopy: { flex: 1, alignItems: "flex-end" },
  sectionTitle: { color: COLORS.navy, fontSize: 17, fontWeight: "800", textAlign: "right" },
  sectionDetail: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 4, textAlign: "right" },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  pillText: { fontSize: 10, fontWeight: "800" },
  pillNeutral: { backgroundColor: "#EDF2F5" }, pillNeutralText: { color: COLORS.muted },
  pillSuccess: { backgroundColor: COLORS.successBg }, pillSuccessText: { color: COLORS.success },
  pillWarning: { backgroundColor: COLORS.warningBg }, pillWarningText: { color: COLORS.warning },
  pillDanger: { backgroundColor: COLORS.dangerBg }, pillDangerText: { color: COLORS.danger },
  pillTeal: { backgroundColor: "#E7F6F3" }, pillTealText: { color: COLORS.tealDark },
  metricCard: { width: "48.5%", minHeight: 140, backgroundColor: COLORS.paper, borderRadius: 17, padding: 14, borderWidth: 1, borderColor: COLORS.line, shadowColor: "#17324A", shadowOpacity: 0.045, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  metricIcon: { width: 35, height: 35, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 11 },
  metricLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "600", textAlign: "right" },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: 5, justifyContent: "flex-end", marginTop: 5 },
  metricValue: { color: COLORS.navy, fontSize: 23, fontWeight: "900", flexShrink: 1 },
  metricUnit: { color: COLORS.muted, fontSize: 10 },
  metricNote: { color: COLORS.muted, fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 6 },
  qualityBox: { backgroundColor: COLORS.paper, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, padding: 15 },
  qualityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qualityTitle: { color: COLORS.navy, fontWeight: "800", fontSize: 13 },
  qualityScore: { fontSize: 19, fontWeight: "900" },
  qualityTrack: { height: 9, backgroundColor: "#EAF0F3", borderRadius: 9, overflow: "hidden", marginTop: 11 },
  qualityFill: { height: "100%", borderRadius: 9 },
  qualityLabel: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 8, textAlign: "right" },
  primaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: COLORS.navy, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 18 },
  primaryButtonText: { color: COLORS.paper, fontSize: 14, fontWeight: "800" },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.48 },
  secondaryButton: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.paper, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 15 },
  secondaryButtonText: { color: COLORS.navy, fontSize: 13, fontWeight: "800" },
  secondaryPressed: { backgroundColor: "#F1F6F8" },
  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 16 },
});
