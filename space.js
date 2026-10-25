// Hero arka planı: gerçekçi uzay (bulutsu, Samanyolu şeridi, yıldız alanı).
// Bir kez 2B canvas'a çizilir; hareket yalnızca iki yıldız katmanının yavaş parıldamasıdır.
(() => {
  const hero = document.querySelector(".hero");
  const bg = hero && hero.querySelector(".hero-bg");
  if (!bg) return;

  let seed = 20261022;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // Değer gürültüsü (tohumlu, tekrarlanabilir)
  const G = 64;
  const grid = Float32Array.from({ length: G * G }, rnd);
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = sm(x - xi), fy = sm(y - yi);
    const g = (a, b) => grid[((b & (G - 1)) * G) + (a & (G - 1))];
    const t = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * fx;
    const b = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * fx;
    return t + (b - t) * fy;
  };
  const fbm = (x, y) => {
    let s = 0, a = 0.5;
    for (let i = 0; i < 4; i++) { s += a * vn(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; a *= 0.5; }
    return s;
  };

  const mk = (cls) => {
    const c = document.createElement("canvas");
    c.className = cls;
    c.setAttribute("aria-hidden", "true");
    bg.insertBefore(c, bg.firstChild);
    return c;
  };

  const draw = () => {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const small = W < 700;
    seed = 20261022;

    // Bulutsu kürenin bulunduğu yeri boş bırakır: küre masaüstünde sağda, mobilde altta
    const orbEl = hero.querySelector(".ai-orb");
    const copyEl = hero.querySelector(".hero-copy");
    const hr = hero.getBoundingClientRect();
    let ocx = 0, ocy = 0;
    if (orbEl) {
      const or = orbEl.getBoundingClientRect();
      ocx = (or.left + or.width / 2 - hr.left) / W - 0.5;
      ocy = (or.top + or.height / 2 - hr.top) / H - 0.5;
    }
    // Başlık ve metnin arkasında bulutsu sönükleşir, yazı okunur kalsın
    let cx0 = 2, cx1 = 2, cy0 = 2, cy1 = 2;
    if (copyEl) {
      const cr = copyEl.getBoundingClientRect();
      cx0 = (cr.left - hr.left) / W; cx1 = (cr.right - hr.left) / W;
      cy0 = (cr.top - hr.top) / H; cy1 = (cr.bottom - hr.top) / H;
    }
    const pad = 0.08;
    const textDim = (u, v) => {
      const dx = Math.max(cx0 - u, 0, u - cx1), dy = Math.max(cy0 - v, 0, v - cy1);
      const t = Math.min(1, Math.hypot(dx, dy) / pad);
      return 0.22 + 0.78 * sm(t);
    };

    // 1) Bulutsu: düşük çözünürlükte hesapla, büyütünce yumuşak sis olur
    const nw = small ? 72 : 120, nh = Math.max(60, Math.round(nw * H / W));
    const neb = document.createElement("canvas");
    neb.width = nw; neb.height = nh;
    const nctx = neb.getContext("2d");
    const img = nctx.createImageData(nw, nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const u = x / nw, v = y / nh;
        const px = (u - 0.5) * (W / H), py = v - 0.5;
        // domain warp
        const wx = fbm(u * 3 + 5, v * 3) , wy = fbm(u * 3, v * 3 + 9);
        const n1 = fbm(u * 3.2 + wx * 1.6, v * 3.2 + wy * 1.6);
        const n2 = fbm(u * 5.5 + 40 + wy * 1.2, v * 5.5 + wx * 1.2);
        // Samanyolu şeridi: köşegen, yumuşak
        const band = Math.exp(-Math.pow((px * 0.55 + py * 0.83 + 0.06) / 0.2, 2));
        // merkez (küre) çevresini boş bırak
        const r = Math.hypot((u - 0.5 - ocx) * 1.15, v - 0.5 - ocy);
        const kt = Math.min(1, Math.max(0, (r - 0.08) / 0.55));
        const keep = (0.1 + 0.9 * sm(kt)) * textDim(u, v);
        let a = Math.max(0, n1 - 0.36) * 3.4 * (0.3 + band * 1.5) * keep;
        let b = Math.max(0, n2 - 0.44) * 3.0 * keep * (0.4 + band * 1.1);
        const i = (y * nw + x) * 4;
        // Tek renk ailesi: derin camgöbeği (a) + parlak camgöbeği (b) + soğuk gri toz
        const dust = Math.max(0, fbm(u * 4 + 90, v * 4 + 30) - 0.5) * band * keep * 3.0;
        let R = 14 * a + 30 * b + 120 * dust;
        let Gc = 92 * a + 170 * b + 135 * dust;
        let B = 175 * a + 240 * b + 180 * dust;
        const lum = Math.min(1, a * 0.9 + b * 0.8 + dust * 0.6);
        img.data[i] = Math.min(255, R);
        img.data[i + 1] = Math.min(255, Gc);
        img.data[i + 2] = Math.min(255, B);
        img.data[i + 3] = Math.min(255, lum * 255 * 0.95);
      }
    }
    nctx.putImageData(img, 0, 0);

    const base = bg.querySelector(".space-neb") || mk("space-neb");
    base.width = Math.round(W * dpr); base.height = Math.round(H * dpr);
    const bctx = base.getContext("2d");
    bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = "high";
    bctx.drawImage(neb, 0, 0, base.width, base.height);

    return () => {
    // 2) Yıldızlar
    const tints = ["255,255,255", "205,222,255", "255,244,226", "190,205,255", "255,214,190"];
    const star = (ctx, x, y, r, a, tint) => {
      if (r < 0.55) {
        ctx.fillStyle = `rgba(${tint},${a})`;
        const d = r * 2.2;
        ctx.fillRect(x - d / 2, y - d / 2, d, d);
        return;
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, `rgba(${tint},${a})`);
      g.addColorStop(0.25, `rgba(${tint},${a * 0.45})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 6.2832); ctx.fill();
    };
    const dens = (W * H) / (small ? 2600 : 2200);
    const layer = (cls, count, rmin, rmax, amin, amax, spikes) => {
      const c = bg.querySelector("." + cls) || mk(cls);
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      for (let i = 0; i < count; i++) {
        const x = rnd() * W, y = rnd() * H;
        // Samanyolu şeridinde yıldızlar sıklaşır
        const u = x / W - 0.5, v = y / H - 0.5;
        if (rnd() > 0.35 + 0.65 * Math.exp(-Math.pow((u * 0.55 + v * 0.83 + 0.06) / 0.26, 2))) { i--; continue; }
        const r = rmin + Math.pow(rnd(), 2.4) * (rmax - rmin);
        const a = amin + rnd() * (amax - amin);
        const tint = tints[Math.floor(rnd() * tints.length)];
        star(ctx, x, y, r, a, tint);
        if (spikes && r > rmax * 0.55) {
          ctx.strokeStyle = `rgba(${tint},${a * 0.35})`;
          ctx.lineWidth = 0.6;
          const L = r * 9;
          ctx.beginPath();
          ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
          ctx.moveTo(x, y - L * 0.8); ctx.lineTo(x, y + L * 0.8);
          ctx.stroke();
        }
      }
    };
    layer("space-stars", Math.round(dens * (small ? 0.9 : 1.1)), 0.25, 0.7, 0.35, 0.9, false);
    layer("space-twinkle-a", Math.round(dens * 0.05), 0.5, 1.1, 0.5, 1, false);
    layer("space-twinkle-b", Math.round(dens * 0.03), 0.8, 1.9, 0.7, 1, true);
    bg.classList.add("is-space");
    };
  };

  let t = 0;
  // Ağır iş, sayfa yüklendikten ve küre açıldıktan sonra iki ayrı görev olarak yapılır
  const paint = () => {
    const stars = draw();
    if (stars) setTimeout(stars, 60);
  };
  const run = () => setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(paint, { timeout: 2000 }) : paint()), 2400);
  if (document.readyState === "complete") run(); else window.addEventListener("load", run, { once: true });
  let lastW = hero.clientWidth;
  window.addEventListener("resize", () => {
    if (Math.abs(hero.clientWidth - lastW) < 40) return; // mobil adres çubuğu yükseklik oynamalarını yoksay
    lastW = hero.clientWidth;
    clearTimeout(t);
    t = setTimeout(paint, 300);
  }, { passive: true });
})();
