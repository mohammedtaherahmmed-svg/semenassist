export type CalibrationInput = {
  micronsPerPixel: number;
  chamberDepth: number;
  setupLabel: string;
  calibratedAt?: string;
};

export type FrameQualityMetrics = {
  meanBrightness: number;
  contrastStdDev: number;
  sharpnessVariance: number;
};

export function validateCalibration(input: CalibrationInput): string | null {
  if (!Number.isFinite(input.micronsPerPixel) || input.micronsPerPixel <= 0) {
    return "أدخل قيمة ميكرومتر/بكسل موجبة وصحيحة.";
  }
  if (!Number.isFinite(input.chamberDepth) || input.chamberDepth <= 0) {
    return "أدخل عمق حجرة موجبًا وصحيحًا.";
  }
  if (!input.setupLabel.trim()) return "أدخل اسمًا لإعداد الميكروسكوب.";
  if (input.calibratedAt && !Number.isFinite(Date.parse(input.calibratedAt))) {
    return "تاريخ المعايرة غير صالح.";
  }
  return null;
}

/** Convert a known stage-micrometer distance into microns per image pixel. */
export function calculateMicronsPerPixel(referenceLengthMicrons: number, measuredPixels: number): number {
  if (!Number.isFinite(referenceLengthMicrons) || referenceLengthMicrons <= 0) {
    throw new Error("طول مرجع المعايرة يجب أن يكون أكبر من صفر.");
  }
  if (!Number.isFinite(measuredPixels) || measuredPixels <= 0) {
    throw new Error("عدد البكسلات المقاس يجب أن يكون أكبر من صفر.");
  }
  return referenceLengthMicrons / measuredPixels;
}

/**
 * Engineering QC flags for acquisition quality. These heuristic thresholds
 * are screening safeguards, not clinical acceptance criteria.
 */
export function frameQualityIssues(metrics: FrameQualityMetrics): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(metrics.meanBrightness) || metrics.meanBrightness < 0 || metrics.meanBrightness > 255) {
    return ["تعذر حساب جودة الإضاءة للإطارات."];
  }
  if (metrics.meanBrightness < 35) issues.push("متوسط سطوع الإطارات منخفض؛ راجع الإضاءة.");
  if (metrics.meanBrightness > 225) issues.push("الإطارات شديدة السطوع؛ قد تكون تفاصيل الخلايا مفقودة.");
  if (!Number.isFinite(metrics.contrastStdDev) || metrics.contrastStdDev < 18) {
    issues.push("التباين منخفض؛ راجع ضبط الإضاءة والتكثيف.");
  }
  if (!Number.isFinite(metrics.sharpnessVariance) || metrics.sharpnessVariance < 12) {
    issues.push("حدة الصورة منخفضة أو التركيز غير واضح.");
  }
  return issues;
}
