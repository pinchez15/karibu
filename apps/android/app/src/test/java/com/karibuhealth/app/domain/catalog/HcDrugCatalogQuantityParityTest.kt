package com.karibuhealth.app.domain.catalog

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Spec R6 parity: the Kotlin quantity-compute mirror MUST produce identical
 * numbers to the TS canonical (packages/shared/src/pharmacy-catalog.ts). This
 * suite loads the SHARED golden vectors — the exact same JSON the TS suite pins
 * (packages/shared/src/__fixtures__/quantity-vectors.json) — so the two mirrors
 * cannot drift. Do not copy the fixture into test resources; load the shared one.
 */
class HcDrugCatalogQuantityParityTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun locateVectors(): File {
        // Walk up from the test working dir looking for the shared fixture, so the
        // test is robust to whether Gradle runs from apps/android or apps/android/app.
        val rel = "packages/shared/src/__fixtures__/quantity-vectors.json"
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, rel)
            if (candidate.exists()) return candidate
            dir = dir.parentFile
        }
        throw AssertionError(
            "Could not locate shared golden vectors ($rel) from ${System.getProperty("user.dir")}",
        )
    }

    private fun doseUnit(code: String): HcDrugCatalog.DoseUnit =
        requireNotNull(HcDrugCatalog.DoseUnit.fromCode(code)) { "unknown dose_unit $code" }

    private fun dispenseUnit(code: String): HcDrugCatalog.DispenseUnit =
        requireNotNull(HcDrugCatalog.DispenseUnit.fromCode(code)) { "unknown dispense_unit $code" }

    @Test
    fun kotlinMirror_matchesSharedGoldenVectors() {
        val file = locateVectors()
        val root = json.parseToJsonElement(file.readText()).jsonObject
        val vectors = root["vectors"]!!.jsonArray
        assertTrue("expected golden vectors", vectors.isNotEmpty())

        for (element in vectors) {
            val vec = element.jsonObject
            val name = vec["name"]!!.jsonPrimitive.content
            val input = vec["input"]!!.jsonObject
            val expected = vec["expected"]!!.jsonObject

            fun str(key: String): String? = input[key]?.jsonPrimitive?.content
            fun dbl(key: String): Double? = input[key]?.jsonPrimitive?.content?.toDoubleOrNull()
            fun int(key: String): Int? = input[key]?.jsonPrimitive?.content?.toIntOrNull()

            val orderMode = if (str("order_mode") == "fixed_quantity") {
                HcDrugCatalog.OrderMode.FIXED_QUANTITY
            } else {
                HcDrugCatalog.OrderMode.SCHEDULED
            }

            val result = HcDrugCatalog.computePrescriptionQuantity(
                HcDrugCatalog.QuantityComputeInput(
                    orderMode = orderMode,
                    frequencyCode = str("frequency_code"),
                    durationDays = int("duration_days"),
                    doseAmount = requireNotNull(dbl("dose_amount")) { "$name: dose_amount" },
                    doseUnit = doseUnit(requireNotNull(str("dose_unit")) { "$name: dose_unit" }),
                    strengthAmount = dbl("strength_amount"),
                    dispenseUnit = dispenseUnit(requireNotNull(str("dispense_unit")) { "$name: dispense_unit" }),
                    fixedQuantity = dbl("fixed_quantity"),
                    containerSize = dbl("container_size"),
                ),
            )

            val expQty = expected["quantity"]?.jsonPrimitive?.content?.toDoubleOrNull()
            val expUpd = expected["units_per_dose"]?.jsonPrimitive?.content?.toDoubleOrNull()
            val expTotal = expected["total_doses"]?.jsonPrimitive?.content?.toIntOrNull()
            val expNeeds = expected["needs_confirmation"]!!.jsonPrimitive.content.toBoolean()

            if (expQty == null) {
                assertEquals("$name: quantity should be null", null, result.quantity)
            } else {
                assertNotNull("$name: quantity should not be null", result.quantity)
                assertEquals("$name: quantity", expQty, result.quantity!!, 1e-6)
            }
            if (expUpd == null) {
                assertEquals("$name: units_per_dose should be null", null, result.unitsPerDose)
            } else {
                assertNotNull("$name: units_per_dose should not be null", result.unitsPerDose)
                assertEquals("$name: units_per_dose", expUpd, result.unitsPerDose!!, 1e-6)
            }
            assertEquals("$name: total_doses", expTotal, result.totalDoses)
            assertEquals("$name: needs_confirmation", expNeeds, result.needsConfirmation)
        }
    }
}
