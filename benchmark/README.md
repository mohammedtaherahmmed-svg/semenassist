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

 
## Synthetic ground-truth evaluation

For a deterministic synthetic video with frame-level annotations (CSV columns
`frame,time_sec,cell_id,x_px,y_px`), run the Python OpenCV pipeline and compare
its detections and track identities:

```bash
cd server/vision
python ground_truth_benchmark.py /path/to/SemenAssist_GroundTruth.mp4 /path/to/SemenAssist_GroundTruth.csv \
  --microns-per-pixel 0.5 --chamber-depth 20 --tolerance-px 12 \
  --output /path/to/ground-truth-benchmark.json
```

The report includes frame-wise detection precision/recall, ID switches, IDF1,
and per-cell VCL/VSL/VAP/LIN absolute errors. The script is explicitly scoped
to the Python OpenCV pipeline. It does not validate the Android Kotlin engine;
Android validation requires raw per-frame track observations exported from a
device build and evaluated with the same CSV annotations. The synthetic fixture
is an engineering test, not clinical evidence.

## Android track export and full CASA validation

Each Android sample retains trackObservations containing trackId, sampleSlot, timeSec, xPx, and yPx. The report shows the number of exported observations. Use an expert-annotated CSV with columns frame,cell_id,x_px,y_px and optional time_sec:

    cd server/vision
    python ground_truth_benchmark.py clip.mp4 annotations.csv --predictions-json android-tracks.json --ground-truth-fps 50 --microns-per-pixel 0.5 --tolerance-px 12 --output validation.json

The evaluator reports precision, recall, localization error, ID switches, IDF1, fragmentation, and per-cell kinematic errors. Concentration requires explicit --counting-area-mm2 and --dilution-factor; without both it is not calculated. Even with both, it is a provisional field-occupancy estimate pending chamber-specific reference-count validation.

Morphology remains research-only. The annotation contract is server/vision/datasets/morphology-annotation.schema.json and requires expert head/tail labels and sample-level splits. No trained morphology model is bundled.