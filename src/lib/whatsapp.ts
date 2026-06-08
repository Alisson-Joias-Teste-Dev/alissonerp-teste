/**
 * whatsapp.ts — Envio de mensagens via Evolution API
 *
 * REGRA DE NEGÓCIO: o sistema envia automaticamente o código de verificação
 * (Código A) para o WhatsApp do cliente ao criar uma entrega. O operador
 * nunca vê o código — só o cliente recebe. Isso garante segurança na retirada.
 *
 * O QUE: chama a Evolution API (já instalada no servidor) para enviar
 * mensagens de texto pelo WhatsApp da loja.
 *
 * POR QUE: a Evolution API é uma solução profissional de WhatsApp API,
 * mais confiável que whatsapp-web.js (não depende de navegador) e já está
 * rodando no servidor da Alisson Joias.
 *
 * IMPACTO SE REMOVIDO: o sistema perde a capacidade de enviar códigos de
 * verificação automaticamente. O fallback seria exibir o código na tela,
 * quebrando a segurança (operador veria o código).
 *
 * Configuração necessária no .env:
 *   EVOLUTION_API_URL=https://treinee-evolution-api.pqy87y.easypanel.host
 *   EVOLUTION_API_KEY=A0C435682BF0-47D3-933D-6E6B682D5F14
 *   EVOLUTION_INSTANCE_ID=alissonjoias
 */

const API_URL = process.env.EVOLUTION_API_URL ?? "";
const API_KEY = process.env.EVOLUTION_API_KEY ?? "";
const INSTANCE_ID = process.env.EVOLUTION_INSTANCE_ID ?? "";

export interface EnviarCodigoWhatsAppResult {
  enviado: boolean;
  erro: string | null;
  numeroFormatado: string | null;
}

/**
 * Envia o código de verificação para o WhatsApp do cliente.
 *
 * REGRA DE NEGÓCIO: o código é enviado diretamente para o número do cliente.
 * O operador NUNCA vê o código. Apenas o cliente recebe a mensagem.
 *
 * @param telefone — número do cliente no formato 55DDDXXXXXXXXX (ex: 5585999999999)
 * @param codigo — código de 6 dígitos gerado pelo sistema
 * @param nome — nome do cliente para personalizar a mensagem
 * @returns true se enviado com sucesso, false caso contrário
 */
export async function enviarCodigoWhatsApp(
  telefone: string,
  codigo: string,
  nome: string,
): Promise<boolean> {
  const result = await enviarCodigoWhatsAppDetalhado(telefone, codigo, nome);
  return result.enviado;
}

/**
 * Envia o código e retorna o motivo da falha quando a Evolution rejeita.
 *
 * REGRA DE NEGÓCIO: o operador não pode ver o Código A, mas precisa saber se
 * deve corrigir o WhatsApp do cliente ou se o serviço externo está fora.
 * O QUE: preserva o envio automático e diferencia número inválido/sem WhatsApp
 * de indisponibilidade real da API.
 * IMPACTO SE REMOVIDO: a tela volta a mostrar "WhatsApp indisponível" para
 * qualquer falha, fazendo a loja perder tempo diagnosticando cadastro errado.
 */
export async function enviarCodigoWhatsAppDetalhado(
  telefone: string,
  codigo: string,
  nome: string,
): Promise<EnviarCodigoWhatsAppResult> {
  if (!API_URL || !API_KEY || !INSTANCE_ID) {
    console.warn(
      "[whatsapp] Evolution API não configurada. Verifique EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_ID no .env",
    );
    return {
      enviado: false,
      erro: "WhatsApp não configurado no servidor. Reinicie o sistema e confira o .env.",
      numeroFormatado: null,
    };
  }

  // Normaliza o número: remove espaços, traços, parênteses e o "+" inicial
  const numero = telefone.replace(/[\s\-\(\)\+]/g, "");

  // Se o número não começa com 55, adiciona
  const numeroFormatado = numero.startsWith("55") ? numero : `55${numero}`;

  // Validação básica: número deve ter pelo menos 12 dígitos (55 + DDD + 8 ou 9 dígitos)
  if (numeroFormatado.length < 12) {
    console.warn(
      `[whatsapp] Número inválido: "${telefone}" (formatado: ${numeroFormatado})`,
    );
    return {
      enviado: false,
      erro: "Número de WhatsApp inválido. Confira DDD e telefone do cliente.",
      numeroFormatado,
    };
  }

  const mensagem =
    `Olá ${nome}! Segue o código para retirada do seu pedido na Alisson Joias:\n\n` +
    `🔐 *${codigo}*\n\n` +
    `Informe este código ao atendente no momento da retirada.`;

  try {
    const url = `${API_URL}/message/sendText/${INSTANCE_ID}`;

    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: API_KEY,
      },
      body: JSON.stringify({
        number: numeroFormatado,
        text: mensagem,
      }),
    });

    if (!resposta.ok) {
      const erro = await resposta.text().catch(() => "sem corpo");
      console.error(
        `[whatsapp] Evolution API retornou ${resposta.status} para ${numeroFormatado}: ${erro.slice(0, 200)}`,
      );
      return {
        enviado: false,
        erro: erro.includes("exists\":false")
          ? "Número não encontrado no WhatsApp. Confira o cadastro do cliente."
          : "WhatsApp indisponível no momento. Tente reenviar em instantes.",
        numeroFormatado,
      };
    }

    const data = await resposta.json().catch(() => ({}));
    console.log(
      `[whatsapp] Código enviado para ${nome} (${numeroFormatado}) — status: ${data.status ?? "ok"}`,
    );
    return { enviado: true, erro: null, numeroFormatado };
  } catch (err) {
    console.error(
      `[whatsapp] Erro ao enviar para ${numeroFormatado}:`,
      err instanceof Error ? err.message : err,
    );
    return {
      enviado: false,
      erro: "Erro ao conectar com o serviço de WhatsApp.",
      numeroFormatado,
    };
  }
}

/**
 * Verifica se o módulo de WhatsApp está configurado.
 *
 * REGRA DE NEGÓCIO: usado pelo frontend para decidir se mostra opções
 * de envio por WhatsApp ou fallback manual.
 */
export function whatsappConfigurado(): boolean {
  return !!(API_URL && API_KEY && INSTANCE_ID);
}
