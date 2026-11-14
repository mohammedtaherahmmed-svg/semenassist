import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["technician", "supervisor", "admin"]).default("technician").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const laboratories = mysqlTable("laboratories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  country: varchar("country", { length: 80 }),
  timezone: varchar("timezone", { length: 64 }).default("Africa/Cairo"),
  settings: text("settings"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Laboratory = typeof laboratories.$inferSelect;

export const laboratoryMembers = mysqlTable("laboratory_members", {
  id: int("id").autoincrement().primaryKey(),
  laboratoryId: int("laboratoryId").notNull(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["technician", "supervisor", "admin"]).default("technician").notNull(),
  status: mysqlEnum("status", ["active", "invited", "suspended"]).default("active").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  deactivatedAt: timestamp("deactivatedAt"),
}, (table) => ({ laboratoryMemberIdx: index("laboratory_members_lab_user_idx").on(table.laboratoryId, table.userOpenId) }));
export type LaboratoryMember = typeof laboratoryMembers.$inferSelect;

export const calibrationProfiles = mysqlTable("calibration_profiles", {
  id: int("id").autoincrement().primaryKey(),
  laboratoryId: int("laboratoryId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  deviceModel: varchar("deviceModel", { length: 120 }),
  lens: varchar("lens", { length: 80 }),
  micronsPerPixel: varchar("micronsPerPixel", { length: 32 }).notNull(),
  chamberDepth: varchar("chamberDepth", { length: 32 }).notNull(),
  lightingSetup: text("lightingSetup"),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  verifiedBy: varchar("verifiedBy", { length: 64 }),
  verifiedAt: timestamp("verifiedAt"),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ calibrationLabIdx: index("calibration_profiles_lab_active_idx").on(table.laboratoryId, table.isActive) }));
export type CalibrationProfile = typeof calibrationProfiles.$inferSelect;

export const sampleReports = mysqlTable("sample_reports", {
  id: int("id").autoincrement().primaryKey(),
  sampleId: varchar("sampleId", { length: 64 }).notNull().unique(),
  laboratoryId: int("laboratoryId"),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }),
  calibrationId: int("calibrationId"),
  videoAssetId: int("videoAssetId"),
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "reviewed"]).default("pending").notNull(),
  analysisStatus: mysqlEnum("analysisStatus", ["queued", "processing", "completed", "failed", "cancelled"]).default("completed").notNull(),
  analysisEngine: varchar("analysisEngine", { length: 80 }).default("opencv-centroid-tracker"),
  analysisVersion: varchar("analysisVersion", { length: 32 }).default("0.1.0"),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ ownerIdx: index("sample_reports_owner_idx").on(table.ownerOpenId), labStatusIdx: index("sample_reports_lab_status_idx").on(table.laboratoryId, table.reviewStatus), updatedIdx: index("sample_reports_updated_idx").on(table.updatedAt) }));
export type SampleReport = typeof sampleReports.$inferSelect;
export type InsertSampleReport = typeof sampleReports.$inferInsert;

export const videoAssets = mysqlTable("video_assets", {
  id: int("id").autoincrement().primaryKey(),
  sampleId: varchar("sampleId", { length: 64 }).notNull(),
  laboratoryId: int("laboratoryId"),
  storageKey: varchar("storageKey", { length: 512 }),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  durationSec: varchar("durationSec", { length: 32 }),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  retentionUntil: timestamp("retentionUntil"),
  consentStatus: mysqlEnum("consentStatus", ["not_requested", "granted", "denied"]).default("not_requested").notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  deletedAt: timestamp("deletedAt"),
}, (table) => ({ videoHashIdx: index("video_assets_sha256_idx").on(table.sha256), videoSampleIdx: index("video_assets_sample_idx").on(table.sampleId) }));
export type VideoAsset = typeof videoAssets.$inferSelect;

