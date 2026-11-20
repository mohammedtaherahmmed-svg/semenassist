import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader, COLORS, Divider, MedicalBanner, PrimaryButton, SecondaryButton, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";

const roleLabels = { technician: "فني مختبر", supervisor: "مشرف", admin: "مدير النظام" } as const;

export default function SettingsScreen() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow="الحساب والسياسات" title="الإعدادات" />
    <MedicalBanner />
    <View style={styles.accountCard}>
      <View style={styles.avatar}><MaterialIcons name={user ? "verified-user" : "person-outline"} size={25} color={COLORS.teal} /></View>
      <View style={styles.accountCopy}>
        <Text style={styles.accountTitle}>{loading ? "جاري التحقق…" : user?.name || "لم يتم تسجيل الدخول"}</Text>
        <Text style={styles.accountText}>{user ? `${roleLabels[user.role]} · التخزين الدائم مفعّل` : "سجّل الدخول لحفظ التقارير على خادم المختبر"}</Text>
      </View>
      <StatusPill label={user ? roleLabels[user.role] : "ضيف"} tone={user ? "success" : "warning"} />
    </View>
    {user ? <SecondaryButton label="تسجيل الخروج" icon="logout" onPress={logout} /> : <PrimaryButton label="تسجيل الدخول بحساب المختبر" icon="login" onPress={() => { void startOAuthLogin(); }} />}

    <SectionTitle title="تشخيص التطبيق" detail="لعرض الأخطاء المحفوظة ومشاركتها مع الدعم الفني" />
    <SecondaryButton label="فتح سجل الأخطاء والتشخيص" icon="bug-report" onPress={() => router.push("/diagnostics")} />

    <SectionTitle title="صلاحيات العمل" detail="كل إجراء حساس يُسجّل باسم المستخدم" />
    <View style={styles.permissionCard}>
      {[ ["science", "الفني", "ينشئ العينة، يشغّل التحليل، ويضيف المراجعة البشرية."], ["supervisor-account", "المشرف", "يراجع التقارير ويشاهد سجل التدقيق ويعتمد إجراءات المختبر."], ["admin-panel-settings", "مدير النظام", "يدير الأدوار ويضبط صلاحيات الحسابات." ]].map(([icon, title, body]) => <View key={title} style={styles.permissionRow}><View style={styles.listIcon}><MaterialIcons name={icon as any} size={18} color={COLORS.tealDark} /></View><View style={styles.listCopy}><Text style={styles.listTitle}>{title}</Text><Text style={styles.listBody}>{body}</Text></View></View>)}
    </View>

    <SectionTitle title="كيف يعمل AI هنا؟" detail="تفسير تعليمي، وليس قرارًا طبيًا" />
    <View style={styles.aiCard}><View style={styles.aiIcon}><MaterialIcons name="auto-awesome" size={22} color={COLORS.tealDark} /></View><Text style={styles.aiTitle}>المساعد يشرح البيانات ولا يشخّص</Text><Text style={styles.aiBody}>يقرأ المساعد مؤشرات التقرير وجودة الفيديو والتنبيهات، ثم يصوغ ملخصًا عربيًا يوضح ما يحتاجه الفني للمراجعة. لا يصف علاجًا ولا يجزم بالخصوبة.</Text><View style={styles.aiRow}><MaterialIcons name="lock" size={16} color={COLORS.tealDark} /><Text style={styles.aiRowText}>مفتاح الخدمة يبقى على الخادم ولا يدخل التطبيق.</Text></View></View>
    <SectionTitle title="سلوك المراجعة" detail="الإنسان داخل الحلقة، وليس بعد فوات الأوان" />
    <View style={styles.listCard}>{[["verified", "المعايرة", "لا يبدأ القياس قبل تسجيل إعداد صالح."], ["rate-review", "المراجعة البشرية", "كل رقم قابل للتصحيح مع ملاحظة فني."], ["cloud-done", "التخزين الدائم", "التقرير يُحفظ على قاعدة المختبر بعد تسجيل الدخول."], ["history", "سجل التدقيق", "الحفظ والمراجعة وتغيير الأدوار تُسجّل تلقائيًا."]].map(([icon, title, body]) => <View key={title} style={styles.listRow}><View style={styles.listIcon}><MaterialIcons name={icon as any} size={18} color={COLORS.tealDark} /></View><View style={styles.listCopy}><Text style={styles.listTitle}>{title}</Text><Text style={styles.listBody}>{body}</Text></View></View>)}</View>
    <Divider /><Text style={styles.legalTitle}>حدود النسخة الحالية</Text><Text style={styles.legalText}>تحليل الشكل (Morphology) غير مفعّل بعد. خوارزمية OpenCV الحالية فحص بحثي قابل للتدقيق وليست جهازًا طبيًا معتمدًا؛ يجب مقارنتها بعينات مرجعية وعدّ يدوي قبل أي استخدام فعلي.</Text>
    <View style={styles.version}><Text style={styles.versionText}>Semen Assist · Calm Clinical Instrument</Text></View>
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 42 },
  accountCard: { backgroundColor: COLORS.navy, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#193C55", alignItems: "center", justifyContent: "center" },
  accountCopy: { flex: 1, alignItems: "flex-end" },
  accountTitle: { color: COLORS.paper, fontWeight: "800", fontSize: 15, textAlign: "right" },
  accountText: { color: "#B8CDD5", fontSize: 11, marginTop: 4, textAlign: "right" },
  permissionCard: { backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, padding: 15, marginBottom: 25 },
  permissionRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9 },
  aiCard: { backgroundColor: "#E6F8F5", borderRadius: 20, padding: 18, marginBottom: 25 },
  aiIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.paper, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  aiTitle: { color: COLORS.navy, fontSize: 17, fontWeight: "800", textAlign: "right" },
  aiBody: { color: COLORS.navySoft, fontSize: 13, lineHeight: 21, textAlign: "right", marginTop: 7 },
  aiRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 14 },
  aiRowText: { color: COLORS.tealDark, fontSize: 11, fontWeight: "700" },
  listCard: { backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, padding: 15 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9 },
  listIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: "#E6F8F5", alignItems: "center", justifyContent: "center" },
  listCopy: { flex: 1, alignItems: "flex-end" },
  listTitle: { color: COLORS.navy, fontSize: 13, fontWeight: "800", textAlign: "right" },
  listBody: { color: COLORS.muted, fontSize: 11, lineHeight: 17, marginTop: 2, textAlign: "right" },
  legalTitle: { color: COLORS.navy, fontSize: 15, fontWeight: "800", textAlign: "right", marginBottom: 7 },
  legalText: { color: COLORS.muted, fontSize: 12, lineHeight: 20, textAlign: "right" },
  version: { alignItems: "center", marginTop: 28 },
  versionText: { color: COLORS.muted, fontSize: 10 },
});
