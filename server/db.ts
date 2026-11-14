import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { analysisRuns, auditLogs, benchmarkRuns, calibrationProfiles, humanReviews, InsertAuditLog, InsertUser, sampleReports, syncQueue, users, videoAssets } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch { console.warn("[Database] Failed to connect"); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  values.lastSignedIn ??= new Date(); updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0]; }

export async function setUserRole(openId: string, role: "technician" | "supervisor" | "admin") {
  const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.openId, openId)); return getUserByOpenId(openId);
}

export async function saveSampleReport(input: {
  sampleId: string; ownerOpenId?: string | null; laboratoryId?: number | null; calibrationId?: number | null; videoAssetId?: number | null;
  reviewStatus: "pending" | "reviewed"; analysisStatus?: "queued" | "processing" | "completed" | "failed" | "cancelled";
  analysisEngine?: string; analysisVersion?: string; payload: unknown;
}) {
  const db = await getDb(); if (!db) return null;
  const existing = await db.select().from(sampleReports).where(eq(sampleReports.sampleId, input.sampleId)).limit(1);
  if (existing[0] && existing[0].ownerOpenId !== (input.ownerOpenId ?? null)) {
    throw new Error("لا تملك صلاحية تعديل هذه العينة");
  }
  const payload = JSON.stringify(input.payload);
  await db.insert(sampleReports).values({ sampleId: input.sampleId, ownerOpenId: input.ownerOpenId ?? null, laboratoryId: input.laboratoryId ?? null, calibrationId: input.calibrationId ?? null, videoAssetId: input.videoAssetId ?? null, reviewStatus: input.reviewStatus, analysisStatus: input.analysisStatus ?? "completed", analysisEngine: input.analysisEngine ?? "opencv-centroid-tracker", analysisVersion: input.analysisVersion ?? "0.1.0", payload }).onDuplicateKeyUpdate({ set: { laboratoryId: input.laboratoryId ?? null, calibrationId: input.calibrationId ?? null, videoAssetId: input.videoAssetId ?? null, reviewStatus: input.reviewStatus, analysisStatus: input.analysisStatus ?? "completed", analysisEngine: input.analysisEngine ?? "opencv-centroid-tracker", analysisVersion: input.analysisVersion ?? "0.1.0", payload, updatedAt: new Date() } });
  const result = await db.select().from(sampleReports).where(eq(sampleReports.sampleId, input.sampleId)).limit(1); return result[0] ?? null;
}

export async function recordAnalysisRun(input: { sampleId: string; videoAssetId?: number; calibrationId?: number; engine: string; engineVersion: string; status: "queued" | "processing" | "completed" | "failed" | "cancelled"; result?: unknown; errorMessage?: string; processingMs?: number; startedAt?: Date; completedAt?: Date; }) {
  const db = await getDb(); if (!db) return null;
  const result = await db.insert(analysisRuns).values({ sampleId: input.sampleId, videoAssetId: input.videoAssetId, calibrationId: input.calibrationId, engine: input.engine, engineVersion: input.engineVersion, status: input.status, resultPayload: input.result === undefined ? null : JSON.stringify(input.result), errorMessage: input.errorMessage, processingMs: input.processingMs, startedAt: input.startedAt, completedAt: input.completedAt });
  return result;
}

export async function recordHumanReview(input: { sampleId: string; reviewerOpenId: string; reviewerRole: string; correctedConcentration?: number; correctedTotalMotility?: number; correctedProgressiveMotility?: number; morphology?: unknown; note?: string; }) {
  const db = await getDb(); if (!db) return null;
  return db.insert(humanReviews).values({ sampleId: input.sampleId, reviewerOpenId: input.reviewerOpenId, reviewerRole: input.reviewerRole, correctedConcentration: input.correctedConcentration?.toString(), correctedTotalMotility: input.correctedTotalMotility?.toString(), correctedProgressiveMotility: input.correctedProgressiveMotility?.toString(), morphologyPayload: input.morphology === undefined ? null : JSON.stringify(input.morphology), note: input.note });
}

export async function registerVideoAsset(input: { sampleId: string; laboratoryId?: number; storageKey?: string; mimeType: string; sizeBytes: number; durationSec?: number; sha256: string; retentionUntil?: Date; consentStatus?: "not_requested" | "granted" | "denied"; }) {
  const db = await getDb(); if (!db) return null;
  return db.insert(videoAssets).values({ sampleId: input.sampleId, laboratoryId: input.laboratoryId, storageKey: input.storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, durationSec: input.durationSec?.toString(), sha256: input.sha256, retentionUntil: input.retentionUntil, consentStatus: input.consentStatus ?? "not_requested" });
}

export async function enqueueSync(input: { userOpenId: string; entityType: string; entityId: string; operation: "upsert" | "delete"; payload: unknown; }) {
  const db = await getDb(); if (!db) return null;
  return db.insert(syncQueue).values({ userOpenId: input.userOpenId, entityType: input.entityType, entityId: input.entityId, operation: input.operation, payload: JSON.stringify(input.payload) });
}

export async function createCalibrationProfile(input: { laboratoryId: number; name: string; deviceModel?: string; lens?: string; micronsPerPixel: number; chamberDepth: number; lightingSetup?: string; createdBy: string; }) {
  const db = await getDb(); if (!db) return null;
  return db.insert(calibrationProfiles).values({ laboratoryId: input.laboratoryId, name: input.name, deviceModel: input.deviceModel, lens: input.lens, micronsPerPixel: input.micronsPerPixel.toString(), chamberDepth: input.chamberDepth.toString(), lightingSetup: input.lightingSetup, createdBy: input.createdBy });
}

export async function listCalibrationProfiles(laboratoryId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(calibrationProfiles).where(eq(calibrationProfiles.laboratoryId, laboratoryId)).orderBy(desc(calibrationProfiles.createdAt));
}

export async function saveBenchmarkRun(input: { datasetVersion: string; engineVersion: string; sampleCount: number; metrics: unknown; failedSamples?: unknown; }) {
  const db = await getDb(); if (!db) return null;
  return db.insert(benchmarkRuns).values({ datasetVersion: input.datasetVersion, engineVersion: input.engineVersion, sampleCount: input.sampleCount, metricsPayload: JSON.stringify(input.metrics), failedSamples: input.failedSamples === undefined ? null : JSON.stringify(input.failedSamples) });
}

export async function getSampleReport(sampleId: string) { const db = await getDb(); if (!db) return null; const result = await db.select().from(sampleReports).where(eq(sampleReports.sampleId, sampleId)).limit(1); return result[0] ?? null; }
export async function listSampleReports(limit = 100, ownerOpenId?: string) { const db = await getDb(); if (!db) return []; const query = db.select().from(sampleReports); const filtered = ownerOpenId ? query.where(eq(sampleReports.ownerOpenId, ownerOpenId)) : query; return filtered.orderBy(desc(sampleReports.updatedAt)).limit(Math.min(limit, 200)); }
export async function appendAuditLog(input: InsertAuditLog) { const db = await getDb(); if (!db) return null; return db.insert(auditLogs).values(input); }
export async function listAuditLogs(limit = 100) { const db = await getDb(); if (!db) return []; return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(limit, 200)); }

export { calibrationProfiles };
