package com.karibuhealth.app.ui.patientnote

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.ui.dictation.AutosaveStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject

/**
 * Sources for a patient-only note. Excludes "visit" — the visit-tied path
 * still goes through DictationScreen.
 *
 * Values match the strings the server `provider_notes.source` column accepts
 * (migration 039). Keep in sync with the SQL CHECK constraint.
 */
enum class PatientNoteSource(val label: String, val value: String) {
    PHONE_CALL("Phone call", "phone_call"),
    FOLLOW_UP("Follow-up", "follow_up"),
    LAB_UPDATE("Lab update", "lab_update"),
    PHARMACY_UPDATE("Pharmacy update", "pharmacy_update"),
    GENERAL("General", "general"),
}

data class PatientNoteUiState(
    val patientId: String? = null,
    val noteId: String? = null,
    val transcript: String = "",
    val source: PatientNoteSource = PatientNoteSource.GENERAL,
    val isSigning: Boolean = false,
    val signed: Boolean = false,
    val autosaveStatus: AutosaveStatus = AutosaveStatus.Idle,
    val error: String? = null,
) {
    val canSign: Boolean
        get() = transcript.trim().length >= 10 && !isSigning && !signed
}

/**
 * Phase 3 patient-only note editor. Simpler than the visit-tied
 * DictationScreen: one big text area + source picker + autosave + Sign. No
 * structured-sections SOAP form, no visit advance, no AI structuring chain.
 *
 * Reuses NoteRepository.saveDraft/signNote (Phase 2) — those already accept
 * `visitId = null`. The server's rpc_upsert_provider_note (migration 039)
 * persists provider_notes with patient_id required + visit_id nullable.
 */
@HiltViewModel
class PatientNoteViewModel @Inject constructor(
    private val noteRepository: NoteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PatientNoteUiState())
    val uiState: StateFlow<PatientNoteUiState> = _uiState.asStateFlow()

    private var autosaveJob: Job? = null

    private companion object {
        // Same debounce as DictationViewModel — coalesces burst typing while
        // still flushing within 1.5s of the user pausing.
        const val AUTOSAVE_DEBOUNCE_MS = 1_500L
    }

    fun load(patientId: String, initialSource: String?) {
        val resolved = initialSource?.let { value ->
            PatientNoteSource.values().firstOrNull { it.value == value }
        } ?: PatientNoteSource.GENERAL
        _uiState.update {
            it.copy(
                patientId = patientId,
                source = resolved,
                // Generate the stable provider-note UUID eagerly so every
                // autosave + the final sign call point at the same row.
                noteId = it.noteId ?: UUID.randomUUID().toString(),
            )
        }
    }

    fun updateTranscript(text: String) {
        _uiState.update { it.copy(transcript = text) }
        scheduleAutosave()
    }

    fun updateSource(source: PatientNoteSource) {
        _uiState.update { it.copy(source = source) }
        // Source change is also a meaningful edit — persist it so a clinician
        // who changes "General" → "Phone call" then closes the app sees the
        // right source label on reopen.
        scheduleAutosave()
    }

    private fun scheduleAutosave() {
        val current = _uiState.value
        if (current.isSigning || current.signed) return
        if (current.patientId == null) return

        autosaveJob?.cancel()
        autosaveJob = viewModelScope.launch {
            delay(AUTOSAVE_DEBOUNCE_MS)
            performAutosave()
        }
    }

    private suspend fun performAutosave(): String? {
        val snapshot = _uiState.value
        val patientId = snapshot.patientId ?: return null
        val transcript = snapshot.transcript.trim()
        if (transcript.isBlank()) return null

        _uiState.update { it.copy(autosaveStatus = AutosaveStatus.Saving) }
        return try {
            val (savedNote, syncEntryId) = withContext(Dispatchers.IO) {
                noteRepository.saveDraft(
                    patientId = patientId,
                    visitId = null,
                    transcript = transcript,
                    noteId = snapshot.noteId,
                    source = snapshot.source.value,
                )
            }
            _uiState.update {
                it.copy(
                    noteId = savedNote.id,
                    autosaveStatus = if (syncEntryId == null) AutosaveStatus.Saved else AutosaveStatus.Offline,
                )
            }
            savedNote.id
        } catch (e: Exception) {
            _uiState.update {
                it.copy(autosaveStatus = AutosaveStatus.Error(e.message ?: "Autosave failed"))
            }
            null
        }
    }

    /**
     * Sign the note. Flushes the debounced autosave first so the latest
     * transcript is durable before flipping to `signed`. No visit-tied chain
     * (no documentation_complete, no clinical_summary, no patient_notes
     * receipt) — patient-only notes don't have a visit to advance.
     */
    fun signNote() {
        val state = _uiState.value
        val patientId = state.patientId ?: return
        if (state.transcript.trim().length < 10) {
            _uiState.update { it.copy(error = "Add a bit more to the note before signing.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSigning = true, error = null) }
            try {
                autosaveJob?.cancel()
                autosaveJob = null
                val noteId = performAutosave() ?: state.noteId
                    ?: error("Final autosave failed and no note id available")
                withContext(Dispatchers.IO) {
                    noteRepository.signNote(noteId = noteId)
                }
                _uiState.update {
                    it.copy(
                        isSigning = false,
                        signed = true,
                        autosaveStatus = AutosaveStatus.Saved,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSigning = false, error = "Could not sign: ${e.message}")
                }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
