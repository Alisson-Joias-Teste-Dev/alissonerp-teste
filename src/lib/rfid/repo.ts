/**
 * Repositório de acesso a dados do módulo RFID.
 *
 * SERVER-SIDE ONLY — usa `import sql from "@/lib/db"` (postgres.js tagged template).
 * NÃO importar em Client Components.
 *
 * Todas as queries são schema-qualified (alissonerp.*).
 * Transações usam sql.begin(async (tx) => { ... }) com `tx` como callback parameter.
 *
 * Leitor padrão para eventos de cadastro/reimpressão: ZEBRA-ZD500R.
 */

import sql from "@/lib/db";
import type { Epc, EtiquetaModelo, EtiquetaModeloInput } from "./tipos";

// ---------------------------------------------------------------------------
// Tipos internos do repositório
// ---------------------------------------------------------------------------

/** Dados do produto necessários para cadastrar uma joia RFID. */
export interface ProdutoData {
  produto_id: number;
  sku: string;
  nome: string;
  categoria?: string | null;
  peso_g?: number | null;
  preco_venda?: number | null;
}

/** Parâmetros para cadastrarJoiaPendente. */
export interface CadastrarJoiaPendenteParams {
  produtoData: ProdutoData;
  userId: string;
  epc: Epc | string;
}

/** Resultado de buscarJoiaPorEpc. */
export interface JoiaRfidResumo {
  epc: string;
  sku: string | null;
  nome: string | null;
  status: string;
}

/** Resultado de buscarProduto (public.produtos). */
export interface ProdutoRow {
  id_produto: number;
  sku: string | null;
  nome: string | null;
  categoria: string | null;
  peso_real: number | null;
  preco_tiny: number | null;
}

// ---------------------------------------------------------------------------
// Erro específico do repositório
// ---------------------------------------------------------------------------

/** Erro lançado quando uma pré-condição de negócio falha. */
export class RepoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoError";
  }
}

// ---------------------------------------------------------------------------
// Funções públicas
// ---------------------------------------------------------------------------

/**
 * Cadastra uma joia com status `pendente_impressao`.
 *
 * Executa em UMA transação:
 *   1. INSERT em alissonerp.joias_rfid (status='pendente_impressao', localizacao='fabrica')
 *   2. INSERT em alissonerp.joias_leituras (evento='cadastro')
 *
 * @returns Dados da joia cadastrada (epc, sku, nome).
 */
export async function cadastrarJoiaPendente(
  params: CadastrarJoiaPendenteParams,
): Promise<{ epc: string; sku: string; nome: string }> {
  const { produtoData, userId, epc } = params;

  const result = await sql.begin(async (tx: any) => {
    // 1. Insere joia com status pendente_impressao
    await tx`
      INSERT INTO alissonerp.joias_rfid (
        epc,
        produto_id,
        sku,
        nome,
        categoria,
        peso_g,
        preco_venda,
        localizacao_atual,
        status,
        criado_por
      ) VALUES (
        ${epc},
        ${produtoData.produto_id},
        ${produtoData.sku},
        ${produtoData.nome},
        ${produtoData.categoria ?? null},
        ${produtoData.peso_g ?? null},
        ${produtoData.preco_venda ?? null},
        'fabrica',
        'pendente_impressao',
        ${userId}::uuid
      )
    `;

    // 2. Registra evento na timeline
    await tx`
      INSERT INTO alissonerp.joias_leituras (
        epc,
        evento,
        localizacao,
        leitor_id,
        operador,
        metadata
      ) VALUES (
        ${epc},
        'cadastro',
        'fabrica',
        'ZEBRA-ZD500R',
        ${userId}::uuid,
        ${sql.json({
          produto_id: produtoData.produto_id,
          sku: produtoData.sku,
          nome: produtoData.nome,
        })}
      )
    `;

    return { epc, sku: produtoData.sku, nome: produtoData.nome };
  });

  return result;
}

/**
 * Confirma a impressão de uma etiqueta RFID.
 *
 * Atualiza o status de `pendente_impressao` para `ativo`.
 *
 * @returns `true` se a linha foi atualizada, `false` caso contrário
 *          (EPC não encontrado ou status diferente de pendente_impressao).
 */
export async function confirmarImpressao(epc: string): Promise<boolean> {
  const updated = await sql`
    UPDATE alissonerp.joias_rfid
    SET status = 'ativo',
        updated_at = now()
    WHERE epc = ${epc}
      AND status = 'pendente_impressao'
    RETURNING id
  `;

  return updated.length > 0;
}

