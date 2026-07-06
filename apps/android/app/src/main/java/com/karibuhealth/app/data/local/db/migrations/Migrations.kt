package com.karibuhealth.app.data.local.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

// v30 -> v31: WP2 sync reliability. Raise the retry budget for existing
// non-completed outbox rows from 5 to 10 so transient network failures on a
// bad link stop dead-lettering real patient data before the connection
// recovers. New rows default to 10 via the entity (see SyncQueueEntry). This
// is data-only — no schema/column change — but Room still requires a version
// bump + registered Migration for the new @Database(version = 31).
val MIGRATION_30_31 = object : Migration(30, 31) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "UPDATE sync_queue SET max_attempts = 10 " +
                "WHERE status != 'completed' AND max_attempts < 10",
        )
    }
}

// v23 -> v24: OPD structured prescription lines (migration 064 mirror).
// v25 -> v26: per-test lab results JSON on visits (migration 075 mirror).
val MIGRATION_25_26 = object : Migration(25, 26) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "ALTER TABLE visits ADD COLUMN lab_test_results TEXT NOT NULL DEFAULT '[]'",
        )
    }
}

// v28 -> v29: guardian relationship on patients + clinic district (migration 086 mirror).
val MIGRATION_28_29 = object : Migration(28, 29) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE patients ADD COLUMN guardian_relationship TEXT")
        db.execSQL("ALTER TABLE clinics ADD COLUMN district TEXT")
    }
}

// v29 -> v30: HIV/TB program registers (migration 088 mirror).
val MIGRATION_29_30 = object : Migration(29, 30) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS hts_events (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                patient_name TEXT,
                event_date TEXT NOT NULL,
                counseled INTEGER NOT NULL DEFAULT 1,
                tested INTEGER NOT NULL DEFAULT 0,
                result TEXT,
                result_received INTEGER NOT NULL DEFAULT 0,
                suspected_tb INTEGER NOT NULL DEFAULT 0,
                started_cpt INTEGER NOT NULL DEFAULT 0,
                retester INTEGER NOT NULL DEFAULT 0,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_hts_events_clinic_id ON hts_events(clinic_id)")
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_hts_events_clinic_id_event_date " +
                "ON hts_events(clinic_id, event_date)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS hiv_care_enrollments (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                patient_name TEXT,
                enrolled_at TEXT NOT NULL,
                care_status TEXT NOT NULL DEFAULT 'pre_art',
                who_stage INTEGER,
                art_start_date TEXT,
                art_regimen TEXT,
                art_line TEXT,
                cpt_at_last_visit INTEGER NOT NULL DEFAULT 0,
                tb_assessed_last_visit INTEGER NOT NULL DEFAULT 0,
                tb_treatment_started INTEGER NOT NULL DEFAULT 0,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_hiv_care_enrollments_clinic_id " +
                "ON hiv_care_enrollments(clinic_id)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS tb_episodes (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                patient_name TEXT,
                unit_tb_number TEXT,
                registered_at TEXT NOT NULL,
                case_type TEXT NOT NULL DEFAULT 'new',
                disease_class TEXT NOT NULL DEFAULT 'pulmonary_smear_positive',
                hiv_status TEXT,
                treatment_started_at TEXT,
                outcome TEXT NOT NULL DEFAULT 'ongoing',
                outcome_date TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_tb_episodes_clinic_id ON tb_episodes(clinic_id)")
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS viral_load_tests (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                enrollment_id TEXT,
                test_date TEXT NOT NULL,
                result_copies REAL,
                suppressed INTEGER,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_viral_load_tests_enrollment_id " +
                "ON viral_load_tests(enrollment_id)",
        )
    }
}

// v27 -> v28: enriched formulary from medication_catalog (migration 080 mirror).
val MIGRATION_27_28 = object : Migration(27, 28) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE clinic_formulary_catalog ADD COLUMN strengths_json TEXT")
        db.execSQL("ALTER TABLE clinic_formulary_catalog ADD COLUMN aliases_json TEXT")
        db.execSQL("ALTER TABLE clinic_formulary_catalog ADD COLUMN default_frequency TEXT")
        db.execSQL("ALTER TABLE clinic_formulary_catalog ADD COLUMN default_route TEXT")
        db.execSQL("ALTER TABLE clinic_formulary_catalog ADD COLUMN warning_text TEXT")
    }
}

