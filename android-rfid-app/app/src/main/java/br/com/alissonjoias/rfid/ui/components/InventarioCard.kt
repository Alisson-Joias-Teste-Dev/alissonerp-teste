package br.com.alissonjoias.rfid.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.com.alissonjoias.rfid.data.local.entity.InventarioCacheEntity
import br.com.alissonjoias.rfid.ui.theme.AzulPrimario
import br.com.alissonjoias.rfid.ui.theme.GreenOk

@Composable
fun InventarioCard(
    inventario: InventarioCacheEntity,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val actionLabel = when (inventario.syncStatus) {
        "pendente" -> "Iniciar contagem"
        "contando" -> "Continuar"
        "concluido_local" -> "Ver resultado"
        else -> null
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "#${inventario.id}  ${inventario.localNome}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    if (inventario.categoria != null) {
                        Text(
                            text = inventario.categoria,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                StatusDot(
                    color = when (inventario.syncStatus) {
                        "pendente" -> AzulPrimario
                        "contando" -> GreenOk
                        "concluido_local" -> GreenOk
                        "enviado" -> MaterialTheme.colorScheme.outline
                        else -> MaterialTheme.colorScheme.outline
                    },
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            ProgressoBarra(
                lidos = inventario.itensContados,
                total = inventario.totalItens,
            )

            if (actionLabel != null) {
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = onAction,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AzulPrimario,
                    ),
                ) {
                    Text(text = actionLabel)
                }
            }
        }
    }
}
