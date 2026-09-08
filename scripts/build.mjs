import esbuild from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/custom-thermostat-card.ts"],
  outfile: "dist/custom-thermostat-card.js",
  bundle: true,
  format: "esm",
  target: "es2021",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  legalComments: "none",
  banner: {
    js: `/*! custom-thermostat-card v${pkg.version} | MIT | https://github.com/alws34/custom-thermostat-card */`,
  },
  define: {
    __CARD_VERSION__: JSON.stringify(pkg.version),
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching…");
} else {
  await esbuild.build(options);
  console.log(`built dist/custom-thermostat-card.js (v${pkg.version})`);
}
