package com.karibuhealth.app.domain

import java.time.Instant

/** IV fluids and additives common at Ugandan HC III. */
object InpatientIvCatalog {

    data class FluidOption(val id: String, val label: String)

    val fluids = listOf(
        FluidOption("normal_saline", "Normal saline 0.9%"),
        FluidOption("ringers_lactate", "Ringer's lactate"),
        FluidOption("d5", "Dextrose 5%"),
        FluidOption("d10", "Dextrose 10%"),
        FluidOption("half_normal", "Half-normal saline 0.45%"),
        FluidOption("d5_ns", "D5 in normal saline"),
    )

    val additives = listOf(
        FluidOption("none", "None (fluid only)"),
        FluidOption("vit_b_complex", "Vitamin B complex"),
        FluidOption("vit_c", "Vitamin C"),
        FluidOption("ceftriaxone", "Ceftriaxone"),
        FluidOption("metronidazole", "Metronidazole"),
        FluidOption("artesunate", "Artesunate"),
        FluidOption("quinine", "Quinine"),
        FluidOption("oxytocin", "Oxytocin (PPH)"),
        FluidOption("magnesium_sulphate", "Magnesium sulphate"),
    )

    val volumePresetsMl = listOf(500, 1000, 2000)

    fun fluidLabel(id: String): String = fluids.find { it.id == id }?.label ?: id

    fun additiveLabel(id: String?): String? {
        if (id.isNullOrBlank() || id == "none") return null
        return additives.find { it.id == id }?.label ?: id
    }

    fun estimateMlRemaining(volumeMl: Int, rateMlHr: Int?, startedAt: String, now: Long = System.currentTimeMillis()): Int? {
        if (rateMlHr == null || rateMlHr <= 0) return null
        val elapsedHr = (now - Instant.parse(startedAt).toEpochMilli()) / 3_600_000.0
        return (volumeMl - elapsedHr * rateMlHr).toInt().coerceAtLeast(0)
    }
}
