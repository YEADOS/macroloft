/**
 * Downscale a captured photo to at most `maxEdge` px on its long side and
 * re-encode as JPEG, returning raw base64 (no data: prefix). Cuts upload size
 * and vision-token cost before it ever hits the server.
 */
export async function downscaleImage(
  file: File,
  maxEdge = 1024,
  quality = 0.8,
): Promise<{ base64: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the image on this device.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg" };
}
