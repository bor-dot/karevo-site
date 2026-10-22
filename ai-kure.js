/*
 * Karevo AI küresi (hero)
 * - Ham WebGL (kütüphanesiz): sıvı/plazma gibi akan, mor tonlu parlayan küre
 * - Küre "konuşur": altındaki balonlarda mesajlar daktilo gibi yazılır; yazı
 *   sürerken küre ses dalgası gibi büyüyüp küçülür, susunca yavaşça nefes alır
 * - Küreye tıklayınca komut yazılır, küre hazır yanıtlardan biriyle cevap verir
 *   (sahte demo; gerçek bir API yok)
 * - Mobilde hafif shader ve düşük çözünürlük; kare süresi uzarsa çözünürlük düşer
 * - Hero ekran dışındayken döngü durur; prefers-reduced-motion açıksa sabit kalır
 */
(() => {
  "use strict";

  const stage = document.querySelector("[data-ai-stage]");
  if (!stage) return;

  const orb = stage.querySelector(".ai-orb");
  const canvas = stage.querySelector("#aiCanvas");
  const fallback = stage.querySelector(".ai-orb-fallback");
  const bubble = stage.querySelector(".ai-bubble");
  const textEl = stage.querySelector(".ai-text");
  const ghostEl = stage.querySelector(".ai-ghost");
  const live = stage.querySelector("#aiLive");
  const slot = stage.querySelector(".ai-slot");
  const panel = stage.querySelector("#aiPanel");
  const form = stage.querySelector("#aiForm");
  const input = stage.querySelector("#aiInput");
  const hero = stage.closest(".hero");
  const nav = document.querySelector(".nav");

  const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const compactMq = window.matchMedia("(max-width: 900px), (pointer: coarse)");

  /* ---------- metinler ---------- */
  const MESSAGES = [
    "Videonu yükle, sessizlikleri keseyim.",
    "Altyazıyı ekledim.",
    "Renkleri eşledim.",
    "4K dışa aktarıyorum.",
  ];
  const PASSES = 3; // otomatik gösteri 3 tur sürer, sonra küre sakin nefese geçer
  const GREETING = "Seni dinliyorum. Bir kurgu komutu yaz.";

  const REPLIES = [
    { k: ["sessiz", "bosluk", "kes", "kirp"], r: "Tamam. Sessiz bölümleri buldum ve kestim." },
    { k: ["altyazi", "whisper", "yazi", "ceviri"], r: "Konuşmaları yazıya döktüm ve altyazıyı ekledim." },
    { k: ["renk", "lut", "ton", "gradyan"], r: "Klipler arasında renkleri eşledim ve uygun bir LUT uyguladım." },
    { k: ["4k", "disa", "export", "render", "kaydet", "paylas"], r: "4K dışa aktarıyorum. Hazır olunca haber veririm." },
    { k: ["ses", "muzik", "lufs", "gurultu", "seviye"], r: "Ses seviyesini YouTube için -14 LUFS'a normalleştirdim." },
    { k: ["b-roll", "broll", "medya", "yukle", "ekle", "klip"], r: "Medya havuzundan uygun klipleri seçip B-roll olarak yerleştirdim." },
    { k: ["merhaba", "selam", "naber", "hey"], r: "Merhaba! Ben Karevo AI. Bir kurgu komutu yaz, uygulayayım." },
  ];
  const FALLBACK_REPLY =
    "Bunu henüz anlayamadım. Şunlardan birini dene: sessizlikleri kes, altyazı ekle, renkleri eşle, 4K dışa aktar.";

  const norm = (s) =>
    s
      .toLocaleLowerCase("tr")
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ş/g, "s")
      .replace(/ü/g, "u");

  const replyFor = (cmd) => {
    const n = norm(cmd);
    for (const item of REPLIES) if (item.k.some((w) => n.includes(w))) return item.r;
    return FALLBACK_REPLY;
  };

  /* ---------- shader ---------- */
  const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";

  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmp;
uniform float uBreath;
uniform float uHover;
uniform vec2 uMouse;

float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0,0.0,0.0)), f.x),
        mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
        mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y),
    f.z);
}
// oct: kullanılacak oktav sayısı (en çok OCT); bükme ve damar katmanları daha az oktavla yetinir
float fbm(vec3 p, int oct){
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < OCT; i++) {
    if (i >= oct) break;
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

void main(){
  float m = min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * m);
  float t = uTime;
  float d = length(p);
  float ang = atan(p.y, p.x);
  float aa = 3.0 / m;

  // Küre yarıçapı: nefes + üzerine gelme + ses genliği
  float R = 0.70 * (1.0 + 0.022 * uBreath + 0.04 * uHover + 0.06 * uAmp);
  // Siluetin sıvı gibi dalgalanması
  float wob = 0.004 * sin(ang * 3.0 + t * 0.7)
            + 0.003 * sin(ang * 5.0 - t * 1.1)
            + 0.002 * sin(ang * 2.0 + t * 0.45);
  wob *= 1.0 + 0.6 * uAmp;
  float Rw = R * (1.0 + wob);
  float dd = max(d - Rw, 0.0);

  vec3 mid  = vec3(0.545, 0.361, 0.965);   // #8B5CF6
  vec3 lite = vec3(0.769, 0.710, 0.992);   // #C4B5FD
  vec3 vio  = vec3(0.400, 0.180, 0.850);   // koyu doygun mor
  vec3 deep = vec3(0.050, 0.010, 0.160);
  vec3 hot  = vec3(0.965, 0.950, 1.000);

  // Dış ışıma
  float g = exp(-dd * 4.0) * 0.50 * (0.75 + 0.25 * uBreath + 0.55 * uAmp + 0.25 * uHover);
  vec3 col = mid * g + lite * exp(-dd * 13.0) * 0.30 * (0.7 + uAmp);
#ifndef LITE
  // Konuşurken küreden yayılan ses halkaları
  float ripple = 0.5 + 0.5 * sin(dd * 28.0 - t * 7.0);
  col += mid * uAmp * 0.22 * ripple * exp(-dd * 5.5);
#endif
  col *= smoothstep(1.0, 0.72, d);

  float inside = 1.0 - smoothstep(Rw - aa, Rw + aa, d);
  if (inside > 0.001) {
    float z = sqrt(max(Rw * Rw - d * d, 0.0));
    vec3 n = normalize(vec3(p, z));

    // Akan plazma: alan bükmeli fbm
    float ca = cos(t * 0.10);
    float sa = sin(t * 0.10);
    vec3 q = vec3(ca * n.x + sa * n.z, n.y, -sa * n.x + ca * n.z) * (1.45 + 0.8 * uAmp);
    float flow = t * (0.16 + 0.22 * uAmp);
    float w = fbm(q * 0.9 + vec3(0.0, flow * 0.6, 3.0), OCT - 1);
    float f = fbm(q + 1.7 * w + vec3(flow, -flow * 0.7, 0.0), OCT);
    f = clamp(f * 1.35 - 0.12, 0.0, 1.0);
#ifndef LITE
    float vn = fbm(q * 1.5 + vec3(-flow * 0.5, 4.0, flow), 2);
    float v = 1.0 - abs(2.0 * vn - 1.0);
#else
    float v = 1.0 - abs(2.0 * f - 1.0);
#endif

    // Koyu doygun mordan #8B5CF6'ya; yalnızca en parlak yerlerde açık ton
    vec3 c = mix(deep, vio, smoothstep(0.05, 0.42, f));
    c = mix(c, mid, smoothstep(0.35, 0.78, f));
    c = mix(c, lite, smoothstep(0.80, 1.0, f) * 0.55);
    c += mid * pow(v, 5.0) * (0.75 + 1.0 * uAmp);
    c += lite * pow(v, 12.0) * (0.45 + 0.8 * uAmp);
    c += hot * pow(v, 26.0) * (0.30 + 0.6 * uAmp);

    float fres = pow(1.0 - n.z, 2.2);
    c += mid * fres * (1.1 + 0.6 * uAmp) + lite * pow(1.0 - n.z, 4.5) * 0.45;
    c *= 0.55 + 0.6 * n.z;
    c += mid * pow(n.z, 5.0) * 0.18 * (1.0 + 2.0 * uAmp);

    vec3 L = normalize(vec3(-0.45 + uMouse.x * 0.3, 0.55 + uMouse.y * 0.3, 0.75));
    c += hot * pow(max(dot(n, L), 0.0), 40.0) * 0.22;

    col = mix(col, c, inside);
  }

  col = min(col, vec3(1.0));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

  /* ---------- durum ---------- */
  let gl = null;
  let prog = null;
  let U = {};
  let glOk = false;
  let mode = "none"; // none | gl | css (yazılım render'ı ya da WebGL yoksa hafif mod)
  let cssW = 0;
  let scale = 1;
  let time = 0;
  let last = 0;
  let running = false;
  let visible = true;
  let rafId = 0;
  let ema = 1 / 60;
  let accum = 0;
  let warm = 0;
  let booted = false;

  let amp = 0;
  let pulse = 0;
  let keyPulse = 0;
  let hover = 0;
  let hoverTarget = 0;
  let mx = 0;
  let my = 0;
  let mxT = 0;
  let myT = 0;
  let speaking = false;
  let thinking = false;
  let listening = false;

  const STATIC_TIME = 6.4;

  /* ---------- WebGL ---------- */
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  };

  const initGL = () => {
    if (gl) return glOk;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch (e) {
      gl = null;
    }
    if (!gl) return false;

    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (!hp || hp.precision === 0) return fail();

    // GPU yoksa (yazılım render'ı) shader'ı çalıştırmak sayfayı yavaşlatır: hafif moda geç
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    const forced = /[?&]webgl=1\b/.test(window.location.search); // geliştirici anahtarı
    if (!forced && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) {
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      return fail();
    }

    const defs = compactMq.matches ? "#define OCT 3\n#define LITE\n" : "#define OCT 4\n";
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, defs + FRAG);
    if (!vs || !fs) return fail();

    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "a");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fail();
    gl.useProgram(prog);

    ["uRes", "uTime", "uAmp", "uBreath", "uHover", "uMouse"].forEach((n) => {
      U[n] = gl.getUniformLocation(prog, n);
    });

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    glOk = true;
    return true;
  };

  function fail() {
    glOk = false;
    gl = null;
    return false;
  }

  const resize = () => {
    cssW = orb.clientWidth || 0;
    if (mode !== "gl" || !gl || !cssW) return;
    const cap = compactMq.matches ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, cap) * scale;
    const px = Math.max(64, Math.round(cssW * dpr));
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    gl.viewport(0, 0, px, px);
    if (reduceMq.matches) draw(STATIC_TIME, 0, 0.5, 0, 0, 0);
  };

  // Hafif mod: CSS küre, nefes ve ses genliğiyle ölçeklenir
  const drawCss = (a, breath, h) => {
    fallback.style.transform = `scale(${(1 + 0.03 * breath + 0.02 * h + 0.08 * a).toFixed(4)})`;
  };

  const draw = (t, a, breath, h, x, y) => {
    if (mode === "css") {
      drawCss(a, breath, h);
      return;
    }
    if (!glOk) return;
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uAmp, a);
    gl.uniform1f(U.uBreath, breath);
    gl.uniform1f(U.uHover, h);
    gl.uniform2f(U.uMouse, x, y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!canvas.classList.contains("is-on")) {
      canvas.classList.add("is-on");
      fallback.classList.add("is-off");
    }
  };

  /* ---------- konuşma motoru ---------- */
  const dlg = {
    phase: "off", // off | gap | type | hold | fade | think
    text: "",
    i: 0,
    acc: 0,
    delay: 0.03,
    timer: 0,
    hold: 1.9,
    mode: "auto", // auto | user
    msg: 0,
    pass: 0,
  };

  // Görünmez tam metin balonun boyutunu baştan sabitler; yazılan kısım üstüne biner
  const setBubble = (full, shown, kind) => {
    ghostEl.textContent = full;
    textEl.textContent = shown;
    bubble.classList.toggle("is-user", kind === "user");
  };
  const showBubble = (on) => bubble.classList.toggle("is-in", on);

  const charDelay = (ch) => {
    if (ch === "." || ch === "!" || ch === "?") return 0.26;
    if (ch === "," || ch === ":") return 0.15;
    return 0.026 + Math.random() * 0.02;
  };

  const beginType = (text, holdFor) => {
    dlg.text = text;
    dlg.i = 0;
    dlg.acc = 0;
    dlg.delay = 0.12;
    dlg.hold = holdFor;
    dlg.phase = "type";
    setBubble(text, "", "ai");
    showBubble(true);
    speaking = true;
  };

  const nextAuto = () => {
    if (dlg.pass >= PASSES) {
      dlg.phase = "off";
      return;
    }
    beginType(MESSAGES[dlg.msg], 1.9);
    dlg.msg += 1;
    if (dlg.msg >= MESSAGES.length) {
      dlg.msg = 0;
      dlg.pass += 1;
    }
  };

  const onChar = (ch) => {
    if (/\s/.test(ch)) pulse *= 0.35;
    else if (/[.,!?:]/.test(ch)) pulse = 0.12;
    else pulse = 0.55 + Math.random() * 0.45;
  };

  const stepDialog = (dt) => {
    switch (dlg.phase) {
      case "gap":
        dlg.timer -= dt;
        if (dlg.timer <= 0) nextAuto();
        break;
      case "type": {
        dlg.acc += dt;
        while (dlg.acc >= dlg.delay && dlg.i < dlg.text.length) {
          dlg.acc -= dlg.delay;
          const ch = dlg.text[dlg.i++];
          textEl.textContent = dlg.text.slice(0, dlg.i);
          onChar(ch);
          dlg.delay = charDelay(ch);
        }
        if (dlg.i >= dlg.text.length) {
          dlg.phase = "hold";
          dlg.timer = dlg.hold;
          speaking = false;
        }
        break;
      }
      case "hold":
        if (dlg.hold === Infinity) break;
        dlg.timer -= dt;
        if (dlg.timer <= 0) {
          dlg.phase = "fade";
          dlg.timer = 0.32;
          showBubble(false);
        }
        break;
      case "fade":
        dlg.timer -= dt;
        if (dlg.timer <= 0) {
          dlg.phase = "gap";
          dlg.timer = dlg.msg === 0 ? 2.4 : 0.9; // turlar arasında küre biraz daha dinlenir
        }
        break;
      case "think":
        dlg.timer -= dt;
        if (dlg.timer <= 0) {
          thinking = false;
          const reply = dlg.pendingReply;
          live.textContent = reply;
          beginType(reply, Infinity);
        }
        break;
      default:
        break;
    }
  };

  /* ---------- kullanıcı etkileşimi ---------- */
  const staticSay = (text, kind) => {
    setBubble(text, text, kind);
    showBubble(true);
  };

  const say = (text) => {
    dlg.mode = "user";
    if (reduceMq.matches) {
      live.textContent = text;
      staticSay(text, "ai");
      return;
    }
    live.textContent = text;
    beginType(text, Infinity);
  };

  const submit = (cmd) => {
    const text = cmd.trim();
    if (!text) return;
    dlg.mode = "user";
    const reply = replyFor(text);
    if (reduceMq.matches) {
      staticSay(text, "user");
      window.setTimeout(() => {
        live.textContent = reply;
        staticSay(reply, "ai");
      }, 350);
      return;
    }
    speaking = false;
    thinking = true;
    setBubble(text, text, "user");
    showBubble(true);
    dlg.phase = "think";
    dlg.timer = 0.75;
    dlg.pendingReply = reply;
  };

  const setOpen = (open) => {
    panel.hidden = !open;
    slot.classList.toggle("is-open", open);
    orb.setAttribute("aria-expanded", String(open));
    listening = open;
    if (open) {
      dlg.mode = "user";
      if (dlg.phase !== "think") say(GREETING);
      input.focus({ preventScroll: true });
    } else {
      keyPulse = 0;
    }
  };

  orb.addEventListener("click", () => setOpen(panel.hidden));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = "";
    submit(v);
  });

  input.addEventListener("input", () => {
    keyPulse = 0.6 + Math.random() * 0.4;
  });

  stage.querySelectorAll(".ai-suggest button").forEach((b) => {
    b.addEventListener("click", () => submit(b.dataset.cmd || b.textContent));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) {
      setOpen(false);
      orb.focus({ preventScroll: true });
    }
  });

  orb.addEventListener("pointerenter", () => {
    hoverTarget = 1;
  });
  orb.addEventListener("pointerleave", () => {
    hoverTarget = 0;
    mxT = 0;
    myT = 0;
  });
  orb.addEventListener("pointermove", (e) => {
    const r = orb.getBoundingClientRect();
    mxT = ((e.clientX - r.left) / r.width) * 2 - 1;
    myT = -(((e.clientY - r.top) / r.height) * 2 - 1);
  });
  orb.addEventListener("focus", () => {
    hoverTarget = 1;
  });
  orb.addEventListener("blur", () => {
    hoverTarget = 0;
  });

  /* ---------- döngü ---------- */
  const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

  const frame = (now) => {
    rafId = 0;
    if (!running) return;
    const t = now / 1000;
    const dt = last ? Math.min(0.05, t - last) : 1 / 60;
    last = t;
    time += dt;

    stepDialog(dt);

    pulse *= Math.exp(-dt * 10);
    keyPulse *= Math.exp(-dt * 8);
    let target = 0;
    if (speaking) target = 0.22 + 0.78 * pulse;
    else if (thinking) target = 0.3 + 0.18 * Math.sin(time * 9);
    else if (listening) target = 0.05 + 0.5 * keyPulse;
    amp = approach(amp, target, target > amp ? 18 : 5, dt);

    hover = approach(hover, hoverTarget, 6, dt);
    mx = approach(mx, mxT, 7, dt);
    my = approach(my, myT, 7, dt);

    const breath = 0.5 + 0.5 * Math.sin(time * 0.85);
    draw(time, amp, breath, hover, mx, my);

    adapt(dt);
    rafId = requestAnimationFrame(frame);
  };

  const adapt = (dt) => {
    if (mode !== "gl") return;
    warm += dt;
    if (warm < 2.5) return;
    ema += (dt - ema) * 0.06;
    accum += dt;
    if (accum < 1.5) return;
    accum = 0;
    if (ema > 0.026 && scale > 0.5) {
      scale = Math.max(0.5, scale * 0.8);
      resize();
    }
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
    if (reduceMq.matches || !booted) {
      stop();
      return;
    }
    if (visible && !document.hidden) start();
    else stop();
  };

  const kickoff = () => {
    if (reduceMq.matches) {
      if (dlg.mode === "auto") staticSay(MESSAGES[0], "ai");
      return;
    }
    if (dlg.mode === "auto" && dlg.phase === "off" && dlg.pass === 0) {
      dlg.phase = "gap";
      dlg.timer = 0.6;
    }
  };

  const apply = () => {
    resize();
    if (reduceMq.matches) {
      stop();
      speaking = false;
      thinking = false;
      amp = 0;
      if (dlg.mode === "auto") staticSay(MESSAGES[0], "ai");
      draw(STATIC_TIME, 0, 0.5, 0, 0, 0);
    } else {
      kickoff();
      sync();
    }
  };

  const boot = () => {
    if (booted) return;
    booted = true;
    mode = initGL() ? "gl" : "css";
    apply();
  };

  /* ---------- gözlemciler ve kurulum ---------- */
  if ("ResizeObserver" in window) new ResizeObserver(() => resize()).observe(orb);
  else window.addEventListener("resize", resize, { passive: true });

  if ("IntersectionObserver" in window && hero) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      },
      { threshold: 0 }
    ).observe(hero);

    // Hero menünün altında kaldığı sürece menü butonu mor olur
    if (nav) {
      new IntersectionObserver(
        (entries) => {
          nav.classList.toggle("is-on-hero", entries[entries.length - 1].isIntersecting);
        },
        { rootMargin: `-${nav.offsetHeight || 72}px 0px 0px 0px`, threshold: 0 }
      ).observe(hero);
    }
  }

  document.addEventListener("visibilitychange", sync);

  const onMotionChange = () => {
    if (!booted) return;
    if (!reduceMq.matches) {
      dlg.phase = dlg.mode === "auto" ? "off" : dlg.phase;
    }
    apply();
  };
  if (reduceMq.addEventListener) reduceMq.addEventListener("change", onMotionChange);

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    if (mode !== "gl") return;
    glOk = false;
    mode = "css";
    canvas.classList.remove("is-on");
    fallback.classList.remove("is-off");
  });

  // Önce sayfa yüklensin ve başlık animasyonu oynasın; WebGL boşta bir anda açılsın
  const schedule = () => {
    window.setTimeout(() => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(boot, { timeout: 1500 });
      else boot();
    }, 1600);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
})();
