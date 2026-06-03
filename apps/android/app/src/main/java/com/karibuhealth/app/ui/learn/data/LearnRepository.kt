package com.karibuhealth.app.ui.learn.data

import android.content.Context
import com.karibuhealth.app.ui.learn.model.CasePack
import com.karibuhealth.app.ui.learn.model.LearnCase
import com.karibuhealth.app.ui.learn.model.PackInfo
import com.karibuhealth.app.ui.learn.model.PackManifest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

enum class PackStatus { Installed, Available }

data class PackEntry(val info: PackInfo, val status: PackStatus)

/**
 * Loads KaribuLearn case packs.
 *
 * Packs are the download unit. A small **core pack** ships inside the APK; the
 * rest are pulled on demand and cached in internal storage, so a clinician only
 * spends data on the topics they want. Everything is offline-first: once a pack
 * is installed it never needs the network again.
 */
@Singleton
class LearnRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
    private val okHttpClient: OkHttpClient,
) {
    private val packsDir: File by lazy { File(context.filesDir, "learn/packs").apply { mkdirs() } }

    // Published packs are immutable ".kpack" files (case-content-strategy.md).
    private fun downloadedFile(id: String) = File(packsDir, "$id.kpack")

    /** Read the manifest of every known pack (bundled + downloadable). */
    suspend fun loadManifest(): List<PackInfo> = withContext(Dispatchers.IO) {
        val text = context.assets.open(MANIFEST_PATH).bufferedReader().use { it.readText() }
        json.decodeFromString(PackManifest.serializer(), text).packs
    }

    fun isInstalled(info: PackInfo): Boolean =
        info.bundled || downloadedFile(info.id).exists()

    /** Manifest joined with on-device install state. */
    suspend fun listPacks(): List<PackEntry> = loadManifest().map {
        PackEntry(it, if (isInstalled(it)) PackStatus.Installed else PackStatus.Available)
    }

    /** Parse one installed pack's full content. */
    suspend fun loadPack(info: PackInfo): CasePack = withContext(Dispatchers.IO) {
        val text = when {
            info.bundled && info.assetPath != null ->
                context.assets.open(info.assetPath).bufferedReader().use { it.readText() }
            downloadedFile(info.id).exists() -> downloadedFile(info.id).readText()
            else -> error("Pack ${info.id} is not installed")
        }
        json.decodeFromString(CasePack.serializer(), text).let { pack ->
            pack.copy(cases = pack.cases.map { it.copy(packId = pack.id) })
        }
    }

    /** Every case across all currently-installed packs. */
    suspend fun loadInstalledCases(): List<LearnCase> =
        listPacks().filter { it.status == PackStatus.Installed }
            .flatMap { runCatching { loadPack(it.info).cases }.getOrDefault(emptyList()) }

    suspend fun loadCase(caseId: String): LearnCase? =
        loadInstalledCases().firstOrNull { it.id == caseId }

    /**
     * Download a pack to internal storage, reporting 0f..1f progress.
     *
     * Hosted packs (https) stream over the network. The "bundled-remote://"
     * scheme copies from a packaged asset with a simulated transfer, so the
     * download experience is demonstrable offline and the pipeline can swap in
     * a real CDN URL later without any UI change.
     */
    suspend fun downloadPack(info: PackInfo, onProgress: (Float) -> Unit): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val url = info.downloadUrl ?: error("Pack ${info.id} has no download URL")
                val bytes = when {
                    url.startsWith(DEMO_SCHEME) -> readDemoPack(url.removePrefix(DEMO_SCHEME), onProgress)
                    else -> readNetworkPack(url, info.approxSizeKb, onProgress)
                }
                downloadedFile(info.id).writeBytes(bytes)
                onProgress(1f)
            }
        }

    private suspend fun readDemoPack(assetPath: String, onProgress: (Float) -> Unit): ByteArray {
        // Simulate a chunked transfer so the progress bar is honest-looking.
        val bytes = context.assets.open(assetPath).use { it.readBytes() }
        val steps = 8
        for (i in 1..steps) {
            delay(110)
            onProgress(i / (steps + 1f))
        }
        return bytes
    }

    private fun readNetworkPack(url: String, approxKb: Int, onProgress: (Float) -> Unit): ByteArray {
        val request = Request.Builder().url(url).build()
        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("HTTP ${response.code} downloading pack")
            val body = response.body ?: error("Empty pack body")
            val total = if (body.contentLength() > 0) body.contentLength() else approxKb * 1024L
            val source = body.byteStream()
            val out = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(16 * 1024)
            var read = 0L
            while (true) {
                val n = source.read(buffer)
                if (n < 0) break
                out.write(buffer, 0, n)
                read += n
                if (total > 0) onProgress((read.toFloat() / total).coerceIn(0f, 0.99f))
            }
            return out.toByteArray()
        }
    }

    fun removePack(id: String): Boolean = downloadedFile(id).delete()

    companion object {
        private const val MANIFEST_PATH = "learn/manifest.json"
        private const val DEMO_SCHEME = "bundled-remote://"
    }
}
