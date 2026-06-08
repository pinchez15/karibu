package com.karibuhealth.app.ui.anc

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.entity.AncContactEntity
import com.karibuhealth.app.data.local.db.entity.PregnancyEntity
import com.karibuhealth.app.data.repository.AncRepository
import com.karibuhealth.app.domain.AncProtocol
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

data class PregnancyDetailUiState(
    val pregnancy: PregnancyEntity? = null,
    val contacts: List<AncContactEntity> = emptyList(),
    val status: AncProtocol.Status? = null,
    val savedTick: Int = 0,
    val error: String? = null,
)

/** A contact's typed-in values before persistence. */
data class AncContactInput(
    val bpSystolic: Int? = null,
    val bpDiastolic: Int? = null,
    val weightKg: Double? = null,
    val fundalHeightCm: Int? = null,
    val fetalHeartRate: Int? = null,
    val urineProtein: String? = null,
    val hb: Double? = null,
    val iptpGiven: Boolean = false,
    val ifasGiven: Boolean = false,
    val tdGiven: Boolean = false,
    val dewormed: Boolean = false,
    val itnGiven: Boolean = false,
    val notes: String? = null,
)

@HiltViewModel
class PregnancyDetailViewModel @Inject constructor(
    private val ancRepository: AncRepository,
    private val authTokenStore: AuthTokenStore,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val pregnancyId: String = savedStateHandle.get<String>("pregnancyId").orEmpty()
    private val _state = MutableStateFlow(PregnancyDetailUiState())
    val state: StateFlow<PregnancyDetailUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            ancRepository.observePregnancy(pregnancyId).collect { pg ->
                _state.update { it.copy(pregnancy = pg) }
                recompute()
            }
        }
        viewModelScope.launch {
            ancRepository.observeContacts(pregnancyId).collect { contacts ->
                _state.update { it.copy(contacts = contacts) }
                recompute()
            }
        }
        viewModelScope.launch { ancRepository.refreshContacts(pregnancyId) }
    }

    private fun recompute() {
        val st = _state.value
        val pg = st.pregnancy ?: return
        val status = AncProtocol.status(
            lmp = pg.lmp?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() },
            edd = pg.edd?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() },
            contactsDone = st.contacts.size,
            iptpDone = st.contacts.count { it.iptpGiven },
            today = LocalDate.now(),
        )
        _state.update { it.copy(status = status) }
    }

    fun recordContact(input: AncContactInput) {
        val pg = _state.value.pregnancy ?: return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            try {
                ancRepository.recordContact(
                    clinicId = clinicId,
                    pregnancyId = pregnancyId,
                    patientId = pg.patientId,
                    contactNumber = _state.value.contacts.size + 1,
                    gestationWeeks = _state.value.status?.gestationWeeks,
                    bpSystolic = input.bpSystolic, bpDiastolic = input.bpDiastolic, weightKg = input.weightKg,
                    fundalHeightCm = input.fundalHeightCm, fetalHeartRate = input.fetalHeartRate,
                    urineProtein = input.urineProtein, hb = input.hb, iptpGiven = input.iptpGiven,
                    ifasGiven = input.ifasGiven, tdGiven = input.tdGiven, dewormed = input.dewormed,
                    itnGiven = input.itnGiven, notes = input.notes,
                )
                _state.update { it.copy(savedTick = it.savedTick + 1) }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }
}