// v26 -> v27: staff onboarding completion timestamp (migration 079 mirror).
val MIGRATION_26_27 = object : Migration(26, 27) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "ALTER TABLE staff ADD COLUMN onboarding_completed_at TEXT",
        )
    }
}

// v24 -> v25: dose slot linkage + IV drip monitoring (migration 074 mirror).
val MIGRATION_24_25 = object : Migration(24, 25) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "ALTER TABLE medication_administrations ADD COLUMN scheduled_for TEXT",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS iv_infusions (
                id TEXT NOT NULL PRIMARY KEY,
                admission_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                fluid_type TEXT NOT NULL,
                additive TEXT,
                volume_ml INTEGER NOT NULL,
                rate_ml_hr INTEGER,
                drops_per_min INTEGER,
                started_at TEXT NOT NULL,
                stopped_at TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                site_location TEXT,
                notes TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_iv_infusions_admission_id_active " +
                "ON iv_infusions(admission_id, active)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS iv_infusion_checks (
                id TEXT NOT NULL PRIMARY KEY,
                infusion_id TEXT NOT NULL,
                admission_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                checked_at TEXT NOT NULL,
                drip_running INTEGER NOT NULL DEFAULT 1,
                site_ok INTEGER NOT NULL DEFAULT 1,
                note TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_iv_infusion_checks_infusion_id_checked_at " +
                "ON iv_infusion_checks(infusion_id, checked_at)",
        )
    }
}

val MIGRATION_23_24 = object : Migration(23, 24) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS prescription_orders (
                id TEXT NOT NULL PRIMARY KEY,
                visit_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                medication_code TEXT,
                free_text_name TEXT,
                dose_text TEXT,
                route_text TEXT,
                frequency_text TEXT,
                duration_text TEXT,
                quantity_prescribed REAL,
                quantity_unit TEXT,
                status TEXT NOT NULL DEFAULT 'ordered',
                notes TEXT
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_prescription_orders_visit_id_sort_order " +
                "ON prescription_orders(visit_id, sort_order)",
        )
    }
}

// v22 -> v23: Ebola/VHF screening record (migration 060 mirror). One new local
// table; column set + index name match the @Entity exactly.
val MIGRATION_22_23 = object : Migration(22, 23) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS ebola_screenings (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                visit_id TEXT,
                temp_c REAL,
                epi_contact INTEGER NOT NULL DEFAULT 0,
                unexplained_bleeding INTEGER NOT NULL DEFAULT 0,
                symptoms TEXT,
                is_suspect INTEGER NOT NULL DEFAULT 0,
                action_taken TEXT,
                created_at TEXT NOT NULL,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_ebola_screenings_visit_id_created_at " +
                "ON ebola_screenings(visit_id, created_at)",
        )
    }
}

// v21 -> v22: ANC registry (migration 059 mirror). Pregnancies + anc_contacts;
// column sets + index names match the @Entity declarations exactly.
val MIGRATION_21_22 = object : Migration(21, 22) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS pregnancies (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                patient_name TEXT,
                lmp TEXT,
                edd TEXT,
                gravida INTEGER,
                para INTEGER,
                blood_group TEXT,
                hiv_status TEXT,
                syphilis_status TEXT,
                hepb_status TEXT,
                risk_notes TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_pregnancies_patient_id ON pregnancies(patient_id)")
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_pregnancies_clinic_id_status_edd " +
                "ON pregnancies(clinic_id, status, edd)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS anc_contacts (
                id TEXT NOT NULL PRIMARY KEY,
                pregnancy_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                contact_number INTEGER,
                contact_date TEXT NOT NULL,
                gestation_weeks INTEGER,
                bp_systolic INTEGER,
                bp_diastolic INTEGER,
                weight_kg REAL,
                fundal_height_cm INTEGER,
                fetal_heart_rate INTEGER,
                urine_protein TEXT,
                hb REAL,
                iptp_given INTEGER NOT NULL DEFAULT 0,
                ifas_given INTEGER NOT NULL DEFAULT 0,
                td_given INTEGER NOT NULL DEFAULT 0,
                dewormed INTEGER NOT NULL DEFAULT 0,
                itn_given INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_anc_contacts_pregnancy_id_contact_date " +
                "ON anc_contacts(pregnancy_id, contact_date)",
        )
    }
}

