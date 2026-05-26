package com.karibuhealth.app.domain.catalog

/**
 * Ugandan HC III formulary + dispensing constants.
 *
 * Discrete dropdowns for frequency/route/duration replace free-text on the
 * Android prescription builder so dispensers don't have to interpret "twice
 * daily" vs "BID" vs "bd". Mirrors the formulary list seeded by migration
 * 033 (`clinic_pharmacy_formulary`) and the Uganda Essential Medicines list
 * for HC III.
 *
 * Anything outside this list typically gets referred to HC IV / regional
 * hospital. Adding a drug? Append to [drugs] with its standard strengths and
 * formulations.
 */
object HcDrugCatalog {

    /** Standard Sig abbreviations. Display label includes the long form so the
     *  picker stays self-explanatory for newer clinical officers. */
    enum class Frequency(val code: String, val label: String) {
        OD("OD", "OD — once daily"),
        BID("BID", "BID — twice daily"),
        TID("TID", "TID — three times daily"),
        QID("QID", "QID — four times daily"),
        Q4H("q4h", "q4h — every 4 hours"),
        Q6H("q6h", "q6h — every 6 hours"),
        Q8H("q8h", "q8h — every 8 hours"),
        Q12H("q12h", "q12h — every 12 hours"),
        STAT("STAT", "STAT — once now"),
        HS("HS", "HS — at bedtime"),
        AC("AC", "AC — before meals"),
        PC("PC", "PC — after meals"),
        PRN("PRN", "PRN — as needed"),
    }

    enum class Route(val code: String, val label: String) {
        PO("PO", "PO — oral"),
        IV("IV", "IV — intravenous"),
        IM("IM", "IM — intramuscular"),
        SC("SC", "SC — subcutaneous"),
        PR("PR", "PR — rectal"),
        SL("SL", "SL — sublingual"),
        Topical("Topical", "Topical"),
        Inhaled("Inhaled", "Inhaled / neb"),
        IntraVag("PV", "PV — vaginal"),
        Ophthalmic("OD/OS/OU", "Ophthalmic"),
    }

    /** Common pre-canned durations. Picker also accepts custom. */
    val durations: List<DurationOption> = listOf(
        DurationOption(days = 1, label = "1 day"),
        DurationOption(days = 3, label = "3 days"),
        DurationOption(days = 5, label = "5 days"),
        DurationOption(days = 7, label = "7 days"),
        DurationOption(days = 10, label = "10 days"),
        DurationOption(days = 14, label = "14 days"),
        DurationOption(days = 21, label = "21 days"),
        DurationOption(days = 30, label = "30 days (1 month)"),
    )

    data class DurationOption(val days: Int, val label: String)

    data class Drug(
        /** Stable upper-snake code — matches `clinic_pharmacy_formulary`. */
        val code: String,
        /** Generic name shown in the picker. */
        val name: String,
        /** Common brand / shorthand shown as a tooltip. */
        val aliases: List<String> = emptyList(),
        /** Available strengths / formulations e.g. "500mg tab", "250mg/5mL". */
        val strengths: List<String> = emptyList(),
        /** Default sig the picker pre-fills (clinician can override). */
        val defaultFrequency: Frequency? = null,
        val defaultRoute: Route = Route.PO,
        /** Optional category label used for grouping in the picker. */
        val category: String = "Other",
        /** Optional warning surfaced on selection. */
        val warning: String? = null,
    )

