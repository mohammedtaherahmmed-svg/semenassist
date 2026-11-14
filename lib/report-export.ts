import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { type SampleRecord, WHO_REFERENCE } from "@/lib/sample-types";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function bar(label: string, value: number | null | undefined, unit: string, reference?: string) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
  const width = numeric === null ? 0 : Math.min(100, Math.max(4, Math.abs(numeric) / (Math.max(Math.abs(numeric), 1) + 1) * 100));
  return `<div class="metric"><div class="metric-head"><span>${escapeHtml(label)}</span><strong>${numeric === null ? "غير متاح" : `${numeric.toFixed(2)} ${escapeHtml(unit)}`}</strong></div><div class="track"><i style="width:${width}%"></i></div>${reference ? `<small>النطاق المرجعي: ${escapeHtml(reference)}</small>` : ""}</div>`;
}

export function createReportHtml(sample: SampleRecord) {
  const k = sample.kinematics;
  const m = sample.morphology;
  const a = sample.advancedTests;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>
  @page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#102A43;line-height:1.6;direction:rtl}h1{font-size:25px;margin:0 0 4px}h2{font-size:17px;border-bottom:2px solid #27B8A6;padding-bottom:5px;margin-top:24px}.muted{color:#6B7C93;font-size:11px}.banner{background:#FFF5E6;border:1px solid #F6D7A7;border-radius:10px;padding:10px;color:#7A4A08;margin:14px 0}.meta{display:flex;justify-content:space-between;background:#F7FAFC;border:1px solid #E6E0D5;border-radius:10px;padding:10px;font-size:11px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.metric{border:1px solid #E6E0D5;border-radius:10px;padding:9px;margin:6px 0}.metric-head{display:flex;justify-content:space-between;font-size:11px}.metric-head strong{color:#168D80}.track{height:7px;background:#EEF1F1;border-radius:6px;overflow:hidden;margin-top:5px}.track i{display:block;height:100%;background:#27B8A6;border-radius:6px}.metric small{color:#6B7C93;font-size:9px}.table{width:100%;border-collapse:collapse;font-size:10px}.table th,.table td{border:1px solid #E6E0D5;padding:6px;text-align:right}.table th{background:#F6FBFA}.warning{font-size:10px;color:#B54747;background:#FFF0EF;padding:9px;border-radius:8px;margin-top:18px}.footer{margin-top:28px;color:#6B7C93;font-size:9px;text-align:center}
  </style></head><body><h1>Semen Assist — تقرير تحليل العينة</h1><div class="muted">رقم العينة: ${escapeHtml(sample.id)} · تاريخ الاستلام: ${escapeHtml(new Date(sample.receivedAt).toLocaleString("ar-EG"))}</div><div class="banner">تقرير بحثي مساعد وليس تشخيصًا طبيًا. يجب مراجعة الفني أو الطبيب قبل أي استخدام طبي.</div><div class="meta"><span>المحرك: ${escapeHtml(sample.analysisEngine ?? "غير محدد")}</span><span>الإطارات: ${escapeHtml(sample.framesAnalyzed)}</span><span>المعايرة: ${escapeHtml(sample.calibration.micronsPerPixel)} µm/px</span></div>
  <h2>المؤشرات الأساسية ونطاقات المرجع</h2><div class="grid">${bar("التركيز", sample.concentration, "مليون/مل", `≥ ${WHO_REFERENCE.concentration} مليون/مل`)}${bar("إجمالي الحركة", sample.totalMotility, "%", `≥ ${WHO_REFERENCE.totalMotility}%`)}${bar("الحركة التقدمية", sample.progressiveMotility, "%", `≥ ${WHO_REFERENCE.progressiveMotility}%`)}${bar("الحركة غير التقدمية", sample.nonProgressiveMotility, "%", "لا يوجد حد منفرد معروض")}${bar("غير المتحركة", sample.immotile, "%", "يُقرأ مع إجمالي الحركة")}${bar("الثقة", sample.confidence * 100, "%", "هدف جودة داخلي ≥ 75%")}</div>
  <h2>مؤشرات الحركة والمسار</h2><div class="grid">${bar("VCL", k?.vcl, "µm/s", "يُفسر حسب الجهاز والمعايرة")}${bar("VSL", k?.vsl, "µm/s", "يُفسر حسب الجهاز والمعايرة")}${bar("VAP", k?.vap, "µm/s", "يُفسر حسب الجهاز والمعايرة")}${bar("LIN", k?.lin, "", "نسبة وصفية VSL/VCL")}${bar("STR", k?.str, "", "نسبة وصفية VSL/VAP")}${bar("WOB", k?.wob, "", "نسبة وصفية VAP/VCL")}${bar("ALH", k?.alh, "µm", "يُفسر حسب المعايرة")}${bar("BCF", k?.bcf, "Hz", "غير متاح دون تتبع ذيل موثوق")}</div><div class="muted">FPS: ${escapeHtml(sample.fps ?? "غير متاح")} · CV: ${sample.coefficientOfVariation === undefined ? "غير متاح" : `${(sample.coefficientOfVariation * 100).toFixed(1)}%`} · هدف CV الداخلي أقل من 10%</div>
  <h2>المورفولوجي</h2>${m ? `<table class="table"><tr><th>البند</th><th>القيمة</th><th>ملاحظة</th></tr><tr><td>إجمالي المفحوص</td><td>${m.totalExamined}</td><td>طريقة: ${escapeHtml(m.method)}</td></tr><tr><td>أشكال طبيعية</td><td>${m.normalForms}</td><td>Kruger screening تقريبي</td></tr><tr><td>رؤوس دائرية / ممدودة / غير منتظمة</td><td>${m.roundHeads} / ${m.elongatedHeads} / ${m.irregularHeads}</td><td>تحليل هندسي للكونتور</td></tr><tr><td>أذناب ملتفة / مكسورة / مزدوجة</td><td>${m.coiledTails} / ${m.bentTails} / ${m.doubleTails}</td><td>مؤشرات شكلية آلية تحتاج مراجعة</td></tr><tr><td>عيوب الأكروسوم / القطعة الوسطى</td><td>${m.acrosomeAbnormal} / ${m.midpieceDefects}</td><td>تقدير من شكل الجسم المتصل</td></tr><tr><td>TZI / SDI</td><td>${m.tzi.toFixed(2)} / ${m.sdi.toFixed(3)}</td><td>مؤشرات تنظيمية وليست اعتمادًا تشخيصيًا</td></tr>${m.krugerScreening ? `<tr><td>Kruger طبيعي / غير طبيعي</td><td>${m.krugerScreening.normalPercent.toFixed(1)}% / ${m.krugerScreening.abnormalPercent.toFixed(1)}%</td><td>العلامة الإرشادية ${m.krugerScreening.thresholdPercent}%</td></tr>` : ""}</table>` : `<p class="muted">لم يتم تسجيل فحص مورفولوجي.</p>`}
  <h2>اختبارات إضافية</h2><div class="grid">${bar("الحيوية", a?.vitalityPct, "%", "من اختبار صبغة منفصل")}${bar("DFI", a?.dfiPct, "%", "من اختبار DNA منفصل")}${bar("تفاعل الأكروسوم", a?.acrosomeReactionPct, "%", "من اختبار وظيفي منفصل")}</div>
  <div class="warning">النتائج الآلية تقديرية وقابلة للتأثر بالإضاءة والتركيز والمعايرة. لا يتم استنتاج الحيوية أو DFI أو تفاعل الأكروسوم من فيديو الحركة وحده.</div><div class="footer">تم إنشاء التقرير بواسطة Semen Assist · للمراجعة الداخلية والبحثية</div></body></html>`;
}

export async function createReportPdf(sample: SampleRecord) {
  if (Platform.OS === "web") {
    window.print();
    return null;
  }
  const result = await Print.printToFileAsync({ html: createReportHtml(sample), width: 595, height: 842 });
  return result.uri;
}

export async function printReport(sample: SampleRecord) {
  if (Platform.OS === "web") {
    window.print();
    return;
  }
  await Print.printAsync({ html: createReportHtml(sample), width: 595, height: 842 });
}

export async function saveReportPdf(sample: SampleRecord) {
  if (Platform.OS === "web") {
    window.print();
    return;
  }
  const uri = await createReportPdf(sample);
  if (!uri) return;
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error("حفظ PDF غير متاح على هذا الجهاز.");
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `حفظ تقرير ${sample.id} كملف PDF` });
}

export async function shareReportPdf(sample: SampleRecord) {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: `تقرير ${sample.id}`, text: `تقرير تحليل العينة ${sample.id}` });
    } else {
      window.print();
    }
    return;
  }
  const uri = await createReportPdf(sample);
  if (!uri) return;
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error("المشاركة غير متاحة على هذا الجهاز.");
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `مشاركة تقرير ${sample.id} — اختر WhatsApp أو الملفات` });
}
