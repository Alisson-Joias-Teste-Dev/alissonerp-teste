package br.com.alissonjoias.rfid.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.alissonjoias.rfid.AlissonErpApp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

data class DispositivoBt(
    val nome: String,
    val endereco: String,
)

data class AjustesUiState(
    val fabricaVersion: String? = null,
    val powerDbm: Int = 25,
    val beeperEnabled: Boolean = true,
    val erpUrl: String = "https://erp.alisson.api.br",
    val connected: Boolean = false,
    val deviceName: String? = null,
    val dispositivos: List<DispositivoBt> = emptyList(),
    val conectando: Boolean = false,
    val mockMode: Boolean = false,
)

class AjustesViewModel : ViewModel() {

    private val app = AlissonErpApp.instance
    private val tslManager = app.tslManager
    private val prefs = app.preferences

    private val _uiState = MutableStateFlow(AjustesUiState())
    val uiState: StateFlow<AjustesUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val power = prefs.tslPowerDbm.first()
            val beeper = prefs.tslBeeperEnabled.first()
            val url = prefs.erpBaseUrl.first()

            _uiState.value = _uiState.value.copy(
                powerDbm = power,
                beeperEnabled = beeper,
                erpUrl = url,
            )
            listarDispositivos()
        }

        viewModelScope.launch {
            tslManager.state.collect { tsl ->
                _uiState.value = _uiState.value.copy(
                    connected = tsl.connected,
                    deviceName = tsl.deviceName,
                    fabricaVersion = tsl.firmware,
                    conectando = false,
                )
            }
        }
    }

    fun listarDispositivos() {
        val devices = tslManager.getPairedDevices()
        _uiState.value = _uiState.value.copy(
            dispositivos = devices.map {
                DispositivoBt(nome = it.name ?: "Desconhecido", endereco = it.address)
            },
        )
    }

    fun conectar(endereco: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(conectando = true)
            val device = tslManager.getPairedDevices().find { it.address == endereco }
            if (device != null) {
                tslManager.disconnect()
                tslManager.connect(device)
            }
        }
    }

    fun onPowerChanged(dBm: Int) {
        val clamped = dBm.coerceIn(0, 30)
        _uiState.value = _uiState.value.copy(powerDbm = clamped)
        viewModelScope.launch {
            prefs.setTslPowerDbm(clamped)
            tslManager.setPower(clamped)
        }
    }

    fun onBeeperToggled(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(beeperEnabled = enabled)
        viewModelScope.launch {
            prefs.setTslBeeperEnabled(enabled)
            tslManager.setBeeper(enabled)
        }
    }

    fun onErpUrlChanged(url: String) {
        _uiState.value = _uiState.value.copy(erpUrl = url)
        viewModelScope.launch {
            prefs.setErpBaseUrl(url)
        }
    }

    fun reconectar() {
        viewModelScope.launch {
            tslManager.disconnect()
            delay(300)
            val devices = tslManager.getPairedDevices()
            if (devices.isNotEmpty()) {
                tslManager.connect(devices.first())
            }
        }
    }

    fun desconectar() {
        viewModelScope.launch {
            tslManager.disconnect()
        }
    }

    fun toggleMockMode(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(mockMode = enabled)
        tslManager.setMockMode(enabled)
    }
}
