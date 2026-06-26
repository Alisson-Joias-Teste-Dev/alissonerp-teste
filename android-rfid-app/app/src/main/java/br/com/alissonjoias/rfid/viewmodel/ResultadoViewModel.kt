package br.com.alissonjoias.rfid.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import br.com.alissonjoias.rfid.AlissonErpApp
import br.com.alissonjoias.rfid.data.local.entity.InventarioCacheEntity
import br.com.alissonjoias.rfid.data.local.entity.ItemInventarioCacheEntity
import br.com.alissonjoias.rfid.data.repository.InventarioRepository
import br.com.alissonjoias.rfid.data.repository.StatusItem
import br.com.alissonjoias.rfid.data.repository.calcularResultados
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ResultadoUiState(
    val inventario: InventarioCacheEntity? = null,
    val itens: List<ItemInventarioCacheEntity> = emptyList(),
    val itensResultado: List<ItemResultado> = emptyList(),
    val totalEpcs: Int = 0,
    val enviando: Boolean = false,
    val enviado: Boolean = false,
    val erro: String? = null,
)

class ResultadoViewModel(
    private val inventarioId: Int,
) : ViewModel() {

    private val app = AlissonErpApp.instance
    private val repo = InventarioRepository(
        inventarioDao = app.database.inventarioCacheDao(),
        epcDao = app.database.epcCacheDao(),
        tslManager = app.tslManager,
    )

    private val _uiState = MutableStateFlow(ResultadoUiState())
    val uiState: StateFlow<ResultadoUiState> = _uiState.asStateFlow()

    private val _resumo = MutableStateFlow(ResumoDivergencias())
    val resumo: StateFlow<ResumoDivergencias> = _resumo.asStateFlow()

    init {
        carregarDados()
    }

    private fun carregarDados() {
        viewModelScope.launch {
            val inv = app.database.inventarioCacheDao().getInventarioById(inventarioId)
            val itens = repo.getItensSync(inventarioId)
            val epcs = repo.getEpcsSync(inventarioId)

            val resultados = itens.map { item ->
                val lido = item.quantidadeContada ?: 0
                val status = StatusItem.from(lido, item.quantidadeSistema)
                ItemResultado(item = item, lido = lido, status = status)
            }

            val calc = calcularResultados(itens)

            _uiState.value = ResultadoUiState(
                inventario = inv,
                itens = itens,
                itensResultado = resultados,
                totalEpcs = epcs.size,
            )

            _resumo.value = ResumoDivergencias(
                ok = calc.ok,
                faltando = calc.faltando,
                excesso = calc.excesso,
                totalEsperado = itens.sumOf { it.quantidadeSistema },
                totalLido = epcs.size,
            )
        }
    }

    fun enviarParaSistema() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(enviando = true, erro = null)

            val itens = repo.getItensSync(inventarioId)
            val epcs = repo.getEpcsSync(inventarioId)

            val result = repo.enviarParaSistema(inventarioId, itens, epcs)

            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(enviando = false, enviado = true)
                },
                onFailure = { e ->
                    _uiState.value = _uiState.value.copy(
                        enviando = false,
                        erro = e.message ?: "Erro ao enviar",
                    )
                }
            )
        }
    }

    fun limparErro() {
        _uiState.value = _uiState.value.copy(erro = null)
    }

    class Factory(private val inventarioId: Int) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ResultadoViewModel(inventarioId) as T
        }
    }
}
