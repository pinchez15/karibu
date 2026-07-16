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

    // =========================================================================
    // PHARM-4 — structured course-of-treatment prescribing + computed quantity.
    //
    // Kotlin mirror of packages/shared/src/pharmacy-catalog.ts. This MUST produce
    // identical numbers to the TS canonical; both are pinned by the shared golden
    // vectors (packages/shared/src/__fixtures__/quantity-vectors.json, spec R6).
    // Do NOT change the arithmetic here without regenerating those vectors and
    // updating the TS mirror.
    // =========================================================================

    /** Dose unit — the unit the dose amount is expressed in per administration. */
    enum class DoseUnit(val code: String) {
        MG("mg"), ML("mL"), TAB("tab"), CAP("cap"), DROP("drop"), PUFF("puff");

        companion object {
            fun fromCode(code: String?): DoseUnit? =
                code?.let { c -> entries.firstOrNull { it.code == c } }
        }
    }

    /**
     * Dispense unit — the unit stock is counted in at the counter. Distinct from
     * strength unit (mg, mg/mL). Includes container concepts (bottle, inhaler).
     */
    enum class DispenseUnit(val code: String) {
        TAB("tab"), CAP("cap"), ML("mL"), BOTTLE("bottle"), INHALER("inhaler"),
        SACHET("sachet"), VIAL("vial"), DROP("drop"), PUFF("puff"), DOSE("dose");

        companion object {
            fun fromCode(code: String?): DispenseUnit? =
                code?.let { c -> entries.firstOrNull { it.code == c } }
        }
    }

    /** scheduled = quantity computed; fixed_quantity = clinician enters total (PRN). */
    enum class OrderMode(val code: String) {
        SCHEDULED("scheduled"), FIXED_QUANTITY("fixed_quantity");
    }

    /** Provenance of the dispensable quantity (R6 — replaces retired manual_confirmed). */
    enum class QuantitySource(val code: String) {
        COMPUTED("computed"), OVERRIDDEN("overridden");
    }

    /**
     * frequency_code -> canonical doses per day. STAT maps to 1 but the compute
     * forces total_doses = 1 (one dose, ignores duration). PRN is not schedulable
     * (null) — it rides the fixed_quantity path. Mirrors FREQUENCY_PER_DAY in
     * pharmacy-catalog.ts and prescription_frequency_per_day() in migration 107.
     */
    val frequencyPerDayMap: Map<String, Int?> = mapOf(
        "OD" to 1,
        "BID" to 2,
        "TID" to 3,
        "QID" to 4,
        "Q4H" to 6,
        "Q6H" to 4,
        "Q8H" to 3,
        "Q12H" to 2,
        "HS" to 1,
        "AC" to 3, // meal-timing modifier ~ TID
        "PC" to 3, // meal-timing modifier ~ TID
        "STAT" to 1,
        "PRN" to null,
    )

    /** Normalize a frequency code to uppercase and look up its doses/day. */
    fun frequencyPerDay(code: String?): Int? {
        if (code.isNullOrBlank()) return null
        val c = code.trim().uppercase()
        if (!frequencyPerDayMap.containsKey(c)) return null
        return frequencyPerDayMap[c]
    }

    /** Container dispense units — computed amount rounds UP to whole containers. */
    private val containerDispenseUnits = setOf(DispenseUnit.BOTTLE, DispenseUnit.INHALER)

    /** Sanity band for units-per-dose on solid oral forms (spec R5). */
    const val SANITY_MIN_UNITS_PER_DOSE = 0.25
    const val SANITY_MAX_UNITS_PER_DOSE = 4.0

    data class QuantityComputeInput(
        val orderMode: OrderMode,
        val frequencyCode: String? = null,
        val durationDays: Int? = null,
        val doseAmount: Double,
        val doseUnit: DoseUnit,
        /** mg per one dispense unit (mg/tab for solids, mg/mL for liquids). Only used when doseUnit = MG. */
        val strengthAmount: Double? = null,
        val dispenseUnit: DispenseUnit,
        val fixedQuantity: Double? = null,
        /** Units (mL or puffs) per container when dispenseUnit is a container. */
        val containerSize: Double? = null,
    )

    data class QuantityComputeResult(
        val quantity: Double?,
        val unitsPerDose: Double?,
        val totalDoses: Int?,
        val needsConfirmation: Boolean,
        val flags: List<String>,
    )

    private fun roundTo(value: Double, decimals: Int): Double {
        val f = Math.pow(10.0, decimals.toDouble())
        return Math.round((value + 1e-12) * f) / f
    }

    /**
     * Compute the dispensable quantity for a prescription line. Deterministic;
     * pinned by quantity-vectors.json. Branches on doseUnit (spec R5):
     *   tab/cap/drop/puff/mL -> unitsPerDose = doseAmount directly
     *   mg                    -> unitsPerDose = doseAmount / strengthAmount
     * Scheduled: quantity = unitsPerDose * frequencyPerDay * durationDays.
     * STAT: totalDoses = 1. Container dispense units round UP to whole containers.
     */
    fun computePrescriptionQuantity(input: QuantityComputeInput): QuantityComputeResult {
        val flags = mutableListOf<String>()

        // ---- fixed_quantity (PRN): clinician enters the total directly ----
        if (input.orderMode == OrderMode.FIXED_QUANTITY) {
            val q = input.fixedQuantity
            val bad = q == null || q <= 0.0
            if (bad) flags.add("fixed_quantity_required")
            return QuantityComputeResult(
                quantity = if (bad) null else roundTo(q!!, 3),
                unitsPerDose = null,
                totalDoses = null,
                needsConfirmation = bad,
                flags = flags,
            )
        }

        // ---- scheduled: derive unitsPerDose (in dispense unit) ----
        val unitsPerDose: Double? = when (input.doseUnit) {
            DoseUnit.TAB, DoseUnit.CAP, DoseUnit.DROP, DoseUnit.PUFF, DoseUnit.ML ->
                input.doseAmount
            DoseUnit.MG -> {
                val s = input.strengthAmount
                if (s == null || s <= 0.0) {
                    flags.add("strength_required_for_mg_dose")
                    null
                } else {
                    input.doseAmount / s
                }
            }
        }

        // ---- totalDoses ----
        val freq = (input.frequencyCode ?: "").trim().uppercase()
        val totalDoses: Int? = if (freq == "STAT") {
            1
        } else {
            val perDay = frequencyPerDay(freq)
            when {
                perDay == null -> {
                    flags.add("frequency_not_schedulable")
                    null
                }
                input.durationDays == null || input.durationDays <= 0 -> {
                    flags.add("duration_required")
                    null
                }
                else -> perDay * input.durationDays
            }
        }

        if (unitsPerDose == null || totalDoses == null) {
            return QuantityComputeResult(
                quantity = null,
                unitsPerDose = unitsPerDose?.let { roundTo(it, 3) },
                totalDoses = totalDoses,
                needsConfirmation = true,
                flags = flags,
            )
        }

        // ---- sanity band (solid oral forms only) ----
        var needs = false
        val solid = input.doseUnit == DoseUnit.TAB ||
            input.doseUnit == DoseUnit.CAP ||
            (input.doseUnit == DoseUnit.MG &&
                (input.dispenseUnit == DispenseUnit.TAB || input.dispenseUnit == DispenseUnit.CAP))
        if (solid) {
            if (unitsPerDose < SANITY_MIN_UNITS_PER_DOSE || unitsPerDose > SANITY_MAX_UNITS_PER_DOSE) {
                flags.add("units_per_dose_out_of_range")
                needs = true
            }
            if (Math.abs(unitsPerDose * 2 - Math.round(unitsPerDose * 2).toDouble()) > 1e-9) {
                flags.add("non_half_tablet_fraction")
                needs = true
            }
        }

        // ---- quantity (round UP to whole containers where applicable) ----
        var quantity = unitsPerDose * totalDoses
        if (containerDispenseUnits.contains(input.dispenseUnit)) {
            val cs = input.containerSize
            if (cs == null || cs <= 0.0) {
                flags.add("container_size_required")
                needs = true
            } else {
                quantity = Math.ceil(quantity / cs)
            }
        }

        return QuantityComputeResult(
            quantity = roundTo(quantity, 3),
            unitsPerDose = roundTo(unitsPerDose, 3),
            totalDoses = totalDoses,
            needsConfirmation = needs,
            flags = flags,
        )
    }

    // -------------------------------------------------------------------------
    // Strength parsing — turns a catalog strength string ("500mg cap",
    // "125mg/5mL susp", "100mcg MDI") into structured strength/form/dispense hints
    // for the picker. Best-effort: unparsed strings leave fields null and the
    // clinician confirms the computed quantity anyway (invariant preserved).
    // -------------------------------------------------------------------------

    data class ParsedStrength(
        /** mg per one dispense unit (mg/tab for solids, mg/mL concentration for liquids). */
        val strengthAmount: Double? = null,
        val strengthUnit: String? = null,
        val form: String? = null,
        val dispenseUnit: DispenseUnit? = null,
        /** Suggested default dose unit for the picker given the form. */
        val defaultDoseUnit: DoseUnit? = null,
        /** mL/puffs per container for container dispense units. */
        val containerSize: Double? = null,
    )

    private val concentrationRegex =
        Regex("""(\d+(?:\.\d+)?)\s*(mg|mcg|g|IU)\s*/\s*(\d+(?:\.\d+)?)\s*(mL|ml)""", RegexOption.IGNORE_CASE)
    private val simpleAmountRegex =
        Regex("""(\d+(?:\.\d+)?)\s*(mg|mcg|g|IU)""", RegexOption.IGNORE_CASE)

    fun parseStrength(strength: String?): ParsedStrength {
        if (strength.isNullOrBlank()) return ParsedStrength()
        val s = strength.trim()
        val lower = s.lowercase()

        // Form + dispense hints from trailing/keyword tokens.
        val hint: FormHint = when {
            lower.contains("susp") -> FormHint("suspension", DispenseUnit.ML, DoseUnit.ML, null)
            lower.contains("syrup") -> FormHint("syrup", DispenseUnit.ML, DoseUnit.ML, null)
            lower.contains("mdi") || lower.contains("inhaler") ->
                FormHint("inhaler", DispenseUnit.INHALER, DoseUnit.PUFF, 200.0)
            lower.contains("neb") -> FormHint("solution", DispenseUnit.ML, DoseUnit.ML, null)
            lower.contains("cap") -> FormHint("capsule", DispenseUnit.CAP, DoseUnit.CAP, null)
            lower.contains("tab") -> FormHint("tablet", DispenseUnit.TAB, DoseUnit.TAB, null)
            lower.contains("vial") -> FormHint("vial", DispenseUnit.VIAL, DoseUnit.ML, null)
            lower.contains("inj") -> FormHint("injection", DispenseUnit.VIAL, DoseUnit.ML, null)
            lower.contains("sachet") -> FormHint("sachet", DispenseUnit.SACHET, null, null)
            lower.contains("la") -> FormHint("tablet", DispenseUnit.TAB, DoseUnit.TAB, null)
            else -> FormHint(null, null, null, null)
        }

        // Concentration (liquids): strengthAmount = mg per mL.
        concentrationRegex.find(s)?.let { m ->
            val amt = m.groupValues[1].toDoubleOrNull()
            val unit = m.groupValues[2]
            val vol = m.groupValues[3].toDoubleOrNull()
            if (amt != null && vol != null && vol > 0) {
                return ParsedStrength(
                    strengthAmount = amt / vol,
                    strengthUnit = "$unit/mL",
                    form = hint.form ?: "suspension",
                    dispenseUnit = hint.dispenseUnit ?: DispenseUnit.ML,
                    defaultDoseUnit = hint.doseUnit ?: DoseUnit.ML,
                    containerSize = hint.containerSize,
                )
            }
        }

        // Simple amount (solids/single-number strengths).
        simpleAmountRegex.find(s)?.let { m ->
            val amt = m.groupValues[1].toDoubleOrNull()
            val unit = m.groupValues[2]
            return ParsedStrength(
                strengthAmount = amt,
                strengthUnit = unit,
                form = hint.form,
                dispenseUnit = hint.dispenseUnit,
                defaultDoseUnit = hint.doseUnit,
                containerSize = hint.containerSize,
            )
        }

        return ParsedStrength(
            form = hint.form,
            dispenseUnit = hint.dispenseUnit,
            defaultDoseUnit = hint.doseUnit,
            containerSize = hint.containerSize,
        )
    }

    private data class FormHint(
        val form: String?,
        val dispenseUnit: DispenseUnit?,
        val doseUnit: DoseUnit?,
        val containerSize: Double?,
    )
}
