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
