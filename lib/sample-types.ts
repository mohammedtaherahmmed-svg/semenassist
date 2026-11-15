export type ReviewStatus = "pending" | "reviewed";
export type QualityLabel = "good" | "needs_attention" | "insufficient";

export type AiInterpretation = {
  summary: string;
  signals: string[];
  caveats: string[];
  nextStep: string;
  generatedAt: string;
};

export type MorphologyRecord = {
  method: "opencv-contour-screening" | "opencv-heuristic-morphology-v1" | "manual" | "hybrid" | "not-assessed-on-device";
  totalExamined: number;
  normalForms: number;
  roundHeads: number;
  elongatedHeads: number;
  irregularHeads: number;
  coiledTails: number;
  bentTails: number;
  doubleTails: number;
  acrosomeAbnormal: number;
  midpieceDefects: number;
  tzi: number;
  sdi: number;
  automaticConfidence?: number;
  krugerScreening?: { normalPercent: number; abnormalPercent: number; thresholdPercent: number; status: string };
  notes?: string;
  automaticLimitations?: string[];
};

export type AdvancedTestsRecord = {
  vitalityPct?: number;
  dfiPct?: number;
  acrosomeReactionPct?: number;
  source: "manual" | "imported";
  notes?: string;
};

export type SampleRecord = {
  id: string;
  collectedAt: string;
  receivedAt: string;
  sampleType: string;
  notes: string;
  researchOptIn: boolean;
  videoName: string;
  videoSizeMb: number;
  videoDurationSec: number;
  framesAnalyzed: number;
  analyzedDurationSec?: number;
  coveragePct?: number;
  analysisEngine?: string;
  analysisVersion?: string;
  processingLocation?: "on-device" | "server";
  objectsDetected?: number;
  fps?: number;
  sourceFrameCount?: number;
  fpsSource?: string;
  sampleRateHz?: number;
  coefficientOfVariation?: number;
  qualityMetrics?: { meanBrightness: number; contrastStdDev: number; sharpnessVariance: number; decodedFrameCoveragePct: number };
  kinematics?: {
    vcl: number;
    vsl: number;
    vap: number;
    lin: number;
    str: number;
    wob: number;
    alh: number;
    bcf: number | null;
  };
  concentration: number;
  progressiveMotility: number;
  nonProgressiveMotility: number;
  immotile: number;
  totalMotility: number;
  confidence: number;
  qualityScore: number;
  qualityLabel: QualityLabel;
  qualityIssues: string[];
  warnings: string[];
  calibration: {
    micronsPerPixel: number;
    chamberDepth: number;
    calibratedAt: string;
  };
  reviewStatus: ReviewStatus;
  correctedConcentration?: number;
  correctedProgressiveMotility?: number;
  reviewerNote?: string;
  aiInterpretation?: AiInterpretation;
  morphology?: MorphologyRecord;
  advancedTests?: AdvancedTestsRecord;
};

export const WHO_REFERENCE = {
  concentration: 16,
  totalMotility: 42,
  progressiveMotility: 30,
};

