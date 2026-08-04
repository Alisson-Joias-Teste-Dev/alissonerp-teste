"use client";

/**
 * useLocalizacaoMotoboy — captura a posição GPS do navegador quando o
 * motoboy finaliza uma corrida (avulsa ou entrega ao cliente).
 *
 * REGRA DE NEGÓCIO (pedido do Jonathan, 03/08/2026): localização obrigatória
 * ao finalizar — sem geocodificação reversa (custo/serviço externo novo),
 * só coordenadas cruas. O componente que consome monta o link do Google Maps
 * (`https://www.google.com/maps?q=lat,lng`) a partir de `coords`.
 *
 * IMPACTO SE ALTERADO: usado por FinalizarAvulsoModal e ConfirmarEntregaModal
 * para não duplicar a mesma lógica de captura/erro/retry nos dois modais.
 */
import { useCallback, useEffect, useState } from "react";

export interface LocalizacaoCoords {
  latitude: number;
  longitude: number;
}

export function useLocalizacaoMotoboy(ativo: boolean) {
  const [coords, setCoords] = useState<LocalizacaoCoords | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  const capturar = useCallback(() => {
    if (!navigator.geolocation) {
      setErro("Este navegador não suporta localização. Atualize o app ou tente por outro celular.");
      return;
    }
    setBuscando(true);
    setErro("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setBuscando(false);
      },
      () => {
        setErro("Não foi possível obter sua localização. Ative o GPS/permissão e tente de novo.");
        setBuscando(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    if (ativo) capturar();
    else { setCoords(null); setErro(""); setBuscando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  return { coords, buscando, erro, tentarNovamente: capturar };
}
