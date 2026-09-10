import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { UserGuideSection } from "@/domain/help/user-guide";

export async function readUserGuideSection(
  section: UserGuideSection,
): Promise<string | null> {
  try {
    return await readFile(
      join(process.cwd(), "docs", "user", section.fileName),
      "utf8",
    );
  } catch {
    return null;
  }
}
