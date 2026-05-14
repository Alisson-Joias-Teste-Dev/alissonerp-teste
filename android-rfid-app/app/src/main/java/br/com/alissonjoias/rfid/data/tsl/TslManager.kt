package br.com.alissonjoias.rfid.data.tsl

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

private const val TAG = "TslManager"
private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
private const val BAUD_RATE = 115200

class TslManager {

    private var socket: BluetoothSocket? = null
    private var inputStream: InputStream? = null
    private var outputStream: OutputStream? = null
    private var readerThread: Thread? = null
    private var running = false
    private var mockActive = false
    private var mockThread: Thread? = null
    private var mockScanning = false

    private val _state = MutableStateFlow(TslState())
    val state: StateFlow<TslState> = _state.asStateFlow()

    private val epcBuffer = mutableListOf<Pair<String, Int>>()
    private var _onEpcReceived: ((epc: String, rssi: Int) -> Unit)? = null
    private var _onFindProgress: ((rssi: Int) -> Unit)? = null

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
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket?.connect()

            inputStream = socket?.inputStream
            outputStream = socket?.outputStream

            startReaderThread()

            // Pegar versao do firmware
            val version = sendCommand(".vr")
            val firmware = version?.lines()?.firstOrNull { it.startsWith("VR:") }
                ?.removePrefix("VR:")?.trim()

            _state.value = TslState(
                connected = true,
                deviceName = device.name ?: "TSL 1128",
                firmware = firmware,
                powerDbm = _state.value.powerDbm,
                beeperEnabled = _state.value.beeperEnabled,
            )

