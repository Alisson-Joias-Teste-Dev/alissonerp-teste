package br.com.alissonjoias.rfid.nav

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Inventory
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import br.com.alissonjoias.rfid.auth.SupabaseAuth
import br.com.alissonjoias.rfid.ui.inventario.AjustesScreen
import br.com.alissonjoias.rfid.ui.inventario.ContagemScreen
import br.com.alissonjoias.rfid.ui.inventario.ListaInventarioScreen
import br.com.alissonjoias.rfid.ui.inventario.ProcurarScreen
import br.com.alissonjoias.rfid.ui.inventario.ResultadoScreen
import br.com.alissonjoias.rfid.ui.login.LoginScreen
import br.com.alissonjoias.rfid.viewmodel.ContagemViewModel
import br.com.alissonjoias.rfid.viewmodel.ResultadoViewModel

sealed class Screen(val route: String, val title: String = "") {
    data object Login : Screen("login")
    data object InventarioLista : Screen("inventario_lista", "Inventarios")
    data object Contagem : Screen("contagem/{id}") {
        fun createRoute(id: Int) = "contagem/$id"
    }
    data object Resultado : Screen("resultado/{id}") {
        fun createRoute(id: Int) = "resultado/$id"
    }
    data object Procurar : Screen("procurar", "Procurar")
    data object Ajustes : Screen("ajustes", "Ajustes")
}

data class BottomNavItem(
    val screen: Screen,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
)

private val bottomItems = listOf(
    BottomNavItem(Screen.InventarioLista, Icons.Filled.Inventory, Icons.Outlined.Inventory),
    BottomNavItem(Screen.Procurar, Icons.Filled.Search, Icons.Outlined.Search),
    BottomNavItem(Screen.Ajustes, Icons.Filled.Settings, Icons.Outlined.Settings),
)

@Composable
fun NavGraph() {
    val navController = rememberNavController()

    val isLoggedIn by SupabaseAuth.authState.collectAsState()
    val startDest = if (isLoggedIn.isLoggedIn) Screen.InventarioLista.route else Screen.Login.route

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val showBottomBar = bottomItems.any { item ->
        currentDestination?.hierarchy?.any { it.route == item.screen.route } == true
    }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomItems.forEach { item ->
                        val selected = currentDestination?.hierarchy?.any {
                            it.route == item.screen.route
                        } == true

                        NavigationBarItem(
                            icon = {
                                Icon(
                                    imageVector = if (selected) item.selectedIcon else item.unselectedIcon,
                                    contentDescription = item.screen.title,
                                )
                            },
                            label = { Text(item.screen.title) },
                            selected = selected,
                            onClick = {
                                navController.navigate(item.screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = startDest,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Screen.Login.route) {
                SupabaseAuth.restoreSession()
                LoginScreen(
                    onLoginSuccess = {
                        navController.navigate(Screen.InventarioLista.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                )
            }

            composable(Screen.InventarioLista.route) {
                ListaInventarioScreen(
                    onIniciarContagem = { id ->
                        navController.navigate(Screen.Contagem.createRoute(id))
                    },
                )
            }

            composable(Screen.Procurar.route) {
                ProcurarScreen()
            }

            composable(Screen.Ajustes.route) {
                AjustesScreen()
            }

            composable(
                route = Screen.Contagem.route,
                arguments = listOf(navArgument("id") { type = NavType.IntType }),
            ) { entry ->
                val id = entry.arguments?.getInt("id") ?: return@composable
                val vm: ContagemViewModel = viewModel(factory = ContagemViewModel.Factory(id))
                ContagemScreen(
                    viewModel = vm,
                    onBack = { navController.popBackStack() },
                    onResultado = { ivid ->
                        navController.navigate(Screen.Resultado.createRoute(ivid))
                    },
                )
            }

            composable(
                route = Screen.Resultado.route,
                arguments = listOf(navArgument("id") { type = NavType.IntType }),
            ) { entry ->
                val id = entry.arguments?.getInt("id") ?: return@composable
                val vm: ResultadoViewModel = viewModel(factory = ResultadoViewModel.Factory(id))
                ResultadoScreen(
                    viewModel = vm,
                    onBack = { navController.popBackStack() },
                    onEnviado = {
                        navController.navigate(Screen.InventarioLista.route) {
                            popUpTo(0) { inclusive = false }
                        }
                    },
                )
            }
        }
    }
}
