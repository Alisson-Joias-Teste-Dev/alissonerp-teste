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

const BASE_URL = process.env.NEXT_PUBLIC_TSL_HTTP_URL || "http://localhost:9101";
const POLL_MS = 500;
const DEDUP_MS = 3000;

export function useTslReader() {
  const [state, setState] = useState<TSLReaderState>({
    status: { connected: false },
    scanning: false,
    epcs: [],
    firmware: null,
    lastError: null,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const epcsRef = useRef<EPCRead[]>([]);
  const knownEpcsRef = useRef<Set<string>>(new Set());

  const updateState = useCallback((patch: Partial<TSLReaderState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`${BASE_URL}/status`);
        if (!res.ok) return;
        const data = await res.json();

        updateState({
          status: {
            connected: data.connected ?? false,
            port: data.port,
            scanning: data.scanning ?? false,
            error: data.com_error ?? null,
          },
          scanning: data.scanning ?? false,
          firmware: data.firmware ?? null,
        });

        if (Array.isArray(data.epcs)) {
          for (const epc of data.epcs) {
            if (knownEpcsRef.current.has(epc)) continue;
            knownEpcsRef.current.add(epc);
            const now = Date.now();
            const prev = epcsRef.current;
            const dupe = prev.some((p) => p.epc === epc && now - p.ts < DEDUP_MS);
            if (dupe) continue;
            const updated = [{ epc, ts: now }, ...prev].slice(0, 5000);
            epcsRef.current = updated;
            updateState({ epcs: updated });
          }
        }
      } catch (err) {
        updateState({
          status: { connected: false },
          scanning: false,
          lastError: err instanceof Error ? err.message : "Erro de conexao",
        });
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [updateState]);

  const sendCmd = useCallback(async (cmd: string) => {
    try {
      await fetch(`${BASE_URL}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd }),
      });
    } catch {
      // silently fail
    }
  }, []);

  const startScanning = useCallback(() => sendCmd("inventory_start"), [sendCmd]);
  const stopScanning = useCallback(() => sendCmd("inventory_stop"), [sendCmd]);
  const reset = useCallback(() => {
    epcsRef.current = [];
    knownEpcsRef.current.clear();
    sendCmd("reset");
    updateState({ epcs: [], lastError: null });
  }, [sendCmd, updateState]);

  return { ...state, startScanning, stopScanning, reset };
}
