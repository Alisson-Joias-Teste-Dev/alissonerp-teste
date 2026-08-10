"use client";

import { useCallback, useEffect, useState } from "react";
import { gramasToCt } from "@/lib/formatters";

export interface ValidacaoIA {
  peso_digitado: number;
  peso_balanca:  number | null;
  confianca:     string;
  match:         boolean;
  mensagem:      string;
}

/**
 * Foto da balança + validação por IA, usada nos apontamentos de metal/pedra
 * (Distribuição e PCP). REGRA DE NEGOCIO: o peso digitado precisa bater com
 * o peso lido na foto da balança (dentro da tolerância da IA) antes de
 * liberar o botão de salvar — evita erro de digitação no ouro/pedra apontado.
 * IMPACTO SE ALTERADO: mexe na trava anti-erro de todo apontamento com foto.
 */
export function useValidacaoIABalanca(params: {
  isPedra: boolean;
  qtd: string;
  pesoGPedra: string;
  pesoPedraUnitario: number | null;
}) {
  const { isPedra, qtd, pesoGPedra, pesoPedraUnitario } = params;

  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [validacaoIA, setValidacaoIA] = useState<ValidacaoIA | null>(null);
  const [validando, setValidando] = useState(false);

  // Peso mudou depois de já ter validado → precisa validar de novo.
  useEffect(() => { if (validacaoIA) setValidacaoIA(null); }, [qtd, pesoGPedra]); // eslint-disable-line

  const validarComIA = useCallback(async (file: File, valor: number, tipo: "metal" | "pedra" = "metal") => {
    setValidando(true); setValidacaoIA(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("peso", String(valor));
    if (tipo === "pedra") fd.append("tipo", "pedra");
    const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
    setValidacaoIA(await res.json());
    setValidando(false);
  }, []);

  const handleFoto = useCallback(async (file: File) => {
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    setValidacaoIA(null);
    if (isPedra) {
      const g = parseFloat(pesoGPedra);
      if (!isNaN(g) && g > 0) await validarComIA(file, gramasToCt(g), "pedra");
    } else {
      const num = parseFloat(qtd);
      if (!isNaN(num) && num > 0) {
        const valorIA = pesoPedraUnitario !== null ? num * pesoPedraUnitario : num;
        await validarComIA(file, valorIA, "metal");
      }
    }
  }, [qtd, pesoGPedra, validarComIA, isPedra, pesoPedraUnitario]);

  const handleRevalidar = useCallback(() => {
    if (!fotoFile) return;
    if (isPedra) {
      const g = parseFloat(pesoGPedra);
      if (!isNaN(g) && g > 0) validarComIA(fotoFile, gramasToCt(g), "pedra");
    } else {
      const num = parseFloat(qtd);
      if (!isNaN(num) && num > 0) {
        const valorIA = pesoPedraUnitario !== null ? num * pesoPedraUnitario : num;
        validarComIA(fotoFile, valorIA, "metal");
      }
    }
  }, [fotoFile, qtd, pesoGPedra, validarComIA, isPedra, pesoPedraUnitario]);

  function resetFoto() {
    setFotoFile(null); setFotoPreview(null); setValidacaoIA(null); setValidando(false);
  }

  return { fotoFile, fotoPreview, validacaoIA, validando, handleFoto, handleRevalidar, resetFoto };
}
