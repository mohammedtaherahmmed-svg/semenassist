package com.semenassist.vision

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

private data class Detection(val x: Double, val y: Double)
private data class FrameQuality(val meanBrightness: Double, val contrastStdDev: Double, val sharpnessVariance: Double)
private class KalmanAxis(initial: Double) {
  var position = initial
  var velocity = 0.0
  private var p00 = 25.0
  private var p01 = 0.0
  private var p10 = 0.0
  private var p11 = 25.0
  private val measurementNoise = 4.0
  private val processNoise = 0.05

  fun predict(dt: Double) {
    val dt2 = dt * dt
    val dt3 = dt2 * dt
    val dt4 = dt2 * dt2
    val old00 = p00
    val old01 = p01
    val old10 = p10
    val old11 = p11
    position += dt * velocity
    p00 = old00 + dt * (old10 + old01) + dt2 * old11 + processNoise * dt4 / 4.0
    p01 = old01 + dt * old11 + processNoise * dt3 / 2.0
    p10 = old10 + dt * old11 + processNoise * dt3 / 2.0
    p11 = old11 + processNoise * dt2
  }

  fun update(measurement: Double) {
    val innovation = measurement - position
    val denominator = p00 + measurementNoise
    val k0 = p00 / denominator
    val k1 = p10 / denominator
    position += k0 * innovation
    velocity += k1 * innovation
    val old00 = p00
    val old01 = p01
    p00 = (1.0 - k0) * old00
    p01 = (1.0 - k0) * old01
    p10 -= k1 * old00
    p11 -= k1 * old01
  }
}

private class Kalman2D(initial: Detection) {
  private val x = KalmanAxis(initial.x)
  private val y = KalmanAxis(initial.y)
  fun predict(dt: Double) : Detection {
    x.predict(dt)
    y.predict(dt)
    return Detection(x.position, y.position)
  }
  fun update(measurement: Detection) {
    x.update(measurement.x)
    y.update(measurement.y)
  }
}

private data class Track(
  val points: MutableList<Detection>,
  val frameIndices: MutableList<Int>,
  var last: Detection,
  var lastFrame: Int,
  val kalman: Kalman2D,
  var kalmanFrame: Int
)

class SemenAssistVisionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SemenAssistVision")

    AsyncFunction("analyzeVideo") { videoUri: String, micronsPerPixel: Double, chamberDepth: Double, countingAreaMm2: Double, dilutionFactor: Double ->
      require(micronsPerPixel.isFinite() && micronsPerPixel > 0.0) { "قيمة المعايرة غير صالحة." }
      require(chamberDepth.isFinite() && chamberDepth > 0.0) { "عمق الحجرة غير صالح." }
      require(countingAreaMm2.isFinite() && countingAreaMm2 >= 0.0) { "مساحة العد غير صالحة." }
      require(dilutionFactor.isFinite() && dilutionFactor >= 0.0) { "معامل التخفيف غير صالح." }
      val context = appContext.reactContext ?: error("تعذر الوصول إلى سياق Android.")
      val retriever = MediaMetadataRetriever()
      try {
        val uri = Uri.parse(videoUri)
        if (uri.scheme == "content") retriever.setDataSource(context, uri)
        else if (uri.scheme == "file") retriever.setDataSource(uri.path ?: error("مسار الفيديو غير صالح."))
        else error("يجب اختيار فيديو محفوظًا على الجهاز.")
        analyze(retriever, micronsPerPixel, chamberDepth, countingAreaMm2, dilutionFactor)
      } finally {
        retriever.release()
      }
    }
  }

  private fun analyze(retriever: MediaMetadataRetriever, micronsPerPixel: Double, chamberDepth: Double, countingAreaMm2: Double, dilutionFactor: Double): Map<String, Any> {
    val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
    require(durationMs >= 1000L) { "مدة الفيديو غير كافية أو غير قابلة للقراءة." }
    val captureFps = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)
      ?.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 1.0 }
    val sourceFrameCount = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.toIntOrNull()
        ?.takeIf { it > 0 } ?: 0
    } else 0
    val durationSec = durationMs / 1000.0
    val derivedSourceFps = if (sourceFrameCount > 0 && durationSec > 0.0) sourceFrameCount / durationSec else null
    val fps = derivedSourceFps ?: captureFps ?: 0.0
    val fpsSource = when {
      derivedSourceFps != null -> "frame-count-duration"
      captureFps != null -> "capture-metadata"
      else -> "unavailable"
    }
    val sampleCount = min(80, max(12, ceil(durationMs / 250.0).toInt()))
    val tracks = mutableListOf<Track>()
    val counts = mutableListOf<Int>()
    val frameQualities = mutableListOf<FrameQuality>()
    val decodedSlots = mutableListOf<Int>()
    var sourceWidth = 0
    var sourceHeight = 0
    var sourceScale = 1.0

    for (index in 0 until sampleCount) {
      // Keep source sample slots as the timebase; missing decodes never compress time.
      val timeUs = (index.toLong() * durationMs * 1000L) / sampleCount
      val frame = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST) ?: continue
      try {
        if (sourceWidth == 0) {
          sourceWidth = frame.width
          sourceHeight = frame.height
          sourceScale = min(1.0, 320.0 / max(1, frame.width))
        }
        val scaled = if (sourceScale < 1.0) Bitmap.createScaledBitmap(
          frame, max(1, (frame.width * sourceScale).toInt()),
          max(1, (frame.height * sourceScale).toInt()), true
        ) else frame
        frameQualities.add(measureFrameQuality(scaled))
        val detections = detect(scaled)
        if (scaled !== frame) scaled.recycle()
        counts.add(detections.size)
        decodedSlots.add(index)
        updateTracks(tracks, detections, index)
      } finally {
        frame.recycle()
      }
    }
    require(decodedSlots.size >= 8 && sourceWidth > 0) { "تعذر استخراج إطارات كافية من الفيديو." }

    val validTracks = tracks.filter { it.points.size >= 3 }
    val adjustedScale = micronsPerPixel / sourceScale
    // The analysis timeline is the evenly spaced requested sample slots, not source FPS.
    val sampleRate = sampleCount.toDouble() / durationSec
    val metrics = validTracks.map { track -> trackMetrics(track, adjustedScale, sampleRate) }
    val moving = metrics.count { (it["vsl"] ?: 0.0) >= 1.0 }
    val progressive = metrics.count { (it["vsl"] ?: 0.0) >= 1.5 && (it["lin"] ?: 0.0) >= 0.45 }
    val totalMotility = if (metrics.isEmpty()) 0.0 else moving * 100.0 / metrics.size
    val progressiveMotility = if (metrics.isEmpty()) 0.0 else progressive * 100.0 / metrics.size
    val nonProgressive = max(0.0, totalMotility - progressiveMotility)
    val immotile = max(0.0, 100.0 - totalMotility)
    val averageCount = counts.average().takeIf { it.isFinite() } ?: 0.0
    // Provisional field-occupancy estimate; never infer an area from video pixels.
    val concentrationInputsValid = countingAreaMm2 > 0.0 && dilutionFactor > 0.0
    val countingVolumeMl = countingAreaMm2 * chamberDepth / 1.0e6
    val concentration = if (concentrationInputsValid && countingVolumeMl > 0.0) {
      averageCount * dilutionFactor / countingVolumeMl / 1.0e6
    } else 0.0

    val meanBrightness = frameQualities.map { it.meanBrightness }.average()
    val contrastStdDev = frameQualities.map { it.contrastStdDev }.average()
    val sharpnessVariance = frameQualities.map { it.sharpnessVariance }.average()
    val coveragePct = decodedSlots.size * 100.0 / sampleCount
    val analyzedDurationSec = if (decodedSlots.size < 2) 0.0 else
      ((decodedSlots.last() - decodedSlots.first() + 1).toDouble() / sampleCount) * durationSec

    val issues = mutableListOf<String>()
    if (durationSec < 12) issues.add("مدة الفيديو أقل من 12 ثانية.")
    if (decodedSlots.size < 12) issues.add("عدد الإطارات المستخرجة منخفض.")
    if (coveragePct < 90.0) issues.add("تغطية فك الإطارات أقل من 90%؛ قد تكون بعض أجزاء الفيديو مفقودة.")
    if (validTracks.size < 5) issues.add("عدد المسارات المكتشفة منخفض؛ راجع الإضاءة والتركيز.")
    if (fpsSource == "unavailable") issues.add("معدل الإطارات الأصلي غير متاح في بيانات الفيديو.")
    else if (fps < 25) issues.add("معدل الإطارات الأصلي أقل من 25 إطارًا/ثانية.")
    if (sourceWidth < 640) issues.add("دقة الفيديو أقل من 640 بكسل.")
    if (meanBrightness < 35) issues.add("متوسط سطوع الإطارات منخفض؛ راجع الإضاءة.")
    if (meanBrightness > 225) issues.add("الإطارات شديدة السطوع؛ قد تكون تفاصيل الخلايا مفقودة.")
    if (contrastStdDev < 18) issues.add("التباين منخفض؛ راجع ضبط الإضاءة والتكثيف.")
    if (sharpnessVariance < 12) issues.add("حدة الصورة منخفضة أو التركيز غير واضح.")
    val countMean = counts.average().takeIf { it > 0 } ?: 0.0
    val countCv = if (countMean > 0) sqrt(counts.map { (it - countMean) * (it - countMean) }.average()) / countMean else 1.0
    if (countCv > 0.1) issues.add("تباين عدد الأجسام بين الإطارات أعلى من 10%.")
    val quality = max(0, min(100, 100 - issues.size * 12 + min(12, validTracks.size / 5)))
    val avg = { key: String -> if (metrics.isEmpty()) 0.0 else metrics.map { it[key] ?: 0.0 }.average() }

    return mapOf(
      "ok" to true, "engine" to "android-local-cv-screening",
      "engineVersion" to "0.5.0-casa-validation-export",
      "framesAnalyzed" to decodedSlots.size, "frameCount" to sourceFrameCount,
      "fps" to fps, "fpsSource" to fpsSource, "sampleRateHz" to sampleRate,
      "width" to sourceWidth, "height" to sourceHeight,
      "durationSec" to durationSec, "analyzedDurationSec" to analyzedDurationSec,
      "coveragePct" to coveragePct, "objectsDetected" to validTracks.size,
      "averageObjectsPerFrame" to averageCount, "concentration" to concentration,
      "concentrationStatus" to if (concentrationInputsValid) "provisional-counting-area-estimate" else "not-calculated-missing-counting-area-or-dilution",
      "countingAreaMm2" to countingAreaMm2, "dilutionFactor" to dilutionFactor,
      "countingVolumeMl" to if (concentrationInputsValid) countingVolumeMl else 0.0,
      "totalMotility" to totalMotility, "progressiveMotility" to progressiveMotility,
      "nonProgressiveMotility" to nonProgressive, "immotile" to immotile,
      "confidence" to (quality / 100.0), "qualityScore" to quality,
      "qualityIssues" to issues,
      "qualityMetrics" to mapOf(
        "meanBrightness" to meanBrightness,
        "contrastStdDev" to contrastStdDev,
        "sharpnessVariance" to sharpnessVariance,
        "decodedFrameCoveragePct" to coveragePct
      ),
      "thresholds" to mapOf(
        "sampleFrames" to sampleCount.toDouble(),
        "minimumBrightness" to 35.0, "maximumBrightness" to 225.0,
        "minimumContrastStdDev" to 18.0, "minimumSharpnessVariance" to 12.0,
        "minimumDecodedCoveragePct" to 90.0
      ),
      "coefficientOfVariation" to countCv,
      "kinematics" to mapOf("vcl" to avg("vcl"), "vsl" to avg("vsl"), "vap" to avg("vap"),
        "lin" to avg("lin"), "str" to avg("str"), "wob" to avg("wob"), "alh" to avg("alh"), "bcf" to 0.0),
      "trackObservations" to tracks.flatMapIndexed { trackIndex, track ->
        track.points.mapIndexed { pointIndex, point ->
          mapOf(
            "trackId" to (trackIndex + 1),
            "sampleSlot" to track.frameIndices[pointIndex],
            "timeSec" to (track.frameIndices[pointIndex] / sampleRate),
            "xPx" to (point.x / sourceScale),
            "yPx" to (point.y / sourceScale)
          )
        }
      },
      "trackingDiagnostics" to mapOf(
        "totalTracksCreated" to tracks.size,
        "validTracks" to validTracks.size,
        "minimumTrackLength" to 3,
        "maxGapSamples" to 2,
        "identitySwitches" to null,
        "fragmentation" to null,
        "note" to "Identity switches and fragmentation require annotated ground truth."
      ),
      "morphology" to mapOf("method" to "not-assessed-on-device", "totalExamined" to 0,
        "normalForms" to 0, "roundHeads" to 0, "elongatedHeads" to 0, "irregularHeads" to 0,
        "coiledTails" to 0, "bentTails" to 0, "doubleTails" to 0, "acrosomeAbnormal" to 0,
        "midpieceDefects" to 0, "tzi" to 0.0, "sdi" to 0.0,
        "automaticLimitations" to listOf("تحليل الشكل المجهري غير متاح في المحرك المحلي الأولي.")),
      "confidenceInterpretation" to "heuristic acquisition-quality score; not a clinical probability",
      "processingLocation" to "on-device"
    )
  }

  private fun measureFrameQuality(bitmap: Bitmap): FrameQuality {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
    val gray = IntArray(pixels.size)
    var sum = 0.0
    for (i in pixels.indices) {
      val p = pixels[i]
      val value = (0.299 * ((p shr 16) and 255) + 0.587 * ((p shr 8) and 255) + 0.114 * (p and 255)).toInt()
      gray[i] = value
      sum += value
    }
    val mean = sum / max(1, gray.size)
    val variance = gray.map { (it - mean) * (it - mean) }.average().coerceAtLeast(0.0)
    var laplacianSquared = 0.0
    var samples = 0
    if (width >= 3 && height >= 3) {
      for (y in 1 until height - 1) {
        for (x in 1 until width - 1) {
          val index = y * width + x
          val laplacian = gray[index - 1] + gray[index + 1] + gray[index - width] + gray[index + width] - 4 * gray[index]
          laplacianSquared += laplacian.toDouble() * laplacian
          samples++
        }
      }
    }
    val sharpness = if (samples > 0) laplacianSquared / samples else 0.0
    return FrameQuality(mean, sqrt(variance), sharpness)
  }

  private fun detect(bitmap: Bitmap): List<Detection> {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
    val luminance = IntArray(pixels.size)
    var total = 0L
    for (i in pixels.indices) {
      val p = pixels[i]
      val value = (0.299 * ((p shr 16) and 255) + 0.587 * ((p shr 8) and 255) + 0.114 * (p and 255)).toInt()
      luminance[i] = value
      total += value
    }
    val threshold = max(12, (total / max(1, pixels.size)).toInt() - 24)
    val visited = BooleanArray(pixels.size)
    val queue = IntArray(pixels.size)
    val output = mutableListOf<Detection>()
    for (start in pixels.indices) {
      if (visited[start] || luminance[start] >= threshold) continue
      var head = 0
      var tail = 0
      queue[tail++] = start
      visited[start] = true
      var count = 0
      var sumX = 0L
      var sumY = 0L
      while (head < tail) {
        val current = queue[head++]
        val x = current % width
        val y = current / width
        count++
        sumX += x
        sumY += y
        val neighbours = intArrayOf(current - 1, current + 1, current - width, current + width)
        for (next in neighbours) {
          if (next < 0 || next >= pixels.size || visited[next]) continue
          val nx = next % width
          if (abs(nx - x) > 1 || luminance[next] >= threshold) continue
          visited[next] = true
          queue[tail++] = next
        }
      }
      if (count in 3..180) output.add(Detection(sumX.toDouble() / count, sumY.toDouble() / count))
    }
    return output
  }

  private fun hungarian(costs: Array<DoubleArray>): List<Pair<Int, Int>> {
    val size = costs.size
    if (size == 0) return emptyList()
    val u = DoubleArray(size + 1)
    val v = DoubleArray(size + 1)
    val p = IntArray(size + 1)
    val way = IntArray(size + 1)
    for (i in 1..size) {
      p[0] = i
      var j0 = 0
      val minv = DoubleArray(size + 1) { Double.POSITIVE_INFINITY }
      val used = BooleanArray(size + 1)
      do {
        used[j0] = true
        val i0 = p[j0]
        var delta = Double.POSITIVE_INFINITY
        var j1 = 0
        for (j in 1..size) {
          if (!used[j]) {
            val current = costs[i0 - 1][j - 1] - u[i0] - v[j]
            if (current < minv[j]) {
              minv[j] = current
              way[j] = j0
            }
            if (minv[j] < delta) {
              delta = minv[j]
              j1 = j
            }
          }
        }
        for (j in 0..size) {
          if (used[j]) {
            u[p[j]] += delta
            v[j] -= delta
          } else {
            minv[j] -= delta
          }
        }
        j0 = j1
      } while (p[j0] != 0)
      do {
        val j1 = way[j0]
        p[j0] = p[j1]
        j0 = j1
      } while (j0 != 0)
    }
    val result = mutableListOf<Pair<Int, Int>>()
    for (j in 1..size) if (p[j] != 0) result.add(Pair(p[j] - 1, j - 1))
    return result
  }

  private fun updateTracks(tracks: MutableList<Track>, detections: List<Detection>, frame: Int) {
    val eligible = mutableListOf<Int>()
    val predicted = mutableListOf<Detection>()
    for (index in tracks.indices) {
      val track = tracks[index]
      val gap = frame - track.lastFrame
      if (gap !in 1..2) continue
      val dt = max(1, frame - track.kalmanFrame)
      predicted.add(track.kalman.predict(dt.toDouble()))
      track.kalmanFrame = frame
      eligible.add(index)
    }

    val trackCount = eligible.size
    val detectionCount = detections.size
    val size = trackCount + detectionCount
    val usedDetections = mutableSetOf<Int>()
    if (size > 0) {
      val unmatchedCost = 45.0
      val invalidCost = unmatchedCost * (size + 2) * 1_000_000.0
      val costs = Array(size) { DoubleArray(size) }
      for (i in 0 until trackCount) {
        for (j in 0 until detectionCount) {
          val distance = hypot(predicted[i].x - detections[j].x, predicted[i].y - detections[j].y)
          costs[i][j] = if (distance <= 22.0 * max(1, frame - tracks[eligible[i]].lastFrame)) distance else invalidCost
        }
        for (j in detectionCount until size) costs[i][j] = unmatchedCost
      }
      for (i in trackCount until size) {
        for (j in 0 until detectionCount) costs[i][j] = unmatchedCost
        for (j in detectionCount until size) costs[i][j] = 0.0
      }
      for ((row, column) in hungarian(costs)) {
        if (row >= trackCount || column >= detectionCount) continue
        val track = tracks[eligible[row]]
        val detection = detections[column]
        val distance = hypot(predicted[row].x - detection.x, predicted[row].y - detection.y)
        val gate = 22.0 * max(1, frame - track.lastFrame)
        if (distance > gate) continue
        track.kalman.update(detection)
        track.points.add(detection)
        track.frameIndices.add(frame)
        track.last = detection
        track.lastFrame = frame
        usedDetections.add(column)
      }
    }

    for (index in detections.indices) {
      if (index in usedDetections) continue
      val detection = detections[index]
      tracks.add(Track(
        mutableListOf(detection),
        mutableListOf(frame),
        detection,
        frame,
        Kalman2D(detection),
        frame
      ))
    }
  }
  private fun trackMetrics(track: Track, micronsPerPixel: Double, sampleRate: Double): Map<String, Double> {
    val points = track.points
    val elapsed = (track.frameIndices.last() - track.frameIndices.first()) / sampleRate
    if (elapsed <= 0.0) return mapOf("vcl" to 0.0, "vsl" to 0.0, "vap" to 0.0, "lin" to 0.0, "str" to 0.0, "wob" to 0.0, "alh" to 0.0)
    val path = points.zipWithNext().sumOf { hypot(it.second.x - it.first.x, it.second.y - it.first.y) }
    val displacement = hypot(points.last().x - points.first().x, points.last().y - points.first().y)
    val smoothed = points.toMutableList()
    for (i in 1 until points.size - 1) {
      smoothed[i] = Detection(
        (points[i - 1].x + points[i].x + points[i + 1].x) / 3.0,
        (points[i - 1].y + points[i].y + points[i + 1].y) / 3.0
      )
    }
    val averagePath = smoothed.zipWithNext().sumOf { hypot(it.second.x - it.first.x, it.second.y - it.first.y) }
    val vcl = path * micronsPerPixel / elapsed
    val vsl = displacement * micronsPerPixel / elapsed
    val vap = averagePath * micronsPerPixel / elapsed
    val start = points.first()
    val end = points.last()
    val denominator = hypot(end.x - start.x, end.y - start.y)
    val lateralRms = if (denominator <= 0.0) 0.0 else sqrt(points.map {
      val distance = abs((end.y - start.y) * it.x - (end.x - start.x) * it.y + end.x * start.y - end.y * start.x) / denominator
      distance * distance
    }.average()) * micronsPerPixel
    return mapOf(
      "vcl" to vcl, "vsl" to vsl, "vap" to vap,
      "lin" to if (vcl > 0) vsl / vcl else 0.0,
      "str" to if (vap > 0) vsl / vap else 0.0,
      "wob" to if (vcl > 0) vap / vcl else 0.0,
      "alh" to lateralRms
    )
  }
}
