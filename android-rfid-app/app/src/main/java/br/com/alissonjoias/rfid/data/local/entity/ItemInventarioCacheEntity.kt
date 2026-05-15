package br.com.alissonjoias.rfid.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "itens_inventario_cache",
    foreignKeys = [
        ForeignKey(
            entity = InventarioCacheEntity::class,
            parentColumns = ["id"],
            childColumns = ["inventarioId"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
    indices = [Index("inventarioId")]
)
data class ItemInventarioCacheEntity(
    @PrimaryKey val id: Int,
    val inventarioId: Int,
    val produtoId: Long,
    val sku: String,
    val nome: String,
    val quantidadeSistema: Int,
    var quantidadeContada: Int?,
    val conferido: Boolean = false,
)
