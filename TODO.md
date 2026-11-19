## قاعدة بيانات مختبرية منظمة
تم تطبيق migration 0003 على قاعدة البيانات المدارة وإضافة جداول laboratories وlaboratory_members وcalibration_profiles وvideo_assets وanalysis_runs وhuman_reviews وsync_queue وanalysis_engines وbenchmark_runs، مع فهارس البحث وتوسيع sample_reports وaudit_logs. يحافظ النظام على payload القديم للتوافق، ويسجل تشغيلات OpenCV والمراجعات البشرية كنسخ مستقلة. أضيفت API محمية للمعايرات وBenchmark.

## Morphology وSemen Tracking الموسع
تمت إضافة محرك `opencv-heuristic-morphology-v1` الذي يستخرج خصائص contour مثل circularity وsolidity وextent وaspect ratio، ويعرض تقديرات للرأس والذيل والقطعة الوسطى والأكروسوم، مع confidence وKruger screening وTZI/SDI. هذه طبقة screening بحثية تحتاج مراجعة فني ولا تُعد نموذجًا تشخيصيًا مدربًا؛ الاعتماد السريري الكامل يتطلب dataset مصنّفًا وقياس MAE/RMSE مقابل خبراء.

## ترقية جودة القراءة والعد والتدقيق
- [ ] يضيف محرك OpenCV Quality Gate درجة من 0 إلى 100، وقرارًا واضحًا `جاهز للتحليل` أو `يُقبل مع تحذير` أو `يجب إعادة التصوير`، مع قياس مدة الفيديو وFPS والدقة والوضوح والإضاءة والتباين والاهتزاز والتغطية ومعامل التباين وعدد المسارات.
- [ ] يحفظ التحليل track retention وlost/duplicate estimates ومسارات مختصرة وHeatmap منخفض الدقة، ويعرضها للفني دون ادعاء أن التتبع يساوي تحققًا سريريًا.
- [ ] يعرض التقرير جودة الفيديو وثقة العد وثقة التتبع وثقة morphology وإصدار كل محرك، ويطلب مراجعة بشرية عند انخفاض الجودة.
- [ ] يمنع تكرار إرسال الفيديو نفسه في مسار الرفع الحالي، ويحافظ على retry ورسائل الفشل العربية، مع عدم تخزين الفيديو نفسه في MySQL.
- [ ] يضيف شاشة/قسم مراجعة يدوية يوضح اقتراح الآلة وتعديل الفني ومصدر كل قيمة، مع بقاء سجل التدقيق والمشاركة/PDF متضمنين للقيود والمنهج.
- [ ] يحافظ على Benchmark مستقل يحسب MAE/RMSE/Bias وSensitivity/Specificity من Ground Truth حقيقية، ويمنع اختلاق labels أو وصف heuristic بأنه Kruger معتمد.
- [ ] بعد كل تغيير، تنجح TypeScript وPython syntax والاختبارات والبناء وGitHub Actions، ثم يُدفع التحديث إلى `mohammedtaherahmmed-svg/semenassist` ويبنى APK Release من workflow.
