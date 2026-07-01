package com.karibuhealth.app.ui.calendar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.CalendarRepository
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.domain.ClinicAppointment
import com.karibuhealth.app.domain.ClinicEventType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.karibuhealth.app.domain.model.Patient
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneId
import javax.inject.Inject

data class CalendarUiState(
    val month: YearMonth = YearMonth.now(),
    val appointments: List<ClinicAppointment> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val showAddSheet: Boolean = false,
    val addDefaultDate: LocalDate? = null,
    val selectedEvent: ClinicAppointment? = null,
    val showEditSheet: Boolean = false,
)

@HiltViewModel
class CalendarViewModel @Inject constructor(
    private val calendarRepository: CalendarRepository,
    private val patientRepository: PatientRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(CalendarUiState())
    val state: StateFlow<CalendarUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId()
            if (clinicId == null) {
                _state.update { it.copy(loading = false, error = "No clinic on this device") }
                return@launch
            }
            _state.update { it.copy(loading = true, error = null) }
            try {
                val month = _state.value.month
                val (from, to) = calendarRepository.monthWindow(month)
                val rows = calendarRepository.listAppointments(clinicId, from, to)
                _state.update { it.copy(loading = false, appointments = rows) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Could not load calendar") }
            }
        }
    }

    fun previousMonth() {
        _state.update { it.copy(month = it.month.minusMonths(1)) }
        refresh()
    }

    fun nextMonth() {
        _state.update { it.copy(month = it.month.plusMonths(1)) }
        refresh()
    }

    fun openAdd(date: LocalDate? = LocalDate.now()) {
        _state.update { it.copy(showAddSheet = true, addDefaultDate = date, selectedEvent = null, showEditSheet = false) }
    }

    fun openEvent(event: ClinicAppointment) {
        _state.update { it.copy(selectedEvent = event, showAddSheet = false, showEditSheet = false) }
    }

    fun openEdit() {
        _state.update { it.copy(showEditSheet = true) }
    }

    fun dismissSheets() {
        _state.update { it.copy(showAddSheet = false, showEditSheet = false, selectedEvent = null) }
    }

    fun saveEvent(
        eventType: ClinicEventType,
        date: LocalDate,
        time: LocalTime,
        title: String?,
        reason: String?,
        patientId: String?,
        existingId: String? = null,
    ) {
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _state.update { it.copy(loading = true, error = null) }
            try {
                val zone = ZoneId.systemDefault()
                val scheduledAt = date.atTime(time).atZone(zone).toInstant()
                if (existingId == null) {
                    calendarRepository.createAppointment(
                        clinicId = clinicId,
                        eventType = eventType,
                        scheduledAt = scheduledAt,
                        patientId = patientId,
                        title = title,
                        reason = reason,
                        scheduledEnd = null,
                    )
                } else {
                    calendarRepository.updateAppointment(
                        clinicId = clinicId,
                        appointmentId = existingId,
                        eventType = eventType,
                        scheduledAt = scheduledAt,
                        patientId = patientId,
                        title = title,
                        reason = reason,
                        scheduledEnd = null,
                    )
                }
                dismissSheets()
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Could not save event") }
            }
        }
    }

    fun deleteSelected() {
        val event = _state.value.selectedEvent ?: return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _state.update { it.copy(loading = true, error = null) }
            try {
                calendarRepository.cancelAppointment(clinicId, event.id)
                dismissSheets()
                refresh()
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Could not delete event") }
            }
        }
    }

    suspend fun searchPatients(query: String): List<Patient> {
        val clinicId = authTokenStore.getClinicId() ?: return emptyList()
        if (query.length < 2) return emptyList()
        return runCatching { patientRepository.searchPatients(clinicId, query).first() }.getOrElse { emptyList() }
    }
}
