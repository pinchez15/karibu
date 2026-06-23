package com.karibuhealth.app.domain

/** HC III lab catalog — exact names for deterministic ordering (migration 069). */
object LabCatalog {

    data class Test(val code: String, val name: String, val category: String)

    val tests = listOf(
        Test("MRDT", "Malaria RDT", "Malaria"),
        Test("BS_MPS", "Blood slide for malaria parasites", "Malaria"),
        Test("HIV_RDT", "HIV rapid test", "Serology"),
        Test("HB", "Haemoglobin", "Haematology"),
        Test("AFB", "Sputum smear (AFB / TB)", "Microbiology"),
        Test("URINALYSIS", "Urinalysis", "Urine"),
        Test("STOOL_OC", "Stool microscopy (ova/cysts)", "Microbiology"),
        Test("RBS", "Random blood sugar", "Biochemistry"),
        Test("SYPHILIS", "Syphilis test (RPR/TPHA)", "Serology"),
        Test("UCG", "Pregnancy test (UCG)", "Serology"),
        Test("WIDAL", "Widal test (typhoid)", "Serology"),
        Test("STOOL_RDT", "Stool antigen / H. pylori RDT", "Microbiology"),
    )

    fun byCategory(): List<Pair<String, List<Test>>> =
        tests.groupBy { it.category }.toList()

    fun nameForCode(code: String): String? = tests.find { it.code == code }?.name
}
