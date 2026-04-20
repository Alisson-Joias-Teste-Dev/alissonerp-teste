import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import * as inter from "@/lib/inter";

const ROLES_ENVIAR = ["desenvolvedor", "admin", "diretor", "gerente_loja", "gerente_fabrica"];

type DadosPix = { chave?: string; qrcode?: string; descricao?: string };
type DadosBoleto = { codigoBarras: string };
type DadosTed = {
  banco: string; agencia: string; conta: string; digito: string;
  tipoConta: "CC" | "CP"; cpfCnpj: string; nomeFavorecido: string;
};

type Body = {
  tipo: "pix" | "boleto" | "ted";
  dados: DadosPix | DadosBoleto | DadosTed;
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!ROLES_ENVIAR.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const contaId = parseInt(id, 10);
  if (!Number.isFinite(contaId)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const body = (await req.json()) as Body;
  if (!body?.tipo || !["pix", "boleto", "ted"].includes(body.tipo)) {
    return NextResponse.json({ error: "tipo deve ser pix|boleto|ted" }, { status: 400 });
  }
  if (!body.dados) {
    return NextResponse.json({ error: "dados obrigatórios" }, { status: 400 });
  }

  const [conta] = await sql`
    SELECT id, descricao, valor, situacao, data_vencimento, inter_pagamento_id
    FROM alissonerp.contas_pagar
    WHERE id = ${contaId}
    LIMIT 1
  `;
  if (!conta) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  if (conta.situacao !== "pendente") {
    return NextResponse.json({ error: `Conta com situação '${conta.situacao}' não pode ser enviada` }, { status: 400 });
  }
  if (conta.inter_pagamento_id) {
    return NextResponse.json(
      { error: "Conta já enviada ao Inter", inter_pagamento_id: conta.inter_pagamento_id },
      { status: 409 },
    );
  }

  const valor = Number(conta.valor);
  const dataPagamento = conta.data_vencimento
    ? new Date(conta.data_vencimento).toISOString().slice(0, 10)
    : undefined;

  try {
    let result: { id: string; status: string };

    if (body.tipo === "pix") {
      const d = body.dados as DadosPix;
      if (d.qrcode) {
        result = await inter.criarPixCopiaCola(
          { qrcode: d.qrcode, valor, descricao: d.descricao ?? conta.descricao },
          contaId,
        );
      } else if (d.chave) {
        result = await inter.criarPix(
          { chave: d.chave, valor, descricao: d.descricao ?? conta.descricao, dataPagamento },
          contaId,
        );
      } else {
        return NextResponse.json({ error: "pix requer 'chave' ou 'qrcode'" }, { status: 400 });
      }
    } else if (body.tipo === "boleto") {
      const d = body.dados as DadosBoleto;
      if (!d.codigoBarras) return NextResponse.json({ error: "boleto requer 'codigoBarras'" }, { status: 400 });
      result = await inter.criarBoleto({ codigoBarras: d.codigoBarras, valor, dataPagamento }, contaId);
    } else {
      const d = body.dados as DadosTed;
      const obrig = ["banco", "agencia", "conta", "digito", "tipoConta", "cpfCnpj", "nomeFavorecido"] as const;
      for (const k of obrig) {
        if (!d[k]) return NextResponse.json({ error: `ted requer '${k}'` }, { status: 400 });
      }
      result = await inter.criarTed({ ...d, valor, dataPagamento }, contaId);
    }

    await sql`
      UPDATE alissonerp.contas_pagar
      SET inter_pagamento_id = ${result.id},
          inter_status       = ${result.status},
          inter_tipo         = ${body.tipo},
          inter_dados        = ${sql.json(body.dados as never)},
          inter_enviado_em   = now(),
          inter_atualizado_em = now(),
          inter_erro         = NULL
      WHERE id = ${contaId}
    `;

    return NextResponse.json({
      ok: true,
      inter_pagamento_id: result.id,
      inter_status: result.status,
      inter_status_interno: inter.mapearStatusInter(result.status),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`
      UPDATE alissonerp.contas_pagar
      SET inter_erro = ${msg}, inter_atualizado_em = now()
      WHERE id = ${contaId}
    `;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
