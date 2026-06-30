package com.karibuhealth.learn

import com.karibuhealth.learn.model.CasePack
import com.karibuhealth.learn.model.PackManifest
import com.karibuhealth.learn.model.StepKind
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parses the actual shipped pack assets with the same Json config the app uses,
 * so a malformed fixture (or a schema drift in the pipeline) fails CI rather
 * than crashing on a clinician's phone.
 */
class LearnCaseSchemaTest {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; encodeDefaults = true }

    private fun asset(rel: String): String {
        // testDebugUnitTest runs with cwd = module dir; be resilient to others.
        val bases = listOf("", "apps/learn-android/", "../", "../../")
        val path = "src/main/assets/learn/$rel"
        val file = bases.map { File(it + path) }.firstOrNull { it.exists() }
        assertNotNull("Could not locate asset $rel (cwd=${File(".").absolutePath})", file)
        return file!!.readText()
    }

    @Test
    fun `manifest parses and core pack is bundled`() {
        val manifest = json.decodeFromString(PackManifest.serializer(), asset("manifest.json"))
        assertTrue("manifest should list bundled core + downloadable chapter packs", manifest.packs.size >= 40)

        val core = manifest.packs.first { it.id == "core-opd" }
        assertTrue("core pack must be bundled", core.bundled)
        assertEquals("learn/packs/core-opd.kpack", core.assetPath)

        manifest.packs.filter { !it.bundled }.forEach { pack ->
            assertNotNull("${pack.id} needs a download url", pack.downloadUrl)
            assertTrue(
                "${pack.id} should use Supabase Storage or https",
                pack.downloadUrl!!.startsWith("https://"),
            )
        }
    }

    @Test
    fun `core pack parses with the fully-authored fever case`() {
        val pack = json.decodeFromString(CasePack.serializer(), asset("packs/core-opd.kpack"))
        assertEquals("core-opd", pack.id)
        assertEquals(3, pack.cases.size)

        val fever = pack.cases.first { it.id == "fever-headache" }
        assertTrue(fever.ready)
        assertEquals("PT-100015", fever.patient.id)
        assertEquals(7, fever.steps.size)
        assertEquals(4, fever.objectives.size)
        assertEquals(4, fever.takeaways.size)
        assertTrue(fever.citations.isNotEmpty())

        // The case must carry a dose calculator with the four AL bands.
        val calc = fever.doseCalc
        assertNotNull(calc)
        assertEquals(4, calc!!.bands.size)
        assertEquals(4, calc.bandFor(62.4)?.tabs)
    }

    @Test
    fun `fever case has five graded decisions, each with exactly one correct answer`() {
        val pack = json.decodeFromString(CasePack.serializer(), asset("packs/core-opd.kpack"))
        val fever = pack.cases.first { it.id == "fever-headache" }

        val decisions = fever.steps.filter { it.kind == StepKind.decision }
        assertEquals(5, decisions.size)

        decisions.forEach { step ->
            val q = step.question
            assertNotNull("decision step must have a question", q)
            assertEquals(
                "exactly one correct option in: ${q!!.prompt}",
                1, q.options.count { it.correct },
            )
            assertTrue("right/wrong feedback required", q.right.isNotBlank() && q.wrong.isNotBlank())
        }
    }

    @Test
    fun `prescribe step wires the calculator and the diagnosis step carries a primary code`() {
        val pack = json.decodeFromString(CasePack.serializer(), asset("packs/core-opd.kpack"))
        val fever = pack.cases.first { it.id == "fever-headache" }

        val prescribe = fever.steps.first { it.chart?.tag == "PRESCRIBE" }
        assertTrue("prescribe section must request the calculator",
            prescribe.chart!!.sections.any { it.calculator })

        val diagnosis = fever.steps.first { it.chart?.tag == "DIAGNOSIS" }
        val codes = diagnosis.chart!!.sections.first { it.type == "diagnosis" }.codes
        assertEquals("B54", codes.first { it.primary }.code)
    }

    @Test
    fun `catalog stubs parse with no steps`() {
        val pack = json.decodeFromString(CasePack.serializer(), asset("packs/core-opd.kpack"))
        val stub = pack.cases.first { it.id == "breathless-child" }
        assertTrue(!stub.ready)
        assertTrue(stub.steps.isEmpty())
        assertEquals("Okello James", stub.patient.name)
    }

    @Test
    fun `exported chapter pack parses`() {
        val repoRoot = sequenceOf(
            File("../../../content/learn/published/chapters"),
            File("../../content/learn/published/chapters"),
            File("content/learn/published/chapters"),
        ).firstOrNull { it.exists() }
        assertNotNull("chapter export dir missing — run export-chapter-packs", repoRoot)

        val sample = File(repoRoot!!, "fever-malaria-acute-illness-l1.kpack")
        assertTrue("sample chapter pack should exist", sample.exists())
        val pack = json.decodeFromString(CasePack.serializer(), sample.readText())
        assertEquals("fever-malaria-acute-illness-l1", pack.id)
        assertTrue("chapter pack should contain cases", pack.cases.isNotEmpty())
        assertTrue("chapter cases should be walkable", pack.cases.all { it.ready })
    }

    @Test
    fun `content-strategy fields parse on the fever case`() {
        val pack = json.decodeFromString(CasePack.serializer(), asset("packs/core-opd.kpack"))
        val fever = pack.cases.first { it.id == "fever-headache" }

        assertEquals("Guideline Practice", fever.sourceType)
        assertEquals("Core Practice", fever.mode)
        assertEquals(1, fever.level)

        // Share artifacts for WhatsApp-style peer learning.
        assertNotNull(fever.share)
        assertTrue(fever.share!!.shareTitle!!.isNotBlank())
        assertTrue(fever.share!!.shareUrl!!.startsWith("https://"))
        assertTrue("share text excludes learner progress", !shareText(fever).contains("score", ignoreCase = true))

        // Provenance / review metadata is carried for future CPD readiness.
        assertEquals("approved", fever.meta?.reviewStatus)
        assertEquals("1.0.0", fever.meta?.caseVersion)
        assertTrue(fever.meta!!.sourceGuidelineIds.isNotEmpty())
    }
}
