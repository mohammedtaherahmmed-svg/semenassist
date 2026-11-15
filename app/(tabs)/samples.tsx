import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, COLORS, MedicalBanner, QualityBar, SectionTitle, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { loadSamples } from "@/lib/sample-store";
import { formatDate, qualityLabelText, type SampleRecord } from "@/lib/sample-types";
import { trpc } from "@/lib/trpc";

type Filter = "all" | "pending" | "reviewed" | "quality";

export default function SamplesScreen() {
  const router = useRouter();
  const [samples, setSamples] = useState<SampleRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { user } = useAuth();
  const remoteSamples = trpc.samples.list.useQuery(undefined, { enabled: Boolean(user), retry: false });

  useFocusEffect(useCallback(() => {
    let active = true;
    loadSamples().then((next) => active && setSamples(remoteSamples.data?.map((row) => row.payload as SampleRecord) ?? next));
    return () => { active = false; };
  }, [remoteSamples.data]));

  const filtered = useMemo(() => samples.filter((sample) => {
    const matchesQuery = !query.trim() || sample.id.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFilter = filter === "all" || (filter === "pending" && sample.reviewStatus === "pending") || (filter === "reviewed" && sample.reviewStatus === "reviewed") || (filter === "quality" && sample.qualityLabel !== "good");
    return matchesQuery && matchesFilter;
  }), [filter, query, samples]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader eyebrow="مكتبة العمل" title="العينات" action={<View style={styles.countBadge}><Text style={styles.countText}>{samples.length}</Text><Text style={styles.countLabel}>سجل</Text></View>} />
        <MedicalBanner compact />
        <View style={styles.searchBox}><MaterialIcons name="search" size={20} color={COLORS.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث برقم العينة" placeholderTextColor="#9AA7B4" style={styles.searchInput} textAlign="right" /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {([ ["all", "الكل"], ["pending", "تحتاج مراجعة"], ["reviewed", "مراجعة مكتملة"], ["quality", "جودة منخفضة"] ] as [Filter, string][]).map(([value, label]) => (
            <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filterButton, filter === value && styles.filterButtonActive]}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text></Pressable>
          ))}
        </ScrollView>
        <SectionTitle title="سجل العينات" detail={`${filtered.length} نتيجة مطابقة${user ? " · متزامن" : " · محلي"}`} />
        {filtered.length === 0 ? <View style={styles.empty}><MaterialIcons name="inventory-2" size={32} color={COLORS.teal} /><Text style={styles.emptyTitle}>لا توجد نتائج هنا</Text><Text style={styles.emptyText}>جرّب تغيير الفلتر أو أنشئ عينة جديدة من لوحة التشغيل.</Text></View> : filtered.map((sample) => <SampleCard key={sample.id} sample={sample} onPress={() => router.push({ pathname: "/sample/[id]", params: { id: sample.id } })} />)}
      </ScrollView>
    </ScreenContainer>
  );
}

function SampleCard({ sample, onPress }: { sample: SampleRecord; onPress: () => void }) {
  const reviewTone = sample.reviewStatus === "reviewed" ? "success" : "warning";
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.sampleCard, pressed && { opacity: 0.7 }]}>
    <View style={styles.cardTop}><StatusPill label={sample.reviewStatus === "reviewed" ? "تمت المراجعة" : "بانتظار المراجعة"} tone={reviewTone} icon={sample.reviewStatus === "reviewed" ? "done" : "rate-review"} /><View style={styles.sampleIdentity}><Text style={styles.sampleId}>{sample.id}</Text><Text style={styles.sampleDate}>{formatDate(sample.receivedAt)}</Text></View></View>
    <View style={styles.cardMetrics}><View><Text style={styles.metricNumber}>{sample.concentrationStatus === "not-calculated-missing-counting-area-or-dilution" ? "—" : sample.concentration}</Text><Text style={styles.metricCaption}>{sample.concentrationStatus === "not-calculated-missing-counting-area-or-dilution" ? "تركيز غير محسوب" : "مليون/مل"}</Text></View><View><Text style={styles.metricNumber}>{sample.totalMotility}%</Text><Text style={styles.metricCaption}>حركة كلية</Text></View><View><Text style={styles.metricNumber}>{sample.confidence * 100 | 0}%</Text><Text style={styles.metricCaption}>ثقة</Text></View><MaterialIcons name="chevron-left" size={22} color={COLORS.muted} /></View>
    <QualityBar score={sample.qualityScore} label={qualityLabelText(sample.qualityLabel)} />
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  countBadge: { backgroundColor: "#E6F8F5", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, alignItems: "center" },
  countText: { color: COLORS.tealDark, fontSize: 18, fontWeight: "800" },
  countLabel: { color: COLORS.tealDark, fontSize: 10, marginTop: 1 },
  searchBox: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.paper, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 9, marginBottom: 12 },
  searchInput: { flex: 1, color: COLORS.navy, fontSize: 14 },
  filters: { gap: 8, paddingBottom: 22, flexDirection: "row-reverse" },
  filterButton: { borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: COLORS.paper },
  filterButtonActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  filterText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: COLORS.paper },
  sampleCard: { backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  sampleIdentity: { alignItems: "flex-end" },
  sampleId: { color: COLORS.navy, fontSize: 15, fontWeight: "800" },
  sampleDate: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  cardMetrics: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line, paddingVertical: 13, marginBottom: 13 },
  metricNumber: { color: COLORS.navy, fontWeight: "800", fontSize: 18, textAlign: "right" },
  metricCaption: { color: COLORS.muted, fontSize: 10, marginTop: 2, textAlign: "right" },
  empty: { alignItems: "center", backgroundColor: COLORS.paper, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: COLORS.line, marginTop: 8 },
  emptyTitle: { color: COLORS.navy, fontSize: 17, fontWeight: "800", marginTop: 12 },
  emptyText: { color: COLORS.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 6 },
});
