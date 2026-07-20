package com.karibuhealth.app.domain.catalog

/**
 * Ugandan HC III lab test catalog.
 *
 * HC IIIs (Health Centre IIIs) run a limited diagnostic menu. This catalog
 * mirrors the standard list documented in docs/hc3-rollout-plan.md §3c and
 * Uganda Clinical Guidelines 2023 — anything outside this list typically
 * gets referred to HC IV / regional hospital.
 *
 * Smart filters:
 *  - [LabTest.sexRestriction] hides female-only tests (e.g. pregnancy) for
 *    male patients so the dropdown stays focused.
 *  - [LabTest.minAgeYears] / [LabTest.maxAgeYears] hide age-inappropriate
 *    tests (e.g. PSA only above 40, BMI-related screening for adults).
 *
 *  Adding a test? Append to the matching [LabCategory]. Codes should follow
 *  the HMIS-friendly upper-snake convention (MAL_RDT, URINE_PREG, etc.) so
 *  they round-trip cleanly when we move from free-text to structured lab
 *  orders.
 */
object HcLabCatalog {

    enum class SexRestriction { Any, FemaleOnly, MaleOnly }

    data class LabTest(
        /** Stable upper-snake code. Used when we migrate to structured lab orders. */
        val code: String,
        /** Display name shown in the picker and appended to free-text. */
        val name: String,
        /** Short helper text — clinical use / sample type. Optional. */
        val hint: String? = null,
        val sexRestriction: SexRestriction = SexRestriction.Any,
        val minAgeYears: Int? = null,
        val maxAgeYears: Int? = null,
    )

    data class LabCategory(
        val id: String,
        val title: String,
        val tests: List<LabTest>,
    )

    val categories: List<LabCategory> = listOf(
        LabCategory(
            id = "malaria",
            title = "Malaria",
            tests = listOf(
                LabTest("MAL_RDT", "Malaria RDT", hint = "Rapid diagnostic test"),
                LabTest("MAL_SLIDE", "Blood slide for malaria", hint = "Microscopy — confirms RDT, parasite count"),
            ),
        ),
        LabCategory(
            id = "hematology",
            title = "Hematology",
            tests = listOf(
                LabTest("HB", "Hemoglobin (Hb)", hint = "Anemia screen"),
                LabTest("ESR", "ESR"),
                LabTest("WBC", "White blood cell count"),
                LabTest("BG_XM", "Blood group + crossmatch"),
            ),
        ),
        LabCategory(
            id = "chemistry",
            title = "Chemistry",
            tests = listOf(
                LabTest("RBS", "Random blood sugar (RBS)", hint = "Diabetes screen"),
                LabTest("FBS", "Fasting blood sugar (FBS)"),
                LabTest("RFT_UREA", "Urea (renal)", hint = "Refer if HC III cannot run"),
                LabTest("RFT_CREAT", "Creatinine", hint = "Refer if HC III cannot run"),
            ),
        ),
        LabCategory(
            id = "infection",
            title = "Infection / serology",
            tests = listOf(
                LabTest("HIV", "HIV rapid test", hint = "Determine / Stat-Pak / SD Bioline"),
                LabTest("HBSAG", "Hepatitis B rapid test (HBsAg)", hint = "Routine in ANC"),
                LabTest("BRU_RDT", "Brucellosis rapid test", hint = "Serology / RDT"),
                LabTest("SYPH_RPR", "Syphilis RPR", hint = "Routine in ANC"),
                LabTest("TB_SMEAR", "TB sputum smear (AFB)", hint = "Refer to HC IV for GeneXpert"),
            ),
        ),
        LabCategory(
            id = "pregnancy",
            title = "Pregnancy / reproductive",
            tests = listOf(
                LabTest(
                    code = "URINE_PREG",
                    name = "Urine pregnancy test",
                    hint = "βhCG",
                    sexRestriction = SexRestriction.FemaleOnly,
                ),
                LabTest(
                    code = "HCG_QUANT",
                    name = "Serum βhCG (quant)",
                    hint = "Refer if HC III cannot run",
                    sexRestriction = SexRestriction.FemaleOnly,
                ),
            ),
        ),
        LabCategory(
            id = "urine",
            title = "Urine",
            tests = listOf(
                LabTest("UA_DIPSTICK", "Urinalysis (dipstick)", hint = "Protein/glucose/ketones/leuks"),
                LabTest("UA_MICRO", "Urine microscopy"),
            ),
        ),
        LabCategory(
            id = "stool",
            title = "Stool",
            tests = listOf(
                LabTest("STOOL_MICRO", "Stool microscopy", hint = "Ova/cysts/parasites"),
                LabTest("STOOL_OB", "Stool occult blood"),
            ),
        ),
        LabCategory(
            id = "other",
            title = "Other",
            tests = listOf(
                LabTest("BP", "Blood pressure (record)"),
                LabTest("MUAC", "MUAC (nutrition screen)"),
            ),
        ),
    )

    /**
     * Filter the catalog for a given patient. Categories with no eligible
     * tests after filtering are dropped so the picker doesn't show empty
     * sections.
     */
    fun filtered(patientSex: String?, ageYears: Int?): List<LabCategory> {
        val sex = patientSex?.uppercase()
        return categories.mapNotNull { cat ->
            val tests = cat.tests.filter { test ->
                val sexOk = when (test.sexRestriction) {
                    SexRestriction.Any -> true
                    SexRestriction.FemaleOnly -> sex == "F" || sex == null
                    SexRestriction.MaleOnly -> sex == "M" || sex == null
                }
                val ageOk = (test.minAgeYears == null || (ageYears ?: Int.MAX_VALUE) >= test.minAgeYears) &&
                    (test.maxAgeYears == null || (ageYears ?: Int.MIN_VALUE) <= test.maxAgeYears)
                sexOk && ageOk
            }
            if (tests.isEmpty()) null else cat.copy(tests = tests)
        }
    }
}
