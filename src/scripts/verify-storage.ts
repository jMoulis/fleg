import { randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { parseArgs } from "node:util";
import * as z from "zod";
import {
  acceptanceLimits,
  acceptanceStoreId,
  cleanupAcceptance,
  parseAcceptanceReport,
  prepareAcceptance,
  runAcceptance,
  type AcceptanceReport,
} from "./storage-acceptance/probe";

let phase = "arguments";
async function syncDirectory(directory: string) {
  const parent = await open(directory, constants.O_RDONLY);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      execute: { type: "boolean", default: false },
      cleanup: { type: "boolean", default: false },
      "run-id": { type: "string" },
      "confirm-store": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const runId = z.uuid().parse(values["run-id"] ?? randomUUID());
  if (values.cleanup && (!values.execute || !values["run-id"]))
    throw new Error("Cleanup requires execution and the original run id");
  if (!values.execute) {
    // No env load, provider import, network call or file write in dry-run.
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          limits: acceptanceLimits,
          report: prepareAcceptance(runId),
          note: "Synthetic local-to-dev Blob probe only; does not authorize production, callbacks or app uploads.",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (values["confirm-store"] !== acceptanceStoreId)
    throw new Error("Explicit development-store confirmation required");
  phase = "local-environment";
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  const { acceptanceConfig, createAcceptancePort } = await import(
    "./storage-acceptance/provider"
  );
  const config = acceptanceConfig(process.env, runId);
  // SDK 2.8.0 requestApi defaults to ten retries. Disable in this CLI process
  // so each reserved operation really permits at most one HTTP attempt.
  process.env.VERCEL_BLOB_RETRIES = "0";
  // Review the retry/transport implementation again on any SDK upgrade.
  const manifest: unknown = JSON.parse(
    await readFile(resolve("node_modules/@vercel/blob/package.json"), "utf8"),
  );
  z.object({ version: z.literal("2.8.0") }).parse(manifest);
  const port = createAcceptancePort(config);
  phase = "local-manifest";
  const root = resolve(".local-backups/blob-acceptance");
  for (const directory of [resolve(".local-backups"), root]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Unsafe acceptance directory");
    await syncDirectory(resolve(directory, ".."));
  }
  const directory = resolve(root, runId);
  if (!values.cleanup) await mkdir(directory, { mode: 0o700 }); // exclusive run, never overwrite
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Unsafe run directory");
  await syncDirectory(root);
  const lockPath = resolve(directory, "operator.lock");
  const lock = await open(lockPath, "wx", 0o600);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, runId }));
    await lock.sync();
    const reportPath = resolve(directory, "report.json");
    async function save(report: AcceptanceReport) {
      const temporary = resolve(directory, `${randomUUID()}.tmp`);
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(report, null, 2));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, reportPath);
      await syncDirectory(directory);
    }
    let report: AcceptanceReport;
    if (values.cleanup) {
      const file = await open(
        reportPath,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 32000)
          throw new Error("Invalid acceptance manifest");
        report = parseAcceptanceReport(
          JSON.parse(await file.readFile("utf8")),
          runId,
        );
      } finally {
        await file.close();
      }
      phase = "cleanup";
      await cleanupAcceptance(report, port, save);
    } else {
      report = prepareAcceptance(runId);
      await save(report);
      phase = "probe";
      await runAcceptance(report, port, save);
    }
    console.log(
      JSON.stringify(
        {
          mode: values.cleanup ? "cleanup" : "execute",
          reportPath,
          report,
          note: "Observed absence is not proof of transfer expiry. Keep this manifest; app uploads stay release-locked.",
        },
        null,
        2,
      ),
    );
    if (
      (!values.cleanup && report.status !== "passed") ||
      report.objects.some((object) => object.cleanup === "pending")
    )
      process.exitCode = 1;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

main().catch(() => {
  // No stack/raw error: provider and config errors can contain credentials.
  console.error(
    `Storage acceptance stopped (${phase}). No application activation. Inspect the local run manifest if created; use --cleanup with its run id for pending objects.`,
  );
  process.exitCode = 1;
});