    val drugs: List<Drug> = listOf(
        // Antimalarials
        Drug("AL", "Artemether/Lumefantrine (AL)", listOf("Coartem"),
            strengths = listOf("20/120 mg"),
            defaultFrequency = Frequency.BID,
            category = "Antimalarials",
        ),
        Drug("ARTESUNATE", "Artesunate (IV/IM)",
            strengths = listOf("60mg vial"),
            defaultRoute = Route.IV,
            defaultFrequency = Frequency.OD,
            category = "Antimalarials",
            warning = "Severe malaria only. Refer if HC III cannot administer.",
        ),
        Drug("DHA_PPQ", "Dihydroartemisinin/Piperaquine",
            strengths = listOf("40/320 mg"),
            defaultFrequency = Frequency.OD,
            category = "Antimalarials",
        ),

        // Antibiotics
        Drug("AMOX", "Amoxicillin",
            strengths = listOf("250mg cap", "500mg cap", "125mg/5mL susp", "250mg/5mL susp"),
            defaultFrequency = Frequency.TID,
            category = "Antibiotics",
        ),
        Drug("AMOX_CLAV", "Amoxicillin / Clavulanic acid",
            strengths = listOf("625mg tab", "1g tab", "228mg/5mL susp"),
            defaultFrequency = Frequency.BID,
            category = "Antibiotics",
        ),
        Drug("COTRIM", "Cotrimoxazole",
            strengths = listOf("480mg tab", "960mg tab", "240mg/5mL susp"),
            defaultFrequency = Frequency.BID,
            category = "Antibiotics",
        ),
        Drug("CIPRO", "Ciprofloxacin",
            strengths = listOf("250mg tab", "500mg tab"),
            defaultFrequency = Frequency.BID,
            category = "Antibiotics",
        ),
        Drug("METRO", "Metronidazole",
            strengths = listOf("200mg tab", "400mg tab", "200mg/5mL susp"),
            defaultFrequency = Frequency.TID,
            category = "Antibiotics",
        ),
        Drug("ERY", "Erythromycin",
            strengths = listOf("250mg tab", "125mg/5mL susp"),
            defaultFrequency = Frequency.QID,
            category = "Antibiotics",
        ),
        Drug("DOXY", "Doxycycline",
            strengths = listOf("100mg cap"),
            defaultFrequency = Frequency.BID,
            category = "Antibiotics",
            warning = "Contraindicated <8y and in pregnancy.",
        ),

        // Antihelminthics
        Drug("MEBEN", "Mebendazole",
            strengths = listOf("100mg tab", "500mg tab"),
            defaultFrequency = Frequency.STAT,
            category = "Antihelminthics",
        ),
        Drug("ALBEN", "Albendazole",
            strengths = listOf("400mg tab"),
            defaultFrequency = Frequency.STAT,
            category = "Antihelminthics",
        ),

        // Analgesics / antipyretics
        Drug("PARA", "Paracetamol",
            strengths = listOf("500mg tab", "120mg/5mL susp", "250mg/5mL susp"),
            defaultFrequency = Frequency.QID,
            category = "Analgesics",
        ),
        Drug("IBU", "Ibuprofen",
            strengths = listOf("200mg tab", "400mg tab", "100mg/5mL susp"),
            defaultFrequency = Frequency.TID,
            category = "Analgesics",
        ),
        Drug("DICLO", "Diclofenac",
            strengths = listOf("50mg tab", "75mg IM"),
            defaultFrequency = Frequency.BID,
            category = "Analgesics",
        ),

        // Rehydration / nutrition
        Drug("ORS", "ORS",
            strengths = listOf("1L sachet"),
            defaultFrequency = Frequency.PRN,
            category = "Rehydration",
        ),
        Drug("ZINC", "Zinc",
            strengths = listOf("20mg tab"),
            defaultFrequency = Frequency.OD,
            category = "Rehydration",
        ),
        Drug("IRON_FOLATE", "Iron + folic acid",
            strengths = listOf("60mg/0.4mg"),
            defaultFrequency = Frequency.OD,
            category = "Supplements",
        ),
        Drug("VITA", "Vitamin A",
            strengths = listOf("100,000 IU", "200,000 IU"),
            defaultFrequency = Frequency.STAT,
            category = "Supplements",
        ),

        // Cardiovascular
        Drug("HCTZ", "Hydrochlorothiazide",
            strengths = listOf("25mg tab"),
            defaultFrequency = Frequency.OD,
            category = "Cardiovascular",
        ),
        Drug("NIFED", "Nifedipine (LA)",
            strengths = listOf("20mg LA", "30mg LA"),
            defaultFrequency = Frequency.BID,
            category = "Cardiovascular",
        ),
        Drug("METHYL", "Methyldopa",
            strengths = listOf("250mg tab", "500mg tab"),
            defaultFrequency = Frequency.BID,
            category = "Cardiovascular",
            warning = "First-line for hypertension in pregnancy.",
        ),

        // Respiratory
        Drug("SALB", "Salbutamol",
            strengths = listOf("4mg tab", "2mg/5mL syrup", "100mcg MDI", "Neb"),
            defaultFrequency = Frequency.PRN,
            defaultRoute = Route.Inhaled,
            category = "Respiratory",
        ),
        Drug("PRED", "Prednisolone",
            strengths = listOf("5mg tab"),
            defaultFrequency = Frequency.OD,
            category = "Respiratory",
        ),

        // Antihistamines
        Drug("PROMETH", "Promethazine",
            strengths = listOf("25mg tab", "5mg/5mL syrup"),
            defaultFrequency = Frequency.HS,
            category = "Antihistamines",
        ),
        Drug("CETIRI", "Cetirizine",
            strengths = listOf("10mg tab", "5mg/5mL syrup"),
            defaultFrequency = Frequency.OD,
            category = "Antihistamines",
        ),

        // Obstetric / labour
        Drug("OXY", "Oxytocin (IV/IM)",
            strengths = listOf("10IU/mL"),
            defaultRoute = Route.IM,
            defaultFrequency = Frequency.STAT,
            category = "Obstetrics",
            warning = "PPH protocol — refer for ongoing infusion.",
        ),
        Drug("MGSO4", "Magnesium sulfate",
            strengths = listOf("50% inj"),
            defaultRoute = Route.IM,
            defaultFrequency = Frequency.STAT,
            category = "Obstetrics",
            warning = "Eclampsia / pre-eclampsia — Pritchard regimen.",
        ),

        // Vaccines
        Drug("TT", "Tetanus toxoid (TT)",
            strengths = listOf("0.5mL"),
            defaultRoute = Route.IM,
            defaultFrequency = Frequency.STAT,
            category = "Vaccines",
        ),
    )

