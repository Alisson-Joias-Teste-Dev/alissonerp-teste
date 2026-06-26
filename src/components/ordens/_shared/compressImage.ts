/**
 * Comprime imagem via canvas (máx 1920px) e retorna base64.
 * Reduz a qualidade JPEG progressivamente até caber em maxBytes ou atingir quality=0.3.
 */
export async function compressImage(
  file: File,
  maxBytes: number = 2 * 1024 * 1024,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const max = 1920;
      let { width, height } = img;
      if (width > max || height > max) {
        if (width > height) {
          height = Math.round((height * max) / width);
          width = max;
        } else {
          width = Math.round((width * max) / height);
          height = max;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);

      let quality = 0.85;

      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(""); return; }
          if (blob.size <= maxBytes || quality <= 0.3) {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
            return;
          }
          quality -= 0.1;
          tryCompress();
        }, "image/jpeg", quality);
      };

      tryCompress();
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(""); };
    img.src = objectUrl;
  });
}
