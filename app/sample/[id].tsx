import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AppHeader, COLORS, Divider, MedicalBanner, MetricCard, PrimaryButton, QualityBar, SectionTitle, SecondaryButton, StatusPill } from "@/components/clinical-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { getSample, upsertSample } from "@/lib/sample-store";
import { formatDate, qualityLabelText, type AdvancedTestsRecord, type AiInterpretation, type MorphologyRecord, type SampleRecord, WHO_REFERENCE } from "@/lib/sample-types";
import { trpc } from "@/lib/trpc";
import { printReport, saveReportPdf, shareReportPdf } from "@/lib/report-export";

export default function SampleReportScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sample, setSample] = useState<SampleRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [correctedConcentration, setCorrectedConcentration] = useState("");
  const [correctedProgressive, setCorrectedProgressive] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [morphology, setMorphology] = useState<MorphologyRecord>(emptyMorphology());
  const [advancedTests, setAdvancedTests] = useState<AdvancedTestsRecord>({ source: "manual" });
  const [exporting, setExporting] = useState<"pdf" | "print" | "share" | null>(null);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [aiResult, setAiResult] = useState<AiInterpretation | null>(null);
  const [aiError, setAiError] = useState("");
  const interpret = trpc.analysis.interpret.useMutation();
  const remoteReview = trpc.samples.review.useMutation();
  const { user } = useAuth();

  useEffect(() => { if (!id) return; getSample(id).then((value) => { setSample(value ?? null); if (value) { setCorrectedConcentration(String(value.correctedConcentration ?? value.concentration)); setCorrectedProgressive(String(value.correctedProgressiveMotility ?? value.progressiveMotility)); setReviewerNote(value.reviewerNote ?? ""); setAiResult(value.aiInterpretation ?? null); setMorphology(value.morphology ?? emptyMorphology()); setAdvancedTests(value.advancedTests ?? { source: "manual" }); } setLoading(false); }); }, [id]);

  async function saveReview() {
    if (!sample) return;
    const updated: SampleRecord = { ...sample, reviewStatus: "reviewed", correctedConcentration: Number(correctedConcentration) || sample.concentration, correctedProgressiveMotility: Number(correctedProgressive) || sample.progressiveMotility, reviewerNote: reviewerNote.trim() || undefined, morphology: recalculateMorphology(morphology), advancedTests };
    await upsertSample(updated);
    if (user) {
      await remoteReview.mutateAsync({ sampleId: updated.id, reviewStatus: "reviewed", analysisEngine: updated.analysisEngine, analysisVersion: updated.analysisVersion, sample: updated });
    }
    setSample(updated);
    setReviewSaved(true);
    setTimeout(() => setReviewSaved(false), 2500);
  }

  async function askAi() {
    if (!sample) return;
    setAiError("");
    try {
      const result = await interpret.mutateAsync({ report: { sampleId: sample.id, concentration: sample.concentration, totalMotility: sample.totalMotility, progressiveMotility: sample.progressiveMotility, confidence: sample.confidence, qualityScore: sample.qualityScore, qualityIssues: sample.qualityIssues, warnings: sample.warnings, reviewed: sample.reviewStatus === "reviewed" } });
      const next = { ...result, generatedAt: new Date().toISOString() };
      setAiResult(next);
      const updated = { ...sample, aiInterpretation: next };
      setSample(updated);
      await upsertSample(updated);
    } catch {
      setAiError("تعذر الوصول إلى المساعد الآن. احتفظ بالتقرير وحاول مرة أخرى.");
    }
  }

  async function exportPdf() {
    if (!sample) return;
    setExporting("pdf");
    try {
      await saveReportPdf(sample);
      notify("تم تجهيز التقرير", "اختر تطبيق الملفات لحفظ نسخة PDF على الهاتف.");
    } catch { notify("تعذر إنشاء PDF", "تحقق من صلاحية التخزين وحاول مرة أخرى."); }
    finally { setExporting(null); }
  }

  async function printCurrentReport() {
    if (!sample) return;
    setExporting("print");
    try { await printReport(sample); } catch { notify("تعذرت الطباعة", "تأكد من اتصال الهاتف بالطابعة أو جرّب حفظ PDF أولًا."); }
    finally { setExporting(null); }
  }

  async function shareCurrentReport() {
    if (!sample) return;
    setExporting("share");
    try { await shareReportPdf(sample); } catch { notify("تعذرت المشاركة", "افتح قائمة المشاركة واختر WhatsApp أو تطبيق الملفات إذا كان متاحًا."); }
    finally { setExporting(null); }
  }

  if (loading) return <ScreenContainer><View style={styles.center}><MaterialIcons name="hourglass-top" size={28} color={COLORS.teal} /><Text style={styles.centerText}>جاري فتح التقرير…</Text></View></ScreenContainer>;
  if (!sample) return <ScreenContainer><View style={styles.center}><MaterialIcons name="search-off" size={32} color={COLORS.muted} /><Text style={styles.centerText}>لم يتم العثور على هذه العينة.</Text><SecondaryButton label="العودة للسجل" onPress={() => router.back()} /></View></ScreenContainer>;

  const concentrationAvailable = sample.concentrationStatus == null || sample.concentrationStatus === "provisional-counting-area-estimate";
  const concentrationBelow = concentrationAvailable && sample.concentration < WHO_REFERENCE.concentration;
  const motilityBelow = sample.totalMotility < WHO_REFERENCE.totalMotility;
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AppHeader eyebrow={`تقرير · ${formatDate(sample.receivedAt)}`} title={sample.id} action={<Pressable accessibilityRole="button" accessibilityLabel="العودة" hitSlop={8} style={styles.backButton} onPress={() => router.back()}><MaterialIcons name="arrow-forward" size={24} color={COLORS.navy} /></Pressable>} />
    <MedicalBanner />
    <View style={styles.reportMeta}><View style={styles.metaItem}><Text style={styles.metaLabel}>ملف الفيديو</Text><Text style={styles.metaValue}>{sample.videoName}</Text></View><View style={styles.metaItem}><Text style={styles.metaLabel}>المحرك / الإطارات</Text><Text style={styles.metaValue}>{sample.analysisEngine === "opencv-centroid-tracker" ? "OpenCV" : "تجريبي"} · {sample.framesAnalyzed} عينة / {sample.sourceFrameCount && sample.sourceFrameCount > 0 ? sample.sourceFrameCount : "—"} إطار أصلي</Text><Text style={styles.metaHint}>{sample.fps != null ? `المعدل الأصلي ${sample.fps} FPS · مصدره ${sample.fpsSource ?? "غير محدد"} · أخذ العينات ${sample.sampleRateHz ?? "—"} عينة/ث` : "معدل الإطارات الأصلي غير متاح"} · {sample.analyzedDurationSec != null ? `تحليل ${sample.analyzedDurationSec} من ${sample.videoDurationSec} ثانية · تغطية ${sample.coveragePct ?? 0}%` : "تغطية التحليل غير متاحة"}</Text></View><StatusPill label={sample.reviewStatus === "reviewed" ? "مراجعة مكتملة" : "تحتاج مراجعة"} tone={sample.reviewStatus === "reviewed" ? "success" : "warning"} /></View>
    <View style={styles.exportCard}><Text style={styles.exportTitle}>حفظ ومشاركة التقرير</Text><Text style={styles.exportHint}>PDF منسق يشمل الرسوم البيانية والقيم المرجعية. للمشاركة عبر واتساب اختر WhatsApp من قائمة المشاركة.</Text><View style={styles.exportButtons}><Pressable accessibilityRole="button" accessibilityLabel="حفظ التقرير ك PDF" disabled={!!exporting} onPress={exportPdf} style={styles.exportButton}><MaterialIcons name="picture-as-pdf" size={19} color={COLORS.danger} /><Text style={styles.exportButtonText}>{exporting === "pdf" ? "جاري الإنشاء…" : "حفظ PDF"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="طباعة التقرير" disabled={!!exporting} onPress={printCurrentReport} style={styles.exportButton}><MaterialIcons name="print" size={19} color={COLORS.navy} /><Text style={styles.exportButtonText}>{exporting === "print" ? "جاري التحضير…" : "طباعة"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="مشاركة التقرير عبر واتساب" disabled={!!exporting} onPress={shareCurrentReport} style={[styles.exportButton, styles.shareButton]}><MaterialIcons name="share" size={19} color={COLORS.paper} /><Text style={[styles.exportButtonText, styles.shareButtonText]}>{exporting === "share" ? "جاري المشاركة…" : "واتساب / مشاركة"}</Text></Pressable></View></View>
    <SectionTitle title="المؤشرات الأساسية" detail="مقارنة إرشادية مع WHO 2021" />
    <View style={styles.metricsGrid}><MetricCard label="التركيز" value={concentrationAvailable ? sample.concentration.toFixed(1) : "—"} unit={concentrationAvailable ? "مليون/مل" : "غير محسوب"} icon="science" tone={concentrationAvailable && concentrationBelow ? "orange" : "navy"} note={concentrationAvailable ? (concentrationBelow ? `أقل من ${WHO_REFERENCE.concentration}` : `المرجع ${WHO_REFERENCE.concentration}`) : "أدخل مساحة العد ومعامل التخفيف"} /><MetricCard label="إجمالي الحركة" value={sample.totalMotility.toFixed(1)} unit="٪" icon="moving" tone={motilityBelow ? "orange" : "teal"} note={motilityBelow ? `أقل من ${WHO_REFERENCE.totalMotility}%` : `المرجع ${WHO_REFERENCE.totalMotility}%`} /></View>
    <View style={styles.metricsGrid}><MetricCard label="الحركة التقدمية" value={sample.progressiveMotility.toFixed(1)} unit="٪" icon="trending-up" tone="teal" note={`المرجع ≥ ${WHO_REFERENCE.progressiveMotility}%`} /><MetricCard label="مؤشر جودة البيانات" value={`${Math.round(sample.confidence * 100)}`} unit="٪" icon="verified" tone="navy" note="درجة فحص هندسي" /></View>
    <SectionTitle title="الرسوم البيانية والنطاقات المرجعية" detail="العلامة المرجعية إرشادية وليست تشخيصًا" />
    <View style={styles.chartCard}><ParameterChart label="التركيز" value={concentrationAvailable ? sample.concentration : null} unit="مليون/مل" reference={concentrationAvailable ? WHO_REFERENCE.concentration : undefined} referenceText={concentrationAvailable ? `WHO ≥ ${WHO_REFERENCE.concentration}` : "غير محسوب: مساحة العد/التخفيف غير مكتملة"} max={40} /><ParameterChart label="إجمالي الحركة" value={sample.totalMotility} unit="%" reference={WHO_REFERENCE.totalMotility} referenceText={`WHO ≥ ${WHO_REFERENCE.totalMotility}%`} max={100} /><ParameterChart label="الحركة التقدمية" value={sample.progressiveMotility} unit="%" reference={WHO_REFERENCE.progressiveMotility} referenceText={`WHO ≥ ${WHO_REFERENCE.progressiveMotility}%`} max={100} /><ParameterChart label="غير المتحركة" value={sample.immotile} unit="%" reference={undefined} referenceText="تُقرأ مع إجمالي الحركة" max={100} /></View>
    {sample.trackingDiagnostics ? <View style={styles.advancedCard}><Text style={styles.advancedTitle}>Scientific validation · تتبع الخلايا</Text><Text style={styles.advancedBody}>المسارات المنشأة: {sample.trackingDiagnostics.totalTracksCreated} · المسارات الصالحة: {sample.trackingDiagnostics.validTracks} · نقاط المسار المصدّرة: {sample.trackObservations?.length ?? 0}</Text><Text style={styles.advancedBody}>ID Switches وFragmentation لا يُعرضان كصفر؛ يلزم Ground Truth معتمد لحسابهما. {sample.trackingDiagnostics.note}</Text></View> : null}
    {sample.kinematics ? <View style={styles.kinematicCard}><Text style={styles.kinematicTitle}>Kinematics · سرعة المسار</Text><View style={styles.kinematicGrid}>{[["VCL", sample.kinematics.vcl, "µm/s"], ["VSL", sample.kinematics.vsl, "µm/s"], ["VAP", sample.kinematics.vap, "µm/s"], ["LIN", sample.kinematics.lin, "ratio"], ["STR", sample.kinematics.str, "ratio"], ["WOB", sample.kinematics.wob, "ratio"], ["ALH", sample.kinematics.alh, "µm"], ["BCF", sample.kinematics.bcf, "Hz"]].map(([label, value, unit]) => <View key={String(label)} style={styles.kinematicItem}><Text style={styles.kinematicValue}>{typeof value === "number" ? value.toFixed(2) : "—"}</Text><Text style={styles.kinematicLabel}>{label} · {unit}</Text></View>)}</View><View style={styles.kinematicCharts}>{[["VCL", sample.kinematics.vcl, "µm/s", 100], ["VSL", sample.kinematics.vsl, "µm/s", 100], ["VAP", sample.kinematics.vap, "µm/s", 100], ["LIN", sample.kinematics.lin, "ratio", 1], ["STR", sample.kinematics.str, "ratio", 1], ["WOB", sample.kinematics.wob, "ratio", 1], ["ALH", sample.kinematics.alh, "µm", 20], ["BCF", sample.kinematics.bcf, "Hz", 20]].map(([label, value, unit, max]) => <ParameterChart key={String(label)} label={String(label)} value={typeof value === "number" ? value : null} unit={String(unit)} reference={undefined} referenceText={label === "BCF" ? "غير متاح دون تتبع ذيل موثوق" : "يُفسر حسب الجهاز والمعايرة"} max={Number(max)} />)}</View><Text style={styles.kinematicNote}>VCL/VSL/VAP بوحدة ميكرومتر/ثانية تقريبية؛ BCF يحتاج معدل إطارات وجودة تتبع ذيل مناسبة.</Text></View> : null}
    <View style={styles.referenceCard}><View style={styles.referenceTitle}><Text style={styles.referenceTitleText}>قراءة أولية</Text><MaterialIcons name={concentrationBelow || motilityBelow ? "info-outline" : "check-circle-outline"} size={20} color={concentrationBelow || motilityBelow ? COLORS.warning : COLORS.success} /></View><Text style={styles.referenceBody}>{concentrationBelow || motilityBelow ? "يوجد مؤشر تحت الحد المرجعي الإرشادي. هذا لا يثبت وجود مشكلة ولا يستبدل التقييم الكامل من المختص." : "المؤشرات المعروضة فوق الحدود الإرشادية في هذا التحليل، لكنها تظل تقديرية وتحتاج مراجعة وفحصًا كاملًا."}</Text></View>
    <QualityBar score={sample.qualityScore} label={qualityLabelText(sample.qualityLabel)} />
    {sample.qualityIssues.length ? <View style={styles.issuesCard}><Text style={styles.issuesTitle}>ما الذي يحد من الثقة؟</Text>{sample.qualityIssues.map((issue) => <View key={issue} style={styles.issueRow}><MaterialIcons name="priority-high" size={16} color={COLORS.warning} /><Text style={styles.issueText}>{issue}</Text></View>)}</View> : null}
    {sample.qualityMetrics ? <View style={styles.issuesCard}><Text style={styles.issuesTitle}>قياسات جودة الصورة · فحص هندسي</Text>{[["سطوع متوسط", sample.qualityMetrics.meanBrightness.toFixed(1), "/ 255"], ["التباين", sample.qualityMetrics.contrastStdDev.toFixed(1), "SD"], ["حدة الصورة", sample.qualityMetrics.sharpnessVariance.toFixed(1), "Laplacian variance"], ["تغطية فك الإطارات", sample.qualityMetrics.decodedFrameCoveragePct.toFixed(1), "%"]].map(([label, value, unit]) => <View key={label} style={styles.issueRow}><Text style={styles.issueText}>{label}: {value} {unit}</Text></View>)}<Text style={styles.metaHint}>مؤشرات هندسية تقريبية وحدودها إرشادية؛ لا تمثل احتمالًا سريريًا.</Text></View> : null}

    <SectionTitle title="المورفولوجي" detail="تحليل آلي موسّع للرأس والذيل والقطعة الوسطى + مراجعة بشرية" />
    <MorphologyEditor value={morphology} onChange={setMorphology} />
    <AdvancedTestsEditor value={advancedTests} onChange={setAdvancedTests} />

    <SectionTitle title="تفسير بالذكاء الاصطناعي" detail="شرح تعليمي غير تشخيصي" />
    {aiResult ? <AiCard result={aiResult} /> : <View style={styles.aiPrompt}><View style={styles.aiPromptIcon}><MaterialIcons name="auto-awesome" size={21} color={COLORS.tealDark} /></View><Text style={styles.aiPromptTitle}>افهم التقرير في دقيقة</Text><Text style={styles.aiPromptBody}>سيقرأ المساعد المؤشرات وجودة البيانات والتنبيهات، ثم يلخص ما يحتاجه الفني للمراجعة دون تشخيص أو وصف علاج.</Text><PrimaryButton label="فسّر التقرير بالذكاء الاصطناعي" icon="auto-awesome" onPress={askAi} loading={interpret.isPending} /></View>}
    {aiError ? <View style={styles.errorRow}><MaterialIcons name="error-outline" size={17} color={COLORS.danger} /><Text style={styles.errorText}>{aiError}</Text></View> : null}
    {aiResult ? <Pressable onPress={askAi} style={styles.retryAi}><MaterialIcons name="refresh" size={16} color={COLORS.tealDark} /><Text style={styles.retryText}>إعادة توليد التفسير</Text></Pressable> : null}

    <Divider /><SectionTitle title="مراجعة الفني" detail="هذه الخطوة تبني مرجعًا بشريًا يمكن الوثوق به أكثر من التخمين الآلي" />
    <View style={styles.reviewCard}><Field label="التركيز بعد المراجعة" value={correctedConcentration} onChangeText={setCorrectedConcentration} unit="مليون/مل" /><Field label="الحركة التقدمية بعد المراجعة" value={correctedProgressive} onChangeText={setCorrectedProgressive} unit="٪" /><View style={styles.field}><Text style={styles.fieldLabel}>ملاحظة الفني</Text><TextInput value={reviewerNote} onChangeText={setReviewerNote} placeholder="ما الذي تمت مراجعته؟" placeholderTextColor="#A0ACB6" style={styles.noteInput} textAlign="right" multiline /></View><PrimaryButton label="حفظ المراجعة البشرية" icon="fact-check" onPress={saveReview} />{reviewSaved ? <View style={styles.savedRow}><MaterialIcons name="check-circle" size={17} color={COLORS.success} /><Text style={styles.savedText}>تم حفظ المراجعة</Text></View> : null}</View>
    <View style={styles.footerWarning}><Text style={styles.footerWarningText}>المعايرة: {sample.calibration.micronsPerPixel} ميكرومتر/بكسل · عمق الحجرة: {sample.calibration.chamberDepth} ميكرومتر</Text><Text style={styles.footerWarningText}>النتيجة بحثية مساعدة وتحتاج مراجعة مختص قبل أي استخدام طبي.</Text></View>
  </ScrollView></ScreenContainer>;
}

function AiCard({ result }: { result: AiInterpretation }) { return <View style={styles.aiCard}><View style={styles.aiCardHeader}><StatusPill label="تفسير غير تشخيصي" tone="teal" icon="auto-awesome" /><Text style={styles.aiCardTitle}>الخلاصة</Text></View><Text style={styles.aiSummary}>{result.summary}</Text><Text style={styles.aiSubTitle}>الإشارات المهمة</Text>{result.signals.map((item) => <View key={item} style={styles.bulletRow}><View style={styles.bullet} /><Text style={styles.bulletText}>{item}</Text></View>)}<Text style={styles.aiSubTitle}>حدود القراءة</Text>{result.caveats.map((item) => <View key={item} style={styles.bulletRow}><View style={[styles.bullet, { backgroundColor: COLORS.warning }]} /><Text style={styles.bulletText}>{item}</Text></View>)}<View style={styles.nextStep}><Text style={styles.nextStepLabel}>الخطوة التالية</Text><Text style={styles.nextStepText}>{result.nextStep}</Text></View></View>; }
function Field({ label, value, onChangeText, unit }: { label: string; value: string; onChangeText: (value: string) => void; unit: string }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.inputRow}><Text style={styles.inputUnit}>{unit}</Text><TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" style={styles.reviewInput} textAlign="right" /></View></View>; }

function notify(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function ParameterChart({ label, value, unit, reference, referenceText, max }: { label: string; value: number | null; unit: string; reference?: number; referenceText: string; max: number }) {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : null;
  const valueWidth = safeValue === null ? 0 : Math.min(100, Math.max(3, (safeValue / max) * 100));
  const referenceLeft = reference === undefined ? null : Math.min(100, Math.max(0, (reference / max) * 100));
  return <View style={styles.parameterChart}><View style={styles.parameterHeader}><Text style={styles.parameterLabel}>{label}</Text><Text style={styles.parameterValue}>{safeValue === null ? "غير متاح" : `${safeValue.toFixed(2)} ${unit}`}</Text></View><View style={styles.chartTrack}><View style={[styles.chartFill, { width: `${valueWidth}%` }]} />{referenceLeft !== null ? <View style={[styles.referenceMarker, { left: `${referenceLeft}%` }]} /> : null}</View><View style={styles.referenceRow}><Text style={styles.referenceText}>{referenceText}</Text>{reference !== undefined ? <Text style={styles.referenceValue}>مرجع: {reference} {unit}</Text> : null}</View></View>;
}

function emptyMorphology(): MorphologyRecord {
  return { method: "manual", totalExamined: 0, normalForms: 0, roundHeads: 0, elongatedHeads: 0, irregularHeads: 0, coiledTails: 0, bentTails: 0, doubleTails: 0, acrosomeAbnormal: 0, midpieceDefects: 0, tzi: 0, sdi: 0, automaticLimitations: ["لم يتم تسجيل فحص مورفولوجي بعد."] };
}

function recalculateMorphology(value: MorphologyRecord): MorphologyRecord {
  const defects = value.roundHeads + value.elongatedHeads + value.irregularHeads + value.coiledTails + value.bentTails + value.doubleTails + value.acrosomeAbnormal + value.midpieceDefects;
  const abnormalCells = Math.max(1, value.totalExamined - value.normalForms);
  return { ...value, method: value.method === "opencv-contour-screening" || value.method === "opencv-heuristic-morphology-v1" ? "hybrid" : "manual", tzi: Number((defects / abnormalCells).toFixed(2)), sdi: Number((defects / Math.max(1, value.totalExamined)).toFixed(3)) };
}

function MorphologyEditor({ value, onChange }: { value: MorphologyRecord; onChange: (next: MorphologyRecord) => void }) {
  const fields: [keyof MorphologyRecord, string][] = [["totalExamined", "إجمالي الخلايا المفحوصة"], ["normalForms", "الأشكال الطبيعية"], ["roundHeads", "رؤوس دائرية"], ["elongatedHeads", "رؤوس ممدودة"], ["irregularHeads", "رؤوس غير منتظمة"], ["coiledTails", "أذناب ملتفة"], ["bentTails", "أذناب مكسورة/منحنية"], ["doubleTails", "أذناب مزدوجة"], ["acrosomeAbnormal", "أكروسوم غير طبيعي"], ["midpieceDefects", "عيوب القطعة الوسطى"]];
  const change = (key: keyof MorphologyRecord, delta: number) => {
    const current = Number(value[key]) || 0;
    onChange(recalculateMorphology({ ...value, [key]: Math.max(0, current + delta) }));
  };
  return <View style={styles.morphologyCard}>
    <View style={styles.morphologyMode}><StatusPill label={value.method === "opencv-heuristic-morphology-v1" ? "OpenCV موسّع · screening" : value.method === "opencv-contour-screening" ? "فحص OpenCV للرأس" : value.method === "hybrid" ? "آلي + يدوي" : "تسجيل يدوي"} tone="teal" icon="biotech" /><Text style={styles.morphologyHint}>اضغط + أو − لتسجيل العدد، ثم احفظ المراجعة</Text></View>
    {fields.map(([key, label]) => <View key={String(key)} style={styles.morphologyRow}><Text style={styles.morphologyLabel}>{label}</Text><View style={styles.stepper}><Pressable accessibilityRole="button" accessibilityLabel={`زيادة ${label}`} onPress={() => change(key, 1)} style={styles.stepButton}><Text style={styles.stepButtonText}>+</Text></Pressable><Text style={styles.stepValue}>{Number(value[key]) || 0}</Text><Pressable accessibilityRole="button" accessibilityLabel={`إنقاص ${label}`} onPress={() => change(key, -1)} style={styles.stepButton}><Text style={styles.stepButtonText}>−</Text></Pressable></View></View>)}
    <View style={styles.morphologyStats}><View><Text style={styles.morphologyStatValue}>{value.tzi.toFixed(2)}</Text><Text style={styles.morphologyStatLabel}>TZI تقريبي</Text></View><View><Text style={styles.morphologyStatValue}>{(value.sdi * 100).toFixed(1)}%</Text><Text style={styles.morphologyStatLabel}>SDI تقريبي</Text></View><View><Text style={styles.morphologyStatValue}>{value.automaticConfidence == null ? "—" : `${Math.round(value.automaticConfidence * 100)}%`}</Text><Text style={styles.morphologyStatLabel}>ثقة الشكل</Text></View></View>
    {value.krugerScreening ? <View style={styles.krugerBox}><Text style={styles.krugerTitle}>Kruger screening تقريبي</Text><Text style={styles.krugerBody}>أشكال طبيعية: {value.krugerScreening.normalPercent.toFixed(1)}٪ · غير طبيعية: {value.krugerScreening.abnormalPercent.toFixed(1)}٪ · العلامة الإرشادية: {value.krugerScreening.thresholdPercent}٪</Text></View> : null}
    <Text style={styles.morphologyDisclaimer}>تمت إضافة تقدير هندسي للرأس والقطعة الوسطى والذيل والأكروسوم من الكونتور. هذه نتيجة screening وليست اعتمادًا لمعيار Kruger؛ يجب مراجعة الصورة/الصبغة يدويًا قبل اعتماد التقرير.</Text>
  </View>;
}

function AdvancedTestsEditor({ value, onChange }: { value: AdvancedTestsRecord; onChange: (next: AdvancedTestsRecord) => void }) {
  const field = (key: "vitalityPct" | "dfiPct" | "acrosomeReactionPct", label: string) => <View style={styles.advancedField}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value[key] === undefined ? "" : String(value[key])} onChangeText={(text) => onChange({ ...value, [key]: text.trim() === "" ? undefined : Number(text) })} keyboardType="decimal-pad" placeholder="غير مقاس" placeholderTextColor="#A0ACB6" style={styles.advancedInput} textAlign="right" /></View>;
  return <View style={styles.advancedCard}><View style={styles.advancedHeader}><StatusPill label="إدخال يدوي / استيراد" tone="neutral" icon="science" /><Text style={styles.advancedTitle}>اختبارات متقدمة</Text></View><Text style={styles.advancedBody}>الحيوية وDFI وتفاعل الأكروسوم تحتاج صبغة أو اختبارًا منفصلًا. لا يتم استنتاجها من فيديو الحركة الحالي.</Text><View style={styles.advancedGrid}>{field("vitalityPct", "الحيوية %")}{field("dfiPct", "DFI %")}{field("acrosomeReactionPct", "تفاعل الأكروسوم %")}</View><Text style={styles.advancedNote}>تُحفظ القيم مع المراجعة البشرية ويظهر مصدرها، ولا تدخل في قرار AI إلا كبيانات سياقية.</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 42 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
  centerText: { color: COLORS.muted, fontSize: 14, textAlign: "center" },
  reportMeta: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  exportCard: { backgroundColor: "#F6FBFA", borderWidth: 1, borderColor: "#CDECE7", borderRadius: 18, padding: 15, marginBottom: 20 },
  exportTitle: { color: COLORS.navy, fontSize: 16, fontWeight: "800", textAlign: "right" },
  exportHint: { color: COLORS.muted, fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 5, marginBottom: 12 },
  exportButtons: { flexDirection: "row", gap: 7, justifyContent: "space-between" },
  exportButton: { minHeight: 44, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.paper, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 5 },
  exportButtonText: { color: COLORS.navy, fontSize: 10, fontWeight: "800", textAlign: "center" },
  shareButton: { backgroundColor: COLORS.tealDark, borderColor: COLORS.tealDark },
  shareButtonText: { color: COLORS.paper },
  metaItem: { alignItems: "flex-end", flex: 1 },
  metaLabel: { color: COLORS.muted, fontSize: 10 },
  metaValue: { color: COLORS.navy, fontSize: 11, fontWeight: "700", marginTop: 3 },
  metaHint: { color: COLORS.tealDark, fontSize: 10, marginTop: 3, textAlign: "right" },
  metricsGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  chartCard: { backgroundColor: COLORS.paper, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 14, marginBottom: 14 },
  parameterChart: { marginBottom: 13 },
  parameterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  parameterLabel: { color: COLORS.navy, fontSize: 12, fontWeight: "800" },
  parameterValue: { color: COLORS.tealDark, fontSize: 12, fontWeight: "800" },
  chartTrack: { height: 10, borderRadius: 8, backgroundColor: "#EEF1F1", overflow: "visible", marginTop: 7, position: "relative" },
  chartFill: { height: "100%", borderRadius: 8, backgroundColor: COLORS.teal },
  referenceMarker: { position: "absolute", top: -3, width: 2, height: 16, backgroundColor: COLORS.warning },
  referenceRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 4 },
  referenceText: { flex: 1, color: COLORS.muted, fontSize: 9, textAlign: "right" },
  referenceValue: { color: COLORS.warning, fontSize: 9, fontWeight: "700" },
  kinematicCard: { backgroundColor: "#F7FAFC", borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 14, marginTop: 2, marginBottom: 14 },
  kinematicTitle: { color: COLORS.navy, fontSize: 13, fontWeight: "800", textAlign: "right", marginBottom: 10 },
  kinematicGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
  kinematicCharts: { marginTop: 10, borderTopWidth: 1, borderColor: COLORS.line, paddingTop: 10 },
  kinematicItem: { width: "22%", alignItems: "center", backgroundColor: COLORS.paper, borderRadius: 10, paddingVertical: 7 },
  kinematicValue: { color: COLORS.navy, fontSize: 13, fontWeight: "800" },
  kinematicLabel: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  kinematicNote: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 10 },
  referenceCard: { backgroundColor: "#F6FBFA", borderWidth: 1, borderColor: "#CDECE7", borderRadius: 18, padding: 15, marginTop: 6, marginBottom: 14 },
  referenceTitle: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  referenceTitleText: { color: COLORS.navy, fontSize: 14, fontWeight: "800" },
  referenceBody: { color: COLORS.navySoft, fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 8 },
  issuesCard: { backgroundColor: COLORS.warningBg, borderRadius: 18, padding: 15, marginTop: 12 },
  issuesTitle: { color: "#7A4A08", fontSize: 14, fontWeight: "800", textAlign: "right", marginBottom: 8 },
  issueRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-end", gap: 6, marginTop: 5 },
  issueText: { flex: 1, color: "#7A4A08", fontSize: 12, lineHeight: 18, textAlign: "right" },
  aiPrompt: { backgroundColor: "#E6F8F5", borderRadius: 20, padding: 17 },
  aiPromptIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: COLORS.paper, alignItems: "center", justifyContent: "center", marginBottom: 11 },
  aiPromptTitle: { color: COLORS.navy, fontSize: 17, fontWeight: "800", textAlign: "right" },
  aiPromptBody: { color: COLORS.navySoft, fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 6, marginBottom: 14 },
  aiCard: { backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, padding: 16 },
  aiCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  aiCardTitle: { color: COLORS.navy, fontSize: 17, fontWeight: "800" },
  aiSummary: { color: COLORS.navySoft, fontSize: 14, lineHeight: 22, textAlign: "right", marginTop: 14 },
  aiSubTitle: { color: COLORS.navy, fontSize: 13, fontWeight: "800", textAlign: "right", marginTop: 17, marginBottom: 6 },
  bulletRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-start", gap: 7, marginTop: 4 },
  bullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.teal, marginTop: 7 },
  bulletText: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "right" },
  nextStep: { backgroundColor: "#F6FBFA", borderRadius: 13, padding: 12, marginTop: 15 },
  nextStepLabel: { color: COLORS.tealDark, fontSize: 11, fontWeight: "800", textAlign: "right" },
  nextStepText: { color: COLORS.navy, fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 4 },
  retryAi: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, paddingVertical: 13 },
  retryText: { color: COLORS.tealDark, fontSize: 12, fontWeight: "700" },
  errorRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, backgroundColor: COLORS.dangerBg, borderRadius: 12, padding: 10, marginTop: 10 },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 12, textAlign: "right" },
  reviewCard: { backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, padding: 16 },
  morphologyCard: { backgroundColor: COLORS.paper, borderRadius: 20, borderWidth: 1, borderColor: COLORS.line, padding: 16, marginBottom: 22 },
  morphologyMode: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  morphologyHint: { flex: 1, color: COLORS.muted, fontSize: 10, lineHeight: 15, textAlign: "right" },
  morphologyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderColor: COLORS.line, paddingVertical: 9, gap: 10 },
  morphologyLabel: { flex: 1, color: COLORS.navySoft, fontSize: 12, textAlign: "right" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 9 },
  backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#EEF7F5", alignItems: "center", justifyContent: "center" },
  stepButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#E6F8F5", alignItems: "center", justifyContent: "center" },
  stepButtonText: { color: COLORS.tealDark, fontSize: 19, fontWeight: "800", lineHeight: 22 },
  stepValue: { minWidth: 30, color: COLORS.navy, fontSize: 15, fontWeight: "800", textAlign: "center" },
  morphologyStats: { flexDirection: "row", justifyContent: "space-around", backgroundColor: "#F6FBFA", borderRadius: 14, paddingVertical: 12, marginTop: 10 },
  krugerBox: { backgroundColor: "#F7FAFC", borderRadius: 12, padding: 11, marginTop: 10, borderWidth: 1, borderColor: COLORS.line },
  krugerTitle: { color: COLORS.navy, fontSize: 12, fontWeight: "800", textAlign: "right" },
  krugerBody: { color: COLORS.navySoft, fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 4 },
  morphologyStatValue: { color: COLORS.navy, fontSize: 20, fontWeight: "800", textAlign: "center" },
  morphologyStatLabel: { color: COLORS.muted, fontSize: 10, textAlign: "center", marginTop: 2 },
  morphologyDisclaimer: { color: COLORS.muted, fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 12 },
  advancedCard: { backgroundColor: "#FBFAF6", borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 15, marginBottom: 22 },
  advancedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  advancedTitle: { color: COLORS.navy, fontSize: 15, fontWeight: "800", textAlign: "right" },
  advancedBody: { color: COLORS.muted, fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 9 },
  advancedGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 12 },
  advancedField: { flex: 1 },
  advancedInput: { height: 44, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, backgroundColor: COLORS.paper, color: COLORS.navy, paddingHorizontal: 9, fontSize: 13 },
  advancedNote: { color: COLORS.muted, fontSize: 10, lineHeight: 15, textAlign: "right", marginTop: 10 },
  field: { marginBottom: 13 },
  fieldLabel: { color: COLORS.navy, fontSize: 12, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, paddingHorizontal: 12, backgroundColor: "#FCFBF9" },
  inputUnit: { color: COLORS.muted, fontSize: 11 },
  reviewInput: { flex: 1, height: 46, color: COLORS.navy, fontSize: 14, paddingHorizontal: 8 },
  noteInput: { minHeight: 70, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, padding: 12, color: COLORS.navy, textAlignVertical: "top", backgroundColor: "#FCFBF9" },
  savedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12 },
  savedText: { color: COLORS.success, fontWeight: "700", fontSize: 12 },
  footerWarning: { backgroundColor: COLORS.dangerBg, borderRadius: 16, padding: 13, marginTop: 18 },
  footerWarningText: { color: COLORS.danger, fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 2 },
});
