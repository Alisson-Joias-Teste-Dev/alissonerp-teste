package br.com.alissonjoias.rfid.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "epcs_cache",
    foreignKeys = [
        ForeignKey(
            entity = InventarioCacheEntity::class,
            parentColumns = ["id"],
            childColumns = ["inventarioId"],
            onDelete = ForeignKey.CASCADE,
        )
    ],
    indices = [Index("inventarioId"), Index("epc")]
)
data class EpcCacheEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val inventarioId: Int,
    val epc: String,
    val produtoId: Long? = null,
    val rssi: Int? = null,
    val lidoEm: Long = System.currentTimeMillis(),
)
