package br.com.alissonjoias.rfid.data.remote.dto

data class FinalizarRequest(
    val leituras: List<String>,
    val contagens: List<ContagemDto>,
    val leitor_id: String = "TSL-1128-ANDROID",
)

data class ContagemDto(
    val item_id: Int,
    val produto_id: Long,
    val quantidade_contada: Int,
)