    /** Drugs grouped by therapeutic category for the safety-first picker. */
    fun drugsByCategory(): List<Pair<String, List<Drug>>> =
        drugs.groupBy { it.category }
            .toList()
            .sortedBy { it.first }

    private val confusableCodes: Map<String, List<String>> = mapOf(
        "AMOX" to listOf("AMOX_CLAV"),
        "AMOX_CLAV" to listOf("AMOX"),
        "NIFED" to listOf("METHYL", "HCTZ"),
        "METHYL" to listOf("NIFED", "HCTZ"),
        "HCTZ" to listOf("NIFED", "METHYL"),
        "AL" to listOf("DHA_PPQ", "ARTESUNATE"),
        "DHA_PPQ" to listOf("AL", "ARTESUNATE"),
        "ARTESUNATE" to listOf("AL", "DHA_PPQ"),
        "COTRIM" to listOf("CIPRO"),
        "CIPRO" to listOf("COTRIM"),
        "PARA" to listOf("IBU"),
        "IBU" to listOf("PARA"),
    )

    fun confusableDrugNames(drug: Drug): List<String> =
        confusableCodes[drug.code]
            ?.mapNotNull { code -> drugs.find { it.code == code }?.name }
            ?: emptyList()

    /** Format the picker selections into the canonical Sig string we append
     *  to the visit's `medications` free-text field. */
    fun formatSig(
        drug: Drug,
        strength: String?,
        quantityText: String?,
        frequency: Frequency?,
        route: Route?,
        durationDays: Int?,
        notes: String?,
    ): String {
        val parts = buildList {
            add(drug.name)
            strength?.takeIf { it.isNotBlank() }?.let { add(it) }
            quantityText?.takeIf { it.isNotBlank() }?.let { add(it) }
            route?.let { add(it.code) }
            frequency?.let { add(it.code) }
            durationDays?.let { add("x ${it}d") }
        }
        val base = parts.joinToString(" ")
        return if (notes.isNullOrBlank()) base else "$base ($notes)"
    }
}
