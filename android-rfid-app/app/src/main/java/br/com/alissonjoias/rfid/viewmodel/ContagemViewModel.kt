package br.com.alissonjoias.rfid.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import br.com.alissonjoias.rfid.AlissonErpApp
import br.com.alissonjoias.rfid.data.local.entity.EpcCacheEntity
import br.com.alissonjoias.rfid.data.local.entity.InventarioCacheEntity
import br.com.alissonjoias.rfid.data.local.entity.ItemInventarioCacheEntity
import br.com.alissonjoias.rfid.data.repository.InventarioRepository
import br.com.alissonjoias.rfid.data.repository.StatusItem
import br.com.alissonjoias.rfid.data.repository.calcularResultados
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    val erro: String? = null,
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
    private var flushJob: Job? = null
    private var scanStartTime: Long = 0L

    private val epcSet = hashSetOf<String>()
    private val pendingEpcs = mutableListOf<EpcCacheEntity>()
    private val displayEpcs = mutableListOf<String>()
    private val lastEpcTimestamps = hashMapOf<String, Long>()
    private var lastRecalcTime = 0L

    companion object {
        private const val DEDUP_WINDOW_MS = 3000L
        private const val BATCH_SIZE = 20
        private const val FLUSH_INTERVAL_MS = 3000L
        private const val RECALC_INTERVAL_MS = 1000L
        private const val MAX_DISPLAY_EPCS = 30
    }

    init {
        carregarDados()
        observarTslEstado()
        registrarCallbackTsl()
    }

    private fun carregarDados() {
        viewModelScope.launch {
            val inv = app.database.inventarioCacheDao().getInventarioById(inventarioId)
            val itens = repo.getItensSync(inventarioId)
            val epcs = repo.getEpcsSync(inventarioId)

            epcSet.addAll(epcs)
            displayEpcs.addAll(epcs.takeLast(MAX_DISPLAY_EPCS))

            _uiState.value = _uiState.value.copy(
                inventario = inv,
                itens = itens,
                epcsLidos = displayEpcs.toList(),
                totalEpcsUnicos = epcSet.size,
            )
            recalcularResultado()
        }
    }

    private fun observarTslEstado() {
        viewModelScope.launch {
            tslManager.state.collect { tslState ->
                _uiState.value = _uiState.value.copy(scanning = tslState.scanning)
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

            displayEpcs.add(epc)
            if (displayEpcs.size > MAX_DISPLAY_EPCS) displayEpcs.removeAt(0)

            addPendingEpc(EpcCacheEntity(inventarioId = inventarioId, epc = epc, rssi = rssi))
            incrementarContagemMemoria()

            _uiState.value = _uiState.value.copy(
                totalEpcsUnicos = epcSet.size,
                epcsLidos = displayEpcs.toList(),
            )

            if (now - lastRecalcTime > RECALC_INTERVAL_MS) {
                recalcularResultado()
                lastRecalcTime = now
            }
        }
    }

    private fun incrementarContagemMemoria() {
        val itens = _uiState.value.itens
        if (itens.isEmpty()) return
        val itemToUpdate = itens
            .filter { (it.quantidadeContada ?: 0) < it.quantidadeSistema }
            .minByOrNull { it.quantidadeContada ?: 0 } ?: return
        itemToUpdate.quantidadeContada = (itemToUpdate.quantidadeContada ?: 0) + 1
    }

    private fun recalcularResultado() {
        val itens = _uiState.value.itens
        if (itens.isEmpty()) return
        _uiState.value = _uiState.value.copy(
            itensResultado = itens.map { item ->
                val lido = item.quantidadeContada ?: 0
                ItemResultado(item = item, lido = lido, status = StatusItem.from(lido, item.quantidadeSistema))
            }
        )
        val calc = calcularResultados(itens)
        _resumo.value = ResumoDivergencias(
            ok = calc.ok, faltando = calc.faltando, excesso = calc.excesso,
            totalEsperado = itens.sumOf { it.quantidadeSistema },
            totalLido = epcSet.size,
        )
    }

    private fun addPendingEpc(epc: EpcCacheEntity) {
        synchronized(pendingEpcs) { pendingEpcs.add(epc) }
    }

    private suspend fun flushEpcs() {
        val batch: List<EpcCacheEntity>
        synchronized(pendingEpcs) {
            batch = pendingEpcs.toList()
            pendingEpcs.clear()
        }
        if (batch.isEmpty()) return
        app.database.epcCacheDao().insertEpcs(batch)
        val dao = app.database.inventarioCacheDao()
        for (item in _uiState.value.itens) {
            dao.updateQuantidadeContada(inventarioId, item.produtoId, item.quantidadeContada ?: 0)
        }
        repo.syncStatus(inventarioId, "contando")
    }

    fun iniciarContagem() {
        viewModelScope.launch {
            tslManager.startInventory().fold(
                onSuccess = {
                    scanStartTime = System.currentTimeMillis()
                    startTimer()
                    startPeriodicFlush()
                    _uiState.value = _uiState.value.copy(erro = null)
                },
                onFailure = { e -> _uiState.value = _uiState.value.copy(erro = "Erro ao iniciar: ${e.message}") }
            )
        }
    }

    fun pararContagem() {
        viewModelScope.launch {
            flushEpcs()
            flushJob?.cancel()
            tslManager.stop()
            timerJob?.cancel()
            _uiState.value = _uiState.value.copy(modoResultado = true)
        }
    }

    fun irParaResultado() {
        viewModelScope.launch {
            flushEpcs()
            flushJob?.cancel()
            tslManager.stop()
            timerJob?.cancel()
            _uiState.value = _uiState.value.copy(modoResultado = true)
        }
    }

    fun recontar() {
        flushJob?.cancel()
        viewModelScope.launch {
            tslManager.stop()
            timerJob?.cancel()
            epcSet.clear(); lastEpcTimestamps.clear(); pendingEpcs.clear(); displayEpcs.clear()
            repo.limparLeituras(inventarioId)
            _uiState.value = _uiState.value.copy(totalEpcsUnicos = 0, tempoLeitura = 0L, modoResultado = false, epcsLidos = emptyList())
            tslManager.startInventory().fold(
                onSuccess = {
                    scanStartTime = System.currentTimeMillis()
                    startTimer()
                    startPeriodicFlush()
                    _uiState.value = _uiState.value.copy(erro = null)
                },
                onFailure = { e -> _uiState.value = _uiState.value.copy(erro = "Erro ao recontar: ${e.message}") }
            )
        }
    }

    fun limparErro() { _uiState.value = _uiState.value.copy(erro = null) }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (isActive) { delay(1000); _uiState.value = _uiState.value.copy(tempoLeitura = (System.currentTimeMillis() - scanStartTime) / 1000) }
        }
    }

    private fun startPeriodicFlush() {
        flushJob?.cancel()
        flushJob = viewModelScope.launch {
            while (isActive) { delay(FLUSH_INTERVAL_MS.toLong()); flushEpcs() }
        }
    }

    override fun onCleared() {
        viewModelScope.launch { flushEpcs() }
        timerJob?.cancel(); flushJob?.cancel()
        super.onCleared()
    }

    class Factory(private val inventarioId: Int) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = ContagemViewModel(inventarioId) as T
    }
}
