/**
 * POST /api/entregas-venda/[id]/reenviar-whatsapp-motoboy
 *
 * REGRA DE NEGÓCIO: o Código B é do motoboy e deve chegar ao WhatsApp dele
 * automaticamente. Se o envio inicial falhar ou o motoboy não tiver WhatsApp
 * cadastrado, o operador pode corrigir o telefone e pedir novo envio.
 *
 * O QUE: localiza a entrega, encontra o motoboy vinculado via motoboy_id,
 * atualiza alissonerp.motoboys.telefone quando um número novo é informado
 * e validado pelo envio, e reenvia o Código B via Evolution API.
 *
 * POR QUE: centralizar o reenvio no backend mantém o Código B protegido e
 * evita que o operador precise copiar o código e enviar manualmente.
 *
 * IMPACTO SE ALTERADO: retornar codigo_motoboy exposto quebra a segurança;
 * remover o UPDATE impede corrigir cadastro do motoboy no momento da entrega.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";
import { enviarCodigoWhatsAppDetalhado } from "@/lib/whatsapp";

const ROLES_ENTREGAS = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

const ReenviarWhatsAppMotoboySchema = z.object({
  whatsapp: z.string().trim().max(32, "WhatsApp muito longo").optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const entregaId = Number(id);
  if (isNaN(entregaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_ENTREGAS.includes(usuario.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = ReenviarWhatsAppMotoboySchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const whatsappNovo = parsed.data.whatsapp?.trim() ?? "";

  const [entrega] = await sql`
    SELECT
      ev.id,
      ev.codigo_motoboy,
      ev.motoboy_id,
      ev.forma_entrega,
      ve.vendedor_id,
      mb.nome AS motoboy_nome,
      mb.telefone AS motoboy_telefone
    FROM alissonerp.entregas_venda ev
    JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
    LEFT JOIN alissonerp.motoboys mb ON mb.user_id = ev.motoboy_id
    WHERE ev.id = ${entregaId}
    LIMIT 1
  `;

  if (!entrega) {
    return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  }

  if (String(entrega.forma_entrega) !== "motoboy") {
    return NextResponse.json(
      { error: "Esta entrega não é via motoboy. O Código B não se aplica." },
      { status: 400 },
    );
  }

  if (usuario.role === "consultora" && usuario.vendedor_id != null) {
    if (entrega.vendedor_id !== usuario.vendedor_id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  const codigoMotoboy = entrega.codigo_motoboy as string | null;
  if (!codigoMotoboy) {
    return NextResponse.json(
      { error: "Esta entrega não possui Código B para envio." },
      { status: 400 },
    );
  }

  const telefoneParaEnvio = whatsappNovo || entrega.motoboy_telefone || "";
  if (!telefoneParaEnvio) {
    return NextResponse.json(
      { error: "Motoboy sem WhatsApp cadastrado" },
      { status: 400 },
    );
  }

  const envio = await enviarCodigoWhatsAppDetalhado(
    telefoneParaEnvio,
    codigoMotoboy,
    (entrega.motoboy_nome as string | null) ?? "motoboy",
  );

  if (!envio.enviado) {
    return NextResponse.json(
      {
        error: envio.erro ?? "Falha ao enviar WhatsApp",
        whatsappMotoboyEnviado: false,
        whatsappMotoboyErro: envio.erro ?? "Falha ao enviar WhatsApp",
        motoboyNome: entrega.motoboy_nome ?? null,
        motoboyTelefone: envio.numeroFormatado ?? telefoneParaEnvio,
      },
      { status: 400 },
    );
  }

  if (whatsappNovo) {
    await sql`
      UPDATE alissonerp.motoboys
      SET telefone = ${whatsappNovo}
      WHERE user_id = ${entrega.motoboy_id}::uuid
    `;
  }

  return NextResponse.json({
    whatsappMotoboyEnviado: true,
    whatsappMotoboyErro: null,
    motoboyNome: entrega.motoboy_nome ?? null,
    motoboyTelefone: envio.numeroFormatado ?? telefoneParaEnvio,
  });
}
