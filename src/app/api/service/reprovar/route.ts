import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile } from "@/lib/storage";
import { zodError } from "@/lib/schemas/common";
import { criarNotificacao } from "@/lib/notificacoes";

const ROLES_CONFERENCIA = ["consultora", "gerente_loja", "admin", "desenvolvedor"] as const;

const ServiceReprovarSchema = z.object({
  servico_id: z.coerce.number().int().positive(),
  motivo_reprovacao: z.string().min(1, "obrigatório"),
  foto_reprovacao_base64: z.string().optional(),
}).passthrough();

// POST /api/service/reprovar
// Consultora reprova serviço na conferência.
// Cria novo protocolo ida automaticamente para retorno ao operador.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!caller) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  if (!ROLES_CONFERENCIA.includes(caller.role as typeof ROLES_CONFERENCIA[number])) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ServiceReprovarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { servico_id, motivo_reprovacao, foto_reprovacao_base64 } = parsed.data;

  // Buscar serviço + número da ordem
  const [servico] = await sql`
    SELECT s.id, s.ordem_id, s.status, s.tentativa, s.concluido_por,
           o.numero_ordem
    FROM alissonerp.servicos s
    JOIN alissonerp.ordens o ON o.id = s.ordem_id
    WHERE s.id = ${servico_id}
    LIMIT 1
  `;
  if (!servico) return NextResponse.json({ error: "Serviço não encontrado" }, { status: 404 });
  if (servico.status !== "concluido") {
    return NextResponse.json(
      { error: `Serviço não está concluído (status: ${servico.status})` },
      { status: 422 }
    );
  }

  // Upload foto reprovação (opcional)
  let fotoUrl: string | null = null;
  if (foto_reprovacao_base64?.startsWith("data:")) {
    const matches = foto_reprovacao_base64.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      const mimeType = matches[1];
      const ext = mimeType.split("/")[1]?.split("+")[0] ?? "jpg";
      const fileName = `reprov-${servico_id}-${Date.now()}.${ext}`;
      const result = await uploadFile("service-fotos", fileName, foto_reprovacao_base64, mimeType);
      if ("url" in result) fotoUrl = result.url;
    }
  }

  // Transação atômica
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultado = await sql.begin(async (tx: any) => {
    // 1. Marcar serviço como reprovado
    await tx`
      UPDATE alissonerp.servicos SET
        status            = 'reprovado',
        motivo_reprovacao = ${motivo_reprovacao},
        foto_reprovacao   = ${fotoUrl},
        reprovado_em      = NOW(),
        reprovado_por     = ${user.id}::uuid
      WHERE id = ${servico_id}
    `;

    // 2. Criar novo protocolo ida para retorno
    const [novoProtocolo] = await tx`
      INSERT INTO alissonerp.protocolos (direcao, etapas)
      VALUES ('ida', 'pendente')
      RETURNING id
    `;

    // 3. Associar protocolo à ordem
    await tx`
      INSERT INTO alissonerp.protocolo_ordens (protocolo_id, ordem_id)
      VALUES (${novoProtocolo.id}, ${servico.ordem_id as number})
    `;

    // 4. Reabrir ordem
    await tx`
      UPDATE alissonerp.ordens SET status = 'em_andamento'
      WHERE id = ${servico.ordem_id as number}
    `;

    return {
      novo_protocolo_id: novoProtocolo.id as number,
      tentativa: Number(servico.tentativa),
    };
  });

  if (servico.concluido_por) {
    await criarNotificacao({
      usuarioId: servico.concluido_por as string,
      tipo: "servico_reprovado",
      titulo: `Serviço reprovado — ${servico.numero_ordem ?? ""}`,
      mensagem: motivo_reprovacao,
      remetenteId: user.id,
      link: "/service",
      ordemId: servico.ordem_id as number,
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    novo_protocolo_id: resultado.novo_protocolo_id,
    tentativa: resultado.tentativa,
  });
}
