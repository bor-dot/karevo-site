/*
 * Karevo hero animasyonu
 * Parlayan çekirdek, dönen ince halkalar, halkadan fırlayan ışık çizgileri
 * ve bazı çizgilerin ucunda beliren etiketler. Tek vurgu rengi: #8B5CF6.
 *
 * - Canvas 2D, zaman tabanlı (60/120 Hz fark etmez)
 * - Mobilde parçacık sayısı ve çözünürlük düşer
 * - Kare süresi uzarsa parçacık sayısı kendiliğinden azalır
 * - Hero ekran dışındayken veya sekme gizliyken döngü durur
 * - prefers-reduced-motion açıksa tek bir durağan kare çizilir
 */
(() => {
  "use strict";

  const canvas = document.getElementById("heroCanvas");
  if (!canvas || !canvas.getContext) return;
  const hero = canvas.closest(".hero");
  const orb = hero && hero.querySelector(".hero-orb");
  const ctx = canvas.getContext("2d");
  if (!hero || !orb || !ctx) return;

  const nav = document.querySelector(".nav");
  const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactMq = window.matchMedia("(max-width: 900px), (pointer: coarse)");

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeOut = (p) => 1 - (1 - p) * (1 - p) * (1 - p);

  const TAIL = "rgba(139,92,246,0)";
  const HEAD = "196,181,253"; // #8B5CF6'nın açık tonu
  const MAX_STREAKS = 170;

  const chips = Array.from(hero.querySelectorAll(".chip")).map((el) => ({
    el,
    w: 0,
    h: 0,
    busy: false,
  }));

  /* ---------- durum ---------- */
  let W = 0, H = 0, dpr = 1;
  let cx = 0, cy = 0, ringR = 80, yMin = 80, yMax = 300;
  let dprScale = 1;
  let quality = 1;
  let activeN = 0;
  let time = 0;
  let flash = 0;
  let labelTimer = 0.7;
  let chipCursor = 0;
  let running = false;
  let visible = true;
  let rafId = 0;
  let last = 0;
  let ema = 1 / 60;
  let accum = 0;
  let warm = 0;

  const pool = [];
  const labels = [];

  const baseCount = () => {
    if (compactMq.matches) return (navigator.hardwareConcurrency || 4) <= 4 ? 44 : 60;
    return 150;
  };
  const maxLabels = () => (compactMq.matches ? 2 : 3);

  /* ---------- hazır sprite'lar ---------- */
  const makeSprite = (size, stops) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  };

  const glow = makeSprite(256, [
    [0, "rgba(255,255,255,0.95)"],
    [0.07, "rgba(221,214,254,0.8)"],
    [0.22, "rgba(139,92,246,0.45)"],
    [0.5, "rgba(139,92,246,0.12)"],
    [1, "rgba(139,92,246,0)"],
  ]);

  /* ---------- çizgiler ---------- */
  const resetStreak = (s, initial) => {
    const a = Math.random() * TAU;
    s.cos = Math.cos(a);
    s.sin = Math.sin(a);
    s.wait = initial ? rand(0, 1.4) : rand(0, 0.4);
    s.t = 0;
    s.dur = rand(0.9, 2.3);
    const reach = Math.max(60, maxR() - ringR);
    s.travel = reach * (0.1 + 0.62 * Math.pow(Math.random(), 1.8));
    s.lag = rand(0.16, 0.34);
    s.w = Math.random() < 0.12 ? rand(1.2, 1.7) : rand(0.5, 1.1);
    s.alpha = rand(0.45, 0.95);
    return s;
  };

  const maxR = () => Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));

  const drawStreak = (s, p, alphaMul) => {
    const e = easeOut(p);
    const tp = p - s.lag;
    const te = tp > 0 ? easeOut(tp) : 0;
    const rh = ringR + s.travel * e;
    const rt = ringR + s.travel * te;
    const hx = cx + s.cos * rh;
    const hy = cy + s.sin * rh;
    const tx = cx + s.cos * rt;
    const ty = cy + s.sin * rt;
    const a = s.alpha * alphaMul * Math.pow(1 - p, 0.9) * Math.min(1, p * 12);
    if (a < 0.015) return;
    if ((hx - tx) * (hx - tx) + (hy - ty) * (hy - ty) < 0.6) return;
    const g = ctx.createLinearGradient(tx, ty, hx, hy);
    g.addColorStop(0, TAIL);
    g.addColorStop(1, `rgba(${HEAD},${a.toFixed(3)})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();
  };

  /* ---------- etiketler ---------- */
  const pickChip = () => {
    for (let i = 0; i < chips.length; i++) {
      const c = chips[(chipCursor + i) % chips.length];
      if (!c.busy) {
        chipCursor = (chipCursor + i + 1) % chips.length;
        return c;
      }
    }
    return null;
  };

  const chipCenter = (cos, sin, r, chip) => {
    const ox = chip.w / 2 + 10;
    const oy = chip.h / 2 + 6;
    return [cx + cos * (r + ox), cy + sin * (r + oy)];
  };

  const chipFits = (cos, sin, r, chip) => {
    const [x, y] = chipCenter(cos, sin, r, chip);
    const pad = 10;
    return (
      x - chip.w / 2 >= pad &&
      x + chip.w / 2 <= W - pad &&
      y - chip.h / 2 >= yMin &&
      y + chip.h / 2 <= yMax
    );
  };

  const spawnLabel = () => {
    if (labels.length >= maxLabels()) return;
    const chip = pickChip();
    if (!chip) return;
    if (!chip.w) {
      chip.w = chip.el.offsetWidth;
      chip.h = chip.el.offsetHeight;
    }

    let best = null;
    for (let k = 0; k < 9; k++) {
      const right = Math.random() < 0.5;
      const base = rand(-1.0, 0.1); // yukarı-yana; aşağı doğru en fazla ~6°
      const a = right ? base : Math.PI - base;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      let r = ringR;
      while (r < ringR + 520 && chipFits(cos, sin, r + 6, chip)) r += 6;
      const room = r - ringR;
      if (!best || room > best.room) best = { cos, sin, room };
      if (room > 120) break;
    }

    chip.busy = true;
    const travel = clamp(best.room * rand(0.78, 1), 18, 460);
    labels.push({
      chip,
      cos: best.cos,
      sin: best.sin,
      t: 0,
      dur: rand(2.7, 3.4),
      travel,
      lag: 0.22,
      w: 1.3,
      alpha: 1,
      wait: 0,
    });
    flash = 1;
  };

  const placeChip = (l, p) => {
    const e = easeOut(p);
    const r = ringR + l.travel * e;
    const [x, y] = chipCenter(l.cos, l.sin, r, l.chip);
    const o =
      p < 0.1 ? p / 0.1 : p > 0.78 ? Math.max(0, (1 - p) / 0.22) : 1;
    const st = l.chip.el.style;
    st.transform = `translate3d(${(x - l.chip.w / 2).toFixed(1)}px,${(y - l.chip.h / 2).toFixed(1)}px,0)`;
    st.opacity = o.toFixed(3);
  };

  const releaseChip = (l) => {
    l.chip.busy = false;
    l.chip.el.style.opacity = "0";
  };

  const clearLabels = () => {
    labels.forEach(releaseChip);
    labels.length = 0;
  };

  /* ---------- çizim ---------- */
  const drawRing = (t) => {
    const rot = t * 0.7;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(139,92,246,0.26)";
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, TAU);
    ctx.stroke();

    // dönen parlak yay
    ctx.lineWidth = 1.6;
    if (typeof ctx.createConicGradient === "function") {
      const g = ctx.createConicGradient(rot, cx, cy);
      g.addColorStop(0, "rgba(196,181,253,0)");
      g.addColorStop(0.26, "rgba(196,181,253,0.95)");
      g.addColorStop(0.265, "rgba(196,181,253,0)");
      g.addColorStop(1, "rgba(196,181,253,0)");
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, TAU);
      ctx.stroke();
    } else {
      const span = 1.5;
      const slices = 10;
      for (let i = 0; i < slices; i++) {
        ctx.strokeStyle = `rgba(196,181,253,${((i + 1) / slices) * 0.9})`;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, rot + (span * i) / slices, rot + (span * (i + 1)) / slices);
        ctx.stroke();
      }
    }

    // dış noktalı halka (ters yönde)
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(167,139,250,0.34)";
    ctx.setLineDash([1.5, 9]);
    ctx.lineDashOffset = t * 14;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 1.17, 0, TAU);
    ctx.stroke();

    // iç kesik halka
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(139,92,246,0.2)";
    ctx.setLineDash([10, 16]);
    ctx.lineDashOffset = -t * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 0.74, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // halka üzerindeki iki düğüm
    for (let i = 0; i < 2; i++) {
      const a = rot * 1.35 + i * Math.PI;
      const x = cx + Math.cos(a) * ringR;
      const y = cy + Math.sin(a) * ringR;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(glow, x - 11, y - 11, 22, 22);
      ctx.globalAlpha = 1;
    }
  };

  const drawCore = (t) => {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
    const size = ringR * 2.7 * (0.9 + 0.08 * pulse + 0.22 * flash);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(glow, cx - size / 2, cy - size / 2, size, size);
    const inner = ringR * 0.9 * (1 + 0.1 * pulse + 0.25 * flash);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(glow, cx - inner / 2, cy - inner / 2, inner, inner);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(245,243,255,0.98)";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2.6, ringR * 0.045) * (1 + 0.12 * pulse), 0, TAU);
    ctx.fill();
  };

  const render = (t) => {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    drawRing(t);

    for (let i = 0; i < activeN; i++) {
      const s = pool[i];
      if (s.wait > 0) continue;
      drawStreak(s, s.t / s.dur, 1);
    }
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      const p = l.t / l.dur;
      drawStreak(l, p, p > 0.8 ? Math.max(0, (1 - p) / 0.2) : 1);
      // çizgi ucundaki küçük parlama
      const r = ringR + l.travel * easeOut(p);
      const o = (p < 0.1 ? p / 0.1 : p > 0.78 ? Math.max(0, (1 - p) / 0.22) : 1) * 0.9;
      ctx.globalAlpha = o;
      ctx.drawImage(glow, cx + l.cos * r - 8, cy + l.sin * r - 8, 16, 16);
      ctx.globalAlpha = 1;
    }

    drawCore(t);
    ctx.globalCompositeOperation = "source-over";
  };

  /* ---------- güncelleme ---------- */
  const update = (dt) => {
    for (let i = 0; i < activeN; i++) {
      const s = pool[i];
      if (s.wait > 0) {
        s.wait -= dt;
        continue;
      }
      s.t += dt;
      if (s.t >= s.dur) resetStreak(s, false);
    }

    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i];
      l.t += dt;
      if (l.t >= l.dur) {
        releaseChip(l);
        labels.splice(i, 1);
      } else {
        placeChip(l, l.t / l.dur);
      }
    }

    labelTimer -= dt;
    if (labelTimer <= 0) {
      spawnLabel();
      labelTimer = rand(1.0, 1.7);
    }
    flash = Math.max(0, flash - dt * 2.4);
  };

  const adapt = (dt) => {
    warm += dt;
    if (warm < 2.5) return;
    ema += (dt - ema) * 0.06;
    accum += dt;
    if (accum < 1.5) return;
    accum = 0;
    if (ema > 0.026 && quality > 0.32) {
      quality = Math.max(0.32, quality * 0.78);
      activeN = Math.round(baseCount() * quality);
      if (quality < 0.6 && dprScale === 1) {
        dprScale = 0.75;
        layout();
      }
    }
  };

  /* ---------- yerleşim ---------- */
  const layout = () => {
    const hr = hero.getBoundingClientRect();
    W = Math.max(1, hr.width);
    H = Math.max(1, hr.height);
    dpr = Math.min(window.devicePixelRatio || 1, compactMq.matches ? 1.5 : 2) * dprScale;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const or = orb.getBoundingClientRect();
    cx = or.left - hr.left + or.width / 2;
    cy = or.top - hr.top + or.height / 2;
    ringR = clamp(or.height * 0.38, 44, 150);
    yMin = (nav ? nav.offsetHeight : 72) + 6;
    yMax = or.bottom - hr.top;

    chips.forEach((c) => {
      c.w = c.el.offsetWidth;
      c.h = c.el.offsetHeight;
    });

    const n = Math.round(baseCount() * quality);
    while (pool.length < MAX_STREAKS) pool.push(resetStreak({}, true));
    activeN = Math.min(MAX_STREAKS, n);
  };

  const drawStatic = () => {
    clearLabels();
    for (let i = 0; i < activeN; i++) {
      const s = pool[i];
      s.wait = 0;
      s.t = s.dur * rand(0.1, 0.72);
    }
    flash = 0;
    render(1.4);
  };

  /* ---------- döngü ---------- */
  const frame = (now) => {
    rafId = 0;
    if (!running) return;
    const t = now / 1000;
    const dt = last ? Math.min(0.05, t - last) : 1 / 60;
    last = t;
    time += dt;
    adapt(dt);
    update(dt);
    render(time);
    rafId = requestAnimationFrame(frame);
  };

  const start = () => {
    if (running) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  };

  const stop = () => {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const sync = () => {
    if (reduceMq.matches) {
      stop();
      return;
    }
    if (visible && !document.hidden) start();
    else stop();
  };

  const apply = () => {
    layout();
    if (reduceMq.matches) {
      stop();
      drawStatic();
    } else {
      sync();
    }
    canvas.classList.add("is-on");
  };

  let resizeRaf = 0;
  const onResize = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      layout();
      if (reduceMq.matches) drawStatic();
    });
  };

  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(hero);
  else window.addEventListener("resize", onResize, { passive: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      },
      { threshold: 0 }
    ).observe(hero);
  }

  // Hero menünün altında kaldığı sürece menü butonu mor olur
  if (nav && "IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        nav.classList.toggle("is-on-hero", entries[entries.length - 1].isIntersecting);
      },
      { rootMargin: `-${nav.offsetHeight || 72}px 0px 0px 0px`, threshold: 0 }
    ).observe(hero);
  }

  document.addEventListener("visibilitychange", sync);
  const onChange = () => {
    if (reduceMq.matches) clearLabels();
    apply();
  };
  if (reduceMq.addEventListener) {
    reduceMq.addEventListener("change", onChange);
    compactMq.addEventListener("change", onChange);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);

  apply();
})();