// v20 -> v21: inpatient progress notes (migration 058 mirror). One new local
// table; column set + index name match the @Entity exactly.
val MIGRATION_20_21 = object : Migration(20, 21) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS admission_notes (
                id TEXT NOT NULL PRIMARY KEY,
                admission_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                note TEXT NOT NULL,
                author_name TEXT,
                created_at TEXT NOT NULL,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_admission_notes_admission_id_created_at " +
                "ON admission_notes(admission_id, created_at)",
        )
    }
}

// v19 -> v20: postnatal observations (migration 057 mirror). One new local
// table for mother/newborn postnatal rounds; column set + index name match the
// @Entity exactly.
val MIGRATION_19_20 = object : Migration(19, 20) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS postnatal_observations (
                id TEXT NOT NULL PRIMARY KEY,
                admission_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                subject TEXT NOT NULL,
                observed_at TEXT NOT NULL,
                temp_c REAL,
                pulse_bpm INTEGER,
                resp_rate INTEGER,
                bp_systolic INTEGER,
                bp_diastolic INTEGER,
                bleeding TEXT,
                fundus_firm INTEGER,
                feeding_well INTEGER,
                not_feeding INTEGER NOT NULL DEFAULT 0,
                convulsions INTEGER NOT NULL DEFAULT 0,
                jaundice INTEGER NOT NULL DEFAULT 0,
                note TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_postnatal_observations_admission_id_observed_at " +
                "ON postnatal_observations(admission_id, observed_at)",
        )
    }
}

// v18 -> v19: maternity delivery record (migration 056 mirror). One new local
// table; column set + the unique admission_id index match the @Entity exactly.
val MIGRATION_18_19 = object : Migration(18, 19) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS deliveries (
                id TEXT NOT NULL PRIMARY KEY,
                admission_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                delivered_at TEXT NOT NULL,
                mode TEXT,
                oxytocin_given INTEGER NOT NULL DEFAULT 0,
                blood_loss_ml INTEGER,
                placenta_complete INTEGER,
                outcome TEXT,
                baby_sex TEXT,
                birth_weight_g INTEGER,
                apgar_1 INTEGER,
                apgar_5 INTEGER,
                resuscitation_done INTEGER NOT NULL DEFAULT 0,
                vitamin_k_given INTEGER NOT NULL DEFAULT 0,
                early_breastfeeding INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE UNIQUE INDEX IF NOT EXISTS index_deliveries_admission_id " +
                "ON deliveries(admission_id)",
        )
    }
}

// v17 -> v18: inpatient discharge (migration 055 mirror). Additive nullable
// outcome columns on admissions.
val MIGRATION_17_18 = object : Migration(17, 18) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE admissions ADD COLUMN outcome TEXT")
        db.execSQL("ALTER TABLE admissions ADD COLUMN disposition TEXT")
        db.execSQL("ALTER TABLE admissions ADD COLUMN discharge_notes TEXT")
    }
}

// v16 -> v17: inpatient treatment chart (migration 054 mirror). Two new local
// tables for medication orders and the append-only administration record.
// Additive; column set + index names match the @Entity declarations exactly.
val MIGRATION_16_17 = object : Migration(16, 17) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS medication_orders (
                id TEXT NOT NULL PRIMARY KEY,
                admission_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                drug_name TEXT NOT NULL,
                dose TEXT,
                route TEXT,
                frequency TEXT,
                instructions TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_medication_orders_admission_id_active " +
                "ON medication_orders(admission_id, active)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS medication_administrations (
                id TEXT NOT NULL PRIMARY KEY,
                order_id TEXT NOT NULL,
                admission_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                status TEXT NOT NULL,
                not_given_reason TEXT,
                administered_at TEXT NOT NULL,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_medication_administrations_order_id_administered_at " +
                "ON medication_administrations(order_id, administered_at)",
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_medication_administrations_admission_id_administered_at " +
                "ON medication_administrations(admission_id, administered_at)",
        )
    }
}

