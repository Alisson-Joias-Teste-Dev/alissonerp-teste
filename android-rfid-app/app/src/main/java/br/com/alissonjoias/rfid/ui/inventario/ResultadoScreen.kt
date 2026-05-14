package br.com.alissonjoias.rfid.ui.inventario

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.alissonjoias.rfid.data.repository.StatusItem
import br.com.alissonjoias.rfid.ui.components.DivergenciaBadge
import br.com.alissonjoias.rfid.ui.theme.AzulPrimario
import br.com.alissonjoias.rfid.ui.theme.BlueExcesso
import br.com.alissonjoias.rfid.ui.theme.GreenOk
import br.com.alissonjoias.rfid.ui.theme.RedFaltando
import br.com.alissonjoias.rfid.viewmodel.ResumoDivergencias
import br.com.alissonjoias.rfid.viewmodel.ResultadoViewModel
import br.com.alissonjoias.rfid.viewmodel.ResultadoUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultadoScreen(
    onBack: () -> Unit,
    onEnviado: () -> Unit,
    viewModel: ResultadoViewModel,
) {
    val state = viewModel.uiState.collectAsState().value
    val resumo = viewModel.resumo.collectAsState().value
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.erro) {
        state.erro?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.limparErro()
        }
    }

    LaunchedEffect(state.enviado) {
        if (state.enviado) {
            snackbarHostState.showSnackbar("Inventario enviado com sucesso!")
            onEnviado()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Resultado #${state.inventario?.id ?: ""}",
                        fontWeight = FontWeight.Bold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Voltar")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
        ) {
            ResumoCard(resumo = resumo)

            Spacer(modifier = Modifier.height(16.dp))

            if (state.totalEpcs > 0) {
                Button(
                    onClick = viewModel::enviarParaSistema,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.enviando,
                    colors = ButtonDefaults.buttonColors(containerColor = AzulPrimario),
                ) {
                    if (state.enviando) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(end = 8.dp),
                            strokeWidth = 2.dp,
                            color = Color.White,
                        )
                    }
                    Text(
                        if (state.enviando) "Enviando..." else "Enviar para o sistema"
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Itens",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(state.itensResultado) { item ->
                    ItemResultadoRow(
                        sku = item.item.sku,
                        nome = item.item.nome,
                        esperado = item.item.quantidadeSistema,
                        lido = item.lido,
                        status = item.status,
                    )
                }
            }
        }
    }
}

@Composable
private fun ResumoCard(resumo: ResumoDivergencias) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ResumoItem(
            label = "OK",
            value = resumo.ok.toString(),
            color = GreenOk,
            modifier = Modifier.weight(1f),
        )
        ResumoItem(
            label = "Faltando",
            value = resumo.faltando.toString(),
            color = RedFaltando,
            modifier = Modifier.weight(1f),
        )
        ResumoItem(
            label = "Excesso",
            value = resumo.excesso.toString(),
            color = BlueExcesso,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ResumoItem(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.1f),
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = color,
            )
            Text(
                text = label,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ItemResultadoRow(
    sku: String,
    nome: String,
    esperado: Int,
    lido: Int,
    status: StatusItem,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = sku,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                )
                Text(
                    text = nome,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "$lido/$esperado",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                )
            }

            Spacer(modifier = Modifier.width(8.dp))
            DivergenciaBadge(status = status)
        }
    }
}
