import AsyncStorage from "@react-native-async-storage/async-storage";

import { seedSamples, type SampleRecord } from "@/lib/sample-types";

const SAMPLES_KEY = "semenassist.samples.v1";
const CALIBRATION_KEY = "semenassist.calibration.v1";

export type CalibrationRecord = {
  micronsPerPixel: number;
  chamberDepth: number;
  calibratedAt: string;
  setupLabel: string;
};

export async function loadSamples(): Promise<SampleRecord[]> {
  const raw = await AsyncStorage.getItem(SAMPLES_KEY);
  if (!raw) {
    await AsyncStorage.setItem(SAMPLES_KEY, JSON.stringify(seedSamples));
    return seedSamples;
  }
  try {
    const parsed = JSON.parse(raw) as SampleRecord[];
    return Array.isArray(parsed) ? parsed : seedSamples;
  } catch {
    return seedSamples;
  }
}

export async function saveSamples(samples: SampleRecord[]) {
  await AsyncStorage.setItem(SAMPLES_KEY, JSON.stringify(samples));
}

export async function upsertSample(sample: SampleRecord) {
  const samples = await loadSamples();
  const next = [sample, ...samples.filter((item) => item.id !== sample.id)];
  await saveSamples(next);
  return next;
}

export async function getSample(sampleId: string) {
  const samples = await loadSamples();
  return samples.find((sample) => sample.id === sampleId);
}

export async function loadCalibration(): Promise<CalibrationRecord | null> {
  const raw = await AsyncStorage.getItem(CALIBRATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CalibrationRecord;
  } catch {
    return null;
  }
}

export async function saveCalibration(calibration: CalibrationRecord) {
  await AsyncStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
}
