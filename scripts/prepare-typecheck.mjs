import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const nextCacheDir = path.join(cwd, ".next", "cache");

await mkdir(nextCacheDir, { recursive: true });
await rm(path.join(cwd, "tsconfig.tsbuildinfo"), { force: true });
await rm(path.join(nextCacheDir, "tsconfig.tsbuildinfo"), { force: true });
