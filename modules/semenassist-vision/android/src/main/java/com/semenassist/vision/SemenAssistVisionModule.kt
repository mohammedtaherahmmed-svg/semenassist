package com.semenassist.vision

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

private data class Detection(val x: Double, val y: Double)
private data class Track(
  val points: MutableList<Detection> = mutableListOf(),
  val frameIndices: MutableList<Int> = mutableListOf(),
  var last: Detection? = null,
  var lastFrame: Int = -1
)

class SemenAssistVisionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SemenAssistVision")

    AsyncFunction("analyzeVideo") { videoUri: String, micronsPerPixel: Double, chamberDepth: Double ->
      require(micronsPerPixel.isFinite() && micronsPerPixel > 0.0) { "قيمة المعايرة غير صالحة." }
      require(chamberDepth.isFinite() && chamberDepth > 0.0) { "عمق الحجرة غير صالح." }
      val context = appContext.reactContext ?: error("تعذر الوصول إلى سياق Android.")
      val retriever = MediaMetadataRetriever()
      try {
        val uri = Uri.parse(videoUri)
        if (uri.scheme == "content") retriever.setDataSource(context, uri)
        else if (uri.scheme == "file") retriever.setDataSource(uri.path ?: error("مسار الفيديو غير صالح."))
        else error("يجب اختيار فيديو محفوظًا على الجهاز.")
        analyze(retriever, micronsPerPixel, chamberDepth)
      } finally {
        retriever.release()
      }
    }
  }

  private fun analyze(retriever: MediaMetadataRetriever, micronsPerPixel: Double, chamberDepth: Double): Map<String, Any> {
    val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
    require(durationMs >= 1000L) { "مدة الفيديو غير كافية أو غير قابلة للقراءة." }
    val fpsMetadata = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)?.toDoubleOrNull()
    val fps = fpsMetadata?.takeIf { it.isFinite() && it >= 1.0 } ?: 30.0
    val sampleCount = min(80, max(12, ceil(durationMs / 250.0).toInt()))
    val tracks = mutableListOf<Track>()
    val counts = mutableListOf<Int>()
    var sourceWidth = 0
    var sourceHeight = 0
    var processed = 0
    var sourceScale = 1.0

    for (index in 0 until sampleCount) {
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
        val detections = detect(scaled)
        if (scaled !== frame) scaled.recycle()
        counts.add(detections.size)
        updateTracks(tracks, detections, processed)
        processed++
      } finally {
        frame.recycle()
      }
    }
    require(processed >= 8 && sourceWidth > 0) { "تعذر استخراج إطارات كافية من الفيديو." }

    val validTracks = tracks.filter { it.points.size >= 3 }
    val durationSec = durationMs / 1000.0
    val adjustedScale = micronsPerPixel / sourceScale
    val sampleRate = max(0.1, (processed - 1).toDouble() / durationSec)
    val metrics = validTracks.map { track -> trackMetrics(track, adjustedScale, sampleRate) }
    val moving = metrics.count { (it["vsl"] ?: 0.0) >= 1.0 }
    val progressive = metrics.count { (it["vsl"] ?: 0.0) >= 1.5 && (it["lin"] ?: 0.0) >= 0.45 }
    val totalMotility = if (metrics.isEmpty()) 0.0 else moving * 100.0 / metrics.size
    val progressiveMotility = if (metrics.isEmpty()) 0.0 else progressive * 100.0 / metrics.size
    val nonProgressive = max(0.0, totalMotility - progressiveMotility)
    val immotile = max(0.0, 100.0 - totalMotility)
    val averageCount = counts.average().takeIf { it.isFinite() } ?: 0.0
    val volumeUm3 = sourceWidth * sourceHeight * micronsPerPixel * micronsPerPixel * chamberDepth
    val volumeMl = volumeUm3 / 1.0e12
    val concentration = if (volumeMl > 0) averageCount / volumeMl / 1.0e6 else 0.0
    val issues = mutableListOf<String>()
    if (durationSec < 12) issues.add("مدة الفيديو أقل من 12 ثانية.")
    if (processed < 12) issues.add("عدد الإطارات المستخرجة منخفض.")
    if (validTracks.size < 5) issues.add("عدد المسارات المكتشفة منخفض؛ راجع الإضاءة والتركيز.")
    if (fpsMetadata == null) issues.add("معدل الإطارات غير متاح؛ استُخدمت قيمة تقريبية.")
    if (sourceWidth < 640) issues.add("دقة الفيديو أقل من 640 بكسل.")
    val countMean = counts.average().takeIf { it > 0 } ?: 0.0
    val countCv = if (countMean > 0) sqrt(counts.map { (it - countMean) * (it - countMean) }.average()) / countMean else 1.0
    if (countCv > 0.1) issues.add("تباين عدد الأجسام بين الإطارات أعلى من 10%.")
    val quality = max(0, min(100, 100 - issues.size * 16 + min(12, validTracks.size / 5)))
    val avg = { key: String -> if (metrics.isEmpty()) 0.0 else metrics.map { it[key] ?: 0.0 }.average() }

    return mapOf(
      "ok" to true, "engine" to "android-local-cv-screening",
      "engineVersion" to "0.1.0-local-frame-tracker",
      "framesAnalyzed" to processed, "frameCount" to (durationSec * fps).toInt(),
      "fps" to fps, "width" to sourceWidth, "height" to sourceHeight,
      "durationSec" to durationSec, "analyzedDurationSec" to durationSec,
      "coveragePct" to 100.0, "objectsDetected" to validTracks.size,
      "averageObjectsPerFrame" to averageCount, "concentration" to concentration,
      "totalMotility" to totalMotility, "progressiveMotility" to progressiveMotility,
      "nonProgressiveMotility" to nonProgressive, "immotile" to immotile,
      "confidence" to (quality / 100.0), "qualityScore" to quality,
      "qualityIssues" to issues, "thresholds" to mapOf("sampleFrames" to sampleCount.toDouble()),
      "coefficientOfVariation" to countCv,
      "kinematics" to mapOf("vcl" to avg("vcl"), "vsl" to avg("vsl"), "vap" to avg("vap"),
        "lin" to avg("lin"), "str" to avg("str"), "wob" to avg("wob"), "alh" to avg("alh"), "bcf" to 0.0),
      "morphology" to mapOf("method" to "not-assessed-on-device", "totalExamined" to 0,
        "normalForms" to 0, "roundHeads" to 0, "elongatedHeads" to 0, "irregularHeads" to 0,
        "coiledTails" to 0, "bentTails" to 0, "doubleTails" to 0, "acrosomeAbnormal" to 0,
        "midpieceDefects" to 0, "tzi" to 0.0, "sdi" to 0.0,
        "automaticLimitations" to listOf("تحليل الشكل المجهري غير متاح في المحرك المحلي الأولي.")),
      "confidenceInterpretation" to "quality-score proxy; not a clinical probability",
      "processingLocation" to "on-device"
    )
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

  private fun updateTracks(tracks: MutableList<Track>, detections: List<Detection>, frame: Int) {
    val used = mutableSetOf<Int>()
    for (track in tracks) {
      val last = track.last ?: continue
      if (frame - track.lastFrame > 2) continue
      var best = -1
      var bestDistance = 22.0
      for (index in detections.indices) {
        if (index in used) continue
        val point = detections[index]
        val distance = hypot(point.x - last.x, point.y - last.y)
        if (distance < bestDistance) { best = index; bestDistance = distance }
      }
      if (best >= 0) {
        track.points.add(detections[best])
        track.frameIndices.add(frame)
        track.last = detections[best]
        track.lastFrame = frame
        used.add(best)
      }
    }
    for (index in detections.indices) if (index !in used) {
      tracks.add(Track(mutableListOf(detections[index]), mutableListOf(frame), detections[index], frame))
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