// v15 -> v16: inpatient ward spine (migration 053 mirror). Two new local tables
// so admissions and rounds observations cache offline — the ward census and the
// 2am no-signal admission both need to work without a connection. Strictly
// additive; column set + index names match the @Entity declarations exactly so
// Room's open-time schema check passes.
val MIGRATION_15_16 = object : Migration(15, 16) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS admissions (
                id TEXT NOT NULL PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                patient_name TEXT,
                date_of_birth TEXT,
                sex TEXT,
                ward TEXT NOT NULL DEFAULT 'general',
                bed_label TEXT,
                admission_type TEXT,
                chief_complaint TEXT,
                weight_kg REAL,
                provisional_dx TEXT,
                gravida INTEGER,
                para INTEGER,
                edd TEXT,
                gestation_weeks INTEGER,
                hiv_status TEXT,
                presenting_status TEXT,
                admitted_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS index_admissions_clinic_id ON admissions(clinic_id)")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_admissions_patient_id ON admissions(patient_id)")
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_admissions_clinic_id_status_admitted_at " +
                "ON admissions(clinic_id, status, admitted_at)",
        )

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS admission_observations (
                id TEXT NOT NULL PRIMARY KEY,
                admission_id TEXT NOT NULL,
                clinic_id TEXT NOT NULL,
                patient_id TEXT NOT NULL,
                observed_at TEXT NOT NULL,
                temp_c REAL,
                pulse_bpm INTEGER,
                resp_rate INTEGER,
                bp_systolic INTEGER,
                bp_diastolic INTEGER,
                spo2_pct INTEGER,
                avpu TEXT,
                imci_not_feeding INTEGER NOT NULL DEFAULT 0,
                imci_vomiting_everything INTEGER NOT NULL DEFAULT 0,
                imci_convulsions INTEGER NOT NULL DEFAULT 0,
                imci_lethargic_unconscious INTEGER NOT NULL DEFAULT 0,
                note TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_admission_observations_admission_id_observed_at " +
                "ON admission_observations(admission_id, observed_at)",
        )
    }
}

// v10 -> v11: EHR pivot pharmacy order submitted columns on visits.
val MIGRATION_10_11 = object : Migration(10, 11) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "ALTER TABLE visits ADD COLUMN pharmacy_order_submitted_at TEXT",
        )
        db.execSQL(
            "ALTER TABLE visits ADD COLUMN pharmacy_order_submitted_by TEXT",
        )
    }
}

// v9 -> v10: cosign lifecycle (migration 044 mirror). Additive columns on
// provider_notes so the mobile cache can read back which mid-level notes are
// awaiting attending cosign. NOT NULL with a 0 default keeps the column
// safe to add to existing rows.
val MIGRATION_9_10 = object : Migration(9, 10) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE provider_notes ADD COLUMN requires_cosign INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE provider_notes ADD COLUMN cosigned_at TEXT")
        db.execSQL("ALTER TABLE provider_notes ADD COLUMN cosigned_by TEXT")
    }
}

// v8 -> v9: note authorship (migration 042 mirror). Adds the
// provider_notes.created_by column so the mobile cache can read back which
// staff first dictated each note. Strictly additive — the server records the
// value on INSERT via rpc_upsert_provider_note; nothing on Android writes to
// it directly.
val MIGRATION_8_9 = object : Migration(8, 9) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE provider_notes ADD COLUMN created_by TEXT")
    }
}

