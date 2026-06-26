package br.com.alissonjoias.rfid.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "app_preferences")

class AppPreferences(private val context: Context) {

    companion object {
        @Volatile
        private var INSTANCE: AppPreferences? = null

        fun getInstance(context: Context): AppPreferences {
            return INSTANCE ?: synchronized(this) {
                AppPreferences(context.applicationContext).also { INSTANCE = it }
            }
        }

        private val ERP_BASE_URL = stringPreferencesKey("erp_base_url")
        private val TSL_POWER_DBM = intPreferencesKey("tsl_power_dbm")
        private val TSL_BEEPER_ENABLED = booleanPreferencesKey("tsl_beeper_enabled")
    }

    val erpBaseUrl: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[ERP_BASE_URL] ?: "https://erp.alisson.api.br"
    }

    val tslPowerDbm: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[TSL_POWER_DBM] ?: 25
    }

    val tslBeeperEnabled: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[TSL_BEEPER_ENABLED] ?: true
    }

    suspend fun setErpBaseUrl(url: String) {
        context.dataStore.edit { it[ERP_BASE_URL] = url }
    }

    suspend fun setTslPowerDbm(power: Int) {
        context.dataStore.edit { it[TSL_POWER_DBM] = power.coerceIn(0, 30) }
    }

    suspend fun setTslBeeperEnabled(enabled: Boolean) {
        context.dataStore.edit { it[TSL_BEEPER_ENABLED] = enabled }
    }
}
