import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getUserGuideSection,
  resolveUserGuideHref,
  userGuideSections,
} from "@/domain/help/user-guide";

describe("user guide", () => {
  it("exposes unique validated sections backed by Markdown files", async () => {
    expect(new Set(userGuideSections.map(({ slug }) => slug)).size).toBe(
      userGuideSections.length,
    );

    for (const section of userGuideSections) {
      expect(getUserGuideSection(section.slug)).toEqual(section);
      const content = await readFile(
        join(process.cwd(), "docs", "user", section.fileName),
        "utf8",
      );
      expect(content).toMatch(/^# \S.+/);
      expect(content.length).toBeGreaterThan(500);
    }
  });

  it("maps documentation links to the authorized store guide", () => {
    const baseHref = "/reseau-test/stores/0123456789abcdef01234567/help";

    expect(
      resolveUserGuideHref(
        "./07_GLOSSARY_AND_TROUBLESHOOTING.md#copilote",
        baseHref,
      ),
    ).toBe(`${baseHref}/glossary-troubleshooting#copilote`);
    expect(resolveUserGuideHref("../README.md", baseHref)).toBe(baseHref);
    expect(resolveUserGuideHref("#imports", baseHref)).toBe("#imports");
    expect(
      resolveUserGuideHref("./08_PILOT_BETA_CHECKLIST.md", baseHref),
    ).toBe(`${baseHref}/pilot-beta-checklist`);
  });

  it("rejects unknown sections and unsafe or unresolved links", () => {
    expect(getUserGuideSection("../../secrets")).toBeNull();
    expect(resolveUserGuideHref("javascript:alert(1)", "/help")).toBeUndefined();
    expect(resolveUserGuideHref("./UNKNOWN.md", "/help")).toBeUndefined();
  });
});
