package br.com.alissonjoias.rfid.data.remote.dto

data class FinalizarResponse(
    val ok: Boolean,
    val inventario_id: Int?,
    val mensagem: String?,
    val error: String?,
)