export const seedSamples: SampleRecord[] = [
  {
    id: "SEM-2026-103",
    collectedAt: "2026-10-03T07:20:00.000Z",
    receivedAt: "2026-10-03T07:46:00.000Z",
    sampleType: "عينة كاملة",
    notes: "إضاءة مستقرة، مجال رؤية واضح",
    researchOptIn: true,
    videoName: "SEM-2026-103.mp4",
    videoSizeMb: 18.4,
    videoDurationSec: 18,
    framesAnalyzed: 60,
    concentration: 31.8,
    progressiveMotility: 36.4,
    nonProgressiveMotility: 14.2,
    immotile: 49.4,
    totalMotility: 50.6,
    confidence: 0.88,
    qualityScore: 86,
    qualityLabel: "good",
    qualityIssues: [],
    warnings: ["النتيجة تقديرية وتحتاج مراجعة فنية قبل الاعتماد."],
    calibration: {
      micronsPerPixel: 0.42,
      chamberDepth: 20,
      calibratedAt: "2026-10-03T06:50:00.000Z",
    },
    reviewStatus: "reviewed",
    correctedConcentration: 30.9,
    correctedProgressiveMotility: 35.8,
    reviewerNote: "تمت مطابقة عينة يدوية مرجعية.",
    morphology: {
      method: "manual",
      totalExamined: 100,
      normalForms: 6,
      roundHeads: 8,
      elongatedHeads: 3,
      irregularHeads: 2,
      coiledTails: 5,
      bentTails: 4,
      doubleTails: 1,
      acrosomeAbnormal: 2,
      midpieceDefects: 3,
      tzi: 1.16,
      sdi: 0.94,
      notes: "تقييم يدوي لعينة مرجعية.",
    },
    advancedTests: { source: "manual", notes: "تُسجل القيم فقط عند توفر صبغة/اختبار مرجعي." },
  },
  {
    id: "SEM-2026-102",
    collectedAt: "2026-10-02T11:05:00.000Z",
    receivedAt: "2026-10-02T11:31:00.000Z",
    sampleType: "عينة بعد الامتناع",
    notes: "الفيديو قصير نسبيًا",
    researchOptIn: false,
    videoName: "SEM-2026-102.mp4",
    videoSizeMb: 7.2,
    videoDurationSec: 8,
    framesAnalyzed: 30,
    concentration: 12.6,
    progressiveMotility: 21.3,
    nonProgressiveMotility: 11.1,
    immotile: 67.6,
    totalMotility: 32.4,
    confidence: 0.64,
    qualityScore: 58,
    qualityLabel: "needs_attention",
    qualityIssues: ["مدة الفيديو أقل من الموصى به.", "عدد المسارات المكتشفة منخفض."],
    warnings: ["لا تستخدم المقارنة المرجعية وحدها لاتخاذ قرار طبي."],
    calibration: {
      micronsPerPixel: 0.42,
      chamberDepth: 20,
      calibratedAt: "2026-09-28T08:12:00.000Z",
    },
    reviewStatus: "pending",
  },
];

export function createDemoSample(input: {
  id: string;
  collectedAt: string;
  receivedAt: string;
  sampleType: string;
  notes: string;
  researchOptIn: boolean;
  videoName: string;
  videoSizeMb: number;
  videoDurationSec: number;
}): SampleRecord {
  const seed = input.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const concentration = 19 + (seed % 22) / 2;
  const progressive = 27 + (seed % 15) / 2;
  const totalMotility = progressive + 13.4;
  const qualityScore = input.videoDurationSec >= 12 ? 84 : 61;
  const qualityLabel: QualityLabel = qualityScore >= 75 ? "good" : "needs_attention";
  return {
    ...input,
      framesAnalyzed: input.videoDurationSec >= 12 ? 60 : 30,
      analyzedDurationSec: input.videoDurationSec,
      coveragePct: 100,
    concentration: Number(concentration.toFixed(1)),
    progressiveMotility: Number(progressive.toFixed(1)),
    nonProgressiveMotility: 13.4,
    immotile: Number((100 - totalMotility).toFixed(1)),
    totalMotility: Number(totalMotility.toFixed(1)),
    confidence: qualityScore / 100,
    qualityScore,
    qualityLabel,
    qualityIssues:
      qualityLabel === "good"
        ? []
        : ["مدة الفيديو أقل من الموصى به؛ أعد التصوير لمدة أطول إن أمكن."],
    warnings: [
      "هذه نتيجة بحثية مساعدة وليست تشخيصًا طبيًا.",
      "يجب أن يراجع الفني المعايرة والفيديو والنتيجة قبل أي استخدام.",
    ],
    calibration: {
      micronsPerPixel: 0.42,
      chamberDepth: 20,
      calibratedAt: new Date().toISOString(),
    },
    reviewStatus: "pending",
    morphology: {
      method: "manual",
      totalExamined: 0,
      normalForms: 0,
      roundHeads: 0,
      elongatedHeads: 0,
      irregularHeads: 0,
      coiledTails: 0,
      bentTails: 0,
      doubleTails: 0,
      acrosomeAbnormal: 0,
      midpieceDefects: 0,
      tzi: 0,
      sdi: 0,
      automaticLimitations: ["لم يتم تسجيل فحص مورفولوجي بعد."],
    },
    advancedTests: { source: "manual", notes: "غير مقاس آليًا في هذه النسخة." },
  };
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function qualityLabelText(label: QualityLabel) {
  if (label === "good") return "جودة جيدة";
  if (label === "needs_attention") return "تحتاج انتباهًا";
  return "بيانات غير كافية";
}
