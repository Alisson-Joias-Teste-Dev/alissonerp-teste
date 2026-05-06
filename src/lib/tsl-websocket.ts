"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface EPCRead {
  epc: string;
  ts: number;
}

export interface TSLBridgeStatus {
  connected: boolean;
  port?: string;
  baud?: number;
  scanning?: boolean;
  error?: string;
}

export interface TSLReaderState {
  status: TSLBridgeStatus;
  scanning: boolean;
  epcs: EPCRead[];
  firmware: string | null;
  lastError: string | null;
}

const WS_URL = process.env.NEXT_PUBLIC_TSL_WS_URL || "ws://localhost:9101";
const DEDUP_MS = 3000;

export function useTslReader() {
  const [state, setState] = useState<TSLReaderState>({
    status: { connected: false },
    scanning: false,
    epcs: [],
    firmware: null,
    lastError: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epcsRef = useRef<EPCRead[]>([]);
  const connectRef = useRef<(() => void) | null>(null);

  const updateState = useCallback((patch: Partial<TSLReaderState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    const dedupMs = DEDUP_MS;
    const wsUrl = WS_URL;

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          wsRef.current = ws;
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        };

        ws.onmessage = (event) => {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(event.data as string);
          } catch {
            return;
          }

          switch (data.type) {
            case "status": {
              const s = data as unknown as TSLBridgeStatus;
              updateState({
                status: s,
                scanning: s.scanning ?? false,
              });
              break;
            }

            case "epc": {
              const epc = data.epc as string;
              const ts = Date.now();
              const prev = epcsRef.current;

              const dupe = prev.some(
                (p) => p.epc === epc && ts - p.ts < dedupMs
              );
              if (dupe) break;

              const updated = [{ epc, ts }, ...prev].slice(0, 5000);
              epcsRef.current = updated;
              updateState({ epcs: updated });
              break;
            }

            case "inventory_status": {
              const status = data.status as string;
              updateState({
                scanning: status === "started",
                lastError: null,
              });
              break;
            }

            case "firmware": {
              updateState({ firmware: data.version as string });
              break;
            }

            case "error": {
              updateState({ lastError: data.message as string });
              break;
            }
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          updateState({
            status: { connected: false },
            scanning: false,
          });
          reconnectTimer.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    }

    connectRef.current = connect;
    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [updateState]);

  const sendCmd = useCallback((cmd: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ cmd }));
    }
  }, []);

  const startScanning = useCallback(() => sendCmd("inventory_start"), [sendCmd]);
  const stopScanning = useCallback(() => sendCmd("inventory_stop"), [sendCmd]);
  const reset = useCallback(() => {
    epcsRef.current = [];
    updateState({ epcs: [], lastError: null });
  }, [updateState]);

  const reconnect = useCallback(() => {
    connectRef.current?.();
  }, []);

  return { ...state, startScanning, stopScanning, reset, reconnect };
}
