package br.com.alissonjoias.rfid

import android.app.Application
import br.com.alissonjoias.rfid.data.local.AppDatabase
import br.com.alissonjoias.rfid.data.local.AppPreferences
import br.com.alissonjoias.rfid.data.remote.ErpApi
import br.com.alissonjoias.rfid.data.tsl.TslManager

class AlissonErpApp : Application() {

    lateinit var database: AppDatabase
        private set
    lateinit var preferences: AppPreferences
        private set
    lateinit var erpApi: ErpApi
        private set
    lateinit var tslManager: TslManager
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        database = AppDatabase.getInstance(this)
        preferences = AppPreferences.getInstance(this)
        erpApi = ErpApi.create()
        tslManager = TslManager(this)
    }

    companion object {
        lateinit var instance: AlissonErpApp
            private set
    }
}
