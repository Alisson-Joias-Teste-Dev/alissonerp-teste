package br.com.alissonjoias.rfid.data.tsl

data class TslState(
    val connected: Boolean = false,
    val deviceName: String? = null,
    val scanning: Boolean = false,
    val firmware: String? = null,
    val powerDbm: Int = 25,
    val beeperEnabled: Boolean = true,
    val error: String? = null,
    val batteryLevel: Int? = null,
)
