/**
 * fotos-base64.ts — leitura de múltiplos arquivos de imagem como base64 (client-side).
 *
 * O QUE: converte uma seleção de arquivos (input type=file multiple) em data
 * URLs (base64), prontos para enviar no body JSON de uma API route.
 *
 * POR QUE: extraído para não duplicar a mesma leitura (FileReader + Promise.all)
 * em cada modal que anexa fotos opcionais na confirmação de entrega
 * (ConfirmarEntregaModal e FinalizarAvulsoModal, migration 357) — mesma regra
 * de negócio (fotos são OPCIONAIS, nunca bloqueiam a ação principal), mesma
 * implementação.
 *
 * IMPACTO SE DUPLICADO EM VEZ DE REUSADO: os dois modais podem divergir em
 * detalhes (ex.: um lê como data URL, outro como binário puro) e um bug de
 * leitura corrigido num lugar não se propaga pro outro.
 */

/**
 * Lê os arquivos selecionados como data URLs (base64), respeitando um limite
 * de quantidade — arquivos excedentes são simplesmente ignorados (o caller
 * decide se avisa o usuário).
 */
export function lerArquivosComoBase64(
  files: FileList | File[],
  limiteQtd?: number,
): Promise<string[]> {
  const lista = Array.from(files).slice(0, limiteQtd ?? Infinity);
  return Promise.all(
    lista.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    ),
  );
}
