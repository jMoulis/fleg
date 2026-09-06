import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { evaluatePreproductionEnvironment } from "@/server/deployment/preflight";

const environmentFile = process.env.DEPLOYMENT_ENV_FILE ?? ".env.local";
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const result = evaluatePreproductionEnvironment(process.env);
console.log(JSON.stringify(result, null, 2));
if (result.status === "blocked") process.exitCode = 1;
