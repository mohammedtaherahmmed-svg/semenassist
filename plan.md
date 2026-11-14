
## بنية قاعدة البيانات المنظمة
تمت إضافة ترحيل 0003 للبنية التالية: laboratories وlaboratory_members لعزل المختبرات والأدوار؛ calibration_profiles لمعايرات الأجهزة؛ sample_reports مع laboratory/calibration/video/analysis status وفهارس؛ video_assets للـmetadata وسياسة الاحتفاظ؛ analysis_runs لإصدارات التشغيل ونتائج OpenCV؛ human_reviews لفصل تصحيح الفني عن نتيجة الآلة؛ sync_queue للمزامنة Offline؛ analysis_engines لإصدارات المحرك؛ benchmark_runs لحفظ MAE/RMSE والـbias؛ وتوسيع audit_logs بالقيم القديمة والجديدة والمختبر والفهارس.

تظل payload القديمة محفوظة للتوافق، وتُكتب معها تشغيلات التحليل والمراجعات المنظمة من API. أضيفت إجراءات tRPC محمية للمعايرات وBenchmark، مع صلاحيات المشرف. الفيديو نفسه لا يُرفع إلى قاعدة البيانات؛ video_assets يحتفظ بالـmetadata وstorageKey فقط، ويمكن ربطه بـObject Storage لاحقًا.

## نشر قاعدة البيانات والتتبع
يطبق Docker runtime الأمر `drizzle-kit migrate` تلقائيًا عند توفر DATABASE_URL قبل تشغيل API، لذلك تُطبق migrations المسجلة مثل 0003 على قاعدة الإنتاج عند نشر النسخة. محرك OpenCV الحالي يتتبع مراكز الأجسام ويحسب VCL/VSL/VAP/LIN/STR/WOB/ALH والحركة، بينما morphology الحالية هي screening هندسي للرأس فقط؛ تشوهات الذيل والأكروسوم والقطعة الوسطى تحتاج نموذجًا مدربًا وصورًا/فيديوهات موثقة ومراجعة بشرية قبل اعتبارها قياسًا موثوقًا.
