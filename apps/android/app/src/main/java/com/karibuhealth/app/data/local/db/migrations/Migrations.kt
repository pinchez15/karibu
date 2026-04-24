package com.karibuhealth.app.data.local.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

// v2 -> v3: dictation-only product pivot.
//
// What v2 had that v3 doesn't:
//   - audio_uploads table (entire ambient-recording pipeline gone)
//   - patient_consents table (no DPPA cross-border consent flow)
//   - visits.consent_recording, consent_timestamp, consent_verified, consent_id
//   - visits.source_language (no Sunbird local-language transcription path)
//   - visits.audio_deleted_at, retention_expires_at
//   - visits.audio_local_path, audio_uploaded (local-only fields)
//   - provider_notes.transcript_original, transcript_english,
//     transcription_provider, transcription_confidence, diarization_output,
//     audio_trimmed
//   - clinics.whatsapp_phone_number, whatsapp_business_account_id
//   - VisitStatus values 'recording' / 'uploading' / 'processing' (collapsed
//     to 'pending')
//
// SQLite can't DROP COLUMN (well, recent versions can but Room doesn't ship
// that), so for each affected table we create a new shape, copy the columns
// that survive, drop the old, rename. Indexes are recreated with Room's
// default naming convention (index_<table>_<col>...) so they match what the
// @Entity declarations expect on the next open.
val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // 1. Drop tables that are gone entirely.
        db.execSQL("DROP TABLE IF EXISTS audio_uploads")
        db.execSQL("DROP TABLE IF EXISTS patient_consents")

        // 2. Rebuild `clinics` without WhatsApp columns.
        db.execSQL(
            """
            CREATE TABLE clinics_new (
                id TEXT NOT NULL PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                clerk_organization_id TEXT,
                timezone TEXT NOT NULL,
                is_active INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            INSERT INTO clinics_new (id, name, slug, clerk_organization_id, timezone, is_active, created_at, updated_at)
            SELECT id, name, slug, clerk_organization_id, timezone, is_active, created_at, updated_at
            FROM clinics
            """.trimIndent(),
        )
        db.execSQL("DROP TABLE clinics")
        db.execSQL("ALTER TABLE clinics_new RENAME TO clinics")

        // 3. Rebuild `visits` without audio + consent + source_language fields.
        //    Old statuses recording/uploading/processing collapse to 'pending'.
        db.execSQL(
            """
            CREATE TABLE visits_new (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                doctor_id TEXT,
                nurse_id TEXT,
                status TEXT NOT NULL,
                queue_status TEXT NOT NULL,
                queue_position INTEGER,
                priority TEXT NOT NULL,
                chief_complaint TEXT,
                checked_in_at TEXT,
                review_status TEXT NOT NULL,
                reviewed_by TEXT,
                reviewed_at TEXT,
                diagnosis TEXT,
                medications TEXT,
                follow_up_instructions TEXT,
                tests_ordered TEXT,
                visit_date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                finalized_at TEXT,
                error_message TEXT,
                error_at TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            INSERT INTO visits_new (
                id, clinic_id, patient_id, doctor_id, nurse_id,
                status, queue_status, queue_position, priority,
                chief_complaint, checked_in_at,
                review_status, reviewed_by, reviewed_at,
                diagnosis, medications, follow_up_instructions, tests_ordered,
                visit_date, created_at, updated_at,
                finalized_at, error_message, error_at, is_synced
            )
            SELECT
                id, clinic_id, patient_id, doctor_id, nurse_id,
                CASE WHEN status IN ('recording', 'uploading', 'processing') THEN 'pending' ELSE status END,
                queue_status, queue_position, priority,
                chief_complaint, checked_in_at,
                review_status, reviewed_by, reviewed_at,
                diagnosis, medications, follow_up_instructions, tests_ordered,
                visit_date, created_at, updated_at,
                finalized_at, error_message, error_at, is_synced
            FROM visits
            """.trimIndent(),
        )
        db.execSQL("DROP TABLE visits")
        db.execSQL("ALTER TABLE visits_new RENAME TO visits")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_clinic_id ON visits(clinic_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_patient_id ON visits(patient_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_doctor_id ON visits(doctor_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_visit_date ON visits(visit_date)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_visits_clinic_id_visit_date ON visits(clinic_id, visit_date)")

        // 4. Rebuild `provider_notes` without long-form transcription columns.
        db.execSQL(
            """
            CREATE TABLE provider_notes_new (
                id TEXT NOT NULL PRIMARY KEY,
                visit_id TEXT NOT NULL,
                transcript TEXT,
                note_content TEXT,
                structured_data TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                finalized_at TEXT,
                finalized_by TEXT
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            INSERT INTO provider_notes_new (
                id, visit_id, transcript, note_content, structured_data,
                status, created_at, updated_at, finalized_at, finalized_by
            )
            SELECT
                id, visit_id, transcript, note_content, structured_data,
                status, created_at, updated_at, finalized_at, finalized_by
            FROM provider_notes
            """.trimIndent(),
        )
        db.execSQL("DROP TABLE provider_notes")
        db.execSQL("ALTER TABLE provider_notes_new RENAME TO provider_notes")
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS index_provider_notes_visit_id ON provider_notes(visit_id)")
    }
}
