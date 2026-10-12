import sharp from "sharp";

/** Decode and re-encode untrusted bytes. Header MIME and filename alone are not evidence. */
export async function normalizeArtistAvatar(file: File): Promise<File> {
  if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error("Profile image must be between 1 byte and 10MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  const expected = ext === "jpg" || ext === "jpeg" ? "jpeg" : ext;
  if (!expected || !["jpeg", "png", "webp"].includes(expected)) throw new Error("Choose a JPG, PNG or WebP profile image.");
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const image = sharp(bytes, { limitInputPixels: 16 * 1024 * 1024, failOn: "warning", animated: false });
    const meta = await image.metadata();
    if (meta.format !== expected || !meta.width || !meta.height || (meta.pages || 1) > 1) throw new Error("Unsupported image content.");
    const normalized = await image.rotate().toFormat(expected as "jpeg" | "png" | "webp").toBuffer();
    if (normalized.byteLength > 10 * 1024 * 1024) throw new Error("Decoded image is too large.");
    // Re-encoding strips embedded metadata and yields a trusted MIME type.
    return new File([new Uint8Array(normalized)], `avatar.${expected === "jpeg" ? "jpg" : expected}`, { type: `image/${expected}` });
  } catch {
    throw new Error("Choose a valid, static JPG, PNG or WebP image under 10MB and 16 megapixels.");
  }
}
