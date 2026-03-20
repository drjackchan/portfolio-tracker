import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

/**
 * Builds to the Vercel Build Output API spec:
 *   .vercel/output/
 *     config.json              — route rules
 *     static/                  — Vite client bundle (served as CDN)
 *     functions/
 *       api.func/
 *         index.js             — bundled Express handler
 *         .vc-config.json      — tells Vercel: Node runtime, entry=index.js
 *
 * This is the only reliable way to deploy a pre-built JS serverless function
 * alongside a Vite SPA on Vercel when outputDirectory is non-standard.
 */
async function buildAll() {
  // Clean previous outputs
  await rm("dist", { recursive: true, force: true });
  await rm(".vercel/output", { recursive: true, force: true });

  // ── 1. Build Vite client → .vercel/output/static ────────────────────────
  console.log("building client...");
  await viteBuild({
    build: {
      // Use absolute path so it resolves from project root, not Vite's root (client/)
      outDir: resolve(".vercel/output/static"),
      emptyOutDir: true,
    },
  });

  // ── 2. Bundle Express API handler → .vercel/output/functions/api.func ───
  console.log("building api (Vercel serverless)...");
  const funcDir = ".vercel/output/functions/api.func";
  await mkdir(funcDir, { recursive: true });

  // Output as index.cjs so Node.js treats it as CommonJS even if package.json has "type":"module"
  await esbuild({
    entryPoints: ["server/api-handler.cts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: `${funcDir}/index.cjs`,
    external: ["pg-native", "bufferutil", "utf-8-validate"],
    logLevel: "info",
  });

  // .vc-config.json — tells Vercel runtime how to invoke this function
  await writeFile(
    `${funcDir}/.vc-config.json`,
    JSON.stringify({
      runtime: "nodejs20.x",
      handler: "index.cjs",   // .cjs extension — forces CJS mode regardless of package.json type field
      launcherType: "Nodejs",
      shouldAddHelpers: true,
    }, null, 2)
  );

  // ── 3. Write .vercel/output/config.json — routes ─────────────────────────
  console.log("writing Vercel output config...");
  await mkdir(".vercel/output", { recursive: true });
  await writeFile(
    ".vercel/output/config.json",
    JSON.stringify({
      version: 3,
      routes: [
        // API requests → serverless function
        {
          src: "/api/(.*)",
          dest: "/api",
        },
        // Static assets served directly
        {
          handle: "filesystem",
        },
        // SPA fallback — all other routes → index.html
        {
          src: "/(.*)",
          dest: "/index.html",
        },
      ],
    }, null, 2)
  );

  // ── 4. Also build dist/index.cjs for local `npm start` ──────────────────
  console.log("building server (local dev)...");
  const pkg = JSON.parse(
    await (await import("fs/promises")).readFile("package.json", "utf-8")
  );
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const allowlist = [
    "express", "drizzle-orm", "drizzle-zod", "pg", "zod",
    "serverless-http", "connect-pg-simple", "memorystore",
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await mkdir("dist", { recursive: true });
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("✓ build complete");
  console.log("  .vercel/output/static/  → Vite SPA");
  console.log("  .vercel/output/functions/api.func/  → Express API");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
