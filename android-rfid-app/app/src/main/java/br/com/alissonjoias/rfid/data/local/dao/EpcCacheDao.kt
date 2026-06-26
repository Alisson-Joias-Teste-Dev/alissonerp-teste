package br.com.alissonjoias.rfid.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import br.com.alissonjoias.rfid.data.local.entity.EpcCacheEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface EpcCacheDao {

    @Query("SELECT * FROM epcs_cache WHERE inventarioId = :inventarioId ORDER BY lidoEm DESC")
    fun getEpcsByInventarioId(inventarioId: Int): Flow<List<EpcCacheEntity>>

    @Query("SELECT * FROM epcs_cache WHERE inventarioId = :inventarioId ORDER BY lidoEm DESC")
    suspend fun getEpcsByInventarioIdSync(inventarioId: Int): List<EpcCacheEntity>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertEpcs(epcs: List<EpcCacheEntity>): List<Long>

    @Query("SELECT COUNT(DISTINCT epc) FROM epcs_cache WHERE inventarioId = :inventarioId")
    fun countDistinctEpcs(inventarioId: Int): Flow<Int>

    @Query("DELETE FROM epcs_cache WHERE inventarioId = :inventarioId")
    suspend fun clearByInventarioId(inventarioId: Int)

    @Query("""
        SELECT epc FROM epcs_cache 
        WHERE inventarioId = :inventarioId 
        AND lidoEm > :sinceMs 
        GROUP BY epc
    """)
    suspend fun getNewEpcsSince(inventarioId: Int, sinceMs: Long): List<String>
}
