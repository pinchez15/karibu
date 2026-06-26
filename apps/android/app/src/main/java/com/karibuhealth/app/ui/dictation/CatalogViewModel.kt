package com.karibuhealth.app.ui.dictation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.CatalogRepository
import com.karibuhealth.app.data.repository.RegionProtocolRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject

data class FormularyDrugRef(
    val name: String,
    val code: String? = null,
    val category: String = "General",
    val strengths: List<String> = emptyList(),
    val aliases: List<String> = emptyList(),
    val defaultFrequency: String? = null,
    val defaultRoute: String? = null,
    val warning: String? = null,
)

data class CatalogUiState(
    val labCategories: List<Pair<String, List<String>>> = emptyList(),
    val formularyCategories: List<Pair<String, List<FormularyDrugRef>>> = emptyList(),
    val loaded: Boolean = false,
)

@HiltViewModel
class CatalogViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    private val regionProtocolRepository: RegionProtocolRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(CatalogUiState())
    val state: StateFlow<CatalogUiState> = _state.asStateFlow()

    fun ensureLoaded() {
        if (_state.value.loaded) return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            catalogRepository.refreshCatalog(clinicId)
            regionProtocolRepository.refreshProtocols(clinicId)
            val labs = catalogRepository.getLabs(clinicId)
            val formulary = catalogRepository.getFormulary(clinicId)
            _state.value = CatalogUiState(
                labCategories = labs
                    .groupBy { it.category?.ifBlank { "General" } ?: "General" }
                    .map { (cat, items) -> cat to items.map { it.testName } },
                formularyCategories = formulary
                    .groupBy { it.category?.ifBlank { "General" } ?: "General" }
                    .map { (cat, items) ->
                        cat to items.map { row ->
                            FormularyDrugRef(
                                name = row.drugName,
                                code = row.code,
                                category = row.category ?: cat,
                                strengths = row.strengthsJson?.let {
                                    runCatching { Json.decodeFromString<List<String>>(it) }.getOrDefault(emptyList())
                                } ?: emptyList(),
                                aliases = row.aliasesJson?.let {
                                    runCatching { Json.decodeFromString<List<String>>(it) }.getOrDefault(emptyList())
                                } ?: emptyList(),
                                defaultFrequency = row.defaultFrequency,
                                defaultRoute = row.defaultRoute,
                                warning = row.warningText,
                            )
                        }
                    },
                loaded = true,
            )
        }
    }
}
