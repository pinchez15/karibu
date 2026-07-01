package com.karibuhealth.app.ui.hivtb

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.entity.HivCareEnrollmentEntity
import com.karibuhealth.app.data.local.db.entity.ViralLoadTestEntity
import com.karibuhealth.app.data.repository.HivTbRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

data class HivCareDetailUiState(
    val enrollment: HivCareEnrollmentEntity? = null,
    val vlTests: List<ViralLoadTestEntity> = emptyList(),
    val vlCopies: String = "",
    val saving: Boolean = false,
    val savedTick: Int = 0,
    val error: String? = null,
)

@HiltViewModel
class HivCareDetailViewModel @Inject constructor(
    private val hivTbRepository: HivTbRepository,
    private val authTokenStore: AuthTokenStore,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val enrollmentId: String = savedStateHandle.get<String>("enrollmentId").orEmpty()
    private val _state = MutableStateFlow(HivCareDetailUiState())
    val state: StateFlow<HivCareDetailUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            hivTbRepository.observeHivEnrollment(enrollmentId).collect { e ->
                _state.update { it.copy(enrollment = e) }
            }
        }
        viewModelScope.launch {
            hivTbRepository.observeViralLoads(enrollmentId).collect { tests ->
                _state.update { it.copy(vlTests = tests) }
            }
        }
    }

    fun onVlCopiesChange(v: String) = _state.update { it.copy(vlCopies = v.filter { c -> c.isDigit() || c == '.' }) }

    fun updateFlags(
        cptAtLastVisit: Boolean? = null,
        tbAssessedLastVisit: Boolean? = null,
        tbTreatmentStarted: Boolean? = null,
        startArt: Boolean = false,
    ) {
        val e = _state.value.enrollment ?: return
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null) }
            try {
                val clinicId = authTokenStore.getClinicId() ?: return@launch
                val today = LocalDate.now().toString()
                val careStatus = if (startArt) "on_art" else e.careStatus
                hivTbRepository.upsertHivCare(
                    clinicId = clinicId,
                    patientId = e.patientId,
                    patientName = e.patientName,
                    enrollmentId = e.id,
                    enrolledAt = e.enrolledAt,
                    careStatus = careStatus,
                    whoStage = e.whoStage,
                    artStartDate = if (startArt && e.artStartDate == null) today else e.artStartDate,
                    artRegimen = if (startArt && e.artRegimen.isNullOrBlank()) "TLD" else e.artRegimen,
                    artLine = e.artLine,
                    cptAtLastVisit = cptAtLastVisit ?: e.cptAtLastVisit,
                    tbAssessedLastVisit = tbAssessedLastVisit ?: e.tbAssessedLastVisit,
                    tbTreatmentStarted = tbTreatmentStarted ?: e.tbTreatmentStarted,
                )
                _state.update { it.copy(saving = false, savedTick = it.savedTick + 1) }
            } catch (ex: Exception) {
                _state.update { it.copy(saving = false, error = ex.message) }
            }
        }
    }

    fun recordViralLoad() {
        val e = _state.value.enrollment ?: return
        val copies = _state.value.vlCopies.toDoubleOrNull()
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null) }
            try {
                val clinicId = authTokenStore.getClinicId() ?: return@launch
                hivTbRepository.recordViralLoad(
                    clinicId = clinicId,
                    patientId = e.patientId,
                    enrollmentId = e.id,
                    resultCopies = copies,
                )
                _state.update { it.copy(saving = false, vlCopies = "", savedTick = it.savedTick + 1) }
            } catch (ex: Exception) {
                _state.update { it.copy(saving = false, error = ex.message) }
            }
        }
    }
}
