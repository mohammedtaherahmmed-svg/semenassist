import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const COLORS = {
  navy: "#102A43",
  navySoft: "#243B53",
  teal: "#27B8A6",
  tealDark: "#168D80",
  sand: "#F7F4EE",
  paper: "#FFFFFF",
  ink: "#102A43",
  muted: "#6B7C93",
  line: "#E6E0D5",
  warning: "#D97706",
  warningBg: "#FFF5E6",
  danger: "#B54747",
  dangerBg: "#FFF0EF",
  success: "#168D63",
  successBg: "#EAF8F2",
};

type IconName = ComponentProps<typeof MaterialIcons>["name"];

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.mark}>
        <MaterialIcons name="center-focus-strong" size={compact ? 18 : 22} color={COLORS.paper} />
        <View style={styles.markLine} />
      </View>
      {!compact ? (
        <View>
          <Text style={styles.brandTitle}>Semen Assist</Text>
          <Text style={styles.brandCaption}>مختبرك في جيبك</Text>
        </View>
      ) : null}
    </View>
  );
}

export function AppHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {action ?? <BrandMark compact />}
    </View>
  );
}

export function MedicalBanner({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.medicalBanner, compact && styles.medicalBannerCompact]}>
      <View style={styles.medicalIcon}>
        <MaterialIcons name="health-and-safety" size={18} color={COLORS.warning} />
      </View>
      <Text style={styles.medicalText}>
        {compact
          ? "نتيجة بحثية مساعدة — لا تغني عن مراجعة المختص."
          : "تنبيه طبي: التطبيق أداة بحثية مساعدة، وليس جهازًا طبيًا معتمدًا. راجع الفني أو الطبيب قبل أي قرار."}
      </Text>
    </View>
  );
}

export function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "teal";
  icon?: IconName;
}) {
  const toneStyle = {
    neutral: styles.pillNeutral,
    success: styles.pillSuccess,
    warning: styles.pillWarning,
    danger: styles.pillDanger,
    teal: styles.pillTeal,
  }[tone];
  const textStyle = {
    neutral: styles.pillNeutralText,
    success: styles.pillSuccessText,
    warning: styles.pillWarningText,
    danger: styles.pillDangerText,
    teal: styles.pillTealText,
  }[tone];
  return (
    <View style={[styles.pill, toneStyle]}>
      {icon ? <MaterialIcons name={icon} size={14} color={textStyle.color} /> : null}
      <Text style={[styles.pillText, textStyle]}>{label}</Text>
    </View>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  tone = "navy",
  icon,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "navy" | "teal" | "orange";
  icon: IconName;
  note?: string;
}) {
  const accent = tone === "teal" ? COLORS.teal : tone === "orange" ? COLORS.warning : COLORS.navy;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${accent}16` }]}>
        <MaterialIcons name={icon} size={19} color={accent} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      {note ? <Text style={styles.metricNote}>{note}</Text> : null}
    </View>
  );
}

export function QualityBar({ score, label }: { score: number; label: string }) {
  const color = score >= 75 ? COLORS.success : score >= 55 ? COLORS.warning : COLORS.danger;
  return (
    <View style={styles.qualityBox}>
      <View style={styles.qualityHeader}>
        <Text style={styles.qualityTitle}>جودة البيانات</Text>
        <Text style={[styles.qualityScore, { color }]}>{score}%</Text>
      </View>
      <View style={styles.qualityTrack}>
        <View style={[styles.qualityFill, { width: `${Math.max(4, Math.min(100, score))}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.qualityLabel}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, (pressed || disabled || loading) && styles.buttonPressed]}
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
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.navy, alignItems: "center", justifyContent: "center", position: "relative" },
  markLine: { position: "absolute", width: 20, height: 2, backgroundColor: COLORS.teal, bottom: 8, right: 10, transform: [{ rotate: "-35deg" }] },
  brandTitle: { color: COLORS.navy, fontSize: 16, fontWeight: "800", textAlign: "right" },
  brandCaption: { color: COLORS.muted, fontSize: 11, marginTop: 2, textAlign: "right" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  headerCopy: { flex: 1, alignItems: "flex-end" },
  eyebrow: { color: COLORS.tealDark, fontSize: 12, fontWeight: "700", marginBottom: 5, textAlign: "right" },
  headerTitle: { color: COLORS.navy, fontSize: 28, fontWeight: "800", letterSpacing: -0.3, textAlign: "right" },
  medicalBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: COLORS.warningBg, borderWidth: 1, borderColor: "#F6D7A7", borderRadius: 16, padding: 13, marginBottom: 18 },
  medicalBannerCompact: { marginBottom: 10, padding: 10 },
  medicalIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#FFE7BF", alignItems: "center", justifyContent: "center" },
  medicalText: { flex: 1, color: "#7A4A08", fontSize: 12, lineHeight: 19, textAlign: "right" },
  sectionTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: COLORS.navy, fontSize: 18, fontWeight: "800", textAlign: "right" },
  sectionDetail: { color: COLORS.muted, fontSize: 12, marginTop: 4, textAlign: "right" },
  pill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  pillText: { fontSize: 11, fontWeight: "700" },
  pillNeutral: { backgroundColor: "#EEF2F5" }, pillNeutralText: { color: COLORS.muted },
  pillSuccess: { backgroundColor: COLORS.successBg }, pillSuccessText: { color: COLORS.success },
  pillWarning: { backgroundColor: COLORS.warningBg }, pillWarningText: { color: COLORS.warning },
  pillDanger: { backgroundColor: COLORS.dangerBg }, pillDangerText: { color: COLORS.danger },
  pillTeal: { backgroundColor: "#E6F8F5" }, pillTealText: { color: COLORS.tealDark },
  metricCard: { width: "48.2%", minHeight: 142, backgroundColor: COLORS.paper, borderRadius: 18, padding: 15, borderWidth: 1, borderColor: COLORS.line, shadowColor: "#0F172A", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  metricIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  metricLabel: { color: COLORS.muted, fontSize: 12, textAlign: "right" },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: 5, justifyContent: "flex-end", marginTop: 4 },
  metricValue: { color: COLORS.navy, fontSize: 24, fontWeight: "800" },
  metricUnit: { color: COLORS.muted, fontSize: 11 },
  metricNote: { color: COLORS.muted, fontSize: 10, textAlign: "right", marginTop: 7 },
  qualityBox: { backgroundColor: COLORS.paper, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 16 },
  qualityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qualityTitle: { color: COLORS.navy, fontWeight: "800", fontSize: 15 },
  qualityScore: { fontSize: 20, fontWeight: "800" },
  qualityTrack: { height: 8, backgroundColor: "#EEF1F1", borderRadius: 8, overflow: "hidden", marginTop: 12 },
  qualityFill: { height: "100%", borderRadius: 8 },
  qualityLabel: { color: COLORS.muted, fontSize: 12, marginTop: 9, textAlign: "right" },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: COLORS.navy, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  primaryButtonText: { color: COLORS.paper, fontSize: 15, fontWeight: "800" },
  buttonPressed: { opacity: 0.55 },
  secondaryButton: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.paper, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 15 },
  secondaryButtonText: { color: COLORS.navy, fontSize: 14, fontWeight: "700" },
  secondaryPressed: { backgroundColor: COLORS.sand },
  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 16 },
});