/**
 * Reverte o cadastro de uma joia pendente de impressão.
 *
 * Executa em UMA transação:
 *   1. Verifica se a joia existe e está com status `pendente_impressao`
 *   2. Remove leituras de cadastro/reimpressao associadas
 *   3. Remove o registro da joia
 *
 * @returns `{ ok: true }` em sucesso, `{ ok: false, reason }` se a
 *          joia não for encontrada ou não estiver pendente.
 */
export async function reverterCadastro(
  epc: string,
  userId: string,
  motivo?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const result = await sql.begin(async (tx: any) => {
    // 1. Verifica existência e status
    const [joia] = await tx`
      SELECT id, status
      FROM alissonerp.joias_rfid
      WHERE epc = ${epc}
    `;

    if (!joia) {
      return { ok: false as const, reason: "nao_encontrada" as const };
    }
    if (joia.status !== "pendente_impressao") {
      return { ok: false as const, reason: "nao_pendente" as const };
    }

    // 2. Remove leituras de cadastro/reimpressao
    await tx`
      DELETE FROM alissonerp.joias_leituras
      WHERE epc = ${epc}
        AND evento IN ('cadastro', 'reimpressao')
    `;

    // 3. Remove a joia (garantia extra de status)
    await tx`
      DELETE FROM alissonerp.joias_rfid
      WHERE epc = ${epc}
        AND status = 'pendente_impressao'
    `;

    return { ok: true as const };
  });

  return result;
}

/**
 * Busca uma joia RFID pelo EPC.
 *
 * @returns Resumo da joia (epc, sku, nome, status) ou `null` se não encontrada.
 */
export async function buscarJoiaPorEpc(
  epc: string,
): Promise<JoiaRfidResumo | null> {
  const [joia] = await sql`
    SELECT epc, sku, nome, status
    FROM alissonerp.joias_rfid
    WHERE epc = ${epc}
  `;

  if (!joia) return null;

  return {
    epc: joia.epc as string,
    sku: joia.sku as string | null,
    nome: joia.nome as string | null,
    status: joia.status as string,
  };
}

/**
 * Registra um evento de reimpressão na timeline da joia.
 *
 * Não altera o status nem gera novo EPC — apenas insere na tabela
 * de leituras para auditoria.
 */
export async function registrarReimpressao(
  epc: string,
  userId: string,
): Promise<void> {
  await sql`
    INSERT INTO alissonerp.joias_leituras (
      epc,
      evento,
      leitor_id,
      operador
    ) VALUES (
      ${epc},
      'reimpressao',
      'ZEBRA-ZD500R',
      ${userId}::uuid
    )
  `;
}

/**
 * Busca um produto na tabela pública `public.produtos`.
 *
 * @returns Dados do produto ou `null` se não encontrado.
 *          Campos NUMERIC (peso_real, preco_tiny) são convertidos para number.
 */
export async function buscarProduto(
  idProduto: number,
): Promise<ProdutoRow | null> {
  const [produto] = await sql`
    SELECT
      id_produto,
      sku,
      nome,
      categoria,
      peso_real,
      preco_tiny
    FROM public.produtos
    WHERE id_produto = ${idProduto}
  `;

  if (!produto) return null;

  return {
    id_produto: Number(produto.id_produto),
    sku: (produto.sku as string) ?? null,
    nome: (produto.nome as string) ?? null,
    categoria: (produto.categoria as string) ?? null,
    peso_real:
      produto.peso_real != null ? Number(produto.peso_real) : null,
    preco_tiny:
      produto.preco_tiny != null ? Number(produto.preco_tiny) : null,
  };
}

/**
 * Gera o próximo número serial RFID chamando a função armazenada
 * `alissonerp.gerar_proximo_serial_rfid()`.
 *
 * O serial retornado (BIGINT) deve ser combinado com o `id_produto`
 * via `buildEpc()` para formar o EPC completo de 24 dígitos.
 *
 * @returns O próximo serial disponível (number).
 * @throws {RepoError} Se a função armazenada retornar um valor inválido.
 */
