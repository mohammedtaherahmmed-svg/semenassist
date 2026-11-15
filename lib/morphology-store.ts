import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export type MorphologyPreparation = "stained" | "unstained" | "unknown";
export type HeadShape = "normal" | "round" | "tapered" | "amorphous" | "small" | "large" | "vacuolated" | "not-assessable";
export type TailStatus = "normal" | "bent" | "coiled" | "multiple" | "absent" | "not-assessable";
export type MaskRegion = "head" | "midpiece" | "tail";
export type NormalizedPoint = { x: number; y: number };
export type ExpertMask = { region: MaskRegion; points: NormalizedPoint[]; createdAt: string; reviewerId: string };

export type MorphologyObjectAnnotation = {
  objectId: string;
  headShape: HeadShape;
  tailStatus: TailStatus;
  overlap: boolean;
  debris: boolean;
  reviewerNote?: string;
  masks: ExpertMask[];
  annotatedAt: string;
  reviewerId: string;
  secondReview?: { reviewerId: string; headShape: HeadShape; tailStatus: TailStatus; overlap: boolean; debris: boolean; masks: ExpertMask[]; reviewedAt: string };
};

export type MorphologyImageRecord = {
  id: string;
  uri: string;
  originalUri?: string;
  fileName: string;
  fileSizeBytes: number;
  importedAt: string;
  preparation: MorphologyPreparation;
  objectiveMagnification: number | null;
  pixelSizeUm: number | null;
  imageWidthPx: number | null;
  imageHeightPx: number | null;
  microscopeId?: string;
  pseudonymousSampleId: string;
  reviewerId: string;
  secondReviewerId?: string;
  adjudicationStatus: "single-review" | "adjudicated" | "unresolved";
  objects: MorphologyObjectAnnotation[];
};

const STORAGE_KEY = "semenassist.morphology-images.v2";
const IMAGE_DIR = `${FileSystem.documentDirectory ?? ""}morphology-images/`;
const EXPORT_DIR = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}morphology-export/`;
const MAX_IMAGES = 100;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "microscopy-image";
}

export async function ensureMorphologyDirectories() {
  if (!FileSystem.documentDirectory) throw new Error("التخزين الدائم غير متاح على هذا الجهاز.");
  await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true }).catch(() => undefined);
}

export async function loadMorphologyImages(): Promise<MorphologyImageRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // One-time migration from the earlier metadata-only key.
    const old = await AsyncStorage.getItem("semenassist.morphology-images.v1");
    if (!old) return [];
    try {
      const legacy = JSON.parse(old) as MorphologyImageRecord[];
      const migrated: MorphologyImageRecord[] = [];
      for (const item of legacy) {
        const info = await FileSystem.getInfoAsync(item.uri);
        if (!info.exists || info.isDirectory) continue;
        const destination = IMAGE_DIR + `${item.id}-${safeFileName(item.fileName)}`;
        await ensureMorphologyDirectories();
        await FileSystem.copyAsync({ from: item.uri, to: destination });
        migrated.push({ ...item, uri: destination, originalUri: item.uri, imageWidthPx: null, imageHeightPx: null, objects: item.objects.map((o) => ({ ...o, masks: [], reviewerId: item.reviewerId })) });
      }
      await saveMorphologyImages(migrated);
      return migrated;
    } catch {
      return [];
    }
  }
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
  await ensureMorphologyDirectories();
  const current = await loadMorphologyImages();
  const existingBytes = current.reduce((sum, item) => sum + item.fileSizeBytes, 0);
  const incomingBytes = records.reduce((sum, item) => sum + item.fileSizeBytes, 0);
  if (existingBytes + incomingBytes > 250 * 1024 * 1024) throw new Error("تجاوزت مجموعة الصور حد التخزين المحلي البالغ 250 MB.");
  const persisted: MorphologyImageRecord[] = [];
  for (const item of records) {
    if (item.fileSizeBytes > MAX_IMAGE_BYTES) throw new Error("حجم الصورة يتجاوز 20 MB.");
    const destination = IMAGE_DIR + `${item.id}-${safeFileName(item.fileName)}`;
    await FileSystem.copyAsync({ from: item.uri, to: destination });
    persisted.push({ ...item, uri: destination, originalUri: item.uri });
  }
  const next = [...persisted, ...current.filter((old) => !persisted.some((item) => item.id === old.id))];
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
  const removed = current.find((item) => item.id === id);
  if (removed?.uri.startsWith(IMAGE_DIR)) await FileSystem.deleteAsync(removed.uri, { idempotent: true }).catch(() => undefined);
  const next = current.filter((item) => item.id !== id);
  await saveMorphologyImages(next);
  return next;
}

export async function exportMorphologyDataset(records: MorphologyImageRecord[]) {
  if (!records.length) throw new Error("لا توجد صور لتصديرها.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("مشاركة الملفات غير متاحة على هذا الجهاز.");
  await FileSystem.makeDirectoryAsync(EXPORT_DIR, { intermediates: true }).catch(() => undefined);
  const exportedAt = new Date().toISOString();
  const manifest = {
    schema_version: "1.1.0",
    dataset_name: "SemenAssist expert-reviewed morphology research dataset",
    exported_at: exportedAt,
    purpose: "research_dataset_only_not_a_clinical_scoring_specification",
    split_policy: "assign_by_pseudonymous_sample_id_only_to_prevent_sample_leakage",
    images: records.map((record) => ({
      sample_id: record.pseudonymousSampleId,
      image_path: `images/${safeFileName(record.fileName)}`,
      preparation: record.preparation,
      pixel_size_um: record.pixelSizeUm,
      microscope_id: record.microscopeId,
      objective_magnification: record.objectiveMagnification,
      image_width_px: record.imageWidthPx,
      image_height_px: record.imageHeightPx,
      reviewer_id: record.reviewerId,
      second_reviewer_id: record.secondReviewerId,
      adjudication_status: record.adjudicationStatus,
      objects: record.objects.map((object) => ({
        object_id: object.objectId,
        labels: { head_shape: object.headShape, tail_status: object.tailStatus, overlap: object.overlap, debris: object.debris },
        masks: object.masks.map((mask) => ({ region: mask.region, points_normalized: mask.points, reviewer_id: mask.reviewerId, created_at: mask.createdAt })),
        second_review: object.secondReview ? {
          reviewer_id: object.secondReview.reviewerId,
          reviewed_at: object.secondReview.reviewedAt,
          labels: { head_shape: object.secondReview.headShape, tail_status: object.secondReview.tailStatus, overlap: object.secondReview.overlap, debris: object.secondReview.debris },
          masks: object.secondReview.masks.map((mask) => ({ region: mask.region, points_normalized: mask.points, reviewer_id: mask.reviewerId, created_at: mask.createdAt })),
        } : null,
        annotated_at: object.annotatedAt,
        reviewer_id: object.reviewerId,
      })),
    })),
  };
  const manifestUri = EXPORT_DIR + "morphology-dataset-manifest.json";
  await FileSystem.writeAsStringAsync(manifestUri, JSON.stringify(manifest, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(manifestUri, { mimeType: "application/json", dialogTitle: "تصدير ملف تعريف مجموعة Morphology" });
  return { manifestUri, imageCount: records.length, exportedAt };
}

export async function shareMorphologyImage(record: MorphologyImageRecord) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("مشاركة الملفات غير متاحة على هذا الجهاز.");
  await Sharing.shareAsync(record.uri, { mimeType: "image/*", dialogTitle: record.fileName });
}
