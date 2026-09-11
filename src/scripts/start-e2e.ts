import { spawn } from "node:child_process";
import { requireE2eEnvironment } from "../domain/testing/e2e-environment";

requireE2eEnvironment(process.env);
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => child.kill(signal));
child.once("exit", (code) => { process.exitCode = code ?? 1; });
