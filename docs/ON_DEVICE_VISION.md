# On-device microscopy engine

## Current implementation

The Android app now calls the local Expo native module `SemenAssistVision`. It decodes video frames with Android `MediaMetadataRetriever`, downsamples frames, performs a simple grayscale connected-component screen, links detections across sampled frames, and computes preliminary track kinematics.

The analysis function does not upload video bytes or call the analysis API. The app may still synchronize the resulting sample record through the existing authenticated laboratory workflow; this is separate from video processing.

## Important limitations

- This is a classical computer-vision prototype, **not a trained machine-learning model**.
- Detection uses a global intensity threshold and connected components. It is sensitive to microscope illumination, stain/contrast, debris, focus, overlap, and camera settings.
- The current tracker is nearest-neighbour and is not robust to dense crossings or long occlusions.
- Concentration depends on the user-supplied calibration and the assumed field-of-view geometry; validate chamber geometry before using this metric.
- Morphology is intentionally returned as `not-assessed-on-device`. No Kruger morphology score is generated.
- The current Android module has not yet been validated against an annotated clinical video set or on a range of physical devices.
- iOS has no local native implementation yet; the app reports that local analysis is Android-only.

## Next steps to reach a real AI platform

1. Define a consented, de-identified dataset protocol and retention policy.
2. Build an annotation tool for sperm heads, tails, debris, overlaps, and track identity.
3. Obtain expert-reviewed ground truth from qualified laboratory staff.
4. Train and benchmark detection and tracking models outside the phone.
5. Export a quantized model (for example, TFLite) and run inference on-device.
6. Compare device results with blinded expert review; report sensitivity, precision, tracking identity switches, repeatability, and limits of agreement.
7. Validate concentration against known chamber volumes and reference counting.
8. Add morphology only after validated image acquisition and expert-labelled stained preparations.

Do not use current outputs for diagnosis, treatment decisions, or patient-facing clinical claims. Keep results marked as research/screening-only until the required analytical and clinical validation is completed.

## Sampling-time correction (Android)

The Android tracker now keeps each requested sample's original slot index instead of
renumbering successfully decoded frames. This preserves gaps when a frame cannot be
decoded. Track velocity calculations use the requested sampling frequency
(`sampleCount / durationSec`), corresponding to the actual interval
(`durationSec / sampleCount`) between frame requests. This prevents decode gaps from
artificially shortening elapsed time and biasing velocity estimates upward.

This is a software-level timing correction, not clinical validation. The tracker,
detection thresholds, calibration assumptions, and CASA classification thresholds
still require verification against timestamped, annotated microscope videos.


## CASA validation baseline (phase A)

The repository now carries deterministic software-level regression checks for:

- Kinematic invariants: stationary tracks, skipped source-frame intervals, calibration scaling, and the relationship between curvilinear and straight-line velocity.
- One-to-one assignment: global nearest-pair selection, no duplicate track/detection assignment, distance-gate rejection, and deterministic tie handling.
- Android tracker parity: the on-device tracker uses globally sorted candidate pairs and increases its search gate for a one-slot missed sample.

These checks use synthetic coordinates. They verify mathematical and algorithmic behavior only; they do not establish detection accuracy on sperm microscopy videos, clinical agreement, or diagnostic performance.

### Required real-video benchmark before clinical interpretation

Create a consented, de-identified, expert-annotated benchmark with sample/patient-wise splits. Each clip should record microscope/camera, objective magnification, chamber type/depth, pixel calibration, frame timestamps, acquisition conditions, and reviewer adjudication. Annotations should include sperm-head centroids or masks, visible tail traces where feasible, debris/overlap flags, and persistent track identity.

Report detection precision/recall and localization error; tracking identity switches, fragmentation, and IDF1; and CASA metric agreement using Bland–Altman bias/limits and repeatability. Keep all synthetic and real-video benchmark results separate. Do not claim clinical validation until an appropriately designed validation study is completed.


## Calibration and acquisition-quality control (0.2.0)

The Android local engine now records per-frame mean luminance, grayscale contrast
(standard deviation), Laplacian-variance sharpness proxy, and decoded-sample coverage.
It raises engineering QC flags for under/over-exposure, low contrast, likely blur,
low frame rate, short clips, low decoded coverage, low track counts, and unstable
per-frame object counts. The thresholds are heuristic acquisition checks, not
validated clinical acceptance limits. The reported quality score is an engineering
screening score and must not be interpreted as diagnostic confidence.

The calibration screen can calculate microns-per-pixel from a known stage-micrometer
length divided by its measured image-pixel length. The user must use a traceable
reference and repeat calibration whenever the phone, optics, magnification, or
measurement chamber changes. Chamber depth remains a separately entered physical
parameter; it is not inferred by the app.