            Log.d(TAG, "Conectado ao TSL: ${device.name}, FW: $firmware")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Falha na conexao: ${e.message}")
            socket?.close()
            socket = null
            _state.value = _state.value.copy(error = e.message)
            Result.failure(e)
        }
    }

    fun disconnect() {
        running = false
        readerThread?.interrupt()
        try {
            outputStream?.close()
            inputStream?.close()
            socket?.close()
        } catch (_: Exception) {}
        socket = null
        inputStream = null
        outputStream = null
        readerThread = null
        _state.value = TslState()
        Log.d(TAG, "Desconectado")
    }

    suspend fun setPower(dBm: Int): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val clamped = dBm.coerceIn(0, 30)
            sendCommandAsync(".sr $clamped")
            _state.value = _state.value.copy(powerDbm = clamped)
            Log.d(TAG, "Potencia: $clamped dBm (.sr)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao ajustar potencia: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun findTag(targetEpc: String, timeoutSec: Int = 30): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            stop()
            sendCommandAsync(".lg $targetEpc $timeoutSec")
            _state.value = _state.value.copy(scanning = true)
            Log.d(TAG, "Procurando: $targetEpc (.lg)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao procurar: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun setBeeper(enabled: Boolean): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            sendCommandAsync(if (enabled) ".bc 1" else ".bc 0")
            _state.value = _state.value.copy(beeperEnabled = enabled)
            Log.d(TAG, "Beeper: ${if (enabled) "ligado" else "desligado"} (.bc)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao ajustar beeper: ${e.message}")
            Result.failure(e)
        }
    }

    private suspend fun sendCommand(cmd: String): String? = withContext(Dispatchers.IO) {
        try {
            val out = outputStream ?: return@withContext null
            out.write("$cmd\r\n".toByteArray())
            out.flush()
            Log.d(TAG, "Enviado: $cmd")

            // Aguarda resposta (ate 500ms)
            val buffer = ByteArray(4096)
            Thread.sleep(200)
            val bytesRead = inputStream?.available()?.let { size ->
                if (size > 0) inputStream?.read(buffer, 0, minOf(size, buffer.size)) else null
            } ?: 0

            if (bytesRead > 0) {
                val response = String(buffer, 0, bytesRead, Charsets.US_ASCII)
                Log.d(TAG, "Resposta: $response")
                response
            } else null
        } catch (e: Exception) {
            Log.e(TAG, "Erro no comando '$cmd': ${e.message}")
            null
        }
    }

    private fun sendCommandAsync(cmd: String) {
        try {
            val out = outputStream ?: return
            out.write("$cmd\r\n".toByteArray())
            out.flush()
            Log.d(TAG, "Enviado async: $cmd")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar '$cmd': ${e.message}")
        }
    }

    private fun startReaderThread() {
        running = true
        readerThread = Thread({
            val buffer = ByteArray(8192)
            val sb = StringBuilder()

            while (running) {
                try {
                    val `is` = inputStream ?: break
                    val available = `is`.available()
                    if (available > 0) {
                        val count = `is`.read(buffer, 0, minOf(available, buffer.size))
                        if (count > 0) {
                            val data = String(buffer, 0, count, Charsets.US_ASCII)
                            sb.append(data)

                            processBuffer(sb)
                        }
                    } else {
                        Thread.sleep(50)
                    }
                } catch (e: InterruptedException) {
                    break
                } catch (e: Exception) {
                    if (running) {
                        Log.e(TAG, "Erro na leitura: ${e.message}")
                        _state.value = _state.value.copy(error = e.message)
                    }
                    break
                }
            }
        })
        readerThread?.start()
    }

    private fun processBuffer(sb: StringBuilder) {
        val content = sb.toString()
        val lines = content.split("\r\n", "\n", "\r")

        sb.clear()

        // Se sobrou um fragmento, guarda para a proxima leitura
        if (!content.endsWith("\n") && lines.isNotEmpty()) {
            sb.append(lines.last())
        }

        for (line in lines) {
            when {
                line.startsWith("EP:") -> handleEpcLine(line)
                line.startsWith("IV:") -> handleInventoryLine(line)
                line.startsWith("VR:") -> handleVersionLine(line)
                line.startsWith("ER:") -> Log.w(TAG, "ERRO LEITOR: $line")
                line.startsWith("LG:") -> { /* localizacao em andamento */ }
            }
        }
    }

    private fun handleEpcLine(line: String) {
        val epcHex = line.removePrefix("EP:").trim()
        if (epcHex.isEmpty()) return

        val epcDecoded = hexToAscii(epcHex) ?: epcHex
        val rssiPos = epcHex.indexOf("RSSI:")
        var rssi = 0
        var cleanEpc = epcDecoded

        if (rssiPos >= 0) {
            val rssiStr = epcHex.substring(rssiPos + 5).trim().split(" ").firstOrNull()
            rssi = rssiStr?.toIntOrNull() ?: 0
            cleanEpc = epcDecoded.substringBefore("RSSI").trim()
        }

        Log.d(TAG, "EPC: $cleanEpc, RSSI: $rssi")
        _onEpcReceived?.invoke(cleanEpc, rssi)
        _onFindProgress?.invoke(rssi)
    }

    private fun handleInventoryLine(line: String) {
        if (line.contains("OK")) {
            _state.value = _state.value.copy(scanning = true)
        }
    }

    private fun handleVersionLine(line: String) {
        val fw = line.removePrefix("VR:").trim()
        _state.value = _state.value.copy(firmware = fw)
    }

    fun setMockMode(enabled: Boolean) {
        mockActive = enabled
        if (enabled) {
            _state.value = TslState(connected = true, deviceName = "MOCK TSL", firmware = "mock-v1.0")
            Log.d(TAG, "Modo simulação ATIVADO")
        } else {
            if (!socket?.isConnected!!) {
                _state.value = TslState()
            }
            Log.d(TAG, "Modo simulação DESATIVADO")
        }
    }

    suspend fun startInventory(): Result<Unit> = withContext(Dispatchers.IO) {
        if (mockActive) {
            mockScanning = true
            _state.value = _state.value.copy(scanning = true, error = null)
            startMockReading()
            return@withContext Result.success(Unit)
        }
        try {
            sendCommandAsync(".iv")
            _state.value = _state.value.copy(scanning = true, error = null)
            Log.d(TAG, "Inventario iniciado (.iv)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar: ${e.message}")
            _state.value = _state.value.copy(error = e.message)
            Result.failure(e)
        }
    }

    suspend fun stop(): Result<Unit> = withContext(Dispatchers.IO) {
        if (mockActive) {
            mockScanning = false
            mockThread?.interrupt()
            mockThread = null
            _state.value = _state.value.copy(scanning = false, error = null)
            return@withContext Result.success(Unit)
        }
        try {
            sendCommandAsync(".")
            _state.value = _state.value.copy(scanning = false, error = null)
            Log.d(TAG, "Leitura parada (.)")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao parar: ${e.message}")
            Result.failure(e)
        }
    }

    private fun startMockReading() {
        mockThread?.interrupt()
        mockThread = Thread({
            val epcs = listOf(
                "AJ250000001", "AJ250000042", "AJ250000087",
                "AJ250000123", "AJ250000456", "AJ250000789",
            )
            var index = 0
            while (mockScanning) {
                try {
                    val epc = epcs[index % epcs.size]
                    val rssi = -60 + (index % 40)
                    index++
                    Log.d(TAG, "[MOCK] EPC: $epc, RSSI: $rssi")
                    _onEpcReceived?.invoke(epc, rssi)
                    Thread.sleep(2000)
                } catch (e: InterruptedException) {
                    break
                } catch (_: Exception) { break }
            }
        })
        mockThread?.start()
    }

    companion object {
        private fun hexToAscii(hex: String): String? {
            return try {
                val input = hex.replace(" ", "")
                if (input.length % 2 != 0) return null
                val bytes = input.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
                String(bytes, Charsets.US_ASCII).trim()
            } catch (_: Exception) { null }
        }
    }
}