// v7 -> v8: clinical notes patient-first (migration 039 mirror). Adds the
// note lifecycle (draft -> signed -> amended | voided) and a source
// discriminator so provider_notes can attach to phone calls, lab follow-ups,
// and other non-encounter clinical activities. Visit_id becomes optional but
// stays unique-when-present via a partial unique index.
//
// Backfill rules mirror the server migration:
//   - patient_id derived from visits.patient_id for rows that have a visit_id
//   - status 'finalized' rows promoted to 'signed'
//   - source defaults to 'visit' (the legacy semantics) on existing rows
//
// Room doesn't enforce CHECK constraints; the server is the source of truth
// for the source/status value sets.
val MIGRATION_7_8 = object : Migration(7, 8) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // 1. patient_id — initially nullable so we can backfill from joined
        //    visit. Pre-launch this only affects demo data.
        db.execSQL("ALTER TABLE provider_notes ADD COLUMN patient_id TEXT")
        db.execSQL(
            "UPDATE provider_notes SET patient_id = (" +
                "SELECT v.patient_id FROM visits v WHERE v.id = provider_notes.visit_id" +
                ") WHERE patient_id IS NULL",
        )
        // Room treats `val patientId: String` as NOT NULL. SQLite can't add a
        // NOT NULL column post-hoc without a table rebuild, but Room only
        // verifies the schema by reading column metadata on first open — and
        // it inspects `notnull` from PRAGMA table_info. We rebuild the table
        // to enforce NOT NULL on patient_id (no production rows pre-launch).
        db.execSQL(
            """
            CREATE TABLE provider_notes_new (
                id TEXT NOT NULL PRIMARY KEY,
                patient_id TEXT NOT NULL,
                visit_id TEXT,
                transcript TEXT,
                note_content TEXT,
                structured_data TEXT,
                status TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'visit',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                finalized_at TEXT,
                finalized_by TEXT,
                amended_at TEXT,
                amended_by TEXT,
                voided_at TEXT,
                voided_by TEXT,
                void_reason TEXT
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            INSERT INTO provider_notes_new (
                id, patient_id, visit_id, transcript, note_content, structured_data,
                status, source, created_at, updated_at, finalized_at, finalized_by
            )
            SELECT
                id, patient_id, visit_id, transcript, note_content, structured_data,
                CASE WHEN status = 'finalized' THEN 'signed' ELSE status END,
                'visit',
                created_at, updated_at, finalized_at, finalized_by
            FROM provider_notes
            WHERE patient_id IS NOT NULL
            """.trimIndent(),
        )
        db.execSQL("DROP TABLE provider_notes")
        db.execSQL("ALTER TABLE provider_notes_new RENAME TO provider_notes")

        // Drop the old implicit UNIQUE on visit_id and replace with a partial
        // unique index so multiple standalone notes (visit_id IS NULL) can
        // coexist while visit-tied notes stay 1:1.
        db.execSQL("DROP INDEX IF EXISTS index_provider_notes_visit_id")
        db.execSQL(
            "CREATE UNIQUE INDEX IF NOT EXISTS index_provider_notes_visit_id " +
                "ON provider_notes(visit_id) WHERE visit_id IS NOT NULL",
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_provider_notes_patient_id_updated_at " +
                "ON provider_notes(patient_id, updated_at)",
        )
    }
}

// v6 -> v7: patient identity precision (migration 038 mirror). Strictly
// additive — adds nullable identity-precision columns and a non-null
// dob_precision discriminator defaulted to 'unknown'. The server's
// patients_dob_precision_consistent CHECK constraint is NOT mirrored here;
// Room/SQLite can't easily express it and the new-visit UI is the single
// writer that has to satisfy it on the server anyway.
//
// Server-side columns (from packages/supabase/migrations/038):
//   birth_year SMALLINT
//   approximate_age SMALLINT
//   age_recorded_at TIMESTAMPTZ
//   dob_precision TEXT NOT NULL DEFAULT 'unknown'
//   village, parish, subcounty, district, guardian_name, national_id (TEXT)
val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // Integer-typed nullable identity columns.
        db.execSQL("ALTER TABLE patients ADD COLUMN birth_year INTEGER")
        db.execSQL("ALTER TABLE patients ADD COLUMN approximate_age INTEGER")
        db.execSQL("ALTER TABLE patients ADD COLUMN age_recorded_at TEXT")
        // Non-null discriminator. Existing rows backfill to 'unknown' via the
        // DEFAULT; the dictation pivot wiped audit history but seed demo
        // patients carry date_of_birth, so we promote them to 'exact' to match
        // the server's same backfill in migration 038.
        db.execSQL("ALTER TABLE patients ADD COLUMN dob_precision TEXT NOT NULL DEFAULT 'unknown'")
        db.execSQL("UPDATE patients SET dob_precision = 'exact' WHERE date_of_birth IS NOT NULL AND dob_precision = 'unknown'")

        // Location + secondary identifiers.
        db.execSQL("ALTER TABLE patients ADD COLUMN village TEXT")
        db.execSQL("ALTER TABLE patients ADD COLUMN parish TEXT")
        db.execSQL("ALTER TABLE patients ADD COLUMN subcounty TEXT")
        db.execSQL("ALTER TABLE patients ADD COLUMN district TEXT")
        db.execSQL("ALTER TABLE patients ADD COLUMN guardian_name TEXT")
        db.execSQL("ALTER TABLE patients ADD COLUMN national_id TEXT")
    }
}

