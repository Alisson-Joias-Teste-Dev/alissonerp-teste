"use client";

import { useState } from "react";

export interface ValidacaoIA {
  peso_digitado: number;
  peso_balanca:  number | null;
  confianca:     string;
  match:         boolean;
  mensagem:      string;
}

/**
 * Foto da balança (guardada em base64, pra ir junto no corpo do POST de
 * salvar) + validação do peso digitado por IA. Usado nos 4 formulários de
 * Purificação/Ligação (Nova e Concluir) — estava colado 4x, extraído na
 * Etapa 5 do plano de consolidação.
 *
 * NÃO é o mesmo hook do apontamento PCP/Distribuição (useValidacaoIABalanca em
 * src/components/forms/_shared): aquele guarda a foto como blob URL e tem
 * outra aparência de tela — aqui a foto precisa ser base64 porque vai dentro
 * do JSON salvo, então são peças diferentes de propósito (confirmado por
 * leitura direta do código, não por suposição).
 *
 * REGRA DE NEGÓCIO: o peso informado só é aceito depois que a IA confirma
 * lendo a foto da balança — tolerância zero em movimentação de metal (ver
 * §Ouro=Dinheiro do CLAUDE.md). IMPACTO SE ALTERADO: destrava salvar
 * purificação/ligação sem confirmar o peso real.
 */
export function useFotoBalancaIA() {
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [iaResult, setIaResult] = useState<ValidacaoIA | null>(null);
  const [iaLoading, setIaLoading] = useState(false);

  async function chamarIA(file: File, peso: number) {
    setIaLoading(true);
    setIaResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("peso", String(peso));
      fd.append("tipo", "metal");
      const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
      const data = await res.json() as ValidacaoIA;
      setIaResult(data);
    } catch {
      setIaResult({ peso_digitado: peso, peso_balanca: null, confianca: "nenhuma", match: false, mensagem: "Erro ao contatar IA" });
    } finally {
      setIaLoading(false);
    }
  }

  function handleFoto(file: File, peso: number) {
    setFotoFile(file);
    setIaResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      setFotoBase64(reader.result as string);
      if (peso > 0) void chamarIA(file, peso);
    };
    reader.readAsDataURL(file);
  }

  return { fotoBase64, fotoFile, iaResult, iaLoading, handleFoto, chamarIA, setIaResult };
}
