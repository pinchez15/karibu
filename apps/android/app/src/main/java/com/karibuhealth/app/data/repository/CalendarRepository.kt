package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.CancelAppointmentRequest
import com.karibuhealth.app.data.remote.dto.CreateAppointmentRequest
import com.karibuhealth.app.data.remote.dto.ListAppointmentsRequest
import com.karibuhealth.app.data.remote.dto.UpdateAppointmentRequest
import com.karibuhealth.app.domain.ClinicAppointment
import com.karibuhealth.app.domain.ClinicEventType
import com.karibuhealth.app.domain.toDomain
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneOffset
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CalendarRepository @Inject constructor(
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
) {
    suspend fun listAppointments(
        clinicId: String,
        from: Instant,
        to: Instant,
    ): List<ClinicAppointment> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isOnline()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcListAppointments(
                ListAppointmentsRequest(
                    clinicId = clinicId,
                    from = from.toString(),
                    to = to.toString(),
                ),
            ).map { it.toDomain() }
        }.getOrElse { emptyList() }
    }

    suspend fun createAppointment(
        clinicId: String,
        eventType: ClinicEventType,
        scheduledAt: Instant,
        patientId: String?,
        title: String?,
        reason: String?,
        scheduledEnd: Instant?,
    ): String = withContext(Dispatchers.IO) {
        require(networkMonitor.isOnline()) { "Calendar requires an internet connection" }
        val resp = supabaseApi.rpcCreateAppointment(
            CreateAppointmentRequest(
                clinicId = clinicId,
                eventType = eventType.wire,
                scheduledAt = scheduledAt.toString(),
                patientId = patientId,
                title = title?.trim()?.takeIf { it.isNotEmpty() },
                reason = reason?.trim()?.takeIf { it.isNotEmpty() },
                scheduledEnd = scheduledEnd?.toString(),
            ),
        )
        if (!resp.isSuccessful) {
            throw IllegalStateException("rpc_create_appointment HTTP ${resp.code()} ${resp.errorBody()?.string()?.take(200)}")
        }
        resp.body()?.string()?.trim('"')
            ?: throw IllegalStateException("rpc_create_appointment returned empty body")
    }

    suspend fun updateAppointment(
        clinicId: String,
        appointmentId: String,
        eventType: ClinicEventType,
        scheduledAt: Instant,
        patientId: String?,
        title: String?,
        reason: String?,
        scheduledEnd: Instant?,
    ) = withContext(Dispatchers.IO) {
        require(networkMonitor.isOnline()) { "Calendar requires an internet connection" }
        val resp = supabaseApi.rpcUpdateAppointment(
            UpdateAppointmentRequest(
                clinicId = clinicId,
                appointmentId = appointmentId,
                eventType = eventType.wire,
                scheduledAt = scheduledAt.toString(),
                patientId = patientId,
                title = title?.trim()?.takeIf { it.isNotEmpty() },
                reason = reason?.trim()?.takeIf { it.isNotEmpty() },
                scheduledEnd = scheduledEnd?.toString(),
            ),
        )
        if (!resp.isSuccessful) {
            throw IllegalStateException("rpc_update_appointment HTTP ${resp.code()} ${resp.errorBody()?.string()?.take(200)}")
        }
    }

    suspend fun cancelAppointment(clinicId: String, appointmentId: String) = withContext(Dispatchers.IO) {
        require(networkMonitor.isOnline()) { "Calendar requires an internet connection" }
        val resp = supabaseApi.rpcCancelAppointment(
            CancelAppointmentRequest(clinicId = clinicId, appointmentId = appointmentId),
        )
        if (!resp.isSuccessful) {
            throw IllegalStateException("rpc_cancel_appointment HTTP ${resp.code()} ${resp.errorBody()?.string()?.take(200)}")
        }
    }

    fun monthWindow(month: java.time.YearMonth): Pair<Instant, Instant> {
        val start = month.minusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC)
        val end = month.plusMonths(2).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC)
        return start to end
    }
}
