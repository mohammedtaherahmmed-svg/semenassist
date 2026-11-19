# Morphology dataset and physical-device validation

This workflow is research-only. It does not create a clinically validated morphology classifier.

## 1. Reviewer workflow

1. Select an existing image and enter the second-reviewer ID.
2. Press **Save second-reviewer ID for selected image**. Typing the ID alone does not update an already imported image.
3. Review every object independently using the second-reviewer mode. The app prevents overwriting a saved second review.
4. If the two reviewers disagree, use the adjudication mode with a third expert ID and a written rationale. The original two reviews remain unchanged.
5. Inspect all masks visually and explicitly confirm human adjudication for the image group.

Do not reuse reviewer IDs for different people. Do not change the second-reviewer ID after reviews have been saved under it.

## 2. Dataset preparation

Export the JSON manifest from the app and share every original image into the same export folder using the image-sharing action. Preserve the relative paths expected by the manifest (images/<sample>_<filename>). Then run:

```bash
python server/vision/datasets/prepare_morphology_dataset.py \
  --manifest /path/to/export/morphology-dataset-manifest.json \
  --output /path/to/prepared-morphology
```

The preparation script excludes images without adjudicated status, calibrated pixel size, valid polygons, and independent reviewer IDs. Any disagreement in categorical labels requires a third expert's separate adjudication and rationale. Splits are deterministic and grouped by pseudonymous sample ID to avoid sample leakage. Review preparation_report.json; training is blocked unless train, validation, and test each contain eligible images.

## 3. Research training and held-out evaluation

In a dedicated research environment with a compatible Ultralytics installation:

```bash
pip install ultralytics
python server/vision/datasets/train_morphology_model.py \
  --data /path/to/prepared-morphology/dataset.yaml \
  --epochs 100 --imgsz 640 --device 0
```

The script evaluates the trained model on the held-out test split and writes research_test_evaluation.json. Keep this test set untouched during model selection. Report per-class segmentation metrics, sample counts, confidence intervals, and failure cases. A successful training run or test metric is not clinical validation.

## 4. Physical-device test protocol

Run this protocol on each supported Android phone with the intended microscope/optical adapter attached. A phone camera without suitable microscope optics cannot resolve sperm morphology.

Record:
- Phone model, Android version, app version/commit, camera lens, adapter and microscope model.
- Objective magnification, calibrated field of view, pixel-size calibration, slide preparation/stain, and illumination.
- Camera permission/restart behavior, preview stability, focus, exposure, orientation, and image capture.
- Analysis FPS and processing latency at the selected profile, for at least 5 minutes after thermal stabilization.
- Dropped frames, camera errors, device temperature/throttling, battery impact, and memory pressure.
- Track continuity through crossings/occlusions, false detections from debris, and repeatability across at least three captures of the same field.
- Image export integrity and whether all annotations/reviews survive app restart.

Use timestamped, de-identified, expert-annotated microscope videos for quantitative comparisons. Record sensitivity/precision, identity switches, track fragmentation, repeatability, and limits of agreement against expert/reference measurements. Do not use these outputs for diagnosis or treatment decisions.

## 5. Validation sign-off

A software CI pass confirms compilation and automated tests only. Mark device validation as **not performed** until the protocol above has been completed and the raw results have been reviewed. Clinical use requires a separately designed analytical and clinical validation study, regulatory review, and qualified laboratory oversight.
