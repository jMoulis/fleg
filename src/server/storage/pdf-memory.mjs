// The pinned Emscripten build defines (rather than imports) its memory. Clamp
// that declaration before compilation: the WASM engine enforces the ceiling,
// including memory.grow instructions, unlike Node's JS-only resourceLimits.
// This reads WASM metadata, never PDF syntax. Unexpected binaries fail closed.
export function capWasmMemory(bytes, maximumPages) {
  if (
    !Number.isInteger(maximumPages) ||
    maximumPages < 1 ||
    maximumPages > 65536
  )
    throw new Error("Invalid WASM memory budget");
  const header = [0, 97, 115, 109, 1, 0, 0, 0];
  if (!header.every((value, index) => bytes[index] === value))
    throw new Error("Unexpected WASM header");
  let offset = 8;
  const read = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      if (offset >= bytes.length) throw new Error("Truncated WASM");
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** (7 * i);
      if (!(byte & 128)) {
        if (value > 0xffffffff) throw new Error("Invalid WASM integer");
        return value;
      }
    }
    throw new Error("Invalid WASM integer");
  };
  const encode = (value) => {
    const result = [];
    do {
      const byte = value % 128;
      value = Math.floor(value / 128);
      result.push(byte | (value ? 128 : 0));
    } while (value);
    return result;
  };
  let replacement;
  while (offset < bytes.length) {
    const start = offset;
    const id = bytes[offset++];
    const length = read();
    const end = offset + length;
    if (end > bytes.length) throw new Error("Truncated WASM section");
    if (id === 5) {
      if (replacement || read() !== 1 || read() !== 1)
        throw new Error("Expected one bounded non-shared 32-bit memory");
      const minimum = read();
      const maximum = read();
      if (offset !== end || minimum > maximumPages || maximum < minimum)
        throw new Error("Unexpected WASM memory declaration");
      const content = [
        1,
        1,
        ...encode(minimum),
        ...encode(Math.min(maximum, maximumPages)),
      ];
      replacement = {
        start,
        end,
        bytes: [5, ...encode(content.length), ...content],
      };
    }
    offset = end;
  }
  if (!replacement) throw new Error("Missing WASM memory");
  const result = new Uint8Array(
    bytes.length -
      (replacement.end - replacement.start) +
      replacement.bytes.length,
  );
  result.set(bytes.subarray(0, replacement.start));
  result.set(replacement.bytes, replacement.start);
  result.set(
    bytes.subarray(replacement.end),
    replacement.start + replacement.bytes.length,
  );
  return result;
}
