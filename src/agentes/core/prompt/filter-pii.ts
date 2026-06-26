export function filterPII(text: string): string {
  return text
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF REMOVIDO]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ REMOVIDO]')
    .replace(/\b\d{3}-\d{2}\b/g, '')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, '[CARTAO REMOVIDO]');
}
