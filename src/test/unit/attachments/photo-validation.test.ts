import { describe, expect, it } from "vitest";

import {
  detectPhotoMimeType,
  normalizePhotoFileName,
  PhotoValidationError,
  validatePhotoBytes,
} from "@/domain/attachments/photo-validation";

describe("photo validation", () => {
  it("detects a PNG signature and accepts the matching declaration", () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    expect(detectPhotoMimeType(bytes)).toBe("image/png");
    expect(
      validatePhotoBytes({
        bytes,
        declaredMimeType: "image/png",
        declaredSizeBytes: bytes.byteLength,
      }),
    ).toBe("image/png");
  });

  it("rejects a MIME declaration that does not match the bytes", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    expect(() =>
      validatePhotoBytes({
        bytes,
        declaredMimeType: "image/png",
        declaredSizeBytes: bytes.byteLength,
      }),
    ).toThrow(PhotoValidationError);
  });

  it("removes paths and control characters from the stored file name", () => {
    expect(normalizePhotoFileName("../rayon\u0000.jpg")).toBe("rayon.jpg");
    expect(normalizePhotoFileName("C:\\photos\\ilot.webp")).toBe("ilot.webp");
  });
});
