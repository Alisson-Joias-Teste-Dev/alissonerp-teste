import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { uploadFile, deleteFile } from "@/lib/storage";

// PATCH /api/insumos/:id — atualiza campos do insumo
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json() as {
    nome?: string;
    sku?: string;
    categoria_id?: number;
    unidade?: string;
    descricao?: string;
    estoque_minimo?: number;
    estoque_maximo?: number;
    custo_compra?: number;
    foto?: string | null;         // base64 "data:image/...;base64,..." para upload
    foto_remover?: boolean;       // true = remover foto atual
    fornecedor_id?: number | null;
    peso_pedra?: number | null;
    observacao?: string | null;
    ativo?: boolean;
  };

  const {
    nome, sku, categoria_id, unidade, descricao,
    estoque_minimo, estoque_maximo, custo_compra,
    foto, foto_remover, fornecedor_id, peso_pedra, observacao, ativo,
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
      observacao     = ${observacao !== undefined ? sql`${observacao}` : sql`observacao`},
      ativo          = ${ativo !== undefined ? sql`${ativo}::boolean` : sql`ativo`},
      updated_at     = now()
    WHERE id = ${id}
    RETURNING id, nome, sku, categoria_id, unidade, estoque_minimo, estoque_maximo,
              custo_compra, foto, fornecedor_id, peso_pedra, observacao, ativo
  `;

  if (!rows[0]) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// DELETE /api/insumos/:id — desativa (soft delete)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  if (id === 1) return NextResponse.json({ error: "Insumo protegido" }, { status: 403 });

  await sql`UPDATE alissonerp.insumos SET ativo = false WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
