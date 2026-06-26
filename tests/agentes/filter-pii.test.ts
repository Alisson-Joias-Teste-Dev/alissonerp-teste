import { describe, it, expect } from 'vitest';
import { filterPII } from '../../src/agentes/core/prompt/filter-pii';

describe('filterPII', () => {
  it('deve remover CPF', () => {
    const input = 'Meu CPF é 123.456.789-00';
    const result = filterPII(input);
    expect(result).not.toContain('123.456.789-00');
    expect(result).toContain('[CPF REMOVIDO]');
  });

  it('deve remover CNPJ', () => {
    const input = 'CNPJ da empresa: 12.345.678/0001-90';
    const result = filterPII(input);
    expect(result).not.toContain('12.345.678/0001-90');
    expect(result).toContain('[CNPJ REMOVIDO]');
  });

  it('deve remover número de cartão de crédito', () => {
    const input = 'Cartão 4111111111111111 usado';
    const result = filterPII(input);
    expect(result).not.toContain('4111111111111111');
    expect(result).toContain('[CARTAO REMOVIDO]');
  });

  it('deve manter texto normal intacto', () => {
    const input = 'Quero consultar a ordem 1234';
    const result = filterPII(input);
    expect(result).toBe('Quero consultar a ordem 1234');
  });

  it('deve manter texto com números de telefone', () => {
    const input = 'Me liga no 11999998888';
    const result = filterPII(input);
    expect(result).toContain('11999998888');
  });
});