These changes improve traceability and warn about visibly poor acquisition but do
not establish analytical accuracy. Verification still requires real microscope
videos, reference annotations, device testing, and comparison with a validated
laboratory CASA method.


## Motion tracking upgrade (0.3.0)

The Android and Python tracking paths now predict centroid motion with a
constant-velocity Kalman filter and solve frame-to-track association with a
gated Hungarian assignment. Explicit unmatched assignments prevent forced
matches when detections are outside the motion gate. The Kalman process and
measurement noise values are initial engineering parameters and have not been
fitted to a microscopy dataset.

Synthetic tests cover globally optimal one-to-one assignment, unmatched
detections, invalid inputs, and constant-velocity prediction. These tests do
not measure identity-switch rate or tracking accuracy on real sperm videos.

## Concentration interpretation remains restricted

The current concentration estimate assumes the complete decoded image is the
counting field, a uniform chamber depth, and no dilution correction. A real
CASA concentration workflow must capture the chamber's effective counting
area/geometry and dilution factor (and validate the sampled fields) before
the numeric result can be interpreted as a laboratory concentration. Until
those inputs and a reference-count comparison are implemented, treat the
reported concentration as a provisional full-frame estimate only.

## CASA complete validation foundation (0.5.0)

### Android track export
The Android module returns per-observation track data with persistent track ID, sample slot, elapsed seconds, and source-resolution pixel coordinates. The sample record keeps these observations and the report shows track counts and export size. Identity switches and fragmentation remain unavailable until tracks are compared with expert-annotated ground truth; they are not reported as zero by assumption.

### Timing and kinematics
The report separates source video FPS/frame count from sampled analysis rate. Track velocity uses elapsed time between original sample slots, preserving gaps. A 50 FPS synthetic fixture should report source metadata separately from its 4 Hz analysis sampling schedule.

### Concentration
A numeric concentration is withheld unless both effective counting area (mm²) and dilution factor are explicitly supplied. The estimate uses mean field count multiplied by dilution divided by area and depth, with unit conversion to million/mL. It remains a provisional field-occupancy estimate; chamber protocol, field sampling and reference count must be validated before laboratory interpretation. No area is inferred from video pixel dimensions.

### Morphology preparation
Android continues to mark morphology as not assessed on-device. The Python contour pipeline is explicitly labelled as a research-only shape proxy, and its Kruger-threshold interpretation has been removed. A JSON schema defines the expert annotation contract for head masks, tail masks, midpiece masks, preparation, pixel scale, adjudication, and sample-level dataset splits. A trained morphology model is not included because no expert-labelled dataset is available.

### Scientific validation dashboard
The sample report exposes source timing, sample rate, track counts, and exported observation count. The benchmark evaluator reports detection precision/recall, localization error, ID switches, IDF1, fragmentation, per-cell VCL/VSL/VAP/LIN errors, and Bland–Altman bias/limits of agreement for matched stable tracks. These metrics require expert-annotated CSV data using the same coordinate/time basis.

Example:
    cd server/vision
    python ground_truth_benchmark.py clip.mp4 annotations.csv --ground-truth-fps 50 --microns-per-pixel 0.5 --chamber-depth 20 --counting-area-mm2 AREA --dilution-factor FACTOR --output validation.json

To score Android output, pass a JSON file containing the trackObservations array with --predictions-json android-tracks.json. CSV columns are frame,cell_id,x_px,y_px; optional time_sec supports timestamp alignment. This remains an engineering prototype, not clinical validation.

## Morphology image workflow (research collection phase)

The Android app now includes a separate Morphology tab for importing multiple microscope images and collecting structured, reviewer-entered object labels. Each record captures a pseudonymous sample ID, reviewer code, preparation state (stained/unstained/unknown), objective magnification, optional calibrated pixel size, microscope code, and per-object head-shape/tail-status plus overlap/debris flags.

This is an image intake and manual annotation aid only:
- It does not run an AI classifier, segmentation model, or automatic sperm detector.
- A reviewer must visually identify each object before adding a label; the current UI does not draw head/tail masks or object bounding boxes.
- The current image records are stored locally in AsyncStorage and refer to document-picker cache URIs. They are not yet a durable image archive or a training-ready dataset export; cache cleanup or app removal can invalidate image paths.
- Do not enter patient names, dates of birth, or other direct identifiers. Use pseudonymous sample and reviewer codes and follow the laboratory's consent, access-control, retention, and de-identification procedures.
- Labels are single-review entries. Adjudication by a second expert, inter-rater agreement, mask annotation, sample-level dataset splitting, and export/backup workflows remain future work.

The existing `server/vision/datasets/morphology-annotation.schema.json` remains the stricter expert dataset contract for training/benchmark preparation. The new app workflow must not be represented as satisfying that contract until object masks, adjudication, durable image packaging, and a validated export pipeline are implemented.
