package com.semenassist.vision

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.events.EventDispatcher
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

private data class LiveCandidate(val x: Double, val y: Double, val area: Int)
private data class LiveTrackState(
  val id: Int,
  var x: Double,
  var y: Double,
  var vx: Double,
  var vy: Double,
  var lastTimestampNs: Long,
  var observations: Int = 1,
  var missed: Int = 0
)

private class LiveCentroidTracker {
  private val active = mutableListOf<LiveTrackState>()
  private var nextId = 1

  fun update(candidates: List<LiveCandidate>, timestampNs: Long): List<LiveTrackState> {
    val pairs = mutableListOf<Triple<Double, Int, Int>>()
    for (trackIndex in active.indices) {
      val track = active[trackIndex]
      val dt = ((timestampNs - track.lastTimestampNs).coerceAtLeast(1L)) / 1_000_000_000.0
      val predictedX = track.x + track.vx * dt
      val predictedY = track.y + track.vy * dt
      val gate = 28.0 + min(42.0, dt * 120.0)
      for (candidateIndex in candidates.indices) {
        val distance = hypot(predictedX - candidates[candidateIndex].x, predictedY - candidates[candidateIndex].y)
        if (distance <= gate) pairs.add(Triple(distance, trackIndex, candidateIndex))
      }
    }
    pairs.sortBy { it.first }
    val usedTracks = mutableSetOf<Int>()
    val usedCandidates = mutableSetOf<Int>()
    for ((_, trackIndex, candidateIndex) in pairs) {
      if (trackIndex in usedTracks || candidateIndex in usedCandidates) continue
      val track = active[trackIndex]
      val candidate = candidates[candidateIndex]
      val dt = ((timestampNs - track.lastTimestampNs).coerceAtLeast(1L)) / 1_000_000_000.0
      val measuredVx = (candidate.x - track.x) / dt
      val measuredVy = (candidate.y - track.y) / dt
      track.vx = track.vx * 0.55 + measuredVx * 0.45
      track.vy = track.vy * 0.55 + measuredVy * 0.45
      track.x = candidate.x
      track.y = candidate.y
      track.lastTimestampNs = timestampNs
      track.observations += 1
      track.missed = 0
      usedTracks.add(trackIndex)
      usedCandidates.add(candidateIndex)
    }
    for (index in active.indices) if (index !in usedTracks) active[index].missed += 1
    active.removeAll { it.missed > 3 }
    for (index in candidates.indices) {
      if (index in usedCandidates) continue
      val candidate = candidates[index]
      active.add(LiveTrackState(nextId++, candidate.x, candidate.y, 0.0, 0.0, timestampNs))
    }
    return active.toList()
  }
}

class SemenAssistLiveCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val onAnalysis by EventDispatcher()
  val onCameraState by EventDispatcher()
  private val previewView = PreviewView(context)
  private val analyzerExecutor = Executors.newSingleThreadExecutor()
  private val tracker = LiveCentroidTracker()
  private var provider: ProcessCameraProvider? = null
  private var previewUseCase: Preview? = null
  private var analysisUseCase: ImageAnalysis? = null
  private var binding = false
  private var started = false
  private var lastAnalysisMs = 0L
  private var previousFrameNs = 0L
  private var measuredFps = 0.0

  @Volatile var cameraFacing: String = "back"
  @Volatile var analysisIntervalMs: Int = 160
  @Volatile var analysisWidth: Int = 480
  @Volatile var analysisHeight: Int = 360

  init {
    previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    previewView.setBackgroundColor(Color.BLACK)
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun applyCameraProps() {
    if (started || binding) {
      stopUseCases()
    }
    startCamera()
  }

  fun startCamera() {
    if (started || binding || !isAttachedToWindow) return
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      onCameraState(mapOf("status" to "permission-required", "message" to "Camera permission is required."))
      return
    }
    val activity = appContext.activityProvider?.currentActivity
    val lifecycleOwner = activity as? LifecycleOwner
    if (lifecycleOwner == null) {
      onCameraState(mapOf("status" to "unavailable", "message" to "Android activity lifecycle is unavailable."))
      return
    }
    binding = true
    onCameraState(mapOf("status" to "starting"))
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        val cameraProvider = future.get()
        provider = cameraProvider
        val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        val analysis = ImageAnalysis.Builder()
          .setTargetResolution(Size(analysisWidth.coerceIn(320, 1280), analysisHeight.coerceIn(240, 960)))
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .build()
        analysis.setAnalyzer(analyzerExecutor) { image -> analyzeFrame(image) }
        val selector = CameraSelector.Builder()
          .requireLensFacing(if (cameraFacing == "front") CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK)
          .build()
        cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, analysis)
        previewUseCase = preview
        analysisUseCase = analysis
        started = true
        onCameraState(mapOf("status" to "ready", "cameraFacing" to cameraFacing))
      } catch (error: Exception) {
        onCameraState(mapOf("status" to "error", "message" to (error.message ?: "CameraX binding failed.")))
      } finally {
        binding = false
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun analyzeFrame(image: ImageProxy) {
    val startedAt = SystemClock.elapsedRealtimeNanos()
    try {
      val nowMs = SystemClock.elapsedRealtime()
      if (nowMs - lastAnalysisMs < analysisIntervalMs.coerceIn(80, 1000)) return
      lastAnalysisMs = nowMs
      val timestampNs = image.imageInfo.timestamp.takeIf { it > 0L } ?: startedAt
      if (previousFrameNs > 0L && timestampNs > previousFrameNs) {
        val instantaneous = 1_000_000_000.0 / (timestampNs - previousFrameNs)
        measuredFps = if (measuredFps == 0.0) instantaneous else measuredFps * 0.7 + instantaneous * 0.3
      }
      previousFrameNs = timestampNs
      val candidates = detectCandidates(image)
      val tracks = tracker.update(candidates, timestampNs)
      val processingMs = (SystemClock.elapsedRealtimeNanos() - startedAt) / 1_000_000.0
      val scaleX = image.width.toDouble() / max(1, image.width / 2)
      val scaleY = image.height.toDouble() / max(1, image.height / 2)
      val payload = mapOf(
        "timestampNs" to timestampNs.toDouble(),
        "imageWidth" to image.width,
        "imageHeight" to image.height,
        "analysisFps" to measuredFps,
        "processingMs" to processingMs,
        "candidateCount" to candidates.size,
        "activeTrackCount" to tracks.size,
        "detectionMethod" to "classical-grayscale-connected-components",
        "tracks" to tracks.map { track ->
          mapOf(
            "id" to track.id,
            "x" to track.x * scaleX,
            "y" to track.y * scaleY,
            "speedPxPerSec" to hypot(track.vx * scaleX, track.vy * scaleY),
            "observations" to track.observations,
            "missedFrames" to track.missed
          )
        }
      )
      post { onAnalysis(payload) }
    } catch (error: Exception) {
      post { onCameraState(mapOf("status" to "analysis-error", "message" to (error.message ?: "Frame analysis failed."))) }
    } finally {
      image.close()
    }
  }

  private fun detectCandidates(image: ImageProxy): List<LiveCandidate> {
    val plane = image.planes.firstOrNull() ?: return emptyList()
    val buffer = plane.buffer.duplicate()
    val rowStride = plane.rowStride
    val pixelStride = plane.pixelStride
    val step = 2
    val width = max(1, image.width / step)
    val height = max(1, image.height / step)
    val gray = ByteArray(width * height)
    var sum = 0L
    for (y in 0 until height) {
      val sourceY = min(image.height - 1, y * step)
      for (x in 0 until width) {
        val sourceX = min(image.width - 1, x * step)
        val sourceIndex = sourceY * rowStride + sourceX * pixelStride
        val value = buffer.get(sourceIndex).toInt() and 0xff
        gray[y * width + x] = value.toByte()
        sum += value
      }
    }
    val threshold = max(8, (sum / max(1, gray.size)).toInt() - 22)
    val visited = BooleanArray(gray.size)
    val queue = IntArray(gray.size)
    val result = mutableListOf<LiveCandidate>()
    for (startIndex in gray.indices) {
      if (visited[startIndex] || (gray[startIndex].toInt() and 0xff) >= threshold) continue
      var head = 0
      var tail = 0
      queue[tail++] = startIndex
      visited[startIndex] = true
      var count = 0
      var sumX = 0L
      var sumY = 0L
      var minX = width
      var minY = height
      var maxX = 0
      var maxY = 0
      while (head < tail) {
        val current = queue[head++]
        val x = current % width
        val y = current / width
        count++
        sumX += x
        sumY += y
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
        val neighbours = intArrayOf(
          if (x > 0) current - 1 else -1,
          if (x < width - 1) current + 1 else -1,
          if (y > 0) current - width else -1,
          if (y < height - 1) current + width else -1
        )
        for (next in neighbours) {
          if (next < 0 || visited[next] || (gray[next].toInt() and 0xff) >= threshold) continue
          visited[next] = true
          queue[tail++] = next
        }
      }
      val boxWidth = maxX - minX + 1
      val boxHeight = maxY - minY + 1
      if (count in 3..120 && boxWidth <= 28 && boxHeight <= 28) {
        result.add(LiveCandidate(sumX.toDouble() / count, sumY.toDouble() / count, count))
      }
    }
    return result
  }

  private fun stopUseCases() {
    try {
      val preview = previewUseCase
      val analysis = analysisUseCase
      if (preview != null || analysis != null) provider?.unbind(*(listOfNotNull(preview, analysis).toTypedArray()))
    } catch (_: Exception) { }
    previewUseCase = null
    analysisUseCase = null
    started = false
  }

  fun release() {
    stopUseCases()
    analyzerExecutor.shutdownNow()
  }
}

class SemenAssistLiveCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SemenAssistLiveCamera")

    AsyncFunction("getDeviceCapabilities") {
      val context = appContext.reactContext ?: error("Android context is unavailable.")
      val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memoryInfo = ActivityManager.MemoryInfo()
      activityManager.getMemoryInfo(memoryInfo)
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val thermalStatus = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) powerManager.currentThermalStatus else 0
      mapOf(
        "totalRamMb" to (memoryInfo.totalMem / (1024L * 1024L)).toInt(),
        "availableRamMb" to (memoryInfo.availMem / (1024L * 1024L)).toInt(),
        "cpuCores" to Runtime.getRuntime().availableProcessors(),
        "sdkInt" to Build.VERSION.SDK_INT,
        "supportedAbis" to Build.SUPPORTED_ABIS.toList(),
        "hasCamera" to context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY),
        "thermalStatus" to thermalStatus
      )
    }

    View(SemenAssistLiveCameraView::class) {
      Events("onAnalysis", "onCameraState")
      Prop("cameraFacing") { view: SemenAssistLiveCameraView, value: String ->
        view.cameraFacing = value
      }
      Prop("analysisIntervalMs") { view: SemenAssistLiveCameraView, value: Int ->
        view.analysisIntervalMs = value
      }
      Prop("analysisWidth") { view: SemenAssistLiveCameraView, value: Int ->
        view.analysisWidth = value
      }
      Prop("analysisHeight") { view: SemenAssistLiveCameraView, value: Int ->
        view.analysisHeight = value
      }
      OnViewDidUpdateProps { view: SemenAssistLiveCameraView -> view.applyCameraProps() }
      OnViewDestroys { view: SemenAssistLiveCameraView -> view.release() }
    }
  }
}
