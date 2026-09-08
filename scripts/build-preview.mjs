// Produce a single self-contained preview HTML with the card bundle and the
// harness inlined. Two outputs:
//   preview/standalone.html  - full document, open with a file:// or any host
//   preview/artifact.html    - body-only fragment for Claude Artifacts
import { readFile, writeFile } from "node:fs/promises";

const dir = new URL("../preview/", import.meta.url);
const [indexHtml, harness, bundle] = await Promise.all([
  readFile(new URL("index.html", dir), "utf8"),
  readFile(new URL("preview.mjs", dir), "utf8"),
  readFile(new URL("../dist/adaptive-thermostat-card.js", import.meta.url), "utf8"),
]);

// escape any sequence that would prematurely close the inline <script>
const forScript = (js) => js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

// use function replacers — the bundle contains `$&`, `$$` etc. which a string
// replacement would interpret as match-group references
const inlined = indexHtml
  .replace(
    '<script type="module" src="../dist/adaptive-thermostat-card.js"></script>',
    () => `<script type="module">\n${forScript(bundle)}\n</script>`,
  )
  .replace(
    '<script type="module" src="./preview.mjs"></script>',
    () => `<script type="module">\n${forScript(harness)}\n</script>`,
  );

await writeFile(new URL("standalone.html", dir), inlined);

// artifact fragment: strip the document wrapper, keep <title>, <style>, body inner
const title = inlined.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Preview";
const style = inlined.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "";
const bodyInner = inlined.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "";
await writeFile(
  new URL("artifact.html", dir),
  `<title>${title}</title>\n${style}\n${bodyInner}\n`,
);

console.log("wrote preview/standalone.html and preview/artifact.html");
