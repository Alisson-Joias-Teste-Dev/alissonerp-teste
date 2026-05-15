package br.com.alissonjoias.rfid.data.remote

import okhttp3.Interceptor
import okhttp3.Response

class HostOverrideInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val request = original.newBuilder()
            .header("Host", "erp.alisson.api.br")
            .build()
        return chain.proceed(request)
    }
}