export const analysisRuns = mysqlTable("analysis_runs", {
  id: int("id").autoincrement().primaryKey(),
  sampleId: varchar("sampleId", { length: 64 }).notNull(),
  videoAssetId: int("videoAssetId"),
  calibrationId: int("calibrationId"),
  engine: varchar("engine", { length: 80 }).notNull(),
  engineVersion: varchar("engineVersion", { length: 32 }).notNull(),
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed", "cancelled"]).default("queued").notNull(),
  resultPayload: text("resultPayload"),
  errorMessage: text("errorMessage"),
  processingMs: int("processingMs"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ runSampleIdx: index("analysis_runs_sample_idx").on(table.sampleId), runStatusIdx: index("analysis_runs_status_idx").on(table.status), runEngineIdx: index("analysis_runs_engine_idx").on(table.engineVersion) }));
export type AnalysisRun = typeof analysisRuns.$inferSelect;

export const humanReviews = mysqlTable("human_reviews", {
  id: int("id").autoincrement().primaryKey(),
  sampleId: varchar("sampleId", { length: 64 }).notNull(),
  reviewerOpenId: varchar("reviewerOpenId", { length: 64 }).notNull(),
  reviewerRole: varchar("reviewerRole", { length: 32 }).notNull(),
  correctedConcentration: varchar("correctedConcentration", { length: 32 }),
  correctedTotalMotility: varchar("correctedTotalMotility", { length: 32 }),
  correctedProgressiveMotility: varchar("correctedProgressiveMotility", { length: 32 }),
  morphologyPayload: text("morphologyPayload"),
  note: text("note"),
  status: mysqlEnum("status", ["draft", "final"]).default("final").notNull(),
  reviewedAt: timestamp("reviewedAt").defaultNow().notNull(),
}, (table) => ({ reviewSampleIdx: index("human_reviews_sample_idx").on(table.sampleId), reviewerIdx: index("human_reviews_reviewer_idx").on(table.reviewerOpenId) }));
export type HumanReview = typeof humanReviews.$inferSelect;

export const syncQueue = mysqlTable("sync_queue", {
  id: int("id").autoincrement().primaryKey(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: varchar("entityId", { length: 128 }).notNull(),
  operation: mysqlEnum("operation", ["upsert", "delete"]).notNull(),
  payload: text("payload").notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastError: text("lastError"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  nextRetryAt: timestamp("nextRetryAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ syncStatusIdx: index("sync_queue_status_retry_idx").on(table.status, table.nextRetryAt), syncUserIdx: index("sync_queue_user_idx").on(table.userOpenId) }));
export type SyncQueueItem = typeof syncQueue.$inferSelect;

export const analysisEngines = mysqlTable("analysis_engines", {
  id: int("id").autoincrement().primaryKey(),
  engineName: varchar("engineName", { length: 80 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  thresholds: text("thresholds"),
  releaseNotes: text("releaseNotes"),
  validatedOn: timestamp("validatedOn"),
  isActive: int("isActive").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ engineVersionIdx: index("analysis_engines_name_version_idx").on(table.engineName, table.version) }));
export type AnalysisEngine = typeof analysisEngines.$inferSelect;

export const benchmarkRuns = mysqlTable("benchmark_runs", {
  id: int("id").autoincrement().primaryKey(),
  datasetVersion: varchar("datasetVersion", { length: 80 }).notNull(),
  engineVersion: varchar("engineVersion", { length: 32 }).notNull(),
  sampleCount: int("sampleCount").notNull(),
  metricsPayload: text("metricsPayload").notNull(),
  failedSamples: text("failedSamples"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ benchmarkEngineIdx: index("benchmark_runs_engine_idx").on(table.engineVersion), benchmarkDatasetIdx: index("benchmark_runs_dataset_idx").on(table.datasetVersion) }));
export type BenchmarkRun = typeof benchmarkRuns.$inferSelect;

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  actorOpenId: varchar("actorOpenId", { length: 64 }),
  actorRole: varchar("actorRole", { length: 32 }),
  laboratoryId: int("laboratoryId"),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entityType", { length: 64 }).notNull(),
  entityId: varchar("entityId", { length: 128 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ auditEntityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId), auditCreatedIdx: index("audit_logs_created_idx").on(table.createdAt), auditActorIdx: index("audit_logs_actor_idx").on(table.actorOpenId) }));
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
