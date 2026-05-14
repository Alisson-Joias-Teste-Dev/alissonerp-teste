package br.com.alissonjoias.rfid.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.alissonjoias.rfid.AlissonErpApp
import br.com.alissonjoias.rfid.data.local.entity.InventarioCacheEntity
import br.com.alissonjoias.rfid.data.repository.InventarioRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ListaInventarioUiState(
    val sincronizando: Boolean = false,
    val error: String? = null,
)

class ListaInventarioViewModel : ViewModel() {

    private val repo = InventarioRepository(
        inventarioDao = AlissonErpApp.instance.database.inventarioCacheDao(),
        epcDao = AlissonErpApp.instance.database.epcCacheDao(),
        tslManager = AlissonErpApp.instance.tslManager,
    )

    val inventarios: StateFlow<List<InventarioCacheEntity>> = repo.inventarios
        .let { flow ->
            val mutable = MutableStateFlow<List<InventarioCacheEntity>>(emptyList())
            viewModelScope.launch {
                flow.collect { mutable.value = it }
            }
            mutable.asStateFlow()
        }

    private val _uiState = MutableStateFlow(ListaInventarioUiState())
    val uiState: StateFlow<ListaInventarioUiState> = _uiState.asStateFlow()

    fun sincronizar() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(sincronizando = true, error = null)
            val result = repo.sincronizarInventarios()
            result.fold(
                onSuccess = { _uiState.value = _uiState.value.copy(sincronizando = false) },
                onFailure = { e ->
                    _uiState.value = _uiState.value.copy(
                        sincronizando = false,
                        error = e.message ?: "Erro ao sincronizar"
                    )
                }
            )
        }
    }

    fun limparErro() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}
