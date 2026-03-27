package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.PatientNoteDao
import com.karibuhealth.app.data.local.db.dao.ProviderNoteDao
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.domain.model.PatientNote
import com.karibuhealth.app.domain.model.ProviderNote
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NoteRepository @Inject constructor(
    private val providerNoteDao: ProviderNoteDao,
    private val patientNoteDao: PatientNoteDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
) {
    fun getProviderNote(visitId: String): Flow<ProviderNote?> =
        providerNoteDao.getByVisitId(visitId).map { it?.toDomain() }

    fun getPatientNote(visitId: String): Flow<PatientNote?> =
        patientNoteDao.getByVisitId(visitId).map { it?.toDomain() }

    suspend fun refreshNotes(visitId: String) {
        if (!networkMonitor.isOnline()) return
        try {
            val providerNotes = supabaseApi.getProviderNote("eq.$visitId")
            providerNotes.firstOrNull()?.let { providerNoteDao.upsert(it.toEntity()) }

            val patientNotes = supabaseApi.getPatientNote("eq.$visitId")
            patientNotes.firstOrNull()?.let { patientNoteDao.upsert(it.toEntity()) }
        } catch (_: Exception) {}
    }
}
