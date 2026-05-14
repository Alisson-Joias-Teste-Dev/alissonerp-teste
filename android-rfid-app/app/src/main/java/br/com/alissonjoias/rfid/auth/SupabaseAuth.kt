package br.com.alissonjoias.rfid.auth

import android.util.Log
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.providers.builtin.Email
import br.com.alissonjoias.rfid.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class AuthState(
    val isLoggedIn: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
    val accessToken: String? = null,
    val email: String? = null,
)

object SupabaseAuth {
    private val TAG = "SupabaseAuth"

    private val client: SupabaseClient = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY
    ) {
        install(Auth)
    }

    private val _authState = MutableStateFlow(AuthState())
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    suspend fun signIn(email: String, password: String): Result<String> {
        _authState.value = _authState.value.copy(isLoading = true, error = null)
        return try {
            val session = client.auth.signInWith(Email) {
                this.email = email
                this.password = password
            }
            val token = session.accessToken
            _authState.value = _authState.value.copy(
                isLoggedIn = true,
                isLoading = false,
                accessToken = token,
                email = email,
            )
            Log.d(TAG, "Login bem-sucedido: $email")
            Result.success(token)
        } catch (e: Exception) {
            Log.e(TAG, "Erro no login: ${e.message}")
            _authState.value = _authState.value.copy(
                isLoading = false,
                error = e.message ?: "Erro desconhecido no login"
            )
            Result.failure(e)
        }
    }

    fun getAccessToken(): String? = _authState.value.accessToken
        ?: runCatching { client.auth.currentSessionOrNull()?.accessToken }.getOrNull()

    suspend fun signOut() {
        try {
            client.auth.signOut()
        } catch (_: Exception) {}
        _authState.value = AuthState()
    }

    fun restoreSession(): Boolean {
        return try {
            val session = client.auth.currentSessionOrNull()
            if (session != null) {
                _authState.value = AuthState(
                    isLoggedIn = true,
                    accessToken = session.accessToken,
                    email = session.user?.email,
                )
                true
            } else false
        } catch (_: Exception) {
            false
        }
    }
}
