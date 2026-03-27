package com.karibuhealth.app.ui.consent

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.ConsentRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConsentUiState(
    val consentRecording: Boolean = false,
    val consentAiProcessing: Boolean = false,
    val consentStorage: Boolean = false,
    val consentCrossBorder: Boolean = false,
    val isMinor: Boolean = false,
    val guardianName: String = "",
    val guardianRelationship: String = "",
    val sourceLanguage: SourceLanguage = SourceLanguage.eng,
    val isCreating: Boolean = false,
    val createdVisitId: String? = null,
    val error: String? = null,
) {
    val allConsentsGranted: Boolean
        get() = consentRecording && consentAiProcessing && consentStorage && consentCrossBorder

    val guardianValid: Boolean
        get() = !isMinor || (guardianName.isNotBlank() && guardianRelationship.isNotBlank())

    val canProceed: Boolean
        get() = allConsentsGranted && guardianValid
}

@HiltViewModel
class ConsentViewModel @Inject constructor(
    private val consentRepository: ConsentRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ConsentUiState())
    val uiState: StateFlow<ConsentUiState> = _uiState.asStateFlow()

    fun updateConsentRecording(v: Boolean) = _uiState.update { it.copy(consentRecording = v) }
    fun updateConsentAiProcessing(v: Boolean) = _uiState.update { it.copy(consentAiProcessing = v) }
    fun updateConsentStorage(v: Boolean) = _uiState.update { it.copy(consentStorage = v) }
    fun updateConsentCrossBorder(v: Boolean) = _uiState.update { it.copy(consentCrossBorder = v) }
    fun updateIsMinor(v: Boolean) = _uiState.update { it.copy(isMinor = v) }
    fun updateGuardianName(v: String) = _uiState.update { it.copy(guardianName = v) }
    fun updateGuardianRelationship(v: String) = _uiState.update { it.copy(guardianRelationship = v) }
    fun updateSourceLanguage(v: SourceLanguage) = _uiState.update { it.copy(sourceLanguage = v) }

    fun createVisitWithConsent(patientId: String) {
        if (!_uiState.value.canProceed) return

        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true) }
            try {
                val clinicId = authTokenStore.getClinicId() ?: throw Exception("No clinic ID")
                val staffId = authTokenStore.getStaffId()
                val state = _uiState.value

                // Create visit (offline-first)
                val visit = visitRepository.createVisit(
                    clinicId = clinicId,
                    patientId = patientId,
                    doctorId = staffId,
                    sourceLanguage = state.sourceLanguage,
                    consentRecording = true,
                )

                // Record all consents (offline-first)
                val grantedBy = if (state.isMinor) ConsentGrantedBy.guardian else ConsentGrantedBy.patient
                consentRepository.recordAllConsents(
                    patientId = patientId,
                    visitId = visit.id,
                    grantedBy = grantedBy,
                    guardianName = state.guardianName.takeIf { state.isMinor },
                    guardianRelationship = state.guardianRelationship.takeIf { state.isMinor },
                )

                _uiState.update { it.copy(createdVisitId = visit.id, isCreating = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message, isCreating = false) }
            }
        }
    }
}
