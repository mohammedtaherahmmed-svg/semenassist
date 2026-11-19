import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, router, supervisorProcedure, publicProcedure } from "./_core/trpc";
import { appendAuditLog, createCalibrationProfile, getLaboratoryMembership, getSampleReport, listAuditLogs, listCalibrationProfiles, listSampleReports, listUserLaboratoryIds, recordAnalysisRun, recordHumanReview, saveBenchmarkRun, saveSampleReport, setUserRole } from "./db";
import { activateDevice, createActivationChallenge, getLatestAppRelease, issueDeviceLicense, listDeviceLicenses, publishAppRelease, revokeDeviceLicense, validateLicensedDevice } from "./licensing";

const reportInput = z.object({
  sampleId: z.string().min(1),
  concentration: z.number(),
  totalMotility: z.number(),
  progressiveMotility: z.number(),
  confidence: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(100),
  qualityIssues: z.array(z.string()),
  warnings: z.array(z.string()),
  reviewed: z.boolean(),
});

const storedSampleInput = z.object({
  sampleId: z.string().min(1).max(64),
  reviewStatus: z.enum(["pending", "reviewed"]),
  analysisEngine: z.string().max(80).optional(),
  analysisVersion: z.string().max(32).optional(),
  sample: z.record(z.string(), z.unknown()),
});

const interpretationShape = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    signals: { type: "array", items: { type: "string" } },
    caveats: { type: "array", items: { type: "string" } },
    nextStep: { type: "string" },
  },
  required: ["summary", "signals", "caveats", "nextStep"],
};

type Interpretation = {
  summary: string;
  signals: string[];
  caveats: string[];
  nextStep: string;
};

function deterministicFallback(report: z.infer<typeof reportInput>): Interpretation {
  return {
    summary: "هذا شرح تعليمي لمؤشرات التقرير، وليس تشخيصًا طبيًا. النتيجة تبدو قابلة للقراءة الأولية، لكن درجة الثقة وحدود الفيديو يجب أن تقود قرار المراجعة.",
    signals: [
      report.concentration >= 16 ? "التركيز التقديري فوق الحد الإرشادي في هذا التقرير." : "التركيز التقديري تحت الحد الإرشادي ويحتاج مقارنة بعدّ يدوي.",
      report.totalMotility >= 42 ? "إجمالي الحركة فوق الحد الإرشادي المستخدم للمقارنة." : "إجمالي الحركة تحت الحد الإرشادي المستخدم للمقارنة.",
    ],
    caveats: report.qualityIssues.length > 0 ? report.qualityIssues : ["القياس حاسوبي تقديري ولا يغني عن فحص العينة ومراجعتها."],
    nextStep: report.reviewed ? "وثّق ما تمت مراجعته واحتفظ بالملاحظة المرجعية للمقارنة المستقبلية." : "راجع المعايرة والفيديو والعدّ اليدوي، ثم احفظ تصحيح الفني قبل اعتماد التقرير الداخلي.",
  };
}

function extractText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part && typeof part === "object" && "text" in part ? String((part as { text?: unknown }).text ?? "") : "").join("\n");
  return "";
}

