package br.com.alissonjoias.rfid.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.com.alissonjoias.rfid.data.repository.StatusItem
import br.com.alissonjoias.rfid.ui.theme.BlueExcesso
import br.com.alissonjoias.rfid.ui.theme.GreenOk
import br.com.alissonjoias.rfid.ui.theme.RedFaltando

@Composable
fun DivergenciaBadge(status: StatusItem, modifier: Modifier = Modifier) {
    val (label, color) = when (status) {
        StatusItem.OK -> "OK" to GreenOk
        StatusItem.FALTANDO -> "Faltando" to RedFaltando
        StatusItem.EXCESSO -> "Excesso" to BlueExcesso
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(
            text = label,
            color = color,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

fun StatusItem.toColor(): Color = when (this) {
    StatusItem.OK -> GreenOk
    StatusItem.FALTANDO -> RedFaltando
    StatusItem.EXCESSO -> BlueExcesso
}

fun StatusItem.toEmoji(): String = when (this) {
    StatusItem.OK -> "\uD83D\uDFE2"
    StatusItem.FALTANDO -> "\uD83D\uDD34"
    StatusItem.EXCESSO -> "\uD83D\uDD35"
}
