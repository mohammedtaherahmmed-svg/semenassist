import { z } from "zod";

import { getSessionCookieName, getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, router, supervisorProcedure, publicProcedure } from "./_core/trpc";
import { appendAuditLog, createCalibrationProfile, getSampleReport, listAuditLogs, listCalibrationProfiles, listSampleReports, recordAnalysisRun, recordHumanReview, saveBenchmarkRun, saveSampleReport, setUserRole } from "./db";

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
      const canSeeAll = ctx.user.role === "supervisor" || ctx.user.role === "admin";
      const rows = await listSampleReports(100, canSeeAll ? undefined : ctx.user.openId);
      return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
    }),
    get: protectedProcedure.input(z.object({ sampleId: z.string().min(1) })).query(async ({ input, ctx }) => {
      const row = await getSampleReport(input.sampleId);
      if (row && row.ownerOpenId !== ctx.user.openId && ctx.user.role === "technician") return null;
      return row ? { ...row, payload: JSON.parse(row.payload) } : null;
    }),
    save: protectedProcedure.input(storedSampleInput).mutation(async ({ input, ctx }) => {
      const saved = await saveSampleReport({ ...input, ownerOpenId: ctx.user.openId, payload: input.sample });
      const sample = input.sample as Record<string, any>;
      if (input.analysisEngine && input.analysisVersion) await recordAnalysisRun({ sampleId: input.sampleId, engine: input.analysisEngine, engineVersion: input.analysisVersion, status: "completed", result: sample });
      await appendAuditLog({ actorOpenId: ctx.user.openId, actorRole: ctx.user.role, action: "sample.save", entityType: "sample_report", entityId: input.sampleId, details: JSON.stringify({ reviewStatus: input.reviewStatus }) });
      return saved ? { ...saved, payload: JSON.parse(saved.payload) } : null;
    }),
    review: protectedProcedure.input(storedSampleInput).mutation(async ({ input, ctx }) => {
      const saved = await saveSampleReport({ ...input, reviewStatus: "reviewed", ownerOpenId: ctx.user.openId, payload: input.sample });
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
    list: protectedProcedure.input(z.object({ laboratoryId: z.number().int().positive() })).query(({ input }) => listCalibrationProfiles(input.laboratoryId)),
    create: supervisorProcedure.input(z.object({ laboratoryId: z.number().int().positive(), name: z.string().min(1).max(160), deviceModel: z.string().max(120).optional(), lens: z.string().max(80).optional(), micronsPerPixel: z.number().positive(), chamberDepth: z.number().positive(), lightingSetup: z.string().max(2000).optional() })).mutation(({ input, ctx }) => createCalibrationProfile({ ...input, createdBy: ctx.user.openId })),
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
