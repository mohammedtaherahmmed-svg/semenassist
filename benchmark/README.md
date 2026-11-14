# Benchmark OpenCV

هذا المجلد مخصص لعينات فيديو حقيقية تمت مراجعتها يدويًا. لا يضع المشروع عينات أو أرقامًا مصطنعة داخله.

## البنية المطلوبة

```text
benchmark/
  videos/
    LAB-001.mp4
    LAB-002.mp4
  ground_truth.json
```

مثال `ground_truth.json` للحركة:

```json
{
  "LAB-001": {
    "micronsPerPixel": 0.42,
    "chamberDepth": 20,
    "concentration": 18.4,
    "totalMotility": 46.0,
    "progressiveMotility": 31.2
  }
}
```

يمكن إضافة حقول المورفولوجي داخل `morphology` أو في المستوى الأعلى. استخدم فقط أرقامًا راجعها مختص، مثل:

```json
{
  "LAB-001": {
    "micronsPerPixel": 0.42,
    "chamberDepth": 20,
    "morphology": {
      "totalExamined": 100,
      "normalForms": 62,
      "roundHeads": 34,
      "elongatedHeads": 18,
      "irregularHeads": 48,
      "coiledTails": 12,
      "bentTails": 21,
      "doubleTails": 4,
      "acrosomeAbnormal": 17,
      "midpieceDefects": 15,
      "tzi": 1.42,
      "sdi": 0.38
    }
  }
}
```

الأرقام المرجعية يجب أن تأتي من عدّ/مراجعة مختص أو جهاز مرجعي موثوق، مع سياسة واضحة للتعمية وتقليل بيانات التعريف.

## التشغيل

```bash
python3 scripts/benchmark_opencv.py benchmark/videos benchmark/ground_truth.json benchmark/results.json --csv-output benchmark/results.csv --fail-on-error
```

يُنتج التقرير JSON ملخص `MAE` و`RMSE` و`bias` للحركة والمورفولوجي، وملخصًا ثنائيًا تقريبيًا لاكتشاف وجود العيب (`TP/TN/FP/FN` وSensitivity/Specificity)، وملف CSV صفًا لكل عينة، مع زمن تشغيل المحرك ورسائل العينات الفاشلة. لا يتم اختلاق أي label ناقص، و`--fail-on-error` يجعل CI يفشل إذا تعذر تحليل عينة.

هذا Benchmark بحثي وليس اعتمادًا طبيًا. لا تحسب الدقة من قيم morphology إلا إذا كانت Ground Truth لنفس الفيديو/الإطارات ومراجعة مختص، ولا تخلط عينات الضبط مع عينات التقييم.
