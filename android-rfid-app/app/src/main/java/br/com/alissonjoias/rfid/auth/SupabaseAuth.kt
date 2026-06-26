package br.com.alissonjoias.rfid.auth

import android.util.Log
import br.com.alissonjoias.rfid.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

data class AuthState(
    val isLoggedIn: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
    val accessToken: String? = null,
    val email: String? = null,
)

object SupabaseAuth {
    private val TAG = "SupabaseAuth"

    private val _authState = MutableStateFlow(AuthState())
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    suspend fun signIn(email: String, password: String): Result<String> {
        _authState.value = _authState.value.copy(isLoading = true, error = null)
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=password")
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 15_000
                conn.readTimeout = 15_000
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
                conn.doOutput = true

                val body = """{"email":"$email","password":"$password"}"""
                conn.outputStream.write(body.toByteArray())

                val code = conn.responseCode
                val response = if (code in 200..299) {
                    conn.inputStream.bufferedReader().readText()
                } else {
                    conn.errorStream?.bufferedReader()?.readText() ?: "{\"error\":\"$code\"}"
                }
                conn.disconnect()

                if (code in 200..299) {
                    val json = org.json.JSONObject(response)
                    val token = json.getString("access_token")
                    val userEmail = json.optString("email", email)

                    _authState.value = AuthState(
                        isLoggedIn = true,
                        isLoading = false,
                        accessToken = token,
                        email = userEmail,
                    )
                    Log.d(TAG, "Login OK: $userEmail")
                    Result.success(token)
                } else {
                    val msg = try {
                        val json = org.json.JSONObject(response)
                        json.optString("msg", json.optString("error_description", "Erro no login"))
                    } catch (_: Exception) { "Erro no login (código $code)" }
                    Log.e(TAG, "Login falhou: $msg")
                    _authState.value = _authState.value.copy(isLoading = false, error = msg)
                    Result.failure(Exception(msg))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro no login: ${e.message}")
                _authState.value = _authState.value.copy(isLoading = false, error = e.message)
                Result.failure(e)
            }
        }
    }

    fun getAccessToken(): String? = _authState.value.accessToken

    suspend fun signOut() {
        _authState.value = AuthState()
    }

    fun restoreSession(): Boolean {
        return _authState.value.isLoggedIn
    }
}
