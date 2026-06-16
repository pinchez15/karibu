package com.karibuhealth.app.ui.dictation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.remote.api.DictationApiClient
import com.karibuhealth.app.data.remote.api.DictationException
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.sync.SyncEngine
import com.karibuhealth.app.ui.auth.ClerkAuthManager
import com.karibuhealth.app.util.Analytics
import com.karibuhealth.app.util.DictationRecorder
import com.karibuhealth.app.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject

@Serializable
data class ClinicalNoteSections(
    val chiefComplaint: String = "",
    val hpi: String = "",
    val physicalExam: String = "",
    val familySocialHistory: String = "",
    val diagnosis: String = "",
    val assessmentPlan: String = "",
    val medications: String = "",
    val testsOrdered: String = "",
    val followUpInstructions: String = "",
    val followUpTasks: List<String> = emptyList(),
    val additionalNote: String = "",
)

/**
 * Identifies the section text field currently holding focus, so Whisper
 * transcripts route to that field instead of always landing in
 * `additionalNote`. Default routing target when nothing is focused remains
 * `additionalNote` so the existing tap-mic-and-talk flow is unchanged.
 */
enum class NoteSection {
    ChiefComplaint,
    Hpi,
    PhysicalExam,
    FamilySocialHistory,
    Diagnosis,
    AssessmentPlan,
    Medications,
    TestsOrdered,
    FollowUpInstructions,
    AdditionalNote,
    ;

    /** Matches `section` multipart field / edge-function prompt hints. */
    val apiKey: String
        get() = name

    val displayLabel: String
        get() = when (this) {
            ChiefComplaint -> "Chief complaint"
            Hpi -> "History"
            PhysicalExam -> "Physical exam"
            FamilySocialHistory -> "Family & social history"
            Diagnosis -> "Diagnosis"
            AssessmentPlan -> "Assessment & plan"
            Medications -> "Pharmacy"
            TestsOrdered -> "Labs"
            FollowUpInstructions -> "Follow-up"
            AdditionalNote -> "Additional notes"
        }
}

/**
 * Visual state of the autosave pipeline. Drives the small indicator under
 * the screen header. Sealed so the screen can match on subtype without
 * accidentally falling into an "everything is Idle" coalescing bug.
 *
 * Lifecycle: Idle -> Saving -> Saved (online) | Offline (queued) | Error
 *   Idle    — no edits since last save, nothing pending
 *   Saving  — debounce fired, write to Room + (online) RPC in flight
 *   Saved   — last save completed against the server
 *   Offline — last save persisted locally + queued; sync on reconnect
 *   Error   — last save threw; surfaced briefly, then resets on next edit
 */
sealed class AutosaveStatus {
    data object Idle : AutosaveStatus()
    data object Saving : AutosaveStatus()
    data object Saved : AutosaveStatus()
    data object Offline : AutosaveStatus()
    data class Error(val message: String) : AutosaveStatus()
}

data class DictationUiState(
    val transcript: String = "",
    val sections: ClinicalNoteSections = ClinicalNoteSections(),
    val isRecording: Boolean = false,
    /** Section locked when the current recording session started. */
    val recordingSection: NoteSection? = null,
    /** Batch transcription in flight after stop (one upload per section take). */
    val isTranscribing: Boolean = false,
    val transcribingSection: NoteSection? = null,
    val isSubmitting: Boolean = false,
    val isStructuringWithAi: Boolean = false,
    val submitted: Boolean = false,
    val error: String? = null,
    val savedLocally: Boolean = false,
    /**
     * Stable provider-note UUID for this editing session. Generated on the
     * first text change (or read from existing local row on load) and reused
     * across every autosave + Sign call so the server-side ON CONFLICT (id)
     * keeps merging into the same row.
     */
    val noteId: String? = null,
    /**
     * Patient owning the note. For visit-tied dictation we resolve this from
     * the visit on load. Standalone notes (phone calls, etc.) would supply
     * patient_id directly — not wired into this screen yet.
     */
    val patientId: String? = null,
    /** Patient sex ('M' / 'F' / null). Drives the lab picker's sex filter. */
    val patientSex: String? = null,
    /** Patient age in whole years. Drives the lab picker's age filter. */
    val patientAgeYears: Int? = null,
    /**
     * Visit id this dictation is tied to (every current entrypoint is
     * visit-tied; reserved nullable for standalone-note callers wired in
     * later phases).
     */
    val visitId: String? = null,
    val autosaveStatus: AutosaveStatus = AutosaveStatus.Idle,
    /**
     * Section field that currently has focus. Set via setFocusedSection from
     * onFocusChanged callbacks on each field. `null` means no section field
     * is focused — Whisper transcripts then fall back to `additionalNote`.
     */
    val focusedSection: NoteSection? = null,
    val pharmacyOrderSubmitted: Boolean = false,
    val isSendingToPharmacy: Boolean = false,
    val openLabPickerOnLoad: Boolean = false,
    val openRxPickerOnLoad: Boolean = false,
    val isOnline: Boolean = true,
    val connectionLabel: String = "Online",
) {
    val canSubmit: Boolean
        get() = (transcript.trim().length >= 10 || sections.hasClinicalContent()) &&
            !isRecording && !isTranscribing && !isSubmitting
}

