import AsyncStorage from "@react-native-async-storage/async-storage";

export type MorphologyCount = {
  sampleId: string;
  imagesReviewed: number;
  totalExamined: number;
  normalForms: number;
  abnormalForms: number;
  notAssessable: number;
  updatedAt: string;
};

const MORPHOLOGY_COUNT_KEY = "semenassist.morphology-count.v1";

export function calculateConcentrationMillionPerMl(input: {
  spermCount: number;
  countedAreaMm2: number;
  chamberDepthUm: number;
  dilutionFactor: number;
}) {
  const { spermCount, countedAreaMm2, chamberDepthUm, dilutionFactor } = input;
  if (![spermCount, countedAreaMm2, chamberDepthUm, dilutionFactor].every(Number.isFinite)) {
    throw new Error("أدخل قيمًا رقمية صالحة.");
  }
  if (spermCount < 0 || !Number.isInteger(spermCount)) throw new Error("عدد الخلايا يجب أن يكون عددًا صحيحًا غير سالب.");
  if (countedAreaMm2 <= 0 || chamberDepthUm <= 0 || dilutionFactor <= 0) {
    throw new Error("مساحة العد وعمق الحجرة ومعامل التخفيف يجب أن تكون أكبر من صفر.");
  }
  // cells/mL = count * dilution / (area[mm²] * depth[µm] * 1e-6 mL)
  // Return in millions/mL, so the 1e6 factors cancel.
  return (spermCount * dilutionFactor) / (countedAreaMm2 * chamberDepthUm);
}

export function summarizeMorphologyCount(count: MorphologyCount) {
  const classified = count.normalForms + count.abnormalForms;
  return {
    classified,
    normalPercent: classified ? (count.normalForms / classified) * 100 : null,
    abnormalPercent: classified ? (count.abnormalForms / classified) * 100 : null,
    completionPercent: count.totalExamined ? (classified / count.totalExamined) * 100 : 0,
  };
}

export async function loadMorphologyCounts(): Promise<MorphologyCount[]> {
  const raw = await AsyncStorage.getItem(MORPHOLOGY_COUNT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MorphologyCount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveMorphologyCount(count: MorphologyCount) {
  const current = await loadMorphologyCounts();
  const next = [count, ...current.filter((item) => item.sampleId !== count.sampleId)];
  await AsyncStorage.setItem(MORPHOLOGY_COUNT_KEY, JSON.stringify(next));
  return next;
}
