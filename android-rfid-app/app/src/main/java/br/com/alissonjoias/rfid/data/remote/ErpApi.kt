package br.com.alissonjoias.rfid.data.remote

import br.com.alissonjoias.rfid.BuildConfig
import br.com.alissonjoias.rfid.data.remote.dto.FinalizarRequest
import br.com.alissonjoias.rfid.data.remote.dto.FinalizarResponse
import br.com.alissonjoias.rfid.data.remote.dto.InventarioAppResponse
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import java.util.concurrent.TimeUnit

interface ErpApi {

    @GET("api/estoque-comercial/inventario/app")
    suspend fun listarInventariosApp(): InventarioAppResponse

    @POST("api/estoque-comercial/inventario/{id}/finalizar")
    suspend fun finalizarInventario(
        @Path("id") id: Int,
        @Body body: FinalizarRequest,
    ): FinalizarResponse

    companion object {
        fun create(): ErpApi {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val client = OkHttpClient.Builder()
                .addInterceptor(AuthInterceptor())
                .addInterceptor(logging)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .build()

            val retrofit = Retrofit.Builder()
                .baseUrl(BuildConfig.ERP_BASE_URL + "/")
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()

            return retrofit.create(ErpApi::class.java)
        }
    }
}
