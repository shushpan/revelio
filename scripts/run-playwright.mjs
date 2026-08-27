import { spawn } from "node:child_process";
import { cleanVerificationEnv } from "./clean-verification-env.mjs";

const command = process.platform === "win32" ? "playwright.cmd" : "playwright";
const child = spawn(command, process.argv.slice(2), {
  env: cleanVerificationEnv(),
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Unable to start Playwright: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = signal === null ? (code ?? 1) : 1;
});
