package br.com.alissonjoias.rfid.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import br.com.alissonjoias.rfid.data.local.dao.EpcCacheDao
import br.com.alissonjoias.rfid.data.local.dao.InventarioCacheDao
import br.com.alissonjoias.rfid.data.local.entity.EpcCacheEntity
import br.com.alissonjoias.rfid.data.local.entity.InventarioCacheEntity
import br.com.alissonjoias.rfid.data.local.entity.ItemInventarioCacheEntity

@Database(
    entities = [
        InventarioCacheEntity::class,
        ItemInventarioCacheEntity::class,
        EpcCacheEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun inventarioCacheDao(): InventarioCacheDao
    abstract fun epcCacheDao(): EpcCacheDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "alisson_rfid_cache.db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
