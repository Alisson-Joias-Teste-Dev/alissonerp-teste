"use client";

/**
 * EnderecoForm — formulário estruturado de endereço (CEP / logradouro /
 * número / complemento / bairro / cidade / UF) com busca automática por CEP.
 *
 * O QUE: componente controlado (value + onChange, sem estado global) com os
 * mesmos 7 campos e a mesma busca por CEP (ViaCEP) já usadas na tela de Nova
 * Venda (NovaVendaClientV2.tsx, função buscaCEP ~L893) — limpa a máscara,
 * consulta https://viacep.com.br/ws/{cep}/json/, preenche logradouro/bairro/
 * cidade/UF e ignora silenciosamente CEP não encontrado ou falha de rede
 * (o usuário preenche manualmente; número e complemento NUNCA vêm do ViaCEP).
 *
 * POR QUE (padrão do sistema, migration 355): antes desta tarefa, o endereço
 * da solicitação de frete avulso era um texto livre concatenado — sem
 * estrutura, sem busca por CEP, divergente do padrão já usado em Nova Venda.
 * Este componente vira a FONTE ÚNICA do formulário de endereço para quem
 * precisar dele daqui pra frente (evita reimplementar a busca de CEP em cada
 * tela nova).
 *
 * IMPACTO SE ALTERADO: usado hoje pelo FreteAvulsoModal.tsx (endereço da
 * solicitação de frete avulso, entregas_venda.endereco_entrega*). A tela de
 * Nova Venda (NovaVendaClientV2.tsx) TEM a mesma lógica só que inline — não
 * foi refatorada para importar daqui porque é tela crítica e está FORA do
 * escopo desta tarefa (mexer nela exige plano próprio aprovado); é candidata
 * a migrar para este componente numa tarefa futura.
 */
import { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

const C = {
  esmeralda: "#184036",
  cremeBorder: "#E8DCC8",
  cinza: "#6B7280",
};

/** Valor estruturado do formulário — mesmos nomes de campo usados em
 *  NovaVendaClientV2.tsx (EnderecoEntrega) para não introduzir uma 2ª
 *  convenção de nomenclatura no front. */
export interface EnderecoValue {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export const ENDERECO_VAZIO: EnderecoValue = {
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
};

/** Subconjunto de campos endereco_entrega_* como vêm de vendas_erp (GET
 *  /api/vendas/[id]) ou de qualquer linha que siga a mesma convenção. */
export interface EnderecoVendaFields {
  endereco_entrega?: string | null;
  endereco_entrega_numero?: string | null;
  endereco_entrega_complemento?: string | null;
  endereco_entrega_bairro?: string | null;
  endereco_entrega_cidade?: string | null;
  endereco_entrega_cep?: string | null;
  endereco_entrega_uf?: string | null;
}

/**
 * Mapeia os campos endereco_entrega_* de uma venda para o objeto estruturado
 * deste formulário — CAMPO A CAMPO (antes cada consumidor concatenava os
 * mesmos campos num texto único para pré-preencher o textarea).
 *
 * O QUE: usado para pré-preencher o EnderecoForm a partir do endereço já
 * confirmado na venda (FreteAvulsoModal ao buscar uma venda, e
 * VendaDetalheClient ao montar o valor inicial do modal).
 * POR QUE: FONTE ÚNICA do mapeamento — evita 2 lugares reimplementando o
 * mesmo "de onde vem cada campo".
 * IMPACTO SE DUPLICADO: divergência sutil (um lugar esquece um campo, o
 * outro usa fallback diferente) entre os dois pontos de pré-preenchimento.
 */
export function enderecoDaVenda(v: EnderecoVendaFields): EnderecoValue {
  return {
    cep: v.endereco_entrega_cep ?? "",
    logradouro: v.endereco_entrega ?? "",
    numero: v.endereco_entrega_numero ?? "",
    complemento: v.endereco_entrega_complemento ?? "",
    bairro: v.endereco_entrega_bairro ?? "",
    cidade: v.endereco_entrega_cidade ?? "",
    uf: v.endereco_entrega_uf ?? "",
  };
}

interface Props {
  value: EnderecoValue;
  onChange: (value: EnderecoValue) => void;
  disabled?: boolean;
}

/**
 * Busca o CEP no ViaCEP e preenche logradouro/bairro/cidade/UF.
 * REGRA DE NEGÓCIO (espelha buscaCEP de NovaVendaClientV2.tsx ~L893):
 *   - só dispara com 8 dígitos (CEP limpo de máscara);
 *   - CEP não encontrado (`data.erro`) ou falha de rede (catch): NÃO altera
 *     nada além do que o usuário já digitou — silencioso, sem mensagem de
 *     erro (o usuário preenche o resto manualmente);
 *   - número e complemento NUNCA vêm do ViaCEP (não fazem parte do CEP).
 * IMPACTO SE ALTERADO: divergir desse comportamento quebra a paridade com o
 * padrão já usado (e em produção) na tela de Nova Venda.
 */
async function buscarCEP(
  cepDigitado: string,
  atual: EnderecoValue,
  onChange: (v: EnderecoValue) => void,
  setBuscando: (b: boolean) => void,
) {
  const limpo = cepDigitado.replace(/\D/g, "");
  if (limpo.length !== 8) return;
  setBuscando(true);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
    const data = await res.json();
    if (data.erro) return;
    onChange({
      ...atual,
      cep: cepDigitado,
      logradouro: data.logradouro || atual.logradouro,
      bairro: data.bairro || atual.bairro,
      cidade: data.localidade || atual.cidade,
      uf: data.uf || atual.uf,
    });
  } catch {
    /* silencioso — mesmo comportamento de buscaCEP em NovaVendaClientV2 */
  } finally {
    setBuscando(false);
  }
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${C.cremeBorder}`, fontSize: 13,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
  color: C.cinza, marginBottom: 6,
};

export default function EnderecoForm({ value, onChange, disabled }: Props) {
  const [buscando, setBuscando] = useState(false);

  function set<K extends keyof EnderecoValue>(campo: K, v: string) {
    onChange({ ...value, [campo]: v });
  }

  return (
    <div>
      {/* CEP + Número lado a lado (padrão do modal: 2 colunas) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}><MapPin size={13} /> CEP</label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={value.cep}
              placeholder="00000-000"
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                set("cep", v);
                if (v.replace(/\D/g, "").length === 8) {
                  void buscarCEP(v, { ...value, cep: v }, onChange, setBuscando);
                }
              }}
              style={inputStyle}
            />
            {buscando && (
              <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                <Loader2 size={14} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            )}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Número *</label>
          <input
            type="text"
            value={value.numero}
            disabled={disabled}
            onChange={(e) => set("numero", e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Logradouro largo */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Logradouro *</label>
        <input
          type="text"
          value={value.logradouro}
          disabled={disabled}
          onChange={(e) => set("logradouro", e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Complemento</label>
        <input
          type="text"
          value={value.complemento}
          disabled={disabled}
          onChange={(e) => set("complemento", e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Bairro / Cidade / UF */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Bairro</label>
          <input
            type="text"
            value={value.bairro}
            disabled={disabled}
            onChange={(e) => set("bairro", e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Cidade *</label>
          <input
            type="text"
            value={value.cidade}
            disabled={disabled}
            onChange={(e) => set("cidade", e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>UF</label>
          <input
            type="text"
            maxLength={2}
            value={value.uf}
            disabled={disabled}
            onChange={(e) => set("uf", e.target.value.toUpperCase())}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}
