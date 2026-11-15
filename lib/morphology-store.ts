import AsyncStorage from "@react-native-async-storage/async-storage";

export type MorphologyPreparation = "stained" | "unstained" | "unknown";
export type HeadShape = "normal" | "round" | "tapered" | "amorphous" | "small" | "large" | "vacuolated" | "not-assessable";
export type TailStatus = "normal" | "bent" | "coiled" | "multiple" | "absent" | "not-assessable";

export type MorphologyObjectAnnotation = {
  objectId: string;
  headShape: HeadShape;
  tailStatus: TailStatus;
  overlap: boolean;
  debris: boolean;
  reviewerNote?: string;
  annotatedAt: string;
};

export type MorphologyImageRecord = {
  id: string;
  uri: string;
  fileName: string;
  fileSizeBytes: number;
  importedAt: string;
  preparation: MorphologyPreparation;
  objectiveMagnification: number | null;
  pixelSizeUm: number | null;
  microscopeId?: string;
  pseudonymousSampleId: string;
  reviewerId: string;
  adjudicationStatus: "single-review" | "adjudicated" | "unresolved";
  objects: MorphologyObjectAnnotation[];
};

const STORAGE_KEY = "semenassist.morphology-images.v1";
const MAX_IMAGES = 100;

export async function loadMorphologyImages(): Promise<MorphologyImageRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as MorphologyImageRecord[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveMorphologyImages(records: MorphologyImageRecord[]) {
  if (records.length > MAX_IMAGES) throw new Error(`الحد الأقصى ${MAX_IMAGES} صورة في مجموعة العمل المحلية.`);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export async function addMorphologyImages(records: MorphologyImageRecord[]) {
  const current = await loadMorphologyImages();
  const next = [...records, ...current.filter((old) => !records.some((item) => item.id === old.id))];
  await saveMorphologyImages(next);
  return next;
}

export async function updateMorphologyImage(record: MorphologyImageRecord) {
  const current = await loadMorphologyImages();
  const next = current.map((item) => item.id === record.id ? record : item);
  await saveMorphologyImages(next);
  return next;
}

export async function deleteMorphologyImage(id: string) {
  const current = await loadMorphologyImages();
  const next = current.filter((item) => item.id !== id);
  await saveMorphologyImages(next);
  return next;
}
