(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileMq = window.matchMedia("(max-width: 900px)");
  const mobile = () => mobileMq.matches;
  const CMD = "Medya havuzundaki videoyu ekle, sessiz yerleri kes";

  const nav = document.querySelector(".nav");
  const cmdEl = document.querySelector(".cmd-text");
  const ba = document.querySelector(".ba");
  const baLine = document.querySelector(".ba-line");
  const baRange = document.querySelector(".ba-range");
  const hNow = document.getElementById("hNow");
  let lenis = null;

  const sectionTop = (section) => {
    const spacer = section.parentElement && section.parentElement.classList.contains("pin-spacer")
      ? section.parentElement
      : section;
    return spacer.getBoundingClientRect().top + window.scrollY;
  };

  const onScrollChrome = () => {
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
    const y = window.scrollY + 120;
    let current = "";
    let best = -1;
    document.querySelectorAll(".nav-links a").forEach((link) => {
      const section = document.getElementById(link.getAttribute("href").slice(1));
      if (!section) return;
      const top = sectionTop(section);
      if (top <= y && top >= best) {
        best = top;
        current = section.id;
      }
    });
    document.querySelectorAll(".nav-links a").forEach((link) => {
      const on = link.getAttribute("href") === `#${current}`;
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };
  onScrollChrome();
  window.addEventListener("scroll", onScrollChrome, { passive: true });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='#']");
    if (!link) return;
    const hash = link.getAttribute("href");
    if (!hash || hash === "#") {
      event.preventDefault();
      return;
    }
    if (hash === "#ust") {
      event.preventDefault();
      if (lenis) lenis.scrollTo(0);
      else window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      return;
    }
    const target = document.querySelector(hash);
    if (!target) return;
    event.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: 0 });
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });

  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    document.documentElement.classList.remove("motion");
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  let ctx = null;
  let typeGen = 0;
  let baW = 0;

  const measureBA = () => {
    if (ba) baW = ba.getBoundingClientRect().width;
  };

  const setBA = (progress) => {
    const p = Math.min(0.9, Math.max(0.1, progress));
    if (!baW) measureBA();
    if (baLine) baLine.style.transform = `translate3d(${p * baW}px,0,0)`;
    if (baRange && document.activeElement !== baRange) baRange.value = String(Math.round(p * 100));
  };

  const paintGradient = () => {
    const line = document.querySelector(".hero-line.grad");
    if (!line) return;
    const width = line.getBoundingClientRect().width;
    line.querySelectorAll(".char-grad").forEach((char) => {
      char.style.backgroundSize = `${width}px 100%`;
      char.style.backgroundPosition = `${-char.offsetLeft}px 50%`;
    });
  };

  const splitHero = () => {
    if (reduce) return;
    const title = document.querySelector(".hero-title");
    title.querySelectorAll(".hero-line").forEach((line) => {
      const text = line.textContent;
      line.textContent = "";
      const grad = line.classList.contains("grad");
      [...text].forEach((ch, index) => {
        const span = document.createElement("span");
        span.className = grad ? "char char-grad" : "char";
        span.style.setProperty("--i", index);
        span.textContent = ch === " " ? "\u00A0" : ch;
        line.appendChild(span);
      });
    });
    const chars = title.querySelectorAll(".char");
    gsap.set(chars, { yPercent: 110, opacity: 0 });
    title.classList.add("is-ready");
    paintGradient();
    gsap.to(chars, {
      yPercent: 0,
      opacity: 1,
      duration: 0.92,
      ease: "power3.out",
      stagger: 0.028,
      delay: 0.08,
    });
    gsap.fromTo(
      ".hero-bg img",
      { scale: 1.66, transformOrigin: "center 42%" },
      { scale: 1.48, transformOrigin: "center 42%", duration: 22, ease: "power1.out" }
    );
  };

  const playType = () => {
    const gen = ++typeGen;
    let index = 0;
    const step = () => {
      if (gen !== typeGen || !cmdEl) return;
      cmdEl.textContent = CMD.slice(0, index);
      index += 1;
      if (index <= CMD.length) window.setTimeout(step, 26);
    };
    step();
  };

  const raf = (time) => {
    if (lenis) lenis.raf(time * 1000);
  };

  const mountLenis = () => {
    const want = !reduce && !mobile() && typeof Lenis !== "undefined";
    if (want && !lenis) {
      lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    } else if (!want && lenis) {
      gsap.ticker.remove(raf);
      lenis.destroy();
      lenis = null;
    }
  };

  const build = () => {
    if (ctx) ctx.revert();
    typeGen += 1;
    mountLenis();
    measureBA();

    if (reduce) {
      if (cmdEl) cmdEl.textContent = CMD;
      setBA(0.5);
      return;
    }

    ctx = gsap.context(() => {
      if (!mobile()) {
        gsap.fromTo(
          ".stage-window",
          { rotateX: 17, scale: 0.88, y: 18 },
          {
            rotateX: 0,
            scale: 1,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: ".reveal",
              start: "top top",
              end: "+=130%",
              pin: true,
              scrub: 0.45,
              anticipatePin: 1,
            },
          }
        );

        const proxy = { i: 0 };
        const aiTl = gsap.timeline({
          scrollTrigger: {
            trigger: ".ai",
            start: "top top",
            end: "+=145%",
            pin: true,
            scrub: 0.4,
            anticipatePin: 1,
          },
        });
        aiTl.to(proxy, {
          i: CMD.length,
          duration: 1,
          ease: "none",
          onUpdate: () => {
            if (cmdEl) cmdEl.textContent = CMD.slice(0, Math.round(proxy.i));
          },
        }, 0);
        aiTl.fromTo(".ai-shot-edit", { opacity: 0 }, { opacity: 1, duration: 1, ease: "none" }, 0);

        gsap.fromTo(
          ".audio-shot",
          { y: 36 },
          {
            y: -36,
            ease: "none",
            scrollTrigger: {
              trigger: "#ses",
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );

        const track = document.querySelector(".h-track");
        const pin = document.querySelector(".h-pin");
        const distance = () => Math.max(0, track.scrollWidth - pin.clientWidth);
        gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: ".h-gallery",
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.45,
            invalidateOnRefresh: true,
            anticipatePin: 1,
            onUpdate: (self) => {
              if (!hNow) return;
              const n = Math.min(6, Math.max(1, Math.ceil(self.progress * 6) || 1));
              hNow.textContent = String(n).padStart(2, "0");
            },
          },
        });

        ScrollTrigger.create({
          trigger: ".ba",
          start: "top 75%",
          end: "bottom 35%",
          scrub: true,
          onRefresh: measureBA,
          onUpdate: (self) => setBA(0.16 + self.progress * 0.7),
        });
      } else if (baRange) {
        ScrollTrigger.create({
          trigger: ".ai",
          start: "top 75%",
          once: true,
          onEnter: playType,
        });
        setBA(Number(baRange.value) / 100);
      }

      gsap.utils.toArray(".bento-card, .export-shot").forEach((card) => {
        gsap.to(card, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: card, start: "top 88%" },
          onComplete: () => {
            card.style.opacity = "";
            card.style.transform = "";
            card.classList.add("is-in");
          },
        });
      });
    });
  };

  if (baRange) {
    baRange.addEventListener("input", () => {
      measureBA();
      setBA(Number(baRange.value) / 100);
    });
  }

  splitHero();
  build();
  measureBA();
  setBA(mobile() && baRange ? Number(baRange.value) / 100 : 0.2);

  mobileMq.addEventListener("change", build);
  window.addEventListener("resize", () => {
    measureBA();
    paintGradient();
  }, { passive: true });

  const refresh = () => ScrollTrigger.refresh();
  window.addEventListener("load", refresh);
  document.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", refresh, { once: true });
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      paintGradient();
      refresh();
    });
  }
})();
