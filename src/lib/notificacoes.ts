import sql from "@/lib/db";
import { enviarPushParaUsuario } from "@/lib/push";

export interface CriarNotificacaoParams {
  usuarioId: string;
  tipo: string;
  titulo: string;
  mensagem?: string | null;
  remetenteId?: string | null;
  link?: string | null;
  vendaId?: number | null;
  ordemId?: number | null;
  comentarioId?: number | null;
  aguardandoResposta?: boolean;
}

/**
 * REGRA DE NEGOCIO: toda notificacao interna do ERP deve tentar chegar tambem
 * no celular do usuario, sem transformar falha de push em falha da operacao.
 * O QUE: grava em alissonerp.notificacoes e dispara Web Push usando as
 * assinaturas salvas em push_subscriptions.
 * POR QUE: aprovacao, mencao, tarefa e alertas financeiros precisam seguir a
 * mesma regra de entrega; antes apenas um fluxo especifico chamava push.
 * IMPACTO: se este helper for ignorado e alguem voltar a usar INSERT direto,
 * a notificacao aparece no sino mas nao chega no celular.
 */
export async function criarNotificacao(params: CriarNotificacaoParams): Promise<void> {
  const mensagem = params.mensagem ?? "";
  const link = params.link ?? null;

  if (params.comentarioId != null) {
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id, link, ordem_id, comentario_id, aguardando_resposta)
      VALUES
        (${params.usuarioId}::uuid, ${params.tipo}, ${params.titulo}, ${mensagem},
         ${params.remetenteId ?? null}::uuid, ${link}, ${params.ordemId ?? null},
         ${params.comentarioId}, ${params.aguardandoResposta ?? false})
    `;
  } else if (params.ordemId != null) {
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id, link, ordem_id)
      VALUES
        (${params.usuarioId}::uuid, ${params.tipo}, ${params.titulo}, ${mensagem},
         ${params.remetenteId ?? null}::uuid, ${link}, ${params.ordemId})
    `;
  } else if (params.vendaId != null) {
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id, venda_id, link)
      VALUES
        (${params.usuarioId}::uuid, ${params.tipo}, ${params.titulo}, ${mensagem},
         ${params.remetenteId ?? null}::uuid, ${params.vendaId}, ${link})
    `;
  } else if (link != null) {
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id, link)
      VALUES
        (${params.usuarioId}::uuid, ${params.tipo}, ${params.titulo}, ${mensagem},
         ${params.remetenteId ?? null}::uuid, ${link})
    `;
  } else {
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id)
      VALUES
        (${params.usuarioId}::uuid, ${params.tipo}, ${params.titulo}, ${mensagem},
         ${params.remetenteId ?? null}::uuid)
    `;
  }

  await enviarPushParaUsuario(params.usuarioId, {
    titulo: params.titulo,
    mensagem,
    url: link ?? "/",
  }).catch((err) => {
    console.error("[notificacoes] erro ao enviar push", err);
  });
}
