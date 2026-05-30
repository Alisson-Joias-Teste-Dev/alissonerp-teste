import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const CofreBaixaPostSchema = z.object({
  gramas: z.coerce.number().positive(),
  destino: z.enum(["alisson", "fabrica", "service"]),
  transportador_id: z.string().optional(),
  transportador_nome: z.string().optional(),
  obs: z.string().optional(),
  itens: z.array(z.object({
    origem_tipo: z.enum(["venda_ouro", "compra_metal", "recebimento_metal"]),
    origem_id: z.coerce.number().int().positive(),
    referencia: z.string().min(1),
    pessoa_nome: z.string().optional(),
    data_origem: z.string().optional(),
    gramas: z.coerce.number().positive(),
    valor_brl: z.coerce.number().nonnegative().optional(),
  })).optional(),
}).passthrough();

const CofreBaixaPatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.string().min(1),
}).passthrough();

// GET /api/financeiro/cofre-ouro/baixas — lista baixas
export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const rows = await sql`
    SELECT
      id, gramas, destino, status,
      protocolo_id,
      realizado_nome, transportador_nome, recebedor_nome,
      confirmado_em, foto_comprovacao, obs,
      created_at, updated_at
    FROM alissonerp.cofre_ouro_baixas
    ORDER BY id DESC
    LIMIT 100
  `;
  return NextResponse.json(rows);
}

// POST /api/financeiro/cofre-ouro/baixas — cria baixa
export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const raw = await req.json().catch(() => ({}));
  const parsedPost = CofreBaixaPostSchema.safeParse(raw);
  if (!parsedPost.success) return zodError(parsedPost.error);
  const body = parsedPost.data;

  // REGRA DE NEGÓCIO: se vierem itens, a soma deve bater com a baixa.
  // IMPACTO: sem essa validação, histórico pode ficar inconsistente.
  const itens = body.itens ?? [];
  const somaItens = itens.reduce((s, it) => s + Number(it.gramas), 0);
  if (itens.length > 0 && Math.abs(Number(body.gramas) - somaItens) > 0.001) {
    return NextResponse.json(
      { error: `Soma dos itens (${somaItens.toFixed(3)}g) difere da baixa (${Number(body.gramas).toFixed(3)}g)` },
      { status: 400 }
    );
  }

  // Validar saldo disponível
  const [disp] = await sql`SELECT * FROM alissonerp.vw_cofre_ouro_disponivel`;
  const disponivel = disp ? Number(disp.disponivel_gramas) : 0;
  if (body.gramas > disponivel) {
    return NextResponse.json(
      { error: `Saldo insuficiente. Disponível: ${disponivel.toFixed(3)}g, solicitado: ${body.gramas.toFixed(3)}g` },
      { status: 400 }
    );
  }

  const [usuario] = await sql`
    SELECT nome FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  const realizadoNome = usuario?.nome ?? user.email ?? "Sistema";

  // Alisson = baixa direta concluída
  const statusInicial = body.destino === "alisson" ? "concluido" : "pendente";

  const baixa = await sql.begin(async (tx: any) => {
    const [nova] = await tx`
      INSERT INTO alissonerp.cofre_ouro_baixas
        (gramas, destino, status, realizado_por, realizado_nome,
         transportador_id, transportador_nome, obs,
         confirmado_em)
      VALUES
        (${body.gramas}, ${body.destino}, ${statusInicial},
         ${user.id}::uuid, ${realizadoNome},
         ${body.transportador_id ?? null}::uuid,
         ${body.transportador_nome ?? null},
         ${body.obs ?? null},
         ${statusInicial === 'concluido' ? sql`now()` : null})
      RETURNING id, gramas, destino, status, protocolo_id, created_at
    `;

    // REGRA DE NEGÓCIO: persistir itens da baixa para rastrear origem.
    // IMPACTO: sem isso não dá para abrir a baixa e ver de onde saiu.
    if (itens.length > 0) {
      for (const item of itens) {
        await tx`
          INSERT INTO alissonerp.cofre_ouro_baixa_itens
            (baixa_id, origem_tipo, origem_id, referencia, pessoa_nome, data_origem, gramas, valor_brl)
          VALUES
            (${nova.id}, ${item.origem_tipo}, ${item.origem_id}, ${item.referencia},
             ${item.pessoa_nome ?? null}, ${item.data_origem ?? null}::timestamptz,
             ${item.gramas}, ${item.valor_brl ?? 0})
        `;
      }
    }

    return nova;
  });

  await logAudit(sql, {
    tabela: "cofre_ouro_baixas",
    operacao: "INSERT",
    registro_id: baixa.id,
    usuario_id: user.id,
    dados_depois: { gramas: body.gramas, destino: body.destino },
  });

  // Se destino for fabrica/service, criar protocolo automaticamente
  if (body.destino !== "alisson") {
    const direcao = "ida";
    const tipoProtocolo = "ouro";

    const [prot] = await sql`
      INSERT INTO alissonerp.protocolos
        (direcao, etapas, motoboy_id, created_by, tipo_protocolo)
      VALUES
        (${direcao}, 'pendente',
         ${body.transportador_id ?? null}::uuid,
         ${user.id}::uuid,
         ${tipoProtocolo})
      RETURNING id
    `;

    await logAudit(sql, {
      tabela: "protocolos",
      operacao: "INSERT",
      registro_id: prot.id,
      usuario_id: user.id,
      dados_depois: { direcao, tipo_protocolo: tipoProtocolo, origem: "cofre_ouro_baixa", baixa_id: baixa.id },
    });

    // Vincular protocolo à baixa
    await sql`
      UPDATE alissonerp.cofre_ouro_baixas
      SET protocolo_id = ${prot.id}, status = 'em_trafego', updated_at = now()
      WHERE id = ${baixa.id}
    `;

    return NextResponse.json({ ...baixa, protocolo_id: prot.id, status: "em_trafego" });
  }

  return NextResponse.json(baixa);
}

// PATCH /api/financeiro/cofre-ouro/baixas — cancela baixa
export async function PATCH(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const rawPatch = await req.json().catch(() => ({}));
  const parsedPatch = CofreBaixaPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const { id, status } = parsedPatch.data;

  const [baixa] = await sql`
    UPDATE alissonerp.cofre_ouro_baixas
    SET status = ${status}, updated_at = now()
    WHERE id = ${id} AND status NOT IN ('concluido')
    RETURNING id, status
  `;

  if (!baixa) {
    return NextResponse.json({ error: "Baixa não encontrada ou já concluída" }, { status: 400 });
  }

  await logAudit(sql, {
    tabela: "cofre_ouro_baixas",
    operacao: "UPDATE",
    registro_id: id,
    usuario_id: user.id,
    dados_depois: { status },
  });

  return NextResponse.json(baixa);
}
