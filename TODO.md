
## قاعدة بيانات مختبرية منظمة
تم تطبيق migration 0003 على قاعدة البيانات المدارة وإضافة جداول laboratories وlaboratory_members وcalibration_profiles وvideo_assets وanalysis_runs وhuman_reviews وsync_queue وanalysis_engines وbenchmark_runs، مع فهارس البحث وتوسيع sample_reports وaudit_logs. يحافظ النظام على payload القديم للتوافق، ويسجل تشغيلات OpenCV والمراجعات البشرية كنسخ مستقلة. أضيفت API محمية للمعايرات وBenchmark.

## Morphology وSemen Tracking الموسع
تمت إضافة محرك `opencv-heuristic-morphology-v1` الذي يستخرج خصائص contour مثل circularity وsolidity وextent وaspect ratio، ويعرض تقديرات للرأس والذيل والقطعة الوسطى والأكروسوم، مع confidence وKruger screening وTZI/SDI، ويعرضها في التقرير وPDF. هذه طبقة screening بحثية تحتاج مراجعة فني ولا تُعد نموذجًا تشخيصيًا مدربًا؛ الاعتماد السريري الكامل يتطلب dataset مصنّفًا وقياس MAE/RMSE مقابل خبراء.
