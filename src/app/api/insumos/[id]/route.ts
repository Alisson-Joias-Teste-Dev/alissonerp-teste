import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { uploadFile, deleteFile } from "@/lib/storage";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const InsumoPatchSchema = z.object({
  nome: z.string().optional(),
  sku: z.string().optional(),
  categoria_id: z.coerce.number().int().positive().optional(),
  unidade: z.string().optional(),
  descricao: z.string().optional(),
  estoque_minimo: z.coerce.number().optional(),
  estoque_maximo: z.coerce.number().optional(),
  custo_compra: z.coerce.number().optional(),
  foto: z.string().nullable().optional(),
  foto_remover: z.boolean().optional(),
  fornecedor_id: z.coerce.number().int().nullable().optional(),
  peso_pedra: z.coerce.number().nullable().optional(),
  peso_pedra_ct: z.coerce.number().nullable().optional(),
  observacao: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
}).passthrough();

// PATCH /api/insumos/:id — atualiza campos do insumo (somente full access)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = InsumoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const {
    nome, sku, categoria_id, unidade, descricao,
    estoque_minimo, estoque_maximo, custo_compra,
    foto, foto_remover, fornecedor_id, peso_pedra, peso_pedra_ct, observacao, ativo,
  } = body;

  // ── Upload / remoção de foto ────────────────────────────────────────────────
  // fotoUrl = undefined → não alterar | null → remover | string → URL pública nova
  let fotoUrl: string | null | undefined = undefined;

  async function deleteOldFoto() {
    const [current] = await sql`SELECT foto FROM alissonerp.insumos WHERE id = ${id}`;
    if (current?.foto) {
      // foto pode ser URL completa ou só o filename — extrair path relativo
      const oldPath = (current.foto as string).includes("/storage/v1/object/public/insumo-fotos/")
        ? (current.foto as string).split("/storage/v1/object/public/insumo-fotos/")[1]
        : (current.foto as string);
      await deleteFile("insumo-fotos", oldPath);
    }
  }

  if (foto_remover === true) {
    await deleteOldFoto();
    fotoUrl = null;
  } else if (typeof foto === "string" && foto.startsWith("data:")) {
    const matches = foto.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return NextResponse.json({ error: "Formato de foto inválido" }, { status: 400 });
    const mimeType = matches[1];

    const ext = mimeType.split("/")[1]?.split("+")[0] ?? "jpg";
    const fileName = `insumo-${id}-${Date.now()}.${ext}`;

    await deleteOldFoto();

    const result = await uploadFile("insumo-fotos", fileName, foto, mimeType);

    if ("error" in result) {
      return NextResponse.json({ error: `Upload falhou: ${result.error}` }, { status: 500 });
    }

    // Salvar URL pública completa (não apenas o filename)
    fotoUrl = result.url;
  }

  // ── UPDATE — usa COALESCE para campos escalares, UPDATE explícito para novos ─
  const rows = await sql`
    UPDATE alissonerp.insumos SET
      nome           = COALESCE(${nome           ?? null}, nome),
      sku            = COALESCE(${sku            ?? null}, sku),
      categoria_id   = COALESCE(${categoria_id   ?? null}::int, categoria_id),
      unidade        = COALESCE(${unidade        ?? null}, unidade),
      descricao      = COALESCE(${descricao      ?? null}, descricao),
      estoque_minimo = COALESCE(${estoque_minimo ?? null}::numeric, estoque_minimo),
      estoque_maximo = COALESCE(${estoque_maximo ?? null}::numeric, estoque_maximo),
      custo_compra   = COALESCE(${custo_compra   ?? null}::numeric, custo_compra),
      foto           = ${fotoUrl !== undefined ? fotoUrl : sql`foto`},
      fornecedor_id  = ${fornecedor_id !== undefined ? sql`${fornecedor_id}::bigint` : sql`fornecedor_id`},
      peso_pedra     = ${peso_pedra !== undefined ? sql`${peso_pedra}::real` : sql`peso_pedra`},
      peso_pedra_ct  = ${peso_pedra_ct !== undefined ? sql`${peso_pedra_ct}::numeric` : sql`peso_pedra_ct`},
      observacao     = ${observacao !== undefined ? sql`${observacao}` : sql`observacao`},
      ativo          = ${ativo !== undefined ? sql`${ativo}::boolean` : sql`ativo`},
      updated_at     = now()
    WHERE id = ${id}
    RETURNING id, nome, sku, categoria_id, unidade, estoque_minimo, estoque_maximo,
              custo_compra, foto, fornecedor_id, peso_pedra, peso_pedra_ct, observacao, ativo
  `;

  if (!rows[0]) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// DELETE /api/insumos/:id — desativa (soft delete, somente full access)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  if (id === 1) return NextResponse.json({ error: "Insumo protegido" }, { status: 403 });

  await sql`UPDATE alissonerp.insumos SET ativo = false WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
