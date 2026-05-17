package br.com.alissonjoias.rfid.ui.inventario

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.alissonjoias.rfid.data.local.entity.InventarioCacheEntity
import br.com.alissonjoias.rfid.ui.components.InventarioCard
import br.com.alissonjoias.rfid.ui.theme.AzulPrimario
import br.com.alissonjoias.rfid.viewmodel.ListaInventarioViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListaInventarioScreen(
    onIniciarContagem: (Int) -> Unit,
    viewModel: ListaInventarioViewModel = viewModel(),
) {
    val uiState = viewModel.uiState.collectAsState().value
    val inventarios = viewModel.inventarios.collectAsState().value
    val snackbarHostState = remember { SnackbarHostState() }
    val pullRefreshState = rememberPullToRefreshState()

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.limparErro()
        }
    }

    if (pullRefreshState.isRefreshing) {
        LaunchedEffect(true) {
            viewModel.sincronizar()
            pullRefreshState.endRefresh()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Inventarios",
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = {
                    if (uiState.sincronizando) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(end = 16.dp),
                            strokeWidth = 2.dp,
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .nestedScroll(pullRefreshState.nestedScrollConnection),
        ) {
            if (inventarios.isEmpty() && !uiState.sincronizando) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = "Nenhum inventario disponivel",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Toque no botao abaixo ou puxe para baixo para sincronizar",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = viewModel::sincronizar,
                        colors = ButtonDefaults.buttonColors(containerColor = AzulPrimario),
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                        Spacer(modifier = Modifier.padding(4.dp))
                        Text("Sincronizar")
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (inventarios.isNotEmpty()) {
                        item {
                            Button(
                                onClick = viewModel::sincronizar,
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !uiState.sincronizando,
                                colors = ButtonDefaults.buttonColors(containerColor = AzulPrimario),
                            ) {
                                Icon(Icons.Default.Refresh, contentDescription = null)
                                Spacer(modifier = Modifier.padding(4.dp))
                                Text(
                                    if (uiState.sincronizando) "Sincronizando..."
                                    else "Sincronizar"
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                    }

                    val pendentes = inventarios.filter { it.syncStatus == "pendente" }
                    val contando = inventarios.filter { it.syncStatus == "contando" }
                    val concluidos = inventarios.filter { it.syncStatus == "concluido_local" }
                    val enviados = inventarios.filter { it.syncStatus == "enviado" }

                    if (pendentes.isNotEmpty()) {
                        item {
                            Text(
                                text = "Pendentes",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                        items(pendentes, key = { p -> p.id }) { inv ->
                            InventarioCard(
                                inventario = inv,
                                onAction = { onIniciarContagem(inv.id) },
                            )
                        }
                    }

                    if (contando.isNotEmpty()) {
                        item {
                            Text(
                                text = "Em contagem",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                        items(contando, key = { c -> c.id }) { inv ->
                            InventarioCard(
                                inventario = inv,
                                onAction = { onIniciarContagem(inv.id) },
                            )
                        }
                    }

                    if (concluidos.isNotEmpty()) {
                        item {
                            Text(
                                text = "Concluidos (nao enviados)",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                        items(concluidos, key = { cv -> cv.id }) { inv ->
                            InventarioCard(
                                inventario = inv,
                                onAction = { onIniciarContagem(inv.id) },
                            )
                        }
                    }

                    if (enviados.isNotEmpty()) {
                        item {
                            Text(
                                text = "Enviados",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = MaterialTheme.colorScheme.outline,
                                modifier = Modifier.padding(vertical = 4.dp),
                            )
                        }
                        items(enviados, key = { item -> item.id }) { inv ->
                            InventarioCard(
                                inventario = inv,
                                onAction = { },
                            )
                        }
                    }
                }
            }

            PullToRefreshContainer(
                state = pullRefreshState,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
    }
}
