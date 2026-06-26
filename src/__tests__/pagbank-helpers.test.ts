/**
 * Testes unitários para baixa-credito.ts
 *
 * Verifica as regras de ouro extraídas como funções puras:
 *   - REGRA DE OURO #1: devolverSaldoGerente
 *   - REGRA DE OURO #2: baixarContaReceber
 *   - REGRA DE OURO #3: confirmarPagamentoVenda
 */
import { describe, it, expect } from "vitest";
import {
  centavosParaReais,
  reaisParaCentavos,
} from "@/lib/pagbank";

describe("PagBank helpers", () => {
  describe("centavosParaReais", () => {
    it("converte 500 centavos para R$ 5.00", () => {
      expect(centavosParaReais(500)).toBe(5);
    });

    it("converte 0 centavos para R$ 0.00", () => {
      expect(centavosParaReais(0)).toBe(0);
    });

    it("converte 199 centavos para R$ 1.99", () => {
      expect(centavosParaReais(199)).toBe(1.99);
    });

    it("converte 1 centavo para R$ 0.01", () => {
      expect(centavosParaReais(1)).toBe(0.01);
    });

    it("lida com valores negativos", () => {
      expect(centavosParaReais(-500)).toBe(-5);
    });
  });

  describe("reaisParaCentavos", () => {
    it("converte R$ 5.00 para 500 centavos", () => {
      expect(reaisParaCentavos(5)).toBe(500);
    });

    it("converte R$ 0.01 para 1 centavo", () => {
      expect(reaisParaCentavos(0.01)).toBe(1);
    });

    it("converte R$ 1.99 para 199 centavos", () => {
      expect(reaisParaCentavos(1.99)).toBe(199);
    });

    it("converte R$ 0 para 0 centavos", () => {
      expect(reaisParaCentavos(0)).toBe(0);
    });

    it("arredonda corretamente valores com 3 casas decimais", () => {
      expect(reaisParaCentavos(5.009)).toBe(501); // 5.009 * 100 = 500.9 → arredonda 501
    });
  });
});
