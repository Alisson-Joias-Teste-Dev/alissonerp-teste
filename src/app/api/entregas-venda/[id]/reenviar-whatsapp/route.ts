/**
 * POST /api/entregas-venda/[id]/reenviar-whatsapp
 *
 * REGRA DE NEGÓCIO: o Código A pertence ao cliente e nunca deve aparecer para
 * o operador. Quando o envio inicial falha por falta de WhatsApp ou cadastro
 * errado, o operador pode salvar/corrigir o celular do cliente e pedir novo
 * envio por esta rota.
 *
 * O QUE: localiza a entrega, encontra o cliente da venda, envia o código pela
 * Evolution API e atualiza public.contatos.celular quando um número novo foi
 * informado e validado pelo envio.
 *
 * POR QUE: centralizar o reenvio no backend mantém o Código A protegido e evita
 * que o frontend precise receber o código para montar mensagem manual.
 *
 * IMPACTO SE ALTERADO: retornar ou expor codigo_cliente aqui quebra a segurança
 * operacional da retirada/entrega; remover o UPDATE impede corrigir cadastro no
 * momento da entrega; salvar número rejeitado pela API suja o cadastro do
 * cliente.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";
import { enviarCodigoWhatsAppDetalhado } from "@/lib/whatsapp";

const ROLES_ENTREGAS = ["desenvolvedor", "admin", "gerente_loja", "consultora"];

// REGRA DE NEGÓCIO: whatsapp vazio significa reenviar usando o cadastro atual;
// preenchido significa corrigir public.contatos.celular antes do envio.
const ReenviarWhatsAppSchema = z.object({
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

  const parsed = ReenviarWhatsAppSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const whatsappNovo = parsed.data.whatsapp?.trim() ?? "";

  const [entrega] = await sql`
    SELECT
      ev.id,
      ev.codigo_cliente,
      ve.vendedor_id,
      c.id_contato,
      c.nome AS cliente_nome,
      c.celular,
      c.telefone
    FROM alissonerp.entregas_venda ev
    JOIN alissonerp.vendas_erp ve ON ve.id = ev.venda_id
    JOIN public.contatos c ON c.id_contato = ve.cliente_id
    WHERE ev.id = ${entregaId}
    LIMIT 1
  `;

  if (!entrega) {
    return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  }

  // REGRA DE NEGÓCIO: consultora só pode reenviar código de entrega das suas
  // próprias vendas. IMPACTO SE REMOVIDO: uma consultora poderia acionar envio
  // de código para cliente de outra vendedora.
  if (usuario.role === "consultora" && usuario.vendedor_id != null) {
    if (entrega.vendedor_id !== usuario.vendedor_id) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  }

  const telefoneParaEnvio = whatsappNovo || entrega.celular || entrega.telefone || "";
  if (!telefoneParaEnvio) {
    return NextResponse.json(
      { error: "Cliente sem WhatsApp cadastrado" },
      { status: 400 },
    );
  }

  const envio = await enviarCodigoWhatsAppDetalhado(
    telefoneParaEnvio,
    entrega.codigo_cliente as string,
    (entrega.cliente_nome as string | null) ?? "cliente",
  );

  if (!envio.enviado) {
    return NextResponse.json(
      {
        error: envio.erro ?? "Falha ao enviar WhatsApp",
        whatsappEnviado: false,
        whatsappErro: envio.erro ?? "Falha ao enviar WhatsApp",
        clienteNome: entrega.cliente_nome ?? null,
        clienteTelefone: envio.numeroFormatado ?? telefoneParaEnvio,
      },
      { status: 400 },
    );
  }

  // REGRA DE NEGÓCIO: só salvamos número novo depois de envio confirmado.
  // O QUE: impede gravar no cadastro um telefone que a Evolution informou não
  // existir no WhatsApp. IMPACTO SE REMOVIDO: dados ruins ficam persistidos e
  // próximas entregas continuam falhando automaticamente.
  if (whatsappNovo) {
    await sql`
      UPDATE public.contatos
      SET celular = ${whatsappNovo}
      WHERE id_contato = ${Number(entrega.id_contato)}
    `;
  }

  return NextResponse.json({
    whatsappEnviado: true,
    whatsappErro: null,
    clienteNome: entrega.cliente_nome ?? null,
    clienteTelefone: envio.numeroFormatado ?? telefoneParaEnvio,
  });
}
