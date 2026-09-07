import {
  attachmentMaxSizeBytes,
  attachmentMimeTypeSchema,
  type AttachmentMimeType,
} from "@/domain/attachments/schemas";

export class PhotoValidationError extends Error {
  readonly code = "PHOTO_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "PhotoValidationError";
  }
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function hasAsciiAt(
  bytes: Uint8Array,
  offset: number,
  expected: string,
): boolean {
  return [...expected].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

export function detectPhotoMimeType(
  bytes: Uint8Array,
): AttachmentMimeType | null {
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    hasAsciiAt(bytes, 0, "RIFF") &&
    hasAsciiAt(bytes, 8, "WEBP")
  ) {
    return "image/webp";
  }
  return null;
}

export function validatePhotoBytes(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
  declaredSizeBytes: number;
}): AttachmentMimeType {
  const declaredMimeType = attachmentMimeTypeSchema.safeParse(
    input.declaredMimeType,
  );
  if (!declaredMimeType.success) {
    throw new PhotoValidationError(
      "Seuls les fichiers JPEG, PNG et WebP sont acceptés",
    );
  }
  if (
    input.declaredSizeBytes <= 0 ||
    input.declaredSizeBytes > attachmentMaxSizeBytes ||
    input.bytes.byteLength !== input.declaredSizeBytes
  ) {
    throw new PhotoValidationError("La photo doit peser au maximum 4 Mio");
  }

  const detectedMimeType = detectPhotoMimeType(input.bytes);
  if (!detectedMimeType || detectedMimeType !== declaredMimeType.data) {
    throw new PhotoValidationError(
      "Le contenu du fichier ne correspond pas au format annoncé",
    );
  }
  return detectedMimeType;
}

export function normalizePhotoFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).at(-1) ?? "photo";
  const normalized = baseName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  return normalized || "photo";
}