@HiltViewModel
class DictationViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val dictationApi: DictationApiClient,
    private val noteRepository: NoteRepository,
    private val visitRepository: VisitRepository,
    private val patientRepository: PatientRepository,
    private val staffRepository: StaffRepository,
    private val authTokenStore: AuthTokenStore,
    private val syncEngine: SyncEngine,
    private val clerkAuthManager: ClerkAuthManager,
    private val networkMonitor: NetworkMonitor,
    private val analytics: Analytics,
    private val json: Json,
) : ViewModel() {

    private val recorder = DictationRecorder(context)

    private val _uiState = MutableStateFlow(DictationUiState())
    val uiState: StateFlow<DictationUiState> = _uiState.asStateFlow()

    // Pending autosave debounce job. Cancelled on every keystroke so we only
    // flush once typing settles (AUTOSAVE_DEBOUNCE_MS). signNote() awaits any
    // in-flight job so the final autosave landed before flipping to signed.
    private var autosaveJob: Job? = null
    private var draftAiQueuedForVisit: String? = null

    // A recording whose transcription FAILED. The audio file is kept on disk
    // (filesDir/dictation) — tapping the mic on the same section retries the
    // upload of the kept file instead of forcing the clinician to re-dictate.
    private var failedRecording: Pair<java.io.File, NoteSection>? = null

    init {
        // Best-effort cleanup of recordings nobody rescued within a week.
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { recorder.pruneOlderThan(KEPT_RECORDING_MAX_AGE_MS) }
        }
        viewModelScope.launch {
            networkMonitor.connectionStatusFlow.collect { status ->
                val label = when {
                    !status.isOnline -> "Offline"
                    else -> status.transportLabel
                }
                _uiState.update {
                    it.copy(isOnline = status.isOnline, connectionLabel = label)
                }
            }
        }
    }

    private companion object {
        // Idle delay before the autosave fires. 1.5s matches the prompt's
        // recommendation; long enough to coalesce burst typing, short enough
        // that a stop-mid-edit gets persisted before the user moves on.
        const val AUTOSAVE_DEBOUNCE_MS = 1_500L
        const val DRAFT_AI_MIN_CHARS = 50
        const val KEPT_RECORDING_MAX_AGE_MS = 7L * 24 * 60 * 60 * 1000
    }

    fun load(
        visitId: String,
        incorporateSection: NoteSection? = null,
        incorporatePrefill: String? = null,
        openLabPickerOnLoad: Boolean = false,
        openRxPickerOnLoad: Boolean = false,
    ) {
        viewModelScope.launch {
            val existing = noteRepository.getProviderNoteOnce(visitId)
            val visit = visitRepository.getVisitByIdOnce(visitId)
            val patient = visit?.patientId?.let { patientRepository.getPatientByIdOnce(it) }
            val ageYears = patient?.dateOfBirth?.let(::computeAgeYears)
            var parsedSections = existing?.structuredData
                ?.let(::decodeClinicalSections)
                ?: ClinicalNoteSections(
                    chiefComplaint = visit?.chiefComplaint.orEmpty(),
                    diagnosis = visit?.diagnosis.orEmpty(),
                    medications = visit?.medications.orEmpty(),
                    testsOrdered = visit?.testsOrdered.orEmpty(),
                    followUpInstructions = visit?.followUpInstructions.orEmpty(),
                    additionalNote = existing?.transcript.orEmpty(),
                )
            if (incorporateSection != null && !incorporatePrefill.isNullOrBlank()) {
                parsedSections = parsedSections.appendToSection(
                    incorporateSection,
                    incorporatePrefill,
                )
            }
            _uiState.update {
                it.copy(
                    transcript = parsedSections.toClinicianText().ifBlank { existing?.transcript.orEmpty() },
                    sections = parsedSections,
                    savedLocally = existing?.transcript?.isNotBlank() == true,
                    submitted = false,
                    error = null,
                    noteId = existing?.id ?: it.noteId,
                    patientId = visit?.patientId ?: it.patientId,
                    patientSex = patient?.sex ?: it.patientSex,
                    patientAgeYears = ageYears ?: it.patientAgeYears,
                    visitId = visitId,
                    pharmacyOrderSubmitted = visit?.pharmacyOrderSubmittedAt != null,
                    autosaveStatus = AutosaveStatus.Idle,
                    focusedSection = incorporateSection ?: it.focusedSection,
                    openLabPickerOnLoad = openLabPickerOnLoad,
                    openRxPickerOnLoad = openRxPickerOnLoad,
                )
            }
            if (incorporateSection != null) {
                scheduleAutosave()
            }
            recoverKeptRecording(visitId)
        }
    }

    /**
     * If a previous session left an untranscribed recording for this visit
     * (upload failed / app died before transcription), re-offer it: tapping
     * the mic on that section sends the KEPT audio instead of re-recording.
     */
    private suspend fun recoverKeptRecording(visitId: String) {
        if (failedRecording != null) return
        val kept = withContext(Dispatchers.IO) { recorder.findKeptRecordings(visitId) }
        if (kept.isEmpty()) return
        val file = kept.first()
        // Filename: rec_<visitId>_<Section>_<ts>.m4a — section sits between
        // the visit id and the timestamp.
        val section = file.name
            .removePrefix("rec_")
            .removePrefix(visitId.replace(Regex("[^A-Za-z0-9_-]"), ""))
            .trimStart('_')
            .substringBefore('_')
            .let { name -> NoteSection.entries.firstOrNull { it.name == name } }
            ?: NoteSection.AdditionalNote
        // Older duplicates for this visit are stale takes — drop them.
        kept.drop(1).forEach { it.delete() }
        failedRecording = file to section
        _uiState.update {
            it.copy(
                error = "An unsent recording for ${section.displayLabel} was recovered. " +
                    "Tap the mic on that section to send it.",
            )
        }
    }

    fun sendToPharmacy() {
        val visitId = _uiState.value.visitId ?: return
        val meds = _uiState.value.sections.medications.trim()
        if (meds.isEmpty()) {
            _uiState.update { it.copy(error = "Add medications before sending to pharmacy") }
            return
        }
        viewModelScope.launch {
            val clerkUserId = authTokenStore.getClerkUserId()
            val staffId = clerkUserId?.let { staffRepository.fetchAndCacheStaff(it)?.id }
            if (staffId == null) {
                _uiState.update { it.copy(error = "Staff session required") }
                return@launch
            }
            _uiState.update { it.copy(isSendingToPharmacy = true, error = null) }
            runCatching {
                visitRepository.submitPharmacyOrder(visitId, meds, staffId)
                syncEngine.processQueue()
            }.onSuccess {
                _uiState.update {
                    it.copy(pharmacyOrderSubmitted = true, isSendingToPharmacy = false)
                }
            }.onFailure { e ->
                _uiState.update {
                    it.copy(isSendingToPharmacy = false, error = e.message)
                }
            }
        }
    }

    fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun startRecording() {
        if (!hasMicrophonePermission()) {
            _uiState.update { it.copy(error = "Microphone permission is required.") }
            return
        }
        val state = _uiState.value
        if (state.isRecording || state.isTranscribing) return

        val section = state.focusedSection
        if (section == null) {
            _uiState.update {
                it.copy(error = "Tap a section field first, then tap the mic to dictate.")
            }
            return
        }

        // A kept recording for this section is waiting — retry sending it
        // instead of forcing the clinician to re-dictate the same content.
        failedRecording?.let { (file, failedSection) ->
            if (failedSection == section && file.exists()) {
                failedRecording = null
                viewModelScope.launch { transcribeSectionRecording(file, section) }
                return
            }
        }

        if (!recorder.start(label = "${state.visitId.orEmpty()}_${section.name}")) {
            _uiState.update { it.copy(error = "Could not start recorder. Try again.") }
            return
        }
        _uiState.update {
            it.copy(isRecording = true, recordingSection = section, error = null)
        }
        analytics.capture(Analytics.Events.DICTATION_STARTED)
    }

    fun stopRecording() {
        val section = _uiState.value.recordingSection
        if (!_uiState.value.isRecording || section == null) return

        val file = recorder.stop()
        _uiState.update {
            it.copy(isRecording = false, recordingSection = null)
        }
        if (file == null) return
        viewModelScope.launch { transcribeSectionRecording(file, section) }
    }

    /** Back-compat alias for screens that still call the old name. */
    fun stopRecordingAndTranscribe() = stopRecording()

    private suspend fun transcribeSectionRecording(file: java.io.File, section: NoteSection) {
        if (file.length() < 800) {
            file.delete()
            _uiState.update {
                it.copy(error = "Recording too short. Hold the mic a little longer.")
            }
            return
        }
        _uiState.update {
            it.copy(isTranscribing = true, transcribingSection = section, error = null)
        }
        try {
            val sectionContext = _uiState.value.sections.sectionText(section).trim().takeLast(400)
            val text = withContext(Dispatchers.IO) {
                clerkAuthManager.refreshToken()
                dictationApi.transcribeRecording(
                    audioFile = file,
                    transcriptContext = sectionContext.ifBlank { null },
                    section = section.apiKey,
                )
            }
            if (text.isNotBlank()) {
                _uiState.update { state ->
                    val nextSections = state.sections.appendToSection(section, text.trim())
                    state.copy(
                        transcript = nextSections.toClinicianText(),
                        sections = nextSections,
                    )
                }
                scheduleAutosave()
            }
            // Delete ONLY on success — the audio is the sole copy of the
            // clinician's dictation until the transcript is in the note.
            file.delete()
        } catch (e: kotlinx.coroutines.CancellationException) {
            // Screen closed mid-upload: keep the audio for recovery on the
            // next entry to this visit's dictation screen.
            failedRecording = file to section
            throw e
        } catch (e: Exception) {
            // Keep the file. Tapping the mic on the same section retries the
            // upload of this kept recording (see startRecording).
            failedRecording = file to section
            _uiState.update {
                it.copy(
                    error = "Transcription failed for ${section.displayLabel}. " +
                        "Your recording is saved — tap the mic on that section to retry sending it.",
                )
            }
            android.util.Log.w("DictationVM", "section transcribe failed: ${e.message}")
        } finally {
            _uiState.update {
                it.copy(isTranscribing = false, transcribingSection = null)
            }
        }
    }

    fun updateTranscript(text: String) {
        _uiState.update {
            val nextSections = it.sections.copy(additionalNote = text)
            it.copy(
                transcript = nextSections.toClinicianText(),
                sections = nextSections,
                savedLocally = false,
            )
        }
        scheduleAutosave()
    }

    fun updateSections(sections: ClinicalNoteSections) {
        _uiState.update {
            it.copy(
                sections = sections,
                transcript = sections.toClinicianText(),
                savedLocally = false,
            )
        }
        scheduleAutosave()
    }

    /**
     * Debounced autosave. Every edit cancels the prior pending save and
     * schedules a new one AUTOSAVE_DEBOUNCE_MS out. The actual write goes
     * through `noteRepository.saveDraft(...)`, which persists locally first
     * then direct-writes (online) or queues (offline) the upsert RPC.
     *
     * Skipped when there's no patient_id yet (load() hasn't resolved it) or
     * when we're already mid-Sign — Sign does its own final saveDraft to
     * make sure the latest transcript landed before flipping to signed.
     */
    private fun scheduleAutosave() {
        val current = _uiState.value
        if (current.isSubmitting) return
        val patientId = current.patientId ?: return

        autosaveJob?.cancel()
        autosaveJob = viewModelScope.launch {
            delay(AUTOSAVE_DEBOUNCE_MS)
            performAutosave(patientId)
        }
    }

    private suspend fun maybeQueueDraftAiAssist(
        visitId: String?,
        transcript: String,
        sections: ClinicalNoteSections,
        syncEntryId: String?,
    ) {
        if (visitId == null || syncEntryId != null) return
        if (!networkMonitor.isOnline()) return
        if (transcript.length < DRAFT_AI_MIN_CHARS) return
        if (draftAiQueuedForVisit == visitId) return
        draftAiQueuedForVisit = visitId
        withContext(Dispatchers.IO) {
            runCatching {
                val snapshot = mapOf(
                    "chief_complaint" to sections.chiefComplaint,
                    "diagnosis" to sections.diagnosis,
                    "medications" to sections.medications,
                    "tests_ordered" to sections.testsOrdered,
                ).filterValues { it.isNotBlank() }
                dictationApi.requestDraftAiAssist(visitId, snapshot.ifEmpty { null })
            }
        }
    }

    /**
     * Run one autosave cycle. Generates a stable noteId on first save and
     * keeps it in UI state so subsequent saves (and the final Sign) reuse
     * the same row server-side.
     */
    private suspend fun performAutosave(patientId: String): Pair<String, String?>? {
        val snapshot = _uiState.value
        val transcript = snapshot.sections.toClinicianText().ifBlank { snapshot.transcript }
        if (transcript.isBlank()) return null

        _uiState.update { it.copy(autosaveStatus = AutosaveStatus.Saving) }
        return try {
            val noteId = snapshot.noteId ?: UUID.randomUUID().toString()
            val visitId = snapshot.visitId
            val (savedNote, syncEntryId) = withContext(Dispatchers.IO) {
                val draftResult = noteRepository.saveDraft(
                    patientId = patientId,
                    visitId = visitId,
                    transcript = transcript,
                    noteId = noteId,
                    source = "visit",
                )
                if (visitId != null) {
                    noteRepository.saveClinicalSummary(
                        visitId = visitId,
                        diagnosis = snapshot.sections.diagnosis.cleanOrNull(),
                        medications = snapshot.sections.medications.cleanOrNull(),
                        followUpInstructions = snapshot.sections.followUpInstructionsWithTasks().cleanOrNull(),
                        testsOrdered = snapshot.sections.testsOrdered.cleanOrNull(),
                        structuredData = json.encodeToString(snapshot.sections),
                        predecessorSyncId = draftResult.second,
                    )
                }
                draftResult
            }
            _uiState.update {
                it.copy(
                    noteId = savedNote.id,
                    savedLocally = true,
                    autosaveStatus = if (syncEntryId == null) AutosaveStatus.Saved else AutosaveStatus.Offline,
                )
            }
            maybeQueueDraftAiAssist(
                visitId = visitId,
                transcript = transcript,
                sections = snapshot.sections,
                syncEntryId = syncEntryId,
            )
            savedNote.id to syncEntryId
        } catch (e: Exception) {
            _uiState.update {
                it.copy(autosaveStatus = AutosaveStatus.Error(e.message ?: "Autosave failed"))
            }
            null
        }
    }

    fun onMicrophonePermissionDenied() {
        _uiState.update { it.copy(error = "Microphone permission is required for Whisper recording.") }
    }

    /**
     * Flush the pending autosave window synchronously, then invoke [onDone] so
     * the caller can navigate away (back arrow, system back / swipe). Without
     * this they'd lose the last debounce window of typing on a quick exit.
     */
    fun saveDraftAndExit(onDone: () -> Unit) {
        val patientId = _uiState.value.patientId
        if (patientId == null) {
            onDone()
            return
        }
        viewModelScope.launch {
            autosaveJob?.cancel()
            autosaveJob = null
            performAutosave(patientId)
            onDone()
        }
    }

    /**
     * Sign the note + run the visit-tied finalization chain.
     *
     * Phase 2 split (docs/patient-centered-architecture-plan.md): autosave
     * keeps the draft transcript fresh in provider_notes; Sign is the
     * deliberate action that flips status -> signed and stamps finalized_at.
     *
     * Pipeline (visit-tied — each step direct-writes when online + no
     * upstream queue dependency, otherwise queues with a linear `dependsOn`
     * chain):
     *   0. cancel debounced autosave + run one final saveDraft so the
     *      latest transcript is durable BEFORE we flip to signed
     *   1. rpc_sign_provider_note — status='signed', finalized_at/by set
     *   2. patient_notes.content (clinician fallback for the receipt; copies
     *      the transcript verbatim so print/pharmacy works without AI)
     *   3. visits.diagnosis/medications/etc. via rpc_upsert_visit_clinical_summary
     *   4. visits.documentation_complete = true, status pending -> sent, and
     *      queue_status released from with_doctor (billing is separate)
     */
    fun signNote(visitId: String) {
        val sections = _uiState.value.sections
        val transcript = sections.toClinicianText()
        if (transcript.length < 10) {
            _uiState.update { it.copy(error = "Add a bit more to the note before signing.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            try {
                // 0. Flush autosave. Cancel the debounce so we don't race
                //    against ourselves, then force one final draft write so
                //    the freshly typed content is durable + has a stable
                //    note id before we sign.
                autosaveJob?.cancel()
                autosaveJob = null
                val patientId = _uiState.value.patientId
                    ?: visitRepository.getVisitByIdOnce(visitId)?.patientId
                    ?: error("Cannot resolve patient_id for visit $visitId")
                val (noteId, upsertSyncId) = withContext(Dispatchers.IO) {
                    performAutosave(patientId)
                } ?: error("Final autosave failed")

                withContext(Dispatchers.IO) {
                    noteRepository.finalizeClinicalEncounter(
                        noteId = noteId,
                        visitId = visitId,
                        patientId = patientId,
                        transcript = transcript,
                        patientSummary = transcript,
                        diagnosis = sections.diagnosis.cleanOrNull(),
                        medications = sections.medications.cleanOrNull(),
                        followUpInstructions = sections.followUpInstructionsWithTasks().cleanOrNull(),
                        testsOrdered = sections.testsOrdered.cleanOrNull(),
                        structuredData = json.encodeToString(sections),
                        predecessorSyncId = upsertSyncId,
                    )
                }
                analytics.capture(
                    Analytics.Events.DICTATION_COMPLETED,
                    mapOf(
                        "visit_id" to visitId,
                        "transcript_length" to transcript.length,
                        "mode" to "sign",
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submitted = true,
                        savedLocally = true,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isSubmitting = false, error = "Could not sign: ${e.message}") }
            }
        }
    }

    /** Back-compat alias for callers that still invoke the old name. */
    fun submit(visitId: String) = signNote(visitId)

    /**
     * Opt-in: structure the saved note with AI. Fires the existing
     * submit-dictation edge function which dispatches the structure-dictation
     * Inngest workflow. Returns immediately; the workflow runs in the
     * background and writes back to provider_notes.note_content +
     * patient_notes.content + visit_diagnosis_codes.
     *
     * Requires online — tells the user to come back online if not.
     */
    fun structureWithAi(visitId: String) {
        if (_uiState.value.isStructuringWithAi) return
        viewModelScope.launch {
            if (!networkMonitor.isOnline()) {
                _uiState.update {
                    it.copy(error = "AI needs Wi-Fi or data. Try again when you're online.")
                }
                return@launch
            }
            _uiState.update { it.copy(isStructuringWithAi = true, error = null) }
            try {
                withContext(Dispatchers.IO) {
                    val transcript = _uiState.value.transcript.trim()
                    if (transcript.isNotEmpty()) {
                        clerkAuthManager.refreshToken()
                        dictationApi.submitDictation(visitId, transcript)
                    }
                }
                analytics.capture(
                    Analytics.Events.DICTATION_COMPLETED,
                    mapOf("visit_id" to visitId, "mode" to "ai_structure"),
                )
                _uiState.update { it.copy(isStructuringWithAi = false) }
            } catch (e: DictationException) {
                _uiState.update { it.copy(isStructuringWithAi = false, error = e.message) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isStructuringWithAi = false, error = "AI request failed: ${e.message}")
                }
            }
        }
    }

    fun setFocusedSection(section: NoteSection?) {
        _uiState.update { it.copy(focusedSection = section) }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    override fun onCleared() {
        super.onCleared()
        // Abandon any in-progress recording, but DO NOT wipe the dictation
        // dir: kept recordings from failed transcriptions are recovered on
        // the next entry to this visit's screen (see recoverKeptRecording).
        recorder.cancel()
    }

    private fun decodeClinicalSections(raw: String): ClinicalNoteSections? {
        return try {
            json.decodeFromString(ClinicalNoteSections.serializer(), raw)
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}

private fun ClinicalNoteSections.sectionText(section: NoteSection): String = when (section) {
    NoteSection.ChiefComplaint -> chiefComplaint
    NoteSection.Hpi -> hpi
    NoteSection.PhysicalExam -> physicalExam
    NoteSection.FamilySocialHistory -> familySocialHistory
    NoteSection.Diagnosis -> diagnosis
    NoteSection.AssessmentPlan -> assessmentPlan
    NoteSection.Medications -> medications
    NoteSection.TestsOrdered -> testsOrdered
    NoteSection.FollowUpInstructions -> followUpInstructions
    NoteSection.AdditionalNote -> additionalNote
}

/**
 * Append a batch transcription to [target]. Joins with a space when the
 * section already has content (re-dictate into the same field).
 */
private fun ClinicalNoteSections.appendToSection(target: NoteSection, chunk: String): ClinicalNoteSections {
    fun merge(prev: String): String {
        val trimmed = prev.trimEnd()
        return if (trimmed.isEmpty()) chunk else "$trimmed $chunk"
    }
    return when (target) {
        NoteSection.ChiefComplaint -> copy(chiefComplaint = merge(chiefComplaint))
        NoteSection.Hpi -> copy(hpi = merge(hpi))
        NoteSection.PhysicalExam -> copy(physicalExam = merge(physicalExam))
        NoteSection.FamilySocialHistory -> copy(familySocialHistory = merge(familySocialHistory))
        NoteSection.Diagnosis -> copy(diagnosis = merge(diagnosis))
        NoteSection.AssessmentPlan -> copy(assessmentPlan = merge(assessmentPlan))
        NoteSection.Medications -> copy(medications = merge(medications))
        NoteSection.TestsOrdered -> copy(testsOrdered = merge(testsOrdered))
        NoteSection.FollowUpInstructions -> copy(followUpInstructions = merge(followUpInstructions))
        NoteSection.AdditionalNote -> copy(additionalNote = merge(additionalNote))
    }
}

private fun ClinicalNoteSections.hasClinicalContent(): Boolean =
    listOf(
        chiefComplaint,
        hpi,
        physicalExam,
        familySocialHistory,
        diagnosis,
        assessmentPlan,
        medications,
        testsOrdered,
        followUpInstructions,
        additionalNote,
    ).any { it.isNotBlank() } || followUpTasks.isNotEmpty()

private fun ClinicalNoteSections.toClinicianText(): String {
    val blocks = listOfNotNull(
        chiefComplaint.cleanOrNull()?.let { "Chief complaint: $it" },
        hpi.cleanOrNull()?.let { "History of present illness: $it" },
        physicalExam.cleanOrNull()?.let { "Physical exam: $it" },
        familySocialHistory.cleanOrNull()?.let { "Family and social history: $it" },
        diagnosis.cleanOrNull()?.let { "Diagnosis: $it" },
        assessmentPlan.cleanOrNull()?.let { "Assessment and plan: $it" },
        medications.cleanOrNull()?.let { "Medications: $it" },
        testsOrdered.cleanOrNull()?.let { "Labs/tests: $it" },
        followUpInstructionsWithTasks().cleanOrNull()?.let { "Follow-up: $it" },
        additionalNote.cleanOrNull()?.let { "Additional note: $it" },
    )
    return blocks.joinToString("\n\n")
}

private fun ClinicalNoteSections.followUpInstructionsWithTasks(): String {
    val taskText = followUpTasks.joinToString("; ")
    return listOf(followUpInstructions.cleanOrNull(), taskText.cleanOrNull())
        .filterNotNull()
        .joinToString("\n")
}

private fun String.cleanOrNull(): String? = trim().takeIf { it.isNotBlank() }

// Whole-year age from an ISO date string. Returns null on parse failure so the
// lab picker falls back to "no age filter" rather than gating on bad data.
private fun computeAgeYears(isoDate: String): Int? {
    return try {
        val dob = java.time.LocalDate.parse(isoDate)
        java.time.Period.between(dob, java.time.LocalDate.now()).years
    } catch (_: Exception) {
        null
    }
}
