package com.karibuhealth.app.domain

import com.karibuhealth.app.util.parseServerInstant

import com.karibuhealth.app.data.local.db.entity.MedicationAdministrationEntity
import com.karibuhealth.app.data.local.db.entity.MedicationOrderEntity
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Computes today's dose slots from free-text frequency (BD/TDS/…).
 * Ward-standard times for Ugandan HC III.
 */
object InpatientDoseSchedule {

    data class DoseSlot(
        val orderId: String,
        val drugName: String,
        val dose: String?,
        val route: String?,
        val frequency: String?,
        val scheduledFor: Instant,
        val label: String,
        val status: SlotStatus,
        val adminId: String? = null,
        val notGivenReason: String? = null,
    )

    enum class SlotStatus { DUE, DUE_SOON, OVERDUE, GIVEN, NOT_GIVEN, UPCOMING }

    private val timeFmt = DateTimeFormatter.ofPattern("HH:mm")
    private const val GRACE_MINUTES = 30L
    private const val DUE_SOON_MINUTES = 60L
    private const val MATCH_WINDOW_MS = 90 * 60 * 1000L

    private val slotHours = mapOf(
        "stat" to emptyList(),
        "od" to listOf(8),
        "daily" to listOf(8),
        "mane" to listOf(8),
        "bd" to listOf(8, 20),
        "tds" to listOf(8, 14, 20),
        "qds" to listOf(6, 12, 18, 22),
        "q6h" to listOf(6, 12, 18, 0),
        "q8h" to listOf(6, 14, 22),
        "nocte" to listOf(20),
    )

    fun isPrn(order: MedicationOrderEntity): Boolean = normalizeFreq(order.frequency) == "prn"

    fun buildSchedule(
        orders: List<MedicationOrderEntity>,
        admins: List<MedicationAdministrationEntity>,
        now: Instant = Instant.now(),
    ): ScheduleResult {
        val zone = ZoneId.systemDefault()
        val active = orders.filter { it.active }
        val prn = active.filter(::isPrn)
        val scheduled = active.filterNot(::isPrn)
        val slots = mutableListOf<DoseSlot>()

        for (order in scheduled) {
            val key = normalizeFreq(order.frequency)
            var hours = slotHours[key] ?: listOf(8, 20)
            if (key == "stat") {
                hours = listOf(
                    parseServerInstant(order.createdAt).atZone(zone).hour,
                )
            }
            for (h in hours) {
                val slotInstant = LocalDate.now(zone).atTime(LocalTime.of(h, 0))
                    .atZone(zone).toInstant()
                val admin = findAdmin(order.id, slotInstant, admins)
                val status = slotStatus(slotInstant, admin, now)
                slots += DoseSlot(
                    orderId = order.id,
                    drugName = order.drugName,
                    dose = order.dose,
                    route = order.route,
                    frequency = order.frequency,
                    scheduledFor = slotInstant,
                    label = slotInstant.atZone(zone).format(timeFmt),
                    status = status,
                    adminId = admin?.id,
                    notGivenReason = admin?.notGivenReason,
                )
            }
        }

        slots.sortBy { it.scheduledFor }
        val dueNow = slots.filter {
            it.status == SlotStatus.DUE || it.status == SlotStatus.DUE_SOON || it.status == SlotStatus.OVERDUE
        }
        return ScheduleResult(dueNow = dueNow, prnOrders = prn)
    }

    data class ScheduleResult(
        val dueNow: List<DoseSlot> = emptyList(),
        val prnOrders: List<MedicationOrderEntity> = emptyList(),
    )

    private fun normalizeFreq(freq: String?): String {
        if (freq.isNullOrBlank()) return "stat"
        val f = freq.trim().lowercase().replace("\\s+".toRegex(), "")
        return when {
            "stat" in f || "once" in f -> "stat"
            "prn" in f || "sos" in f -> "prn"
            "qds" in f || "4x" in f -> "qds"
            "tds" in f || "3x" in f -> "tds"
            "bd" in f || "2x" in f -> "bd"
            "q6" in f -> "q6h"
            "q8" in f -> "q8h"
            "nocte" in f || "night" in f -> "nocte"
            "od" in f || "daily" in f || "mane" in f -> "od"
            else -> f
        }
    }

    private fun findAdmin(
        orderId: String,
        slot: Instant,
        admins: List<MedicationAdministrationEntity>,
    ): MedicationAdministrationEntity? {
        val slotMs = slot.toEpochMilli()
        return admins.firstOrNull { a ->
            if (a.orderId != orderId) return@firstOrNull false
            val schedMs = a.scheduledFor?.let { parseServerInstant(it).toEpochMilli() }
            if (schedMs != null && kotlin.math.abs(schedMs - slotMs) < MATCH_WINDOW_MS) return@firstOrNull true
            kotlin.math.abs(parseServerInstant(a.administeredAt).toEpochMilli() - slotMs) < MATCH_WINDOW_MS
        }
    }

    private fun slotStatus(
        slot: Instant,
        admin: MedicationAdministrationEntity?,
        now: Instant,
    ): SlotStatus {
        if (admin != null) {
            return if (admin.status == "given") SlotStatus.GIVEN else SlotStatus.NOT_GIVEN
        }
        val diffMin = (slot.toEpochMilli() - now.toEpochMilli()) / 60_000
        return when {
            diffMin > DUE_SOON_MINUTES -> SlotStatus.UPCOMING
            diffMin > -GRACE_MINUTES -> SlotStatus.DUE_SOON
            diffMin > -GRACE_MINUTES - 120 -> SlotStatus.DUE
            else -> SlotStatus.OVERDUE
        }
    }
}