export async function gerarProximoSerial(): Promise<number> {
  const [row] = await sql`
    SELECT alissonerp.gerar_proximo_serial_rfid() AS serial
  `;

  const serial = Number(row?.serial);

  if (!Number.isFinite(serial) || serial <= 0) {
    throw new RepoError(
      `gerar_proximo_serial_rfid() retornou valor inválido: ${row?.serial}`,
    );
  }

  return serial;
}

// ---------------------------------------------------------------------------
// Modelos de etiqueta (dimensões, offset, posição do chip)
// ---------------------------------------------------------------------------

const COLS_MODELO = sql`
  id, nome, largura_mm::float8 AS largura_mm, altura_mm::float8 AS altura_mm,
  offset_x_mm::float8 AS offset_x_mm, offset_y_mm::float8 AS offset_y_mm,
  posicao_rfid, padrao, ativo
`;

/** Lista os modelos de etiqueta ativos (padrão primeiro). */
export async function listarModelosEtiqueta(): Promise<EtiquetaModelo[]> {
  const rows = await sql<EtiquetaModelo[]>`
    SELECT ${COLS_MODELO}
    FROM alissonerp.rfid_etiqueta_modelo
    WHERE ativo = true
    ORDER BY padrao DESC, nome ASC
  `;
  return rows;
}

/** Busca um modelo por id (ou null). */
export async function buscarModeloEtiqueta(id: number): Promise<EtiquetaModelo | null> {
  const [row] = await sql<EtiquetaModelo[]>`
    SELECT ${COLS_MODELO} FROM alissonerp.rfid_etiqueta_modelo WHERE id = ${id}
  `;
  return row ?? null;
}

/** Retorna o modelo padrão (ou null se nenhum). */
export async function modeloEtiquetaPadrao(): Promise<EtiquetaModelo | null> {
  const [row] = await sql<EtiquetaModelo[]>`
    SELECT ${COLS_MODELO}
    FROM alissonerp.rfid_etiqueta_modelo
    WHERE ativo = true AND padrao = true
    LIMIT 1
  `;
  return row ?? null;
}

/**
 * Cria ou atualiza um modelo de etiqueta (upsert por id).
 * Se `padrao = true`, zera o padrão dos demais (o índice único garante 1 só).
 * Tudo numa transação.
 */
export async function salvarModeloEtiqueta(
  input: EtiquetaModeloInput,
): Promise<EtiquetaModelo> {
  const posicao = input.posicao_rfid ?? null;
  const excluiId = input.id ?? -1; // ao criar (sem id), zera o padrão de todos
  const modelo = await sql.begin(async (tx: any) => {
    if (input.padrao) {
      await tx`
        UPDATE alissonerp.rfid_etiqueta_modelo
        SET padrao = false, atualizado_em = now()
        WHERE padrao = true AND id <> ${excluiId}
      `;
    }
    if (input.id) {
      const rows = await tx`
        UPDATE alissonerp.rfid_etiqueta_modelo SET
          nome = ${input.nome}, largura_mm = ${input.largura_mm},
          altura_mm = ${input.altura_mm}, offset_x_mm = ${input.offset_x_mm},
          offset_y_mm = ${input.offset_y_mm}, posicao_rfid = ${posicao},
          padrao = ${input.padrao}, atualizado_em = now()
        WHERE id = ${input.id}
        RETURNING ${COLS_MODELO}
      `;
      const row = rows[0] as unknown as EtiquetaModelo | undefined;
      if (!row) throw new RepoError(`Modelo ${input.id} nao encontrado`);
      return row;
    }
    const rows = await tx`
      INSERT INTO alissonerp.rfid_etiqueta_modelo
        (nome, largura_mm, altura_mm, offset_x_mm, offset_y_mm, posicao_rfid, padrao)
      VALUES
        (${input.nome}, ${input.largura_mm}, ${input.altura_mm},
         ${input.offset_x_mm}, ${input.offset_y_mm}, ${posicao}, ${input.padrao})
      RETURNING ${COLS_MODELO}
    `;
    return rows[0] as unknown as EtiquetaModelo;
  });
  return modelo as unknown as EtiquetaModelo;
}

/** Desativa (soft-delete) um modelo. */
export async function excluirModeloEtiqueta(id: number): Promise<boolean> {
  const rows = await sql`
    UPDATE alissonerp.rfid_etiqueta_modelo
    SET ativo = false, padrao = false, atualizado_em = now()
    WHERE id = ${id} AND ativo = true
    RETURNING id
  `;
  return rows.length > 0;
}