export const appRouter = router({
  system: systemRouter,
  licensing: router({
    challenge: publicProcedure.input(z.object({
      installationId: z.string().min(16).max(128),
    })).mutation(({ input }) => createActivationChallenge(input.installationId)),
    activate: publicProcedure.input(z.object({
      serial: z.string().min(12).max(64),
      installationId: z.string().min(16).max(128),
      publicKeyPem: z.string().min(80).max(4096),
      challengeId: z.string().length(48),
      signature: z.string().min(80).max(256),
      appVersion: z.string().max(32).optional(),
      versionCode: z.number().int().positive().optional(),
    })).mutation(({ input }) => activateDevice(input)),
    validate: publicProcedure.input(z.object({
      installationId: z.string().min(16).max(128),
      challengeId: z.string().length(48),
      signature: z.string().min(80).max(256),
    })).mutation(({ input }) => validateLicensedDevice(input)),
    admin: router({
      issue: adminProcedure.input(z.object({
        expiresAt: z.coerce.date().optional(),
        notes: z.string().max(2000).optional(),
      })).mutation(async ({ input, ctx }) => {
        const result = await issueDeviceLicense({ ...input, createdBy: ctx.user.openId });
        await appendAuditLog({ actorOpenId: ctx.user.openId, actorRole: ctx.user.role, action: "license.issue", entityType: "device_license", entityId: "new", details: JSON.stringify({ expiresAt: result.expiresAt }) });
        return result;
      }),
      list: adminProcedure.query(() => listDeviceLicenses()),
      revoke: adminProcedure.input(z.object({
        licenseId: z.number().int().positive(),
      })).mutation(async ({ input, ctx }) => {
        const result = await revokeDeviceLicense(input.licenseId);
        await appendAuditLog({ actorOpenId: ctx.user.openId, actorRole: ctx.user.role, action: "license.revoke", entityType: "device_license", entityId: String(input.licenseId) });
        return result;
      }),
      publishRelease: adminProcedure.input(z.object({
        version: z.string().regex(/^\\d+\\.\\d+\\.\\d+([+-][a-zA-Z0-9.-]+)?$/).max(32),
        versionCode: z.number().int().positive(),
        channel: z.enum(["stable", "beta"]),
        minSupportedVersionCode: z.number().int().positive(),
        mandatory: z.boolean(),
        apkUrl: z.string().url().max(1024),
        sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
        fileSizeBytes: z.number().int().positive(),
        releaseNotes: z.string().max(5000).optional(),
      })).mutation(async ({ input, ctx }) => {
        const result = await publishAppRelease(input);
        await appendAuditLog({ actorOpenId: ctx.user.openId, actorRole: ctx.user.role, action: "release.publish", entityType: "app_release", entityId: String(input.versionCode), details: JSON.stringify({ version: input.version, channel: input.channel }) });
        return result;
      }),
    }),
    latestRelease: publicProcedure.input(z.object({
      currentVersionCode: z.number().int().nonnegative(),
      channel: z.enum(["stable", "beta"]).default("stable"),
    })).query(({ input }) => getLatestAppRelease(input)),
  }),
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(getSessionCookieName(ctx.req), { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  samples: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "admin") {
        const rows = await listSampleReports(100);
        return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
      }
      const laboratoryIds = ctx.user.role === "supervisor" ? await listUserLaboratoryIds(ctx.user.openId) : [];
      const rows = await listSampleReports(100, ctx.user.openId, laboratoryIds);
      return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
    }),
    get: protectedProcedure.input(z.object({ sampleId: z.string().min(1) })).query(async ({ input, ctx }) => {
      const row = await getSampleReport(input.sampleId);
      if (!row) return null;
      if (ctx.user.role !== "admin") {
        if (row.laboratoryId) {
          const membership = await getLaboratoryMembership(row.laboratoryId, ctx.user.openId);
          if (!membership) return null;
        } else if (row.ownerOpenId !== ctx.user.openId) return null;
      }
      return { ...row, payload: JSON.parse(row.payload) };
    }),
    save: protectedProcedure.input(storedSampleInput).mutation(async ({ input, ctx }) => {
      if (input.reviewStatus !== "pending") {
        throw new TRPCError({ code: "FORBIDDEN", message: "اعتماد العينة يتم من خلال إجراء المراجعة المخصص فقط" });
      }
      const existing = await getSampleReport(input.sampleId);
      if (existing?.reviewStatus === "reviewed") {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن تعديل تقرير معتمد من خلال الحفظ العادي؛ استخدم مسار مراجعة مخولًا" });
      }
      if (existing && ctx.user.role !== "admin") {
        if (existing.laboratoryId) {
          const membership = await getLaboratoryMembership(existing.laboratoryId, ctx.user.openId);
          if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك عضوية نشطة في معمل هذه العينة" });
        } else if (existing.ownerOpenId !== ctx.user.openId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل هذه العينة" });
        }
      }
      const saved = await saveSampleReport({ ...input, ownerOpenId: existing?.ownerOpenId ?? ctx.user.openId, payload: input.sample });
      const sample = input.sample as Record<string, any>;
      if (input.analysisEngine && input.analysisVersion) await recordAnalysisRun({ sampleId: input.sampleId, engine: input.analysisEngine, engineVersion: input.analysisVersion, status: "completed", result: sample });
      await appendAuditLog({ actorOpenId: ctx.user.openId, actorRole: ctx.user.role, action: "sample.save", entityType: "sample_report", entityId: input.sampleId, details: JSON.stringify({ reviewStatus: input.reviewStatus }) });
      return saved ? { ...saved, payload: JSON.parse(saved.payload) } : null;
    }),
    review: protectedProcedure.input(storedSampleInput).mutation(async ({ input, ctx }) => {
      const existing = await getSampleReport(input.sampleId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "العينة غير موجودة" });
      if (ctx.user.role !== "admin") {
        if (!existing.laboratoryId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن مراجعة عينة غير مرتبطة بمعمل إلا بواسطة مسؤول النظام" });
        }
        const membership = await getLaboratoryMembership(existing.laboratoryId, ctx.user.openId);
        if (!membership || !["supervisor", "admin"].includes(membership.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "مراجعة العينات متاحة لمشرفي المعمل فقط" });
        }
      }
      const saved = await saveSampleReport({ ...input, reviewStatus: "reviewed", ownerOpenId: existing.ownerOpenId, payload: input.sample });
      const sample = input.sample as Record<string, any>;
      await recordHumanReview({ sampleId: input.sampleId, reviewerOpenId: ctx.user.openId, reviewerRole: ctx.user.role, correctedConcentration: typeof sample.correctedConcentration === "number" ? sample.correctedConcentration : undefined, correctedTotalMotility: typeof sample.correctedTotalMotility === "number" ? sample.correctedTotalMotility : undefined, correctedProgressiveMotility: typeof sample.correctedProgressiveMotility === "number" ? sample.correctedProgressiveMotility : undefined, morphology: sample.morphology, note: typeof sample.reviewerNote === "string" ? sample.reviewerNote : undefined });
      await appendAuditLog({ actorOpenId: ctx.user.openId, actorRole: ctx.user.role, action: "sample.review", entityType: "sample_report", entityId: input.sampleId, details: JSON.stringify({ reviewStatus: "reviewed" }) });
      return saved ? { ...saved, payload: JSON.parse(saved.payload) } : null;
    }),
  }),
  admin: router({
    setRole: adminProcedure.input(z.object({ openId: z.string().min(1), role: z.enum(["technician", "supervisor", "admin"]) })).mutation(async ({ input, ctx }) => {
      const user = await setUserRole(input.openId, input.role);
      await appendAuditLog({ actorOpenId: ctx.user.openId, actorRole: ctx.user.role, action: "user.role_change", entityType: "user", entityId: input.openId, details: JSON.stringify({ role: input.role }) });
      return user;
    }),
  }),
  audit: router({
    list: supervisorProcedure.query(() => listAuditLogs()),
  }),
  calibration: router({
    list: protectedProcedure.input(z.object({ laboratoryId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && !(await getLaboratoryMembership(input.laboratoryId, ctx.user.openId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك عضوية نشطة في هذا المعمل" });
      }
      return listCalibrationProfiles(input.laboratoryId);
    }),
    create: supervisorProcedure.input(z.object({ laboratoryId: z.number().int().positive(), name: z.string().min(1).max(160), deviceModel: z.string().max(120).optional(), lens: z.string().max(80).optional(), micronsPerPixel: z.number().positive(), chamberDepth: z.number().positive(), lightingSetup: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        const membership = await getLaboratoryMembership(input.laboratoryId, ctx.user.openId);
        if (!membership || !["supervisor", "admin"].includes(membership.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "إنشاء المعايرات متاح لمشرفي المعمل فقط" });
        }
      }
      return createCalibrationProfile({ ...input, createdBy: ctx.user.openId });
    }),
  }),
  benchmark: router({
    save: supervisorProcedure.input(z.object({ datasetVersion: z.string().min(1).max(80), engineVersion: z.string().min(1).max(32), sampleCount: z.number().int().nonnegative(), metrics: z.record(z.string(), z.unknown()), failedSamples: z.array(z.string()).optional() })).mutation(({ input }) => saveBenchmarkRun(input)),
  }),
  analysis: router({
    interpret: publicProcedure.input(z.object({ report: reportInput })).mutation(async ({ input }) => {
      const fallback = deterministicFallback(input.report);
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: "أنت مساعد شرح مخبري مسؤول. اكتب بالعربية الفصحى المبسطة. فسّر المؤشرات وجودة البيانات فقط. ممنوع التشخيص أو وصف العلاج أو الجزم بالخصوبة. اذكر أن النتيجة بحثية مساعدة وتحتاج مراجعة فنية. أعد JSON مطابقًا للمخطط." },
            { role: "user", content: `فسّر التقرير التالي تعليميًا لفني مختبر: ${JSON.stringify(input.report)}` },
          ],
          maxTokens: 700,
          responseFormat: { type: "json_schema", json_schema: { name: "semen_report_interpretation", strict: true, schema: interpretationShape } },
        });
        const text = extractText(result.choices?.[0]?.message?.content);
        if (!text) return fallback;
        const parsed = JSON.parse(text) as Interpretation;
        if (!parsed.summary || !Array.isArray(parsed.signals) || !Array.isArray(parsed.caveats) || !parsed.nextStep) return fallback;
        return parsed;
      } catch (error) {
        console.warn("[AI] Interpretation fallback used", error instanceof Error ? error.message : "unknown error");
        return fallback;
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
