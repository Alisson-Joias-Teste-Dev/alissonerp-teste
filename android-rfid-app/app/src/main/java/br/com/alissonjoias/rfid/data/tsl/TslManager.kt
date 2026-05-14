package br.com.alissonjoias.rfid.data.tsl

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.util.Log
import com.uk.tsl.rfid.ascii.AsciiProtocol
import com.uk.tsl.rfid.ascii.AsciiProtocolBase
import com.uk.tsl.rfid.ascii.TransponderReceivedDelegate
import com.uk.tsl.utils.HexString
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

class TslManager(private val context: Context) {

    private val TAG = "TslManager"

    private var reader: AsciiProtocolBase? = null
    private var bluetoothDevice: BluetoothDevice? = null

    private val _state = MutableStateFlow(TslState())
    val state: StateFlow<TslState> = _state.asStateFlow()

    private var _onEpcReceived: ((epc: String, rssi: Int) -> Unit)? = null
    private var _onFindProgress: ((rssi: Int) -> Unit)? = null

    private val transponderDelegate = TransponderReceivedDelegate { epc, crc, rssi, _ ->
        val epcStr = HexString.hexToStr(epc) ?: epc
        Log.d(TAG, "EPC recebido: $epcStr, RSSI: $rssi")
        _onEpcReceived?.invoke(epcStr, rssi ?: 0)
        _onFindProgress?.invoke(rssi ?: 0)
    }

    fun onEpcReceived(callback: (epc: String, rssi: Int) -> Unit) {
        _onEpcReceived = callback
    }

    fun onFindProgress(callback: (rssi: Int) -> Unit) {
        _onFindProgress = callback
    }

    fun getPairedDevices(): List<BluetoothDevice> {
        return BluetoothAdapter.getDefaultAdapter()
            ?.bondedDevices
            ?.filter { it.name?.contains("TSL", ignoreCase = true) == true }
            ?.toList() ?: emptyList()
    }

    suspend fun connect(device: BluetoothDevice): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            bluetoothDevice = device
            reader = AsciiProtocol()
            reader?.connect(device)

            val version = reader?.commandVersion()
            val firmware = version?.rawData?.lines()
                ?.firstOrNull { it.startsWith("VR:") }
                ?.removePrefix("VR:")
                ?.trim()

            _state.value = TslState(
                connected = true,
                deviceName = device.name ?: "TSL 1128",
                firmware = firmware,
                powerDbm = _state.value.powerDbm,
                beeperEnabled = _state.value.beeperEnabled,
            )

            reader?.transponderReceivedDelegate = transponderDelegate

            applyPower(_state.value.powerDbm)
            applyBeeper(_state.value.beeperEnabled)

            Log.d(TAG, "Conectado ao TSL: ${device.name}, FW: $firmware")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Falha na conexao: ${e.message}")
            _state.value = _state.value.copy(error = e.message)
            Result.failure(e)
        }
    }

    fun disconnect() {
        try {
            reader?.transponderReceivedDelegate = null
            reader?.disconnect()
        } catch (_: Exception) {}
        reader = null
        bluetoothDevice = null
        _state.value = TslState()
    }

    suspend fun startInventory(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            reader?.commandInventory()
            _state.value = _state.value.copy(scanning = true, error = null)
            Log.d(TAG, "Inventario iniciado (.iv)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar leitura: ${e.message}")
            _state.value = _state.value.copy(error = e.message)
            Result.failure(e)
        }
    }

    suspend fun stop(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            reader?.commandAbort()
            _state.value = _state.value.copy(scanning = false, error = null)
            Log.d(TAG, "Leitura parada (.)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao parar: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun setPower(dBm: Int): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val clamped = dBm.coerceIn(0, 30)
            reader?.commandSetReadPower(clamped)
            _state.value = _state.value.copy(powerDbm = clamped)
            Log.d(TAG, "Potencia ajustada: $clamped dBm (.sr)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao ajustar potencia: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun findTag(targetEpc: String, timeoutSec: Int = 30): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            reader?.commandAbort()
            reader?.commandLocateTag(targetEpc, timeoutSec)
            _state.value = _state.value.copy(scanning = true)
            Log.d(TAG, "Procurando etiqueta: $targetEpc (.lg)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao procurar: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun setBeeper(enabled: Boolean): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            reader?.commandAlert(if (enabled) 1 else 0)
            _state.value = _state.value.copy(beeperEnabled = enabled)
            Log.d(TAG, "Beeper: ${if (enabled) "ligado" else "desligado"} (.bc)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao ajustar beeper: ${e.message}")
            Result.failure(e)
        }
    }

    private suspend fun applyPower(dBm: Int) {
        try {
            reader?.commandSetReadPower(dBm.coerceIn(0, 30))
        } catch (_: Exception) {}
    }

    private suspend fun applyBeeper(enabled: Boolean) {
        try {
            reader?.commandAlert(if (enabled) 1 else 0)
        } catch (_: Exception) {}
    }
}
