import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("combines conditional class names", () => {
    expect(cn("rounded", false && "hidden", "px-4")).toBe("rounded px-4");
  });

  it("resolves conflicting Tailwind utilities", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
