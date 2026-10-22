// Bağımlılıksız yerel önizleme sunucusu (sıkıştırma dahil, Vercel'e yakın davranır).
//   npm run dev      -> depo kökünü sunar
//   npm run preview  -> dist/ klasörünü sunar (önce npm run build)
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createBrotliCompress, createGzip } from "node:zlib";

const dir = resolve(process.argv[2] || ".");
const port = Number(process.env.PORT) || 4173;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const compressible = new Set([".html", ".css", ".js", ".json", ".svg"]);

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (rel === "" || rel.endsWith(sep)) rel = join(rel, "index.html");
  const file = resolve(dir, rel);

  if (!file.startsWith(dir + sep) && file !== dir) {
    res.writeHead(403).end("Yasak");
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Bulunamadı");
    return;
  }

  const ext = extname(file);
  const headers = {
    "content-type": types[ext] || "application/octet-stream",
    "cache-control": "no-cache",
  };
  const accept = String(req.headers["accept-encoding"] || "");
  const stream = createReadStream(file);

  if (compressible.has(ext) && /\bbr\b/.test(accept)) {
    res.writeHead(200, { ...headers, "content-encoding": "br", vary: "accept-encoding" });
    stream.pipe(createBrotliCompress()).pipe(res);
  } else if (compressible.has(ext) && /\bgzip\b/.test(accept)) {
    res.writeHead(200, { ...headers, "content-encoding": "gzip", vary: "accept-encoding" });
    stream.pipe(createGzip()).pipe(res);
  } else {
    headers["content-length"] = statSync(file).size;
    res.writeHead(200, headers);
    stream.pipe(res);
  }
}).listen(port, () => {
  console.log(`Önizleme: http://localhost:${port}  (${dir})`);
});
