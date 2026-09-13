import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chromium, expect as browserExpect } from "@playwright/test";
import { verifyPhotoLibrary } from "@/test/helpers/photo-library-browser";
import { verifyPhotoQueue } from "@/test/helpers/photo-queue-browser";

// Separate CI job/command: exercises Next's real compiler, not Vitest's loader.
// The isolated fixture has no .env, auth, database, Blob, or provider access.
describe.skipIf(process.env.PDF_RUNTIME_TEST !== "true")(
  "PDF worker in Next.js",
  () => {
    it("validates and rejects PDFs over HTTP with the production worker and Turbopack", async () => {
      const root = process.cwd();
      const parent = join(root, ".local-backups");
      await mkdir(parent, { recursive: true });
      const fixture = await mkdtemp(join(parent, "pdf-runtime-"));
      let child: ChildProcess | undefined;
      let passed = false;
      try {
        await symlink(
          join(root, "node_modules"),
          join(fixture, "node_modules"),
          "dir",
        );
        await symlink(join(root, "src"), join(fixture, "src"), "dir");
        await mkdir(join(fixture, "app", "validate"), { recursive: true });
        await writeFile(
          join(fixture, "package.json"),
          JSON.stringify({ private: true }),
        );
        await writeFile(
          join(fixture, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              module: "esnext",
              moduleResolution: "bundler",
              paths: { "@/*": ["./src/*"] },
              jsx: "preserve",
              esModuleInterop: true,
            },
          }),
        );
        await writeFile(
          join(fixture, "next.config.ts"),
          `
        import appConfig from ${JSON.stringify(join(root, "next.config.ts"))};
        export default {
          serverExternalPackages: appConfig.serverExternalPackages,
          turbopack: { root: ${JSON.stringify(root)} },
          devIndicators: false,
        };
      `,
        );
        await writeFile(
          join(fixture, "app", "validate", "route.ts"),
          `
        import { validatePdf } from "@/server/storage/pdf-validator";
        import { PrivateStorageError } from "@/domain/attachments/private-storage";
        export async function POST(request: Request) {
          try {
            return Response.json(await validatePdf(new Uint8Array(await request.arrayBuffer())));
          } catch (error) {
            const code = error instanceof PrivateStorageError ? error.code : "STORAGE_UNAVAILABLE";
            return Response.json({ code }, { status: code === "STORAGE_INTEGRITY" ? 422 : 503 });
          }
        }
      `,
        );
        if (process.env.DOCUMENT_UPLOAD_BROWSER_TEST === "true") {
          await writeFile(
            join(fixture, "postcss.config.mjs"),
            'export { default } from "../../postcss.config.mjs";',
          );
          await writeFile(
            join(fixture, "app", "layout.tsx"),
            `import "@/app/globals.css"; export default function Layout({children}) { return <html lang="fr"><body>{children}</body></html>; }`,
          );
          await writeFile(
            join(fixture, "app", "page.tsx"),
            `
            import { DocumentManager } from "@/components/documents/document-manager";
            export default function Page() {
              return <DocumentManager storeId={"a".repeat(24)} userId="synthetic-manager" basePath="/" canWrite uploadsAvailable hasCursor={false} documents={{sources:[],nextCursor:null}} />;
            }
          `,
          );
          await mkdir(join(fixture, "app", "photos"));
          await writeFile(
            join(fixture, "app", "photos", "page.tsx"),
            `
            import { PhotoAttachmentManager } from "@/components/attachments/photo-attachment-manager";
            import { legacyPhoto } from "@/test/helpers/photo-library-browser-fixture";
            export default async function Page({searchParams}) {
              const query = await searchParams;
              const userId = query.user === "other" ? "other-manager" : "synthetic-manager";
              return <main className="mx-auto max-w-5xl p-4"><PhotoAttachmentManager key={userId} userId={userId} storeId={"a".repeat(24)} title="Photos du magasin" description="Observations terrain" canWrite uploadsAvailable={query.disabled !== "true"} initialAttachments={[legacyPhoto]} targets={[{label:"Magasin",description:"Vue générale",target:{type:"store"}},{label:"Face A",description:"Plan immuable",target:{type:"fixture",layoutVersionId:"d".repeat(24),fixtureId:"face-a"}}]} /></main>;
            }
          `,
          );
        }
        const socket = createServer();
        socket.listen(0, "127.0.0.1");
        await once(socket, "listening");
        const address = socket.address();
        if (!address || typeof address === "string")
          throw new Error("No test port");
        const port = address.port;
        await new Promise<void>((resolve, reject) =>
          socket.close((error) => (error ? reject(error) : resolve())),
        );
        child = spawn(
          process.execPath,
          [
            join(root, "node_modules/next/dist/bin/next"),
            "dev",
            "--turbopack",
            "-H",
            "127.0.0.1",
            "-p",
            String(port),
          ],
          {
            cwd: fixture,
            env: {
              PATH: process.env.PATH,
              NODE_ENV: "development",
              NEXT_TELEMETRY_DISABLED: "1",
            },
            stdio: "pipe",
          },
        );
        child.stdout?.resume();
        child.stderr?.resume();
        const url = `http://127.0.0.1:${port}/validate`;
        let ready = false;
        for (let attempt = 0; attempt < 90; attempt++) {
          if (child.exitCode !== null)
            throw new Error("Next test server exited");
          try {
            const response = await fetch(url, {
              signal: AbortSignal.timeout(2000),
            });
            await response.body?.cancel();
            if (response.status === 405) {
              ready = true;
              break;
            }
          } catch {
            /* Startup / first compilation. */
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        expect(ready).toBe(true);
        let pdf = "%PDF-1.7\n";
        const offsets: number[] = [];
        for (const object of [
          "<< /Type /Catalog /Pages 2 0 R >>",
          "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>",
        ]) {
          offsets.push(pdf.length);
          pdf += `${offsets.length} 0 obj\n${object}\nendobj\n`;
        }
        const start = pdf.length;
        pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
        const valid = await fetch(url, {
          method: "POST",
          body: pdf,
          signal: AbortSignal.timeout(20000),
        });
        expect(await valid.json()).toEqual({
          pageCount: 1,
          parserVersion: "pdfium-2.1.13-fleg-2",
        });
        expect(valid.status).toBe(200);
        const padded = Buffer.concat([Buffer.from(pdf), Buffer.alloc(351792)]);
        const paddedResponse = await fetch(url, {
          method: "POST",
          body: padded,
          signal: AbortSignal.timeout(20000),
        });
        expect(paddedResponse.status).toBe(200);
        expect(await paddedResponse.json()).toEqual({
          pageCount: 1,
          parserVersion: "pdfium-2.1.13-fleg-2",
        });
        const invalid = await fetch(url, {
          method: "POST",
          body: "%PDF-1.7 not a PDF",
          signal: AbortSignal.timeout(20000),
        });
        expect(invalid.status).toBe(422);
        expect(await invalid.json()).toEqual({ code: "STORAGE_INTEGRITY" });
        if (process.env.DOCUMENT_UPLOAD_BROWSER_TEST === "true") {
          const browser = await chromium.launch({ headless: true });
          try {
            await verifyPhotoLibrary(browser, `http://127.0.0.1:${port}`, root);
            await verifyPhotoQueue(browser, `http://127.0.0.1:${port}`, root);
            for (const width of [390, 1440]) {
              const page = await browser.newPage({
                viewport: { width, height: 900 },
              });
              const id = "b19b0d96-8c71-466e-a1d5-2a18ed06e358";
              const receipt = {
                id,
                state: "reserved",
                createdAt: new Date().toISOString(),
                reconcileAfter: new Date().toISOString(),
                uploadAvailable: false,
              };
              const recoveryKey = `fleg-document-upload:synthetic-manager:${"a".repeat(24)}`;
              let puts = 0;
              let checks = 0;
              let reservations = 0;
              let mode: "upload" | "refresh" | "manual" = "upload";
              const errors: string[] = [];
              page.on("pageerror", (error) => errors.push(error.message));
              await page.route("**/*", async (route) => {
                const target = new URL(route.request().url());
                if (
                  target.origin === "https://vercel.com" &&
                  target.pathname === "/api/blob/"
                ) {
                  puts++;
                  return route.fulfill({ status: 200, body: "{}" });
                }
                if (target.origin !== `http://127.0.0.1:${port}`)
                  return route.abort();
                if (!target.pathname.includes("/attachments/upload-intents"))
                  return route.continue();
                if (target.pathname.endsWith("/authorization"))
                  return route.fulfill({
                    json: {
                      upload: {
                        method: "PUT",
                        url: "https://vercel.com/api/blob/?signed=synthetic",
                        contentType: "application/pdf",
                        headers: { "x-content-type": "application/pdf" },
                        validUntil: new Date(Date.now() + 60000).toISOString(),
                      },
                    },
                  });
                if (target.pathname.endsWith("/verify")) {
                  checks++;
                  const linked = mode !== "manual" && checks >= 2;
                  return route.fulfill({
                    json: {
                      intent: {
                        ...receipt,
                        state: linked ? "linked" : "uploaded",
                        receivedAt: receipt.createdAt,
                        reconcileAfter: new Date(
                          Date.now() + (mode === "manual" ? 300000 : 2000),
                        ).toISOString(),
                      },
                    },
                  });
                }
                reservations++;
                return route.fulfill({ json: { intent: receipt } });
              });
              await page.goto(`http://127.0.0.1:${port}`);
              await page
                .getByLabel("Fichier PDF", { exact: true })
                .setInputFiles({
                  name: "synthetic.pdf",
                  mimeType: "application/pdf",
                  buffer: Buffer.from(pdf),
                });
              await page
                .getByRole("button", { name: "Envoyer le PDF", exact: true })
                .click();
              await browserExpect(page.getByRole("status")).toHaveText(
                "PDF vérifié et enregistré.",
                { timeout: 15000 },
              );
              expect({ puts, reservations, checks }).toEqual({
                puts: 1,
                reservations: 1,
                checks: 2,
              });
              expect(
                await page.evaluate(
                  (key) => sessionStorage.getItem(key),
                  recoveryKey,
                ),
              ).toBeNull();
              // Simulate the persisted receipt after the first tab was interrupted.
              mode = "refresh";
              checks = 0;
              await page.evaluate(
                ({ key, id }) => sessionStorage.setItem(key, id),
                { key: recoveryKey, id },
              );
              await page.reload();
              await browserExpect(page.getByRole("status")).toContainText(
                "Reprise automatique",
                { timeout: 10000 },
              );
              await page.reload();
              await browserExpect(page.getByRole("status")).toHaveText(
                "PDF vérifié et enregistré.",
                { timeout: 15000 },
              );
              expect({ puts, reservations }).toEqual({
                puts: 1,
                reservations: 1,
              });
              // Tear down the completed recovery before resetting the mock
              // counters. Its router.refresh() can still be in flight on CI;
              // seeding sessionStorage in that live page starts a second
              // recovery before reload and contaminates the next scenario.
              await page.goto("about:blank");
              mode = "manual";
              checks = 0;
              await page.addInitScript(
                ({ key, id }) => sessionStorage.setItem(key, id),
                { key: recoveryKey, id },
              );
              await page.goto(`http://127.0.0.1:${port}`);
              await browserExpect(page.getByRole("status")).toContainText(
                "Vérification à reprendre",
              );
              await browserExpect(
                page.getByRole("button", {
                  name: "Vérifier la réception",
                  exact: true,
                }),
              ).toBeEnabled();
              expect(checks).toBe(1);
              expect(
                await page.evaluate(
                  (key) => sessionStorage.getItem(key),
                  recoveryKey,
                ),
              ).toBe(id);
              expect(errors).toEqual([]);
              await page.close();
            }
          } finally {
            await browser.close();
          }
        }
        passed = true;
      } finally {
        if (child && child.exitCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGTERM");
          const timer = setTimeout(() => child?.kill("SIGKILL"), 5000);
          await exited;
          clearTimeout(timer);
        }
        // Only the unique generated fixture. rm does not follow its symlinks.
        if (passed) await rm(fixture, { recursive: true, force: true });
        else console.error(`PDF runtime diagnostics: ${fixture}`);
      }
    }, 150000);
  },
);
