"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X } from "lucide-react";

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  file: File | null;
  onClear?: () => void;
  accept?: Record<string, string[]>;
}

export function DropZone({ onFileSelect, file, onClear, accept }: DropZoneProps) {
  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) onFileSelect(accepted[0]);
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-colors cursor-pointer ${
        isDragActive
          ? "border-esmeralda-500 bg-esmeralda-50"
          : "border-gray-300 bg-gray-50 hover:bg-gray-100"
      }`}
    >
      <input {...getInputProps()} />
      {file ? (
        <div className="flex items-center gap-3 w-full">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <File size={18} className="text-esmeralda-500 shrink-0" />
            <span className="text-sm text-gray-700 truncate">{file.name}</span>
          </div>
          {onClear && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-1 rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>
      ) : (
        <>
          <Upload size={24} className="text-gray-400 mb-1.5" />
          <p className="text-sm font-medium text-gray-700">
            {isDragActive ? "Solte a foto aqui..." : "Arraste a foto da balança"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">ou clique para selecionar</p>
        </>
      )}
    </div>
  );
}
