"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface Props {
  url: string;
  size?: number;
}

export default function QrCodeApk({ url, size = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: size,
        margin: 2,
        color: { dark: "#1565C0", light: "#FFFFFF" },
      });
    }
  }, [url, size]);

  const copiarLink = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} className="rounded-xl shadow-md" />
      <div className="flex gap-2">
        <button
          onClick={copiarLink}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: copied ? "#4CAF50" : "#1565C0" }}
        >
          {copied ? "Link copiado!" : "Copiar link"}
        </button>
        <a
          href={url}
          download
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: "#1565C0" }}
        >
          Baixar APK
        </a>
      </div>
    </div>
  );
}
