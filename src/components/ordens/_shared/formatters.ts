export function fmtData(d: string): string {
  return new Date(d).toLocaleDateString("pt-BR");
}

export function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
