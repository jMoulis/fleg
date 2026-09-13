import { parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { capWasmMemory } from "./pdf-memory.mjs";

// No credentials, filesystem paths or provider URLs are passed by callers.
// No forms, JavaScript, OCR, rendering or network features are initialized.
const require = createRequire(import.meta.url);
let contentStarted = false;
try {
  const { bytes, maxPages, wasmMemoryPages } = workerData;
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 25 * 1024 * 1024 ||
    maxPages !== 60 ||
    wasmMemoryPages !== 4096
  )
    throw new Error("Invalid worker input");
  const { PDFiumModule } = require("@hyzyla/pdfium");
  const wasm = capWasmMemory(
    readFileSync(
      // Turbopack rewrites require.resolve() to a module ID even for externals.
      // This pinned asset is explicitly included in the Vercel function traces.
      join(process.cwd(), "node_modules/@hyzyla/pdfium/dist/pdfium.wasm"),
    ),
    wasmMemoryPages,
  );
  const compiled = new WebAssembly.Module(wasm);
  if (
    WebAssembly.Module.imports(compiled).some((item) => item.kind === "memory")
  )
    throw new Error("Unexpected imported memory");
  const pdf = await PDFiumModule({
    instantiateWasm(imports, receive) {
      const instance = new WebAssembly.Instance(compiled, imports);
      receive(instance);
      return instance.exports;
    },
    print() {},
    printErr() {},
  });
  pdf._FPDF_InitLibrary();
  contentStarted = true;
  // Some exporters fill a buffer with NULs after the final %%EOF. PDFium then
  // rebuilds an otherwise valid xref because its trailer search is bounded.
  // Shorten only the analysis view, never the stored bytes/hash/quota input.
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  let eofEnd = end;
  while ([9, 10, 12, 13, 32].includes(bytes[eofEnd - 1])) eofEnd--;
  const hasTerminalEof =
    eofEnd >= 6 &&
    [10, 13].includes(bytes[eofEnd - 6]) &&
    new TextDecoder().decode(bytes.subarray(eofEnd - 5, eofEnd)) === "%%EOF";
  const analysisBytes =
    end < bytes.length && hasTerminalEof ? bytes.subarray(0, end) : bytes;
  const pointer = pdf._malloc(analysisBytes.length);
  if (!pointer) throw new Error("Allocation refused");
  pdf.HEAPU8.set(analysisBytes, pointer);
  const document = pdf._FPDF_LoadMemDocument(pointer, analysisBytes.length, 0);
  if (
    !document ||
    !pdf._FPDF_DocumentHasValidCrossReferenceTable(document) ||
    pdf._FPDF_GetSecurityHandlerRevision(document) !== -1
  )
    throw new Error("Unreadable, repaired or encrypted PDF");
  const pageCount = pdf._FPDF_GetPageCount(document);
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > maxPages)
    throw new Error("Invalid page count");
  for (let index = 0; index < pageCount; index++) {
    const page = pdf._FPDF_LoadPage(document, index);
    if (!page) throw new Error("Unreadable page");
    pdf._FPDF_ClosePage(page);
  }
  pdf._FPDF_CloseDocument(document);
  pdf._free(pointer);
  pdf._FPDF_DestroyLibrary();
  parentPort.postMessage({ pageCount, parserVersion: "pdfium-2.1.13-fleg-2" });
} catch {
  // Never emit document content or library diagnostics.
  parentPort.postMessage({
    error: contentStarted ? "PDF_UNREADABLE" : "PDF_VALIDATOR_UNAVAILABLE",
  });
}
