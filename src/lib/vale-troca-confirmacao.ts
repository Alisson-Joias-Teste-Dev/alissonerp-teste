// ════════════════════════════════════════════════════════════════════════════
// vale-troca-confirmacao.ts — 2a confirmacao do Vale-Troca no FRONT (brecha #1)
//
// O QUE: dispara o codigo de 6 digitos no WhatsApp do DONO do vale
//   (/api/vale-troca/solicitar-codigo) e devolve, sem UI bloqueante, se o vale
//   exige codigo (vale COM dono) ou nao (promocional). Quem coleta o codigo do
//   atendente e o componente ValeCodigoInline (painel embutido no formulario de
//   pagamento) — NAO usamos mais window.prompt.
// POR QUE: era possivel usar vale alheio sem o consentimento do dono (2 usos
//   cruzados reais, R$3.410). O codigo no WhatsApp garante consentimento/identidade.
//   O painel inline substituiu o pop-up do navegador (que travava a tela e sumia
//   ao sair da pagina, obrigando a gerar outro codigo).
// IMPACTO SE REMOVIDO/ALTERADO: a tela volta a aplicar vale sem o token; o backend
//   ainda barra (precisa_codigo em /api/vendas/[id]/pagamentos), mas o usuario fica
//   sem caminho. NUNCA duplicar — todas as telas chamam esta funcao + ValeCodigoInline.
// ════════════════════════════════════════════════════════════════════════════

// Resultado do disparo do codigo (sem UI). precisa_codigo=false => vale promocional
// (aplica direto). precisa_excecao=true => nao deu pra entregar (sem celular /
// WhatsApp fora) — politica atual: codigo OBRIGATORIO, sem bypass de gerente.
export interface EnviarCodigoResult {
  precisa_codigo: boolean;
  telefone_mascarado?: string;
  precisa_excecao?: boolean;
  erro?: string;
}

/**
 * Dispara (ou reenvia) o codigo no WhatsApp do dono. O backend REUSA o codigo
 * ativo (nao expirado/confirmado/bloqueado), entao "Reenviar" manda o MESMO
 * numero — o que o dono recebeu sempre vale dentro dos 15 min.
 */
export async function enviarCodigoVale(valeNumero: string): Promise<EnviarCodigoResult> {
  try {
    const res = await fetch(`/api/vale-troca/solicitar-codigo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vale_numero: valeNumero.trim() }),
    });
    const sd = await res.json().catch(() => ({})) as {
      ok?: boolean; precisa_codigo?: boolean; precisa_excecao?: boolean;
      telefone_mascarado?: string; erro?: string; error?: string;
    };
    if (!res.ok) {
      return { precisa_codigo: false, erro: sd.erro ?? sd.error ?? "Falha ao enviar o código" };
    }
    return {
      precisa_codigo: !!sd.precisa_codigo,
      telefone_mascarado: sd.telefone_mascarado,
      precisa_excecao: sd.precisa_excecao,
      erro: sd.erro,
    };
  } catch {
    // Falha de rede: sinaliza erro pra UI; o backend ainda barra a aplicacao se faltar codigo.
    return { precisa_codigo: true, erro: "Sem conexão para enviar o código. Tente reenviar." };
  }
}
