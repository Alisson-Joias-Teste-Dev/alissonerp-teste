package br.com.alissonjoias.rfid.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import br.com.alissonjoias.rfid.data.local.entity.InventarioCacheEntity
import br.com.alissonjoias.rfid.data.local.entity.ItemInventarioCacheEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface InventarioCacheDao {

    @Query("SELECT * FROM inventarios_cache ORDER BY syncStatus ASC, id DESC")
    fun getAllInventarios(): Flow<List<InventarioCacheEntity>>

    @Query("SELECT * FROM inventarios_cache WHERE id = :id")
    suspend fun getInventarioById(id: Int): InventarioCacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertInventarios(inventarios: List<InventarioCacheEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertItens(itens: List<ItemInventarioCacheEntity>)

    @Query("SELECT * FROM itens_inventario_cache WHERE inventarioId = :inventarioId ORDER BY id")
    fun getItensByInventarioId(inventarioId: Int): Flow<List<ItemInventarioCacheEntity>>

    @Query("SELECT * FROM itens_inventario_cache WHERE inventarioId = :inventarioId")
    suspend fun getItensByInventarioIdSync(inventarioId: Int): List<ItemInventarioCacheEntity>

    @Query("""
        UPDATE itens_inventario_cache 
        SET quantidadeContada = :quantidade, conferido = 1 
        WHERE produtoId = :produtoId AND inventarioId = :inventarioId
    """)
    suspend fun updateQuantidadeContada(inventarioId: Int, produtoId: Long, quantidade: Int)

    @Query("UPDATE inventarios_cache SET syncStatus = :status WHERE id = :id")
    suspend fun updateSyncStatus(id: Int, status: String)

    @Query("DELETE FROM inventarios_cache")
    suspend fun clearAll()
}
