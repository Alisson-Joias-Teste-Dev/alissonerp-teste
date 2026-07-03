import sql from "@/lib/db";
import { ensureTinyToken } from "@/lib/tiny-auth";

interface TinyContatoResult {
  ok: boolean;
  tiny_id?: number;
  erro?: string;
}

function buildPayload(c: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    nome: c.nome,
  };
  if (c.cpf_cnpj)       payload.cpfCnpj        = String(c.cpf_cnpj);
  if (c.email)          payload.email           = String(c.email);
  if (c.telefone)       payload.telefone        = String(c.telefone);
  if (c.celular)        payload.celular         = String(c.celular);
  if (c.inscricao_estadual) payload.inscricaoEstadual = String(c.inscricao_estadual);

  const tipoPessoa = c.tipo_pessoa
    ? String(c.tipo_pessoa)
    : String(c.cpf_cnpj ?? "").replace(/\D/g, "").length === 14 ? "J" : "F";
  payload.tipoPessoa = tipoPessoa;

  const temEndereco = c.endereco || c.municipio || c.cep;
  if (temEndereco) {
    const end: Record<string, string> = {};
    if (c.endereco)    end.endereco    = String(c.endereco);
    if (c.numero)      end.numero      = String(c.numero);
    if (c.complemento) end.complemento = String(c.complemento);
    if (c.bairro)      end.bairro      = String(c.bairro);
    if (c.municipio)   end.municipio   = String(c.municipio);
    if (c.cep)         end.cep         = String(c.cep).replace(/\D/g, "");
    if (c.uf)          end.uf          = String(c.uf);
    payload.endereco = end;
  }
  return payload;
}

export async function syncContatoToTiny(contatoId: number, signal?: AbortSignal): Promise<TinyContatoResult> {
  const t0 = Date.now();
  try {
    const [contato] = await sql`
      SELECT id_contato, nome, cpf_cnpj, email, telefone, celular,
             endereco, numero, complemento, bairro, municipio, cep, uf,
             tipo_pessoa, inscricao_estadual, id_api_contato
      FROM public.contatos WHERE id_contato = ${contatoId}
    `;
    if (!contato) return { ok: false, erro: "Contato não encontrado" };

    console.error(`[tiny-contatos] DB ok contatoId=${contatoId} duracao=${Date.now() - t0}ms`);

    let token: string;
    try {
      token = await ensureTinyToken(signal);
    } catch (err) {
      console.error(`[tiny-contatos] ensureTinyToken FALHOU contatoId=${contatoId} duracao=${Date.now() - t0}ms`, err);
      return { ok: false, erro: err instanceof Error ? err.message : "Token Tiny não disponível" };
    }

    console.error(`[tiny-contatos] token obtido contatoId=${contatoId} duracao=${Date.now() - t0}ms tokenLength=${token.length}`);

    if (signal?.aborted) {
      console.error(`[tiny-contatos] ABORTADO apos token contatoId=${contatoId} duracao=${Date.now() - t0}ms`);
      return { ok: false, erro: "Operação cancelada" };
    }

    const payload = buildPayload(contato as Record<string, unknown>);
    const isNovo = !contato.id_api_contato;
    const url = isNovo
      ? "https://api.tiny.com.br/public-api/v3/contatos"
      : `https://api.tiny.com.br/public-api/v3/contatos/${contato.id_api_contato}`;
    const method = isNovo ? "POST" : "PUT";

    console.error(`[tiny-contatos] fetch Tiny ${method} ${url} contatoId=${contatoId} duracao=${Date.now() - t0}ms`);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: signal ?? AbortSignal.timeout(15000),
      });
    } catch (err) {
      console.error(`[tiny-contatos] fetch EXCEPTION contatoId=${contatoId} duracao=${Date.now() - t0}ms`, err);
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, erro: "Tempo limite excedido ao sincronizar com Tiny. Tente novamente." };
      }
      return { ok: false, erro: err instanceof Error ? err.message : "Erro de comunicação com Tiny" };
    }

    console.error(`[tiny-contatos] fetch OK status=${res.status} contatoId=${contatoId} duracao=${Date.now() - t0}ms`);

    if (!res.ok) {
      const txt = await res.text();
      console.error(`[tiny-contatos] Tiny erro body=${txt.slice(0, 500)} contatoId=${contatoId}`);
      let msg = `Tiny contatos ${res.status}`;
      try {
        const j = JSON.parse(txt);
        const erros = Array.isArray(j.erros)
          ? j.erros.map((e: Record<string, string>) => e.mensagem || e.campo || JSON.stringify(e)).join("; ")
          : "";
        msg = [j.message || j.error || j.mensagem, erros].filter(Boolean).join(" — ") || msg;
      } catch { /* */ }
      return { ok: false, erro: msg };
    }

    if (isNovo) {
      const data = await res.json() as { id?: number; data?: { id?: number } };
      const tinyId = data.id ?? (data.data as Record<string, unknown> | undefined)?.id as number | undefined;
      if (tinyId) {
        await sql`UPDATE public.contatos SET id_api_contato = ${tinyId} WHERE id_contato = ${contatoId}`;
        console.error(`[tiny-contatos] SUCESSO tinyId=${tinyId} contatoId=${contatoId} duracao=${Date.now() - t0}ms`);
        return { ok: true, tiny_id: tinyId };
      }
      console.error(`[tiny-contatos] Tiny sem ID resposta=${JSON.stringify(data).slice(0, 300)} contatoId=${contatoId}`);
      return { ok: false, erro: "Tiny não retornou ID do contato criado" };
    }

    console.error(`[tiny-contatos] SUCESSO update contatoId=${contatoId} duracao=${Date.now() - t0}ms`);
    return { ok: true };
  } catch (err) {
    console.error(`[tiny-contatos] ERRO INESPERADO contatoId=${contatoId} duracao=${Date.now() - t0}ms`, err);
    return { ok: false, erro: err instanceof Error ? err.message : "Erro inesperado ao sincronizar contato" };
  }
}