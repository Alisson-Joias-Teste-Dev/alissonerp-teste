import sql from "@/lib/db";
import { syncContatoToTiny } from "@/lib/tiny-contatos";

const DELAYS_SEGUNDOS = [60, 300, 900, 3600, 21600]; // 1m, 5m, 15m, 1h, 6h
const MAX_TENTATIVAS = 5;

function calcularProximaExecucao(tentativas: number): Date {
  const delay = DELAYS_SEGUNDOS[Math.min(tentativas, DELAYS_SEGUNDOS.length - 1)];
  return new Date(Date.now() + delay * 1000);
}

interface FilaItem {
  id: number;
  sistema: string;
  acao: string;
  payload: Record<string, unknown>;
  tentativas: number;
}

// Processador por sistema — extensível
async function processarItem(item: FilaItem): Promise<void> {
  if (item.sistema === "tiny") {
    await processarTiny(item);
  } else {
    throw new Error(`Sistema desconhecido: ${item.sistema}`);
  }
}

async function processarTiny(item: FilaItem): Promise<void> {
  const { acao, payload } = item;
  if (acao === "sync_contato") {
    const contatoId = payload.id_contato as number;
    if (!contatoId) throw new Error("Payload inválido: id_contato ausente");

    const result = await syncContatoToTiny(contatoId);
    if (!result.ok) {
      throw new Error(result.erro ?? "Falha ao sincronizar contato com Tiny");
    }
  } else {
    throw new Error(`Ação Tiny desconhecida: ${acao}`);
  }
}

export interface ProcessarFilaResult {
  processados: number;
  falhas: number;
  falhas_definitivas: number;
}

export async function processarFila(limite = 10): Promise<ProcessarFilaResult> {
  const result: ProcessarFilaResult = { processados: 0, falhas: 0, falhas_definitivas: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    // Pegar itens pendentes com lock — SKIP LOCKED garante que múltiplas instâncias não colidem
    const itens = await tx`
      SELECT id, sistema, acao, payload, tentativas
      FROM alissonerp.fila_sync_externo
      WHERE status = 'pendente'
        AND (proxima_execucao IS NULL OR proxima_execucao <= NOW())
      ORDER BY criado_em
      LIMIT ${limite}
      FOR UPDATE SKIP LOCKED
    ` as FilaItem[];

    if (itens.length === 0) return;

    // Marcar todos como 'processando' atomicamente
    const ids = itens.map(i => i.id);
    await tx`
      UPDATE alissonerp.fila_sync_externo
      SET status = 'processando'
      WHERE id = ANY(${ids as unknown as number[]}::bigint[])
    `;

    // Processar cada item
    for (const item of itens) {
      try {
        await processarItem(item);
        await tx`
          UPDATE alissonerp.fila_sync_externo
          SET status = 'processado', processado_em = NOW(), ultimo_erro = NULL
          WHERE id = ${item.id}
        `;
        result.processados++;
        console.log(JSON.stringify({ event: "fila_sync.processado", id: item.id, sistema: item.sistema, acao: item.acao }));
      } catch (err) {
        const erroMsg = err instanceof Error ? err.message : String(err);
        const novasTentativas = item.tentativas + 1;

        if (novasTentativas >= MAX_TENTATIVAS) {
          await tx`
            UPDATE alissonerp.fila_sync_externo
            SET status = 'falha_definitiva', tentativas = ${novasTentativas}, ultimo_erro = ${erroMsg}, processado_em = NOW()
            WHERE id = ${item.id}
          `;
          // Notificar admin
          const [admin] = await tx`
            SELECT id FROM alissonerp.usuarios WHERE role IN ('admin','desenvolvedor') AND ativo = true ORDER BY id LIMIT 1
          `;
          if (admin) {
            await tx`
              INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, link)
              VALUES (
                ${admin.id as string}::uuid, 'alerta',
                ${'Falha definitiva na fila sync: ' + item.sistema + '/' + item.acao},
                ${erroMsg.slice(0, 500)},
                '/admin/fila-sync'
              )
            `.catch(() => {});
          }
          result.falhas_definitivas++;
          console.log(JSON.stringify({ event: "fila_sync.falha_definitiva", id: item.id, sistema: item.sistema, erro: erroMsg }));
        } else {
          const proxima = calcularProximaExecucao(novasTentativas);
          await tx`
            UPDATE alissonerp.fila_sync_externo
            SET status = 'pendente', tentativas = ${novasTentativas},
                ultimo_erro = ${erroMsg}, proxima_execucao = ${proxima.toISOString()}
            WHERE id = ${item.id}
          `;
          result.falhas++;
          console.log(JSON.stringify({ event: "fila_sync.falha_retry", id: item.id, sistema: item.sistema, tentativas: novasTentativas, proxima_execucao: proxima.toISOString() }));
        }
      }
    }
  });

  return result;
}
