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
