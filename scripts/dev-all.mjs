// Sobe tudo para desenvolvimento num terminal só (Ctrl+C encerra tudo):
//   mock :8080  →  API Gateway :8090  →  App Shell (SPA) :9000
import { spawn } from "node:child_process";

const procs = [
  ["mock   ", "\x1b[33m", ["run", "mock"]],
  ["gateway", "\x1b[36m", ["run", "gateway"]],
  ["shell  ", "\x1b[35m", ["run", "dev"]],
];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = procs.map(([name, color, args]) => {
  const p = spawn(npm, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const out = (buf) =>
    buf.toString().split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`${color}[${name}]\x1b[0m ${l}`));
  p.stdout.on("data", out);
  p.stderr.on("data", out);
  p.on("exit", (code) => console.log(`${color}[${name}]\x1b[0m encerrado (${code})`));
  return p;
});
const stop = () => {
  children.forEach((p) => p.kill("SIGINT"));
  setTimeout(() => process.exit(0), 500);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
