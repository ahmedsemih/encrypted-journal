/**
 * Decrypted images as in-memory blob URLs. Like the undo history, they only
 * live while the journal is unlocked and are revoked on lock.
 */
import { api } from "./api";

export const SCHEME = "attachment:";
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

const cache = new Map<string, Promise<string>>();

function mimeOf(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  return "image/webp";
}

export function attachmentUrl(id: string): Promise<string> {
  let url = cache.get(id);
  if (!url) {
    url = api.getAttachment(id).then((buf) => {
      const bytes = new Uint8Array(buf);
      return URL.createObjectURL(new Blob([bytes], { type: mimeOf(bytes) }));
    });
    // Do not cache failures, so a later retry can succeed.
    url.catch(() => cache.delete(id));
    cache.set(id, url);
  }
  return url;
}

export function clearAttachmentCache() {
  for (const url of cache.values()) url.then(URL.revokeObjectURL, () => {});
  cache.clear();
}

export function isImagePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

/** Markdown for an inserted image; the file name (sans extension) becomes the alt text. */
export function imageMarkdown(id: string, name: string): string {
  const alt = name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
  return `![${alt}](${SCHEME}${id})`;
}
