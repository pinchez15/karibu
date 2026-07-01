package com.karibuhealth.app.domain

import androidx.compose.ui.graphics.Color
import com.karibuhealth.app.data.remote.dto.AppointmentDto

enum class ClinicEventType(val wire: String) {
    follow_up("follow_up"),
    drive("drive"),
    admin("admin"),
    external_lab_agency("external_lab_agency"),
    ;

    companion object {
        fun fromWire(value: String): ClinicEventType =
            entries.firstOrNull { it.wire == value } ?: admin
    }
}

data class ClinicAppointment(
    val id: String,
    val patientId: String?,
    val patientName: String?,
    val eventType: ClinicEventType,
    val title: String?,
    val reason: String?,
    val scheduledAt: String,
    val scheduledEnd: String?,
    val unit: String?,
    val status: String,
)

data class ClinicEventMeta(
    val label: String,
    val shortLabel: String,
    val color: Color,
)

object ClinicCalendarEvents {
    val meta: Map<ClinicEventType, ClinicEventMeta> = mapOf(
        ClinicEventType.follow_up to ClinicEventMeta("Patient follow-up", "Follow-up", Color(0xFF1E5A8A)),
        ClinicEventType.drive to ClinicEventMeta("Outreach / clinic day", "Outreach", Color(0xFF0D9488)),
        ClinicEventType.admin to ClinicEventMeta("Admin / reporting", "Admin", Color(0xFF64748B)),
        ClinicEventType.external_lab_agency to ClinicEventMeta("Lab run / agency visit", "Lab / agency", Color(0xFFC27803)),
    )

    fun appointmentTitle(a: ClinicAppointment): String =
        a.patientName?.takeIf { it.isNotBlank() }
            ?: a.title?.takeIf { it.isNotBlank() }
            ?: meta[a.eventType]?.shortLabel
            ?: "Event"
}

fun AppointmentDto.toDomain(): ClinicAppointment = ClinicAppointment(
    id = id,
    patientId = patientId,
    patientName = patientName,
    eventType = ClinicEventType.fromWire(eventType),
    title = title,
    reason = reason,
    scheduledAt = scheduledAt,
    scheduledEnd = scheduledEnd,
    unit = unit,
    status = status,
)
