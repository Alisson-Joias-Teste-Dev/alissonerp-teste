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
import br.com.alissonjoias.rfid.data.tsl.TslManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class ItemResultado(
    val item: ItemInventarioCacheEntity,
    val lido: Int,
    val status: StatusItem,
)

data class ContagemUiState(
    val inventario: InventarioCacheEntity? = null,
    val itens: List<ItemInventarioCacheEntity> = emptyList(),
    val itensResultado: List<ItemResultado> = emptyList(),
    val epcsLidos: List<String> = emptyList(),
    val totalEpcsUnicos: Int = 0,
    val scanning: Boolean = false,
    val tempoLeitura: Long = 0L,
    val sincronizando: Boolean = false,
    val enviando: Boolean = false,
    val erro: String? = null,
    val enviado: Boolean = false,
    val modoResultado: Boolean = false,
)

data class ResumoDivergencias(
    val ok: Int = 0,
    val faltando: Int = 0,
    val excesso: Int = 0,
    val totalEsperado: Int = 0,
    val totalLido: Int = 0,
)

class ContagemViewModel(
    private val inventarioId: Int,
) : ViewModel() {

    private val app = AlissonErpApp.instance
    private val repo = InventarioRepository(
        inventarioDao = app.database.inventarioCacheDao(),
        epcDao = app.database.epcCacheDao(),
        tslManager = app.tslManager,
    )
    private val tslManager = app.tslManager

    private val _uiState = MutableStateFlow(ContagemUiState())
    val uiState: StateFlow<ContagemUiState> = _uiState.asStateFlow()

    private val _resumo = MutableStateFlow(ResumoDivergencias())
    val resumo: StateFlow<ResumoDivergencias> = _resumo.asStateFlow()

    private var timerJob: Job? = null
    private var scanStartTime: Long = 0L
    private val epcSet = mutableSetOf<String>()

    private val lastEpcTimestamps = mutableMapOf<String, Long>()
    private val DEDUP_WINDOW_MS = 3000L

    init {
        carregarDados()
        observarTslEstado()
        registrarCallbackTsl()
    }

    private fun carregarDados() {
        viewModelScope.launch {
            val inv = app.database.inventarioCacheDao().getInventarioById(inventarioId)
            _uiState.value = _uiState.value.copy(inventario = inv)

            repo.getItens(inventarioId).collect { itens ->
                _uiState.value = _uiState.value.copy(itens = itens)
                recalcularResultado()
            }
        }

        viewModelScope.launch {
            repo.getEpcs(inventarioId).collect { epcs ->
                val epcsStr = epcs.map { it.epc }.distinct()
                _uiState.value = _uiState.value.copy(
                    epcsLidos = epcsStr,
                    totalEpcsUnicos = epcsStr.size,
                )
            }
        }
    }

    private fun observarTslEstado() {
        viewModelScope.launch {
            tslManager.state.collect { tslState ->
                _uiState.value = _uiState.value.copy(
                    scanning = tslState.scanning,
                )
            }
        }
    }

    private fun registrarCallbackTsl() {
        tslManager.onEpcReceived { epc, rssi ->
            val now = System.currentTimeMillis()
            val lastTime = lastEpcTimestamps[epc]

            if (lastTime != null && (now - lastTime) < DEDUP_WINDOW_MS) return@onEpcReceived

            lastEpcTimestamps[epc] = now
            epcSet.add(epc)

            _uiState.value = _uiState.value.copy(totalEpcsUnicos = epcSet.size)

            viewModelScope.launch {
                repo.registrarLeitura(inventarioId, epc, rssi)
                incrementarContagem(epc)
                recalcularResultado()
            }
        }
    }

    private suspend fun incrementarContagem(epc: String) {
        val itens = _uiState.value.itens
        if (itens.isEmpty()) return

        val itemToUpdate = itens
            .filter { (it.quantidadeContada ?: 0) < it.quantidadeSistema }
            .minByOrNull { it.quantidadeContada ?: 0 }

        if (itemToUpdate != null) {
            val newCount = (itemToUpdate.quantidadeContada ?: 0) + 1
            app.database.inventarioCacheDao().updateQuantidadeContada(
                inventarioId, itemToUpdate.produtoId, newCount
            )
        }

        repo.syncStatus(inventarioId, "contando")
    }

    private fun recalcularResultado() {
        val itens = _uiState.value.itens
        if (itens.isEmpty()) return

        val resultado = itens.map { item ->
            val lido = countEpcsForProduto(item.produtoId)
            val status = StatusItem.from(lido, item.quantidadeSistema)
            ItemResultado(item = item, lido = lido, status = status)
        }

        _uiState.value = _uiState.value.copy(itensResultado = resultado)

        val calc = calcularResultados(itens)
        _resumo.value = ResumoDivergencias(
            ok = calc.ok,
            faltando = calc.faltando,
            excesso = calc.excesso,
            totalEsperado = itens.sumOf { it.quantidadeSistema },
            totalLido = epcSet.size,
        )
    }

    private fun countEpcsForProduto(produtoId: Long): Int {
        val item = _uiState.value.itens.find { it.produtoId == produtoId }
        return item?.quantidadeContada ?: 0
    }

    fun iniciarContagem() {
        viewModelScope.launch {
            val result = tslManager.startInventory()
            result.fold(
                onSuccess = {
                    scanStartTime = System.currentTimeMillis()
                    startTimer()
                    _uiState.value = _uiState.value.copy(erro = null)
                },
                onFailure = { e ->
                    _uiState.value = _uiState.value.copy(
                        erro = "Erro ao iniciar: ${e.message}"
                    )
                }
            )
        }
    }

    fun pararContagem() {
        viewModelScope.launch {
            tslManager.stop()
            timerJob?.cancel()
            repo.syncStatus(inventarioId, "concluido_local")
            _uiState.value = _uiState.value.copy(modoResultado = true)
        }
    }

    fun limparLeituras() {
        viewModelScope.launch {
            tslManager.stop()
            timerJob?.cancel()
            epcSet.clear()
            lastEpcTimestamps.clear()
            repo.limparLeituras(inventarioId)
            repo.syncStatus(inventarioId, "pendente")
            _uiState.value = _uiState.value.copy(
                totalEpcsUnicos = 0,
                tempoLeitura = 0L,
                modoResultado = false,
                epcsLidos = emptyList(),
            )
        }
    }

    fun limparErro() {
        _uiState.value = _uiState.value.copy(erro = null)
    }

    fun irParaResultado() {
        viewModelScope.launch {
            tslManager.stop()
            timerJob?.cancel()
            repo.syncStatus(inventarioId, "concluido_local")
            _uiState.value = _uiState.value.copy(modoResultado = true)
        }
    }

    fun voltarParaContagem() {
        _uiState.value = _uiState.value.copy(modoResultado = false)
        startTimer()
    }

    fun enviarParaSistema() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(enviando = true, erro = null)

            val itens = repo.getItensSync(inventarioId)
            val epcs = repo.getEpcsSync(inventarioId)

            val result = repo.enviarParaSistema(inventarioId, itens, epcs)

            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        enviando = false,
                        enviado = true,
                    )
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

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (isActive) {
                delay(1000)
                val elapsed = (System.currentTimeMillis() - scanStartTime) / 1000
                _uiState.value = _uiState.value.copy(tempoLeitura = elapsed)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
    }

    class Factory(private val inventarioId: Int) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return ContagemViewModel(inventarioId) as T
        }
    }
}
