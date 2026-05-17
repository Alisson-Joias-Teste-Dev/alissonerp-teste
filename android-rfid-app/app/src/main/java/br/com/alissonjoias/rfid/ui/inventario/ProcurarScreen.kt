package br.com.alissonjoias.rfid.ui.inventario

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.alissonjoias.rfid.ui.theme.AzulPrimario
import br.com.alissonjoias.rfid.ui.theme.GreenOk
import br.com.alissonjoias.rfid.ui.theme.RedFaltando
import br.com.alissonjoias.rfid.viewmodel.ProcurarViewModel

@Composable
fun ProcurarScreen(
    viewModel: ProcurarViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.erro) {
        state.erro?.let { snackbarHostState.showSnackbar(it) }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Procurar etiqueta",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Digite o EPC da etiqueta que deseja localizar",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(24.dp))

            OutlinedTextField(
                value = state.targetEpc,
                onValueChange = { viewModel.onTargetEpcChanged(it) },
                label = { Text("EPC ou SKU") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                enabled = !state.procurando,
            )

            Spacer(modifier = Modifier.height(16.dp))

            if (!state.procurando) {
                Button(
                    onClick = viewModel::iniciarProcura,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AzulPrimario),
                ) {
                    Text("Procurar", fontSize = 16.sp)
                }
            } else {
                Button(
                    onClick = viewModel::pararProcura,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = RedFaltando),
                ) {
                    Icon(Icons.Default.Stop, contentDescription = null)
                    Text("  Parar procura")
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    RSSIIndicator(rssiPercent = state.rssiPercent)

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Sinal: ${(state.rssiPercent * 100).toInt()}%",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = state.targetEpc.ifEmpty { "---" },
                        style = MaterialTheme.typography.bodyMedium,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
        }
    }
}

@Composable
private fun RSSIIndicator(rssiPercent: Float, modifier: Modifier = Modifier) {
    val color = when {
        rssiPercent > 0.7f -> GreenOk
        rssiPercent > 0.3f -> AzulPrimario
        else -> RedFaltando
    }

    Box(
        modifier = modifier.size(200.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(200.dp)) {
            val cx = size.width / 2
            val cy = size.height / 2
            val radius = size.minDimension / 2

            for (i in 0 until 3) {
                val r = radius * (1f - i * 0.25f)
                val a = (1f - (i + 1) * 0.25f).coerceAtLeast(0.1f)
                val isFilled = rssiPercent > (1f - (i + 1) * 0.3f)

                drawCircle(
                    color = if (isFilled) color else Color.LightGray.copy(alpha = 0.3f),
                    radius = r,
                    center = Offset(cx, cy),
                )
            }

            drawCircle(
                color = color,
                radius = radius * 0.25f * rssiPercent.coerceAtLeast(0.1f),
                center = Offset(cx, cy),
            )
        }
    }
}
