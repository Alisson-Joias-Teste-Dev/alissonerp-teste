package br.com.alissonjoias.rfid.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.alissonjoias.rfid.AlissonErpApp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ProcurarUiState(
    val targetEpc: String = "",
    val procurando: Boolean = false,
    val rssi: Int = 0,
    val rssiPercent: Float = 0f,
    val epcEncontrado: String? = null,
    val erro: String? = null,
)

class ProcurarViewModel : ViewModel() {

    private val tslManager = AlissonErpApp.instance.tslManager

    private val _uiState = MutableStateFlow(ProcurarUiState())
    val uiState: StateFlow<ProcurarUiState> = _uiState.asStateFlow()

    init {
        tslManager.onFindProgress { rssi ->
            val percent = ((rssi + 100).toFloat() / 100f).coerceIn(0f, 1f)
            _uiState.value = _uiState.value.copy(
                rssi = rssi,
                rssiPercent = percent,
                epcEncontrado = _uiState.value.targetEpc,
            )
        }
    }

    fun onTargetEpcChanged(epc: String) {
        _uiState.value = _uiState.value.copy(
            targetEpc = epc,
            erro = null,
            epcEncontrado = null,
            rssi = 0,
            rssiPercent = 0f,
        )
    }

    fun iniciarProcura() {
        val epc = _uiState.value.targetEpc.trim()
        if (epc.length < 8) {
            _uiState.value = _uiState.value.copy(erro = "EPC invalido (min 8 caracteres)")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(procurando = true, erro = null)
            val result = tslManager.findTag(epc, 30)
            result.fold(
                onSuccess = { },
                onFailure = { e ->
                    _uiState.value = _uiState.value.copy(
                        procurando = false,
                        erro = e.message,
                    )
                }
            )
        }
    }

    fun pararProcura() {
        viewModelScope.launch {
            tslManager.stop()
            _uiState.value = _uiState.value.copy(procurando = false)
        }
    }
}
