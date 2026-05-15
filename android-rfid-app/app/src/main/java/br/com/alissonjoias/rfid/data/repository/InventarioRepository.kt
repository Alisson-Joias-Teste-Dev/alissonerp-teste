package br.com.alissonjoias.rfid.data.repository

import br.com.alissonjoias.rfid.AlissonErpApp
import br.com.alissonjoias.rfid.data.local.dao.EpcCacheDao
import br.com.alissonjoias.rfid.data.local.dao.InventarioCacheDao
import br.com.alissonjoias.rfid.data.local.entity.EpcCacheEntity
import br.com.alissonjoias.rfid.data.local.entity.InventarioCacheEntity
import br.com.alissonjoias.rfid.data.local.entity.ItemInventarioCacheEntity
import br.com.alissonjoias.rfid.data.remote.dto.ContagemDto
import br.com.alissonjoias.rfid.data.remote.dto.FinalizarRequest
import br.com.alissonjoias.rfid.data.tsl.TslManager
import kotlinx.coroutines.flow.Flow
import retrofit2.HttpException
import java.io.IOException

class InventarioRepository(
    private val inventarioDao: InventarioCacheDao,
    private val epcDao: EpcCacheDao,
    private val tslManager: TslManager,
) {
    private val erpApi = AlissonErpApp.instance.erpApi

    val inventarios: Flow<List<InventarioCacheEntity>> = inventarioDao.getAllInventarios()

    fun getItens(inventarioId: Int): Flow<List<ItemInventarioCacheEntity>> =
        inventarioDao.getItensByInventarioId(inventarioId)

    fun getEpcs(inventarioId: Int): Flow<List<EpcCacheEntity>> =
        epcDao.getEpcsByInventarioId(inventarioId)

    fun countEpcs(inventarioId: Int): Flow<Int> =
        epcDao.countDistinctEpcs(inventarioId)

    suspend fun sincronizarInventarios(): Result<Int> {
        return try {
            val response = erpApi.listarInventariosApp()
            val inventarios = response.inventarios

            inventarioDao.clearAll()

            val entities = inventarios.map { inv ->
                InventarioCacheEntity(
                    id = inv.id,
                    localEstoqueId = inv.local_estoque_id,
                    localNome = inv.local_nome,
                    categoria = inv.categoria,
                    status = inv.status,
                    dataAbertura = inv.data_abertura,
                    totalItens = inv.total_itens,
                    itensContados = inv.itens_contados,
                    syncStatus = if (inv.itens_contados > 0) "contando" else "pendente",
                )
            }
            inventarioDao.insertInventarios(entities)

            val allItens = inventarios.flatMap { inv ->
                inv.itens.map { item ->
                    ItemInventarioCacheEntity(
                        id = item.id,
                        inventarioId = inv.id,
                        produtoId = item.produto_id,
                        sku = item.sku,
                        nome = item.nome,
                        quantidadeSistema = item.quantidade_sistema,
                        quantidadeContada = item.quantidade_contada,
                        conferido = item.conferido,
                    )
                }
            }
            inventarioDao.insertItens(allItens)

            Result.success(inventarios.size)
        } catch (e: Exception) {
            val msg = when (e) {
                is HttpException -> {
                    val body = e.response()?.errorBody()?.string() ?: "HTTP ${e.code()}"
                    "Erro do servidor: $body"
                }
                is IOException -> "Erro de rede: ${e.message}"
                else -> e.message ?: "Erro desconhecido"
            }
            Result.failure(Exception(msg))
        }
    }

    suspend fun registrarLeitura(inventarioId: Int, epc: String, rssi: Int) {
        epcDao.insertEpcs(
            listOf(
                EpcCacheEntity(
                    inventarioId = inventarioId,
                    epc = epc,
                    rssi = rssi,
                )
            )
        )
    }

    suspend fun limparLeituras(inventarioId: Int) {
        epcDao.clearByInventarioId(inventarioId)
    }

    suspend fun enviarParaSistema(
        inventarioId: Int,
        itens: List<ItemInventarioCacheEntity>,
        epcs: List<String>,
    ): Result<Unit> {
        return try {
            val contagens = itens
                .filter { it.quantidadeContada != null }
                .map {
                    ContagemDto(
                        item_id = it.id,
                        produto_id = it.produtoId,
                        quantidade_contada = it.quantidadeContada ?: 0,
                    )
                }

            val request = FinalizarRequest(
                leituras = epcs,
                contagens = contagens,
            )

            val response = erpApi.finalizarInventario(inventarioId, request)
            if (response.ok) {
                inventarioDao.updateSyncStatus(inventarioId, "enviado")
                Result.success(Unit)
            } else {
                Result.failure(Exception(response.error ?: "Erro ao enviar"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun syncStatus(inventarioId: Int, status: String) {
        inventarioDao.updateSyncStatus(inventarioId, status)
    }

    suspend fun getEpcsSync(inventarioId: Int): List<String> {
        val epcs = epcDao.getEpcsByInventarioIdSync(inventarioId)
        return epcs.map { it.epc }.distinct()
    }

    suspend fun getItensSync(inventarioId: Int): List<ItemInventarioCacheEntity> {
        return inventarioDao.getItensByInventarioIdSync(inventarioId)
    }
}

fun calcularResultados(itens: List<ItemInventarioCacheEntity>): ResultadoCalculado {
    var ok = 0
    var faltando = 0
    var excesso = 0

    for (item in itens) {
        val lido = item.quantidadeContada ?: 0
        val esperado = item.quantidadeSistema
        when {
            lido > esperado -> excesso++
            lido < esperado -> faltando++
            else -> ok++
        }
    }

    return ResultadoCalculado(ok = ok, faltando = faltando, excesso = excesso)
}

data class ResultadoCalculado(
    val ok: Int,
    val faltando: Int,
    val excesso: Int,
) {
    val total: Int get() = ok + faltando + excesso
}

enum class StatusItem {
    OK, FALTANDO, EXCESSO;

    companion object {
        fun from(lido: Int, esperado: Int): StatusItem = when {
            lido > esperado -> EXCESSO
            lido < esperado -> FALTANDO
            else -> OK
        }
    }
}
