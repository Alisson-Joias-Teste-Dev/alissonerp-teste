package br.com.alissonjoias.rfid.data.remote.dto

data class InventarioAppResponse(
    val inventarios: List<InventarioAppDto>,
)

data class InventarioAppDto(
    val id: Int,
    val local_estoque_id: Int,
    val local_nome: String,
    val categoria: String?,
    val status: String,
    val obs: String?,
    val data_abertura: String?,
    val total_itens: Int,
    val itens_contados: Int,
    val itens: List<ItemInventarioDto>,
)

data class ItemInventarioDto(
    val id: Int,
    val produto_id: Long,
    val sku: String,
    val nome: String,
    val quantidade_sistema: Int,
    val quantidade_contada: Int?,
    val conferido: Boolean,
)
