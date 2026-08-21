/**
 * Purpose: Create a clean Bun full-stack production build for the local PICO demo.
 * Context: Bun bundles imported HTML manifests while local GLB files remain runtime-served assets.
 * Responsibilities: Recreate dist, bundle server and clients, and copy the curated public assets.
 * Boundaries: This script does not install packages, launch services, or alter source assets.
 */

import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const outdir = resolve(projectRoot, "dist");

await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [resolve(projectRoot, "server/server.ts")],
  outdir,
  root: projectRoot,
  target: "bun",
  minify: true,
  naming: {
    entry: "[name].[ext]",
    chunk: "[name]-[hash].[ext]",
    asset: "[name]-[hash].[ext]",
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error("Bun production build failed.");
}

await cp(resolve(projectRoot, "public"), resolve(outdir, "public"), { recursive: true });
console.log(`Built ${result.outputs.length} artifacts in ${outdir}.`);
