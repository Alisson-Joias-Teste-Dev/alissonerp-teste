package br.com.alissonjoias.rfid.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "inventarios_cache")
data class InventarioCacheEntity(
    @PrimaryKey val id: Int,
    val localEstoqueId: Int,
    val localNome: String,
    val categoria: String?,
    val status: String,
    val dataAbertura: String?,
    val totalItens: Int,
    val itensContados: Int,
    val syncStatus: String = "pendente",
)