// v5 -> v6: AI as augmentation. Adds AI-structuring lifecycle columns on
// visits (read-only on Android — written server-side by the Inngest pipeline
// and synced down on refresh). Also drops the unique index on
// patient_notes.visit_id and replaces it with a composite unique on
// (visit_id, source) so both the clinician-fallback row and the AI row can
// coexist locally.
val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // 1. AI-structure columns on visits.
        db.execSQL("ALTER TABLE visits ADD COLUMN ai_structure_status TEXT NOT NULL DEFAULT 'not_started'")
        db.execSQL("ALTER TABLE visits ADD COLUMN ai_structure_started_at TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN ai_structure_completed_at TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN ai_structure_error TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN ai_structure_attempts INTEGER NOT NULL DEFAULT 0")

        // 2. patient_notes: drop the implicit visit_id-only unique that Room
        //    created from `Index("visit_id", unique = true)`; replace with
        //    a composite (visit_id, source) unique. Room names the implicit
        //    index `index_patient_notes_visit_id` (table_name + column).
        db.execSQL("DROP INDEX IF EXISTS index_patient_notes_visit_id")
        db.execSQL(
            "CREATE UNIQUE INDEX IF NOT EXISTS index_patient_notes_visit_id_source " +
                "ON patient_notes(visit_id, source)",
        )
    }
}

// v4 -> v5: pharmacy + lab MVP. Read-only on Android — these columns are
// written on the web by dispenser/lab_tech and synced back via the regular
// visit refresh path so the clinician sees outcomes in their visit details.
// Strictly additive.
val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE visits ADD COLUMN dispensing_status TEXT NOT NULL DEFAULT 'not_started'")
        db.execSQL("ALTER TABLE visits ADD COLUMN dispense_notes TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN dispensed_at TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN dispensed_by TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_status TEXT NOT NULL DEFAULT 'not_ordered'")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_results TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_abnormal INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_completed_at TEXT")
        db.execSQL("ALTER TABLE visits ADD COLUMN lab_completed_by TEXT")
    }
}

// v3 -> v4: offline-first foundation. Strictly additive.
//
// Adds:
//   - patient_vitals table for longitudinal vitals (inpatient maternal pattern)
//   - visits.department (server-side since migration 024; mirrored locally)
//   - visits.documentation_complete + documentation_completed_at
//   - patient_notes.source (discriminator for clinician_fallback vs ai_generated)
//
// All ALTER TABLE ADD COLUMN calls are NOT NULL DEFAULT-safe; SQLite back-fills
// existing rows with the default.
val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // 1. visits.department
        db.execSQL("ALTER TABLE visits ADD COLUMN department TEXT NOT NULL DEFAULT 'opd'")

        // 2. visits.documentation_complete + documentation_completed_at
        db.execSQL("ALTER TABLE visits ADD COLUMN documentation_complete INTEGER NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE visits ADD COLUMN documentation_completed_at TEXT")

        // 3. patient_notes.source
        db.execSQL("ALTER TABLE patient_notes ADD COLUMN source TEXT NOT NULL DEFAULT 'ai_generated'")

        // 4. patient_vitals
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS patient_vitals (
                id TEXT NOT NULL PRIMARY KEY,
                patient_id TEXT NOT NULL,
                visit_id TEXT,
                recorded_at TEXT NOT NULL,
                recorded_by TEXT,
                weight_kg REAL,
                height_cm REAL,
                temp_c REAL,
                bp_systolic INTEGER,
                bp_diastolic INTEGER,
                pulse_bpm INTEGER,
                resp_rate INTEGER,
                spo2_pct INTEGER,
                muac_cm REAL,
                notes TEXT,
                is_synced INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_patient_vitals_patient_id_recorded_at " +
                "ON patient_vitals(patient_id, recorded_at)",
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS index_patient_vitals_visit_id " +
                "ON patient_vitals(visit_id)",
        )
    }
}

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
