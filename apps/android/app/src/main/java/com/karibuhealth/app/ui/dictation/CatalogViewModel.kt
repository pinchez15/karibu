package com.karibuhealth.app.ui.dictation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.CatalogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CatalogUiState(
    val labCategories: List<Pair<String, List<String>>> = emptyList(),
    val formularyCategories: List<Pair<String, List<String>>> = emptyList(),
    val loaded: Boolean = false,
)

@HiltViewModel
class CatalogViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(CatalogUiState())
    val state: StateFlow<CatalogUiState> = _state.asStateFlow()

    fun ensureLoaded() {
        if (_state.value.loaded) return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            catalogRepository.refreshCatalog(clinicId)
            val labs = catalogRepository.getLabs(clinicId)
            val formulary = catalogRepository.getFormulary(clinicId)
            _state.value = CatalogUiState(
                labCategories = labs
                    .groupBy { it.category?.ifBlank { "General" } ?: "General" }
                    .map { (cat, items) -> cat to items.map { it.testName } },
                formularyCategories = formulary
                    .groupBy { it.category?.ifBlank { "General" } ?: "General" }
                    .map { (cat, items) -> cat to items.map { it.drugName } },
                loaded = true,
            )
        }
    }
}
