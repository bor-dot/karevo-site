// Bağımlılıksız statik derleme: yayına girecek dosyaları dist/ klasörüne kopyalar
// ve index.html'in başvurduğu her yerel dosyanın gerçekten var olduğunu doğrular.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const files = ["index.html", "404.html", "styles.css", "main.js", "ai-kure.js", "space.js", ".nojekyll"];
const dirs = ["vendor", "fonts"];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const f of files) {
  const src = join(root, f);
  if (!existsSync(src)) continue;
  cpSync(src, join(dist, f));
}
for (const d of dirs) cpSync(join(root, d), join(dist, d), { recursive: true });

// Ekran görüntüleri ve marka dosyaları (yalnızca web için optimize edilmiş WebP/SVG/PNG)
cpSync(join(root, "public"), join(dist, "public"), { recursive: true });

// Önbellek kırma: ?v= değerini dosya içeriğinin özetinden üret (elle güncellemeye gerek yok)
let page = readFileSync(join(dist, "index.html"), "utf8");
for (const f of ["styles.css", "main.js", "ai-kure.js", "space.js"]) {
  const hash = createHash("sha1").update(readFileSync(join(dist, f))).digest("hex").slice(0, 8);
  page = page.replaceAll(new RegExp(`${f.replace(".", "\\.")}(\\?v=[^"]*)?"`, "g"), `${f}?v=${hash}"`);
}
writeFileSync(join(dist, "index.html"), page);

// Başvuru denetimi
const html = readFileSync(join(dist, "index.html"), "utf8");
const css = readFileSync(join(dist, "styles.css"), "utf8");
const refs = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) refs.add(m[1]);
for (const m of css.matchAll(/url\("?([^")]+)"?\)/g)) refs.add(m[1]);

const missing = [];
for (const ref of refs) {
  if (/^(https?:|data:|#|mailto:)/.test(ref)) continue;
  const clean = ref.split("#")[0].split("?")[0];
  if (!clean || !existsSync(join(dist, clean))) missing.push(ref);
}
if (missing.length) {
  console.error("Derleme hatası: eksik dosyalar:\n  " + missing.join("\n  "));
  process.exit(1);
}

const external = [...refs].filter((r) => /^https?:/.test(r));
const size = (p) => statSync(join(dist, p)).size;
console.log(`dist/ hazır: ${refs.size} başvuru doğrulandı, ${external.length} harici istek.`);
console.log(`index.html ${size("index.html")} B · styles.css ${size("styles.css")} B · ai-kure.js ${size("ai-kure.js")} B`);
