import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
vi.mock("server-only", () => ({}));
import { validatePdf } from "@/server/storage/pdf-validator";
import { capWasmMemory } from "@/server/storage/pdf-memory.mjs";

// Minimal in-memory PDF fixture with computed xref offsets, not a fake %PDF
// prefix. No authoring tool, user document or external service is involved.
function pdf(pages: number, broken = false) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(" ")}] >>`,
    ...Array.from(
      { length: pages },
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    ),
  ];
  let text = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${broken ? 1 : start}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

describe("bounded private PDF validation", () => {
  it("parses actual pages, including the exact 60-page ceiling", async () => {
    expect(await validatePdf(pdf(1))).toEqual({
      pageCount: 1,
      parserVersion: "pdfium-2.1.13-fleg-1",
    });
    expect((await validatePdf(pdf(60))).pageCount).toBe(60);
  });
  it("rejects excessive pages, repaired cross references, empty and forged PDFs", async () => {
    for (const bytes of [
      pdf(61),
      pdf(0),
      pdf(1, true),
      new TextEncoder().encode("%PDF-1.7 not a PDF"),
    ])
      await expect(validatePdf(bytes)).rejects.toMatchObject({
        code: "STORAGE_INTEGRITY",
      });
  });
  it("bounds concurrency without transferring/detaching the caller's bytes", async () => {
    const bytes = pdf(1);
    const first = validatePdf(bytes);
    await expect(validatePdf(bytes)).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
    await first;
    expect(bytes.length).toBeGreaterThan(0);
  });
  it("rejects encryption even when the user password is empty", async () => {
    // Blank page generated locally with Ghostscript pdfwrite, R3/128-bit,
    // owner password 'fleg-test-owner', empty user password. No business data.
    const encrypted = Buffer.from(
      "JVBERi0xLjQKJcfsj6IKJSVJbnZvY2F0aW9uOiBncyAtcSAtZEJBVENIIC1kTk9QQVVTRSAtc0RFVklDRT1wZGZ3cml0ZSAtZENvbXBhdGliaWxpdHlMZXZlbD0xLjQgLWRPbWl0WE1QPXRydWUgLWRPbWl0SW5mb0RhdGU9dHJ1ZSAtc093bmVyUGFzc3dvcmQ9PyAtc1VzZXJQYXNzd29yZD0gLWRFbmNyeXB0aW9uUj0zIC1kS2V5TGVuZ3RoPTEyOCAtc091dHB1dEZpbGU9PyA/ID8KNSAwIG9iago8PC9MZW5ndGggNiAwIFIvRmlsdGVyIC9GbGF0ZURlY29kZT4+CnN0cmVhbQpNcI8TmKxcQ1VLS/cFy/CkB/Xmw3RsLGVuZHN0cmVhbQplbmRvYmoKNiAwIG9iagoyMwplbmRvYmoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovUGFyZW50IDMgMCBSCi9SZXNvdXJjZXM8PC9Qcm9jU2V0Wy9QREZdCj4+Ci9Db250ZW50cyA1IDAgUgo+PgplbmRvYmoKMyAwIG9iago8PCAvVHlwZSAvUGFnZXMgL0tpZHMgWwo0IDAgUgpdIC9Db3VudCAxCj4+CmVuZG9iagoxIDAgb2JqCjw8L1R5cGUgL0NhdGFsb2cgL1BhZ2VzIDMgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8L1Byb2R1Y2VyKFwwMTNxXDAwNGRcMzcyXDM0M1wwMzVMOlwwMjRcMjE3dlwwMjJcMDA3XDIzNVwzMDJ+XDIxMVwzMjRcMzcwXDMxMDMvKT4+ZW5kb2JqCjcgMCBvYmoKPDwvRmlsdGVyIC9TdGFuZGFyZCAvViAyIC9MZW5ndGggMTI4IC9SIDMgL1AgLTQgL08gKI3D9D3eFjg8MB8AOK0akIJgpiNhpM/4HoP4Gfak73HbKQovVSAoXG5ZEIaHjj9+sznO1As74LJcKL9OXk51ikFkAE5W//oBCCk+PgplbmRvYmoKeHJlZgowIDgKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwNTAwIDAwMDAwIG4gCjAwMDAwMDA1NDggMDAwMDAgbiAKMDAwMDAwMDQ0MSAwMDAwMCBuIAowMDAwMDAwMzI3IDAwMDAwIG4gCjAwMDAwMDAyMTYgMDAwMDAgbiAKMDAwMDAwMDMwOSAwMDAwMCBuIAowMDAwMDAwNjQ2IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgOCAvUm9vdCAxIDAgUiAvSW5mbyAyIDAgUgovSUQgWzw4QkZBQUQxQ0Q2MDNFOTIyRDA2OTMyQzE4Q0M2MDIyNz48OEJGQUFEMUNENjAzRTkyMkQwNjkzMkMxOENDNjAyMjc+XQovRW5jcnlwdCA3IDAgUiA+PgpzdGFydHhyZWYKNzg5CiUlRU9GCg==",
      "base64",
    );
    await expect(validatePdf(encrypted)).rejects.toMatchObject({
      code: "STORAGE_INTEGRITY",
    });
  });
  it("compiles the pinned capped binary and lets the WASM engine refuse excess growth", () => {
    // Tiny WASM exporting one 1..100 page memory, no code or PDF semantics.
    const wasm = Uint8Array.from([
      0, 97, 115, 109, 1, 0, 0, 0, 5, 4, 1, 1, 1, 100, 7, 10, 1, 6, 109, 101,
      109, 111, 114, 121, 2, 0,
    ]);
    const compiled = new WebAssembly.Module(capWasmMemory(wasm, 2));
    const memory = new WebAssembly.Instance(compiled).exports
      .memory as WebAssembly.Memory;
    memory.grow(1);
    expect(() => memory.grow(1)).toThrow();
    const require = createRequire(import.meta.url);
    const actual = readFileSync(
      join(dirname(require.resolve("@hyzyla/pdfium")), "pdfium.wasm"),
    );
    expect(WebAssembly.validate(capWasmMemory(actual, 4096))).toBe(true);
    expect(() => capWasmMemory(wasm, 0)).toThrow();
    expect(() => capWasmMemory(wasm.subarray(0, 11), 2)).toThrow();
  });
});
