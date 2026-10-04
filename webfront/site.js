// Page behaviour for the NoteLama landing page: the language switch, the
// ink field and Lama on the hero stage, and the small models of the book,
// library, study tape, scan review and storage. Nothing is stored or sent;
// only the language choice is kept in localStorage when it is available.
"use strict";
(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  // ── Language ────────────────────────────────────────────────────────
  const languageSelect = $("#language");
  const languageError = $("#language-error");
  const localeVersion = $('script[src*="site.js"]').dataset.localesVersion;
  let strings = null;
  let revision = 0;
  let currentLanguage = "en";
  const listeners = [];

  function t(key, values = {}) {
    const text = strings && typeof strings[key] === "string" ? strings[key] : key;
    return text.replace(/\{(\w+)\}/g, (_, name) => (name in values ? values[name] : `{${name}}`));
  }
  function onLocale(listener) {
    listeners.push(listener);
    if (strings) listener();
  }

  async function setLanguage(language) {
    if (!["en", "de"].includes(language)) language = "en";
    const request = ++revision;
    try {
      const response = await fetch(`locales/${language}.json?v=${localeVersion}`);
      if (!response.ok) throw new Error("Language unavailable");
      const loaded = await response.json();
      if (request !== revision) return;
      strings = loaded;
      $$("[data-i18n]").forEach((element) => { element.textContent = strings[element.dataset.i18n]; });
      $$("[data-i18n-label]").forEach((element) => {
        const label = strings[element.dataset.i18nLabel];
        element.setAttribute("aria-label", label);
        if (element.hasAttribute("title")) element.title = label;
      });
      document.title = strings.title;
      $('meta[name="description"]').content = strings.description;
      document.documentElement.lang = language;
      languageSelect.value = language;
      currentLanguage = language;
      languageError.hidden = true;
      listeners.forEach((listener) => listener());
      try { localStorage.setItem("notelama.language", language); } catch (_) { /* Storage is optional. */ }
    } catch (_) {
      if (request !== revision) return;
      languageSelect.value = currentLanguage;
      languageError.textContent = currentLanguage === "de"
        ? "Die Sprache konnte nicht geladen werden. Bitte versuche es erneut."
        : "The language could not be loaded. Please try again.";
      languageError.hidden = false;
    }
  }
  languageSelect.addEventListener("change", (event) => setLanguage(event.target.value));
  let preferred = navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
  try { preferred = localStorage.getItem("notelama.language") || preferred; } catch (_) { /* Storage is optional. */ }
  setLanguage(preferred);

  // ── Shared helpers ──────────────────────────────────────────────────
  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Handwriting-like strokes: one looped trochoid per word, slanted, with
  // some tall and descending letters. Returns strokes of [x, y] points.
  function scribble(rand, x0, baseline, width, xHeight) {
    const strokes = [];
    let x = x0;
    const end = x0 + width;
    while (x < end - xHeight * 2) {
      const letters = 2 + Math.floor(rand() * 6);
      const advance = xHeight * (0.56 + rand() * 0.16);
      if (x + letters * advance > end) break;
      const heights = Array.from({ length: letters }, () => {
        const pick = rand();
        if (pick < 0.16) return -1.9;
        if (pick < 0.24) return 1.4;
        return -(0.8 + rand() * 0.35);
      });
      const points = [[x - advance * 0.4, baseline + xHeight * 0.1]];
      const steps = 12;
      for (let i = 0; i <= letters * steps; i += 1) {
        const u = i / steps;
        const letter = Math.min(letters - 1, Math.floor(u));
        const lift = (1 - Math.cos(2 * Math.PI * u)) / 2;
        const y = baseline + heights[letter] * xHeight * lift;
        const loop = xHeight * 0.26 * Math.sin(2 * Math.PI * u);
        const jitter = xHeight * 0.04;
        points.push([x + advance * u - loop - (y - baseline) * 0.22 + (rand() - 0.5) * jitter, y + (rand() - 0.5) * jitter]);
      }
      points.push([x + letters * advance + advance * 0.35, baseline - xHeight * 0.35]);
      strokes.push(points);
      x += letters * advance + xHeight * (0.9 + rand() * 0.6);
    }
    return strokes;
  }

  function trace(context, points) {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i += 1) {
      const midX = (points[i][0] + points[i + 1][0]) / 2;
      const midY = (points[i][1] + points[i + 1][1]) / 2;
      context.quadraticCurveTo(points[i][0], points[i][1], midX, midY);
    }
    const last = points[points.length - 1];
    context.lineTo(last[0], last[1]);
  }

  function whenVisible(element, callback) {
    if (!("IntersectionObserver" in window)) { callback(true); return; }
    new IntersectionObserver((entries) => entries.forEach((entry) => callback(entry.isIntersecting))).observe(element);
  }

  function replay(element, className) {
    element.classList.remove(className);
    void element.getBoundingClientRect();
    element.classList.add(className);
  }

  // ── Header and reveals ──────────────────────────────────────────────
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if ("IntersectionObserver" in window && !reduced.matches) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }), { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach((element) => observer.observe(element));
  } else {
    $$(".reveal").forEach((element) => element.classList.add("is-visible"));
  }

  // ── Hero: ink field and Lama ────────────────────────────────────────
  function hero() {
    const canvas = $("[data-ink-field]");
    const lama = $("[data-hero-lama]");
    if (!canvas || !lama) return;
    const context = canvas.getContext("2d");
    const rand = random(20261004);
    let width = 0;
    let height = 0;
    let lines = [];
    let current = null;
    let visible = true;
    let frame = 0;
    let last = 0;
    let rest = 0;
    const RULE = 38;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      lines = [];
      current = null;
      if (reduced.matches) settle(); else draw();
    }

    function newLine(age = 0) {
      const rows = Math.max(3, Math.floor((height - RULE * 2) / RULE));
      // On narrow stages the copy sits above the scene; write below it.
      const narrow = width < 760;
      const copy = $(".hero-copy");
      const first = narrow ? Math.min(rows - 1, Math.ceil((copy.offsetTop + copy.offsetHeight) / RULE)) : 1;
      const used = new Set(lines.map((line) => line.row));
      let row = first + Math.floor(rand() * (rows - first + 1));
      for (let tries = 0; tries < 8 && used.has(row); tries += 1) row = first + Math.floor(rand() * (rows - first + 1));
      const start = width * (narrow ? 0.06 : 0.36 + rand() * 0.12);
      const span = width * (narrow ? 0.84 : 0.5 + rand() * 0.1);
      const strokes = scribble(rand, start, RULE * (row + 1) - 9, Math.min(span, width - start - 24), 9 + rand() * 3);
      const total = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
      return { row, strokes, total, drawn: total * (age > 0 ? 1 : 0), age, accent: rand() < 0.4 };
    }

    function settle() {
      for (let i = 0; i < 5; i += 1) lines.push(newLine(3 + i * 2));
      draw();
    }

    function draw() {
      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(255, 248, 235, 0.06)";
      context.lineWidth = 1;
      context.beginPath();
      for (let y = RULE * 2; y < height; y += RULE) { context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5); }
      context.stroke();
      context.lineCap = "round";
      context.lineJoin = "round";
      const all = current ? lines.concat(current) : lines;
      for (const line of all) {
        const fade = Math.max(0, 1 - line.age / 16);
        if (fade <= 0) continue;
        context.strokeStyle = line.accent ? `rgba(92, 192, 207, ${0.6 * fade})` : `rgba(255, 248, 235, ${0.4 * fade})`;
        context.lineWidth = 1.7;
        let budget = line.drawn;
        let tip = null;
        for (const stroke of line.strokes) {
          if (budget <= 1) break;
          const count = Math.min(stroke.length, Math.floor(budget));
          trace(context, stroke.slice(0, count));
          context.stroke();
          tip = stroke[count - 1];
          budget -= stroke.length;
        }
        if (line === current && tip) {
          context.fillStyle = "rgba(92, 192, 207, 0.95)";
          context.beginPath();
          context.arc(tip[0], tip[1], 3, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    function pose(hello) { lama.classList.toggle("is-hello", hello); }
    function nod() {
      pose(true);
      replay(lama, "is-hopping");
      setTimeout(() => pose(false), 900);
    }
    lama.addEventListener("animationend", () => lama.classList.remove("is-hopping"));

    function tick(now) {
      frame = 0;
      if (!visible || document.hidden || reduced.matches) { last = 0; return; }
      const delta = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      lines.forEach((line) => { line.age += delta; });
      lines = lines.filter((line) => line.age < 16);
      if (current) {
        current.drawn += delta * 70;
        if (current.drawn >= current.total) {
          current.drawn = current.total;
          lines.push(current);
          current = null;
          rest = 1.2 + rand();
          nod();
        }
      } else if ((rest -= delta) <= 0) {
        current = newLine();
      }
      draw();
      frame = requestAnimationFrame(tick);
    }
    function wake() {
      if (reduced.matches) { lines = []; current = null; settle(); pose(false); return; }
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
    }

    new ResizeObserver(resize).observe(canvas);
    whenVisible(canvas, (isVisible) => { visible = isVisible; wake(); });
    document.addEventListener("visibilitychange", wake);
    reduced.addEventListener("change", wake);
    setTimeout(() => pose(false), reduced.matches ? 0 : 1400);
    rest = 0.6;
  }

  // ── Menus ───────────────────────────────────────────────────────────
  // A Meridian menu under (or above) [anchor], inside the positioned
  // [container]: 48px rows, a check before the chosen row, arrow keys,
  // Escape and outside clicks close it and return focus to the anchor.
  let closeOpenMenu = null;
  function openMenu(anchor, container, items) {
    if (closeOpenMenu) closeOpenMenu();
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    const checks = items.some((item) => "checked" in item);
    const rows = items.map((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.setAttribute("role", "checked" in item ? "menuitemradio" : "menuitem");
      if ("checked" in item) row.setAttribute("aria-checked", String(item.checked));
      const lead = item.icon || (item.checked ? "check" : null);
      if (checks || item.icon) row.insertAdjacentHTML("beforeend", `<span class="menu-check">${lead ? `<svg class="icon" aria-hidden="true"><use href="#i-${lead}"/></svg>` : ""}</span>`);
      row.append(item.label);
      row.addEventListener("click", () => { close(); item.onSelect(); });
      menu.append(row);
      return row;
    });
    container.append(menu);
    const box = container.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    const left = Math.max(4, Math.min(at.left - box.left, box.width - menu.offsetWidth - 4));
    const below = at.bottom - box.top + 4;
    const top = below + menu.offsetHeight > box.height - 4 && at.top - box.top - menu.offsetHeight - 4 > 0
      ? at.top - box.top - menu.offsetHeight - 4
      : below;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    anchor.setAttribute("aria-expanded", "true");
    function outside(event) { if (!menu.contains(event.target) && !anchor.contains(event.target)) close(false); }
    function close(refocus = true) {
      menu.remove();
      anchor.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
      closeOpenMenu = null;
      if (refocus) anchor.focus({ preventScroll: true });
    }
    menu.addEventListener("keydown", (event) => {
      const index = rows.indexOf(document.activeElement);
      if (event.key === "Escape") { close(); event.stopPropagation(); }
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        rows[(index + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length].focus();
      } else if (event.key === "Tab") close();
      else return;
      event.preventDefault();
    });
    document.addEventListener("pointerdown", outside, true);
    closeOpenMenu = () => close(false);
    (rows.find((row) => row.getAttribute("aria-checked") === "true") || rows[0]).focus({ preventScroll: true });
  }

  // ── 01 · The book sketch ────────────────────────────────────────────
  // Page geometry follows the app: A4 at 600 units across, ruled paper
  // with 7 mm rules starting one rule from the top edge, squared and dotted
  // paper at 5 mm, 0.5 pt lines, no margin line.
  function book() {
    const root = $("[data-book]");
    if (!root) return;
    const app = $("[data-sketch-theme]", root);
    const desk = $("[data-desk]", root);
    const feed = $("[data-feed]", root);
    const dock = $("[data-dock]", root);
    const saveState = $("[data-save-state]", root);
    const saveText = $("[data-save-text]", root);
    const undoButton = $("[data-undo]", root);
    const redoButton = $("[data-redo]", root);
    const toolButtons = $$("[data-tool]", root);
    const presetButtons = $$("[data-slot]", root);
    const presetScroll = $("[data-preset-scroll]", root);
    const presets = $("[data-presets]", root);
    const penGroup = $("[data-pen-group]", root);
    const eraserGroup = $("[data-eraser-group]", root);
    const footprintButton = $("[data-footprint]", root);
    const footprintLabel = $("[data-footprint-label]", root);
    const settingsButton = $("[data-pen-settings]", root);
    const penDot = $("[data-pen-dot]", root);
    const popover = $("[data-ink-popover]", root);
    const swatches = $$("[data-color]", root);
    const fingerButton = $("[data-finger]", root);
    const MM = 600 / 210;
    const W = 600;
    const H = 297 * MM;
    const RULE = 7 * MM;
    const GRID = 5 * MM;
    const PT = 25.4 / 72 * MM;
    // The standard pen and the app's default saved pens, in dock order.
    const slots = {
      standard: { profile: "uniform", color: "#18304F", width: 1 },
      pen: { profile: "uniform", color: "#18304F", width: 0.5 },
      correction: { profile: "pressure", color: "#943A55", width: 1 },
      pencil: { profile: "pencil", color: "#444B55", width: 0.7 },
      marker: { profile: "highlighter", color: "#F4D864", width: 8 },
    };
    const profileLabel = { uniform: "penTool", pressure: "pressurePen", pencil: "pencilTool", highlighter: "highlighterTool" };
    const FOOTPRINTS = [2, 5, 10];
    let tool = "pen";
    let slot = "standard";
    let footprint = 5;
    let finger = true;
    let undo = [];
    let redo = [];
    let active = null;
    let saveTimer = 0;
    let saving = false;
    let announced = "";

    // Seed content, built once from the deterministic scribble generator.
    const rand = random(7);
    const ink = (color, width, points, kind = "uniform") => ({ profile: kind, color, width: width * MM, points: points.map(([x, y]) => [x, y, 0.5]) });
    function wobble(cx, cy, rx, ry, turns = 1.08) {
      const points = [];
      for (let a = 0; a <= Math.PI * 2 * turns; a += 0.12) points.push([cx + Math.cos(a - 2.6) * rx * (1 + (rand() - 0.5) * 0.04), cy + Math.sin(a - 2.6) * ry * (1 + (rand() - 0.5) * 0.06)]);
      return points;
    }
    const words = (x, baseline, width, xHeight, color, mm = 0.5, kind = "uniform") =>
      scribble(rand, x, baseline - 1, width, xHeight).map((points) => ink(color, mm, points, kind));
    const line = (n) => RULE * n;
    const first = [
      ...words(40, line(3), 280, 11, "#0B6477", 0.8),
      ink("#0B6477", 0.8, [[38, line(3) + 5], [180, line(3) + 3.5], [322, line(3) + 6]]),
      ink("#F4D864", 4, [[42, line(6) - 4], [330, line(6) - 5]], "highlighter"),
      ...words(40, line(5), 470, 6.5, "#18304F"),
      ...words(40, line(6), 430, 6.5, "#18304F"),
      ...words(40, line(7), 500, 6.5, "#18304F"),
      ...words(40, line(8), 380, 6.5, "#18304F"),
      ...words(40, line(10), 270, 6.5, "#18304F"),
      ink("#943A55", 1, wobble(98, line(10) - 4, 56, 13), "pressure"),
      ink("#943A55", 1, [[150, line(10) + 4], [196, line(11) + 10], [246, line(12) - 6]], "pressure"),
      ink("#943A55", 1, [[234, line(12) - 14], [247, line(12) - 6], [236, line(12) + 3]], "pressure"),
      ...words(262, line(12), 230, 6.5, "#943A55", 1, "pressure"),
      ...words(40, line(14), 480, 6.5, "#18304F"),
      ...words(40, line(15), 300, 6.5, "#18304F"),
    ];
    const box = (x0, y0, x1, y1) => ink("#444B55", 0.7, [[x0, y0], [x1, y0 - 1], [x1 + 1, y1], [x0 - 1, y1 + 1], [x0, y0 - 1]], "pencil");
    const second = [
      ...words(43, GRID * 4, 260, 11, "#18304F", 0.8),
      box(GRID * 6, GRID * 10, GRID * 18, GRID * 17),
      box(GRID * 24, GRID * 10, GRID * 36, GRID * 17),
      box(GRID * 15, GRID * 24, GRID * 27, GRID * 31),
      ink("#0B6477", 0.8, [[GRID * 12, GRID * 17], [GRID * 15, GRID * 21], [GRID * 19, GRID * 24]]),
      ink("#0B6477", 0.8, [[GRID * 30, GRID * 17], [GRID * 27, GRID * 21], [GRID * 23, GRID * 24]]),
      ...words(GRID * 8, GRID * 14, GRID * 9, 6, "#444B55", 0.7, "pencil"),
      ...words(GRID * 26, GRID * 14, GRID * 9, 6, "#444B55", 0.7, "pencil"),
      ...words(GRID * 17, GRID * 28, GRID * 9, 6, "#444B55", 0.7, "pencil"),
    ];
    const third = [
      ...words(43, GRID * 4, 240, 11, "#315FA6", 0.8),
      ...[0, 1, 2, 3].flatMap((row) => {
        const y = GRID * (8 + row * 3);
        return [
          ink("#315FA6", 0.6, [[GRID * 3, y - GRID], [GRID * 4, y - GRID], [GRID * 4, y], [GRID * 3, y], [GRID * 3, y - GRID]]),
          ...words(GRID * 5.5, y, 200 + rand() * 180, 6.5, "#18304F"),
        ];
      }),
      ink("#315FA6", 0.8, [[GRID * 3.1, GRID * 7.6], [GRID * 3.5, GRID * 8.1], [GRID * 4.4, GRID * 6.6]]),
      ink("#315FA6", 0.8, [[GRID * 3.1, GRID * 13.6], [GRID * 3.5, GRID * 14.1], [GRID * 4.4, GRID * 12.6]]),
    ];
    const pages = $$("[data-page]", feed).map((element, index) => {
      const canvas = $("[data-paper]", element);
      return {
        element, canvas, context: canvas.getContext("2d"),
        ring: $("[data-eraser-ring]", element),
        label: $("[data-page-label]", element),
        zoom: $("[data-page-zoom]", element),
        paper: ["ruled", "grid", "dotted"][index],
        strokes: [first, second, third][index],
      };
    });

    function drawPaper(target, kind, scale) {
      target.fillStyle = "#FFFFFF";
      target.fillRect(0, 0, W, H);
      // 0.5 pt lines, never thinner than a device pixel.
      target.lineWidth = Math.max(0.5 * PT, 1 / scale);
      if (kind === "ruled") {
        target.strokeStyle = "#C9D6E3";
        target.beginPath();
        for (let y = RULE; y < H; y += RULE) { target.moveTo(0, y); target.lineTo(W, y); }
        target.stroke();
      } else if (kind === "grid") {
        target.strokeStyle = "#E3E7EC";
        target.beginPath();
        for (let y = GRID; y < H; y += GRID) { target.moveTo(0, y); target.lineTo(W, y); }
        for (let x = GRID; x < W; x += GRID) { target.moveTo(x, 0); target.lineTo(x, H); }
        target.stroke();
      } else {
        target.fillStyle = "#C3CAD2";
        const r = Math.max(0.5 * PT, 0.6 / scale);
        for (let y = GRID; y < H; y += GRID) {
          for (let x = GRID; x < W; x += GRID) { target.beginPath(); target.arc(x, y, r, 0, Math.PI * 2); target.fill(); }
        }
      }
    }

    function drawStroke(target, stroke) {
      const { points } = stroke;
      if (!points.length) return;
      target.save();
      target.lineCap = "round";
      target.lineJoin = "round";
      target.strokeStyle = stroke.color;
      target.fillStyle = stroke.color;
      if (stroke.profile === "highlighter") {
        target.globalCompositeOperation = "multiply";
        target.globalAlpha = 0.45;
        target.lineCap = "butt";
      }
      if (points.length === 1) {
        target.beginPath();
        target.arc(points[0][0], points[0][1], stroke.width / 2, 0, Math.PI * 2);
        target.fill();
      } else if (stroke.profile === "pressure") {
        for (let i = 1; i < points.length; i += 1) {
          target.lineWidth = stroke.width * (0.45 + points[i][2] * 1.1);
          target.beginPath();
          target.moveTo(points[i - 1][0], points[i - 1][1]);
          target.lineTo(points[i][0], points[i][1]);
          target.stroke();
        }
      } else if (stroke.profile === "pencil") {
        target.globalAlpha = 0.7;
        target.lineWidth = stroke.width * 0.9;
        trace(target, points);
        target.stroke();
        target.globalAlpha = 0.35;
        target.lineWidth = stroke.width * 0.5;
        target.setLineDash([1.2, 1.6]);
        target.translate(0.6, 0.4);
        trace(target, points);
        target.stroke();
      } else {
        target.lineWidth = stroke.width;
        trace(target, points);
        target.stroke();
      }
      target.restore();
    }

    function render(index) {
      const page = pages[index];
      const scale = page.canvas.width / W;
      page.context.setTransform(scale, 0, 0, scale, 0, 0);
      drawPaper(page.context, page.paper, scale);
      page.strokes.forEach((stroke) => drawStroke(page.context, stroke));
      if (active && active.page === index && active.stroke) drawStroke(page.context, active.stroke);
    }

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      pages.forEach((page, index) => {
        page.canvas.width = Math.round(page.canvas.clientWidth * ratio);
        page.canvas.height = Math.round(page.canvas.width * (H / W));
        render(index);
      });
      updateLabels();
    }

    // The pen slot glyph from the app's PenPresetPainter, on its 24px grid.
    function glyph({ profile, color, width }) {
      const wide = profile === "highlighter";
      const left = wide ? 8 : 9;
      const right = wide ? 16 : 15;
      const nib = {
        uniform: "M10 10L11 4.5L13 4.5L14 10Z",
        pressure: "M9.5 10L10.5 6.5L12 3L13.5 6.5L14.5 10Z",
        pencil: "M11 6.5L12 3.5L13 6.5Z",
        highlighter: "M9 10L9.5 5.5L15 3.5L15 10Z",
      }[profile];
      const bar = Math.min(3, Math.max(1, width * 1.2));
      return `<svg viewBox="0 0 24 24" aria-hidden="true">`
        + `<rect x="${left}" y="10" width="${right - left}" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`
        + `<rect x="${left}" y="10" width="${right - left}" height="2.5" fill="${color}"/>`
        + (profile === "pencil" ? `<path d="M9 10L12 3.5L15 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>` : "")
        + `<path d="${nib}" fill="${color}" stroke="currentColor" stroke-width="0.75" stroke-linejoin="round"/>`
        + `<line x1="6" y1="22" x2="18" y2="22" stroke="${color}" stroke-width="${bar}" stroke-linecap="round"/></svg>`;
    }
    function slotLabel(id) {
      const { profile, width } = slots[id];
      const size = new Intl.NumberFormat(currentLanguage, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(width);
      const summary = `${t(profileLabel[profile])} · ${size} mm`;
      return id === "standard" ? `${t("standardPen")} · ${summary}` : summary;
    }
    function updatePens() {
      presetButtons.forEach((button) => {
        const id = button.dataset.slot;
        button.innerHTML = glyph(slots[id]);
        button.setAttribute("aria-checked", String(id === slot));
        button.setAttribute("aria-label", slotLabel(id));
        button.title = slotLabel(id);
      });
      penDot.style.setProperty("--pen", slots[slot].color);
      swatches.forEach((swatch) => swatch.setAttribute("aria-checked", String(swatch.dataset.color === slots[slot].color)));
    }
    function updatePresetEdges() {
      const before = presetScroll.scrollLeft > 0.5;
      const after = presetScroll.scrollLeft < presetScroll.scrollWidth - presetScroll.clientWidth - 0.5;
      presetScroll.classList.toggle("more-before", before);
      presetScroll.classList.toggle("more-after", after);
      presets.classList.toggle("more-after", after);
    }
    presetScroll.addEventListener("scroll", updatePresetEdges, { passive: true });
    presetScroll.addEventListener("wheel", (event) => {
      if (!event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      presetScroll.scrollLeft += event.deltaY;
      event.preventDefault();
    }, { passive: false });

    function updateLabels() {
      pages.forEach((page, index) => {
        page.label.textContent = t("pageOf", { page: index + 1, pages: pages.length });
        page.zoom.textContent = t("zoomLabel", { percent: Math.round((page.canvas.clientWidth / (210 * 72 / 25.4)) * 100) });
      });
      saveText.textContent = announced || t(saving ? "saving" : "savedLocally");
      undoButton.disabled = !undo.length;
      redoButton.disabled = !redo.length;
      footprintLabel.textContent = `${footprint} mm`;
      updatePens();
    }

    function changed(message = "") {
      saving = true;
      announced = message;
      saveState.classList.add("saving");
      updateLabels();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saving = false;
        announced = "";
        saveState.classList.remove("saving");
        updateLabels();
      }, message ? 1600 : 520);
    }

    // Undo and redo follow the book: a change on a page out of view scrolls
    // the feed to that page.
    function reveal(index) {
      const element = pages[index].element;
      const top = element.offsetTop - feed.offsetTop;
      const visible = top < feed.scrollTop + feed.clientHeight - 80 && top + element.offsetHeight > feed.scrollTop + 80;
      if (!visible) feed.scrollTo({ top: top - parseFloat(getComputedStyle(feed).paddingTop) + 8, behavior: reduced.matches ? "auto" : "smooth" });
      return !visible;
    }
    function apply(command, forward) {
      const strokes = pages[command.page].strokes;
      const adding = (command.type === "add") === forward;
      if (adding) {
        command.strokes.slice().sort((a, b) => a.index - b.index).forEach(({ stroke, index }) => strokes.splice(index, 0, stroke));
      } else {
        command.strokes.slice().sort((a, b) => b.index - a.index).forEach(({ stroke }) => strokes.splice(strokes.indexOf(stroke), 1));
      }
      render(command.page);
      const elsewhere = reveal(command.page);
      changed(elsewhere ? t(forward ? "redoneOnPage" : "undoneOnPage", { page: command.page + 1 }) : "");
    }
    function commit(command) {
      undo.push(command);
      if (undo.length > 100) undo.shift();
      redo = [];
      changed();
    }
    undoButton.addEventListener("click", () => { const command = undo.pop(); if (command) { apply(command, false); redo.push(command); updateLabels(); } });
    redoButton.addEventListener("click", () => { const command = redo.pop(); if (command) { apply(command, true); undo.push(command); updateLabels(); } });

    // While the eraser is the tool, the dock shows its footprint in place
    // of the pen settings and slots, as the app does.
    function selectTool(next) {
      tool = next;
      toolButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.tool === tool)));
      penGroup.hidden = tool === "eraser";
      eraserGroup.hidden = tool !== "eraser";
      if (tool === "eraser") closePopover();
      pages.forEach((page) => page.canvas.classList.toggle("erasing", tool === "eraser"));
    }
    toolButtons.forEach((button) => button.addEventListener("click", () => selectTool(button.dataset.tool)));
    presetButtons.forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.slot;
      // A tap on the active slot while writing opens its settings.
      if (id === slot && tool === "pen") { togglePopover(); return; }
      slot = id;
      selectTool("pen");
      updatePens();
    }));
    footprintButton.addEventListener("click", () => openMenu(footprintButton, desk, FOOTPRINTS.map((size) => ({
      label: `${size} mm`, checked: size === footprint, onSelect: () => { footprint = size; updateLabels(); },
    }))));

    function closePopover() { popover.hidden = true; settingsButton.setAttribute("aria-expanded", "false"); }
    function togglePopover() {
      const open = popover.hidden;
      popover.hidden = !open;
      settingsButton.setAttribute("aria-expanded", String(open));
      if (open) (swatches.find((swatch) => swatch.getAttribute("aria-checked") === "true") || swatches[0]).focus();
    }
    settingsButton.addEventListener("click", togglePopover);
    swatches.forEach((swatch) => swatch.addEventListener("click", () => { slots[slot].color = swatch.dataset.color; updatePens(); }));
    popover.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closePopover(); settingsButton.focus(); event.stopPropagation(); return; }
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const index = swatches.indexOf(document.activeElement);
      if (index < 0) return;
      const next = swatches[(index + (event.key === "ArrowRight" ? 1 : swatches.length - 1)) % swatches.length];
      next.focus();
      next.click();
      event.preventDefault();
      event.stopPropagation();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!popover.hidden && !popover.contains(event.target) && !settingsButton.contains(event.target)
        && !presets.contains(event.target)) closePopover();
    }, true);

    // Draw with a finger: off, a finger scrolls the feed and only a pen or
    // mouse writes.
    fingerButton.addEventListener("click", () => {
      finger = !finger;
      fingerButton.setAttribute("aria-pressed", String(finger));
      pages.forEach((page) => page.canvas.classList.toggle("pan", !finger));
    });

    // Arrow keys move along the dock's enabled controls and wrap.
    dock.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key) || popover.contains(event.target)) return;
      const controls = $$("button", dock).filter((button) => !button.disabled && button.offsetParent && !popover.contains(button));
      const index = controls.indexOf(document.activeElement);
      if (index < 0) return;
      const next = controls[(index + (event.key === "ArrowRight" ? 1 : controls.length - 1)) % controls.length];
      next.focus();
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
      event.preventDefault();
    });

    function point(page, event) {
      const box = page.canvas.getBoundingClientRect();
      return [(event.clientX - box.left) * (W / box.width), (event.clientY - box.top) * (H / box.height)];
    }
    function moveRing(page, event) {
      const box = page.canvas.getBoundingClientRect();
      const size = (footprint * MM * box.width) / W;
      page.ring.style.transform = `translate(${event.clientX - box.left}px, ${event.clientY - box.top}px)`;
      page.ring.style.width = page.ring.style.height = `${size}px`;
      page.ring.style.margin = `-${size / 2}px 0 0 -${size / 2}px`;
    }
    function nearSegment(px, py, a, b) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      const k = length ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length)) : 0;
      return Math.hypot(px - (a[0] + k * dx), py - (a[1] + k * dy));
    }
    function erase(index, [x, y]) {
      const strokes = pages[index].strokes;
      for (let i = strokes.length - 1; i >= 0; i -= 1) {
        const stroke = strokes[i];
        const reach = (footprint * MM) / 2 + stroke.width / 2;
        const points = stroke.points;
        const hit = points.length === 1
          ? Math.hypot(x - points[0][0], y - points[0][1]) < reach
          : points.some((p, j) => j > 0 && nearSegment(x, y, points[j - 1], p) < reach);
        if (hit) {
          active.removed.push({ stroke, index: i });
          strokes.splice(i, 1);
        }
      }
    }

    pages.forEach((page, index) => {
      const { canvas } = page;
      canvas.addEventListener("pointerdown", (event) => {
        if (active || event.button > 0) return;
        if (event.pointerType === "touch" && !finger) return;
        closePopover();
        try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Capture is best effort. */ }
        const at = point(page, event);
        if (tool === "eraser") {
          active = { page: index, id: event.pointerId, removed: [] };
          erase(index, at);
        } else {
          const pen = slots[slot];
          active = { page: index, id: event.pointerId, stroke: { profile: pen.profile, color: pen.color, width: pen.width * MM, points: [[...at, event.pressure || 0.5]] } };
        }
        render(index);
        event.preventDefault();
      });
      canvas.addEventListener("pointermove", (event) => {
        if (tool === "eraser" && event.pointerType !== "touch") { page.ring.classList.add("on"); moveRing(page, event); }
        if (!active || active.page !== index || event.pointerId !== active.id) return;
        const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
        for (const sample of events.length ? events : [event]) {
          const [x, y] = point(page, sample);
          if (active.stroke) {
            const previous = active.stroke.points[active.stroke.points.length - 1];
            if (Math.hypot(x - previous[0], y - previous[1]) > 0.8) active.stroke.points.push([x, y, sample.pressure || 0.5]);
          } else {
            erase(index, [x, y]);
          }
        }
        render(index);
      });
      function finish(event, cancelled) {
        if (!active || active.page !== index || event.pointerId !== active.id) return;
        const done = active;
        active = null;
        if (done.stroke) {
          if (!cancelled) {
            page.strokes.push(done.stroke);
            commit({ type: "add", page: index, strokes: [{ stroke: done.stroke, index: page.strokes.length - 1 }] });
          }
        } else if (done.removed.length) {
          if (cancelled) {
            done.removed.slice().reverse().forEach(({ stroke, index: at }) => page.strokes.splice(at, 0, stroke));
          } else {
            commit({ type: "erase", page: index, strokes: done.removed });
          }
        }
        render(index);
      }
      canvas.addEventListener("pointerup", (event) => finish(event, false));
      canvas.addEventListener("pointercancel", (event) => finish(event, true));
      canvas.addEventListener("pointerleave", () => page.ring.classList.remove("on"));
    });
    root.addEventListener("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || !root.contains(document.activeElement)) return;
      (event.shiftKey ? redoButton : undoButton).click();
      event.preventDefault();
    });

    // Sketch appearance: follows the system until a button is pressed.
    const modeButtons = $$("[data-sketch-mode]", root);
    let mode = null;
    function applyMode() {
      const dark = mode ? mode === "dark" : darkScheme.matches;
      app.classList.toggle("dark", dark);
      modeButtons.forEach((button) => button.setAttribute("aria-pressed", String((button.dataset.sketchMode === "dark") === dark)));
    }
    modeButtons.forEach((button) => button.addEventListener("click", () => { mode = button.dataset.sketchMode; applyMode(); }));
    darkScheme.addEventListener("change", applyMode);
    applyMode();

    // About, opened from the signature in the top bar.
    const about = $("[data-about]", root);
    const opener = $("[data-about-open]", root);
    const closer = $("[data-about-close]", root);
    function closeAbout() { about.hidden = true; opener.focus(); }
    opener.addEventListener("click", () => { about.hidden = false; closer.focus(); });
    closer.addEventListener("click", closeAbout);
    about.addEventListener("click", (event) => { if (event.target === about) closeAbout(); });
    about.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closeAbout(); event.stopPropagation(); }
      if (event.key === "Tab") { closer.focus(); event.preventDefault(); }
    });

    const observer = new ResizeObserver(() => {
      desk.style.setProperty("--dock-h", `${dock.offsetHeight}px`);
      resize();
      updatePresetEdges();
    });
    observer.observe(feed);
    observer.observe(dock);
    selectTool("pen");
    updatePens();
    onLocale(updateLabels);
  }

  // ── Library ─────────────────────────────────────────────────────────
  // The app's library: a sort menu (recently opened, last modified, title)
  // behind an icon that shows the order, and an item menu on each book.
  function library() {
    const root = $("[data-library]");
    if (!root) return;
    const shelf = $("[data-shelf]", root);
    const empty = $("[data-empty]", root);
    const restore = $("[data-restore]", root);
    const restoreLabel = $("[data-restore-label]", root);
    const status = $("[data-library-status]", root);
    const sortButton = $("[data-sort-button]", root);
    const sortIcon = $("[data-sort-icon]", root);
    const icons = { recent: "history", modified: "clock", title: "arrow-down-a-z" };
    const labels = { recent: "sortRecent", modified: "sortModified", title: "sortTitle" };
    const trashed = [];
    let order = "recent";
    let message = null;

    function flip(mutate) {
      const items = $$(".book-item", shelf);
      const before = new Map(items.map((item) => [item, item.getBoundingClientRect()]));
      mutate();
      if (reduced.matches) return;
      items.forEach((item) => {
        const old = before.get(item);
        const now = item.getBoundingClientRect();
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (!dx && !dy) return;
        item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      });
    }
    const title = (item) => $(".book-name", item).textContent;
    function sorted() {
      return $$(".book-item", shelf).sort((a, b) => (order === "title"
        ? title(a).localeCompare(title(b), currentLanguage)
        : order === "modified"
          ? b.dataset.modified.localeCompare(a.dataset.modified)
          : Number(a.dataset.recent) - Number(b.dataset.recent)));
    }
    function sort() { flip(() => sorted().forEach((item) => shelf.append(item))); }
    function update() {
      const left = $$(".book-item", shelf).length;
      shelf.hidden = left === 0;
      empty.hidden = left > 0;
      restore.hidden = trashed.length === 0;
      restoreLabel.textContent = t("restoreBooks", { count: trashed.length });
      status.textContent = message ? t(message.key, message.values) : t("libraryNote");
      sortIcon.setAttribute("href", `#i-${icons[order]}`);
      sortButton.title = `${t("sortLabel")}: ${t(labels[order])}`;
      sortButton.setAttribute("aria-label", sortButton.title);
      const format = new Intl.DateTimeFormat(currentLanguage, { day: "numeric", month: "short", year: "numeric" });
      $$(".book-item", root).forEach((item) => {
        $("[data-book-date]", item).textContent = t("bookModified", { date: format.format(new Date(`${item.dataset.modified}T12:00:00`)) });
        $("[data-book-menu]", item).setAttribute("aria-label", t("itemActions", { title: title(item) }));
      });
    }
    sortButton.addEventListener("click", () => openMenu(sortButton, root, Object.keys(labels).map((key) => ({
      label: t(labels[key]), checked: key === order, onSelect: () => { order = key; update(); sort(); },
    }))));
    function moveToTrash(item) {
      const next = item.nextElementSibling || item.previousElementSibling;
      const remove = () => {
        flip(() => { item.remove(); item.classList.remove("leaving"); });
        trashed.push(item);
        message = { key: "movedToTrash", values: { title: title(item) } };
        update();
        const focusTarget = next && next.isConnected ? $("[data-book-menu]", next) : restore;
        focusTarget.focus({ preventScroll: true });
      };
      if (reduced.matches) remove();
      else { item.classList.add("leaving"); item.addEventListener("animationend", remove, { once: true }); }
    }
    shelf.addEventListener("click", (event) => {
      const button = event.target.closest("[data-book-menu]");
      if (!button) return;
      const item = button.closest(".book-item");
      openMenu(button, root, [{ label: t("moveToTrash"), icon: "trash-2", onSelect: () => moveToTrash(item) }]);
    });
    restore.addEventListener("click", () => {
      trashed.splice(0).forEach((item) => shelf.append(item));
      message = { key: "restored", values: {} };
      update();
      sorted().forEach((item) => shelf.append(item));
      $("[data-book-menu]", shelf).focus({ preventScroll: true });
    });
    onLocale(() => { update(); if (order === "title") sorted().forEach((item) => shelf.append(item)); });
  }

  // ── Study tape ──────────────────────────────────────────────────────
  function study() {
    const root = $("[data-study]");
    if (!root) return;
    const tapes = $$("[data-tape]", root);
    const hideAll = $("[data-hide-all]", root);
    const status = $("[data-study-status]", root);
    let touched = false;
    function update() {
      const shown = tapes.filter((tape) => tape.getAttribute("aria-pressed") === "true").length;
      hideAll.disabled = shown === 0;
      tapes.forEach((tape) => {
        const question = tape.previousElementSibling.textContent;
        const revealed = tape.getAttribute("aria-pressed") === "true";
        tape.setAttribute("aria-label", revealed
          ? `${question}: ${$(".answer", tape).textContent}`
          : t("tapeCovered", { question }));
      });
      status.textContent = touched ? t("studyCount", { shown, total: tapes.length }) : t("studyNote");
    }
    tapes.forEach((tape) => tape.addEventListener("click", () => {
      touched = true;
      tape.setAttribute("aria-pressed", String(tape.getAttribute("aria-pressed") !== "true"));
      update();
    }));
    hideAll.addEventListener("click", () => {
      tapes.forEach((tape) => tape.setAttribute("aria-pressed", "false"));
      update();
      tapes[0].focus();
    });
    onLocale(update);
  }

  // ── Scan review ─────────────────────────────────────────────────────
  function scan() {
    const root = $("[data-scan]");
    if (!root) return;
    const svg = $(".scan-view", root);
    const paperShape = $("[data-scan-paper]", root);
    const shadow = $("[data-scan-shadow]", root);
    const outline = $("[data-scan-outline]", root);
    const outlineEdge = $("[data-scan-outline-edge]", root);
    const linesGroup = $("[data-scan-lines]", root);
    const handlesGroup = $("[data-scan-handles]", root);
    const accept = $("[data-scan-accept]", root);
    const reset = $("[data-scan-reset]", root);
    const status = $("[data-scan-status]", root);
    const NS = "http://www.w3.org/2000/svg";
    const PHOTO = [[96, 54], [316, 30], [344, 262], [66, 252]];
    const FOUND = [[100, 59], [311, 36], [338, 257], [72, 247]];
    const FRAME = [[34, 26], [366, 26], [366, 274], [34, 274]];
    const PAGE = [[108, 22], [292, 22], [292, 282], [108, 282]];
    const names = ["cornerTopLeft", "cornerTopRight", "cornerBottomRight", "cornerBottomLeft"];
    let quad = PHOTO.map((p) => p.slice());
    let corners = FRAME.map((p) => p.slice());
    let state = "finding";
    let animation = 0;

    // Page content in unit square coordinates: rules and handwriting.
    const rand = random(42);
    const content = [];
    for (let v = 0.2; v < 0.95; v += 0.075) content.push({ rule: true, points: [[0.06, v], [0.94, v]] });
    scribble(rand, 0.1, 0.12, 0.55, 0.035).forEach((points) => content.push({ points }));
    [0.2, 0.275, 0.35, 0.425, 0.575, 0.65, 0.725].forEach((v, i) => {
      scribble(rand, 0.1, v - 0.008, i % 3 === 2 ? 0.5 : 0.78, 0.022).forEach((points) => content.push({ points }));
    });
    function map([u, v], q) {
      const top = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u];
      const bottom = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u];
      return [top[0] + (bottom[0] - top[0]) * v, top[1] + (bottom[1] - top[1]) * v];
    }
    const pointsAttr = (q) => q.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
    const paths = content.map((item) => {
      const path = document.createElementNS(NS, "path");
      if (item.rule) path.setAttribute("class", "rule");
      linesGroup.append(path);
      return path;
    });
    const handles = corners.map((_, index) => {
      const group = document.createElementNS(NS, "g");
      group.setAttribute("class", "scan-handle");
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.dataset.index = index;
      group.innerHTML = '<circle class="hit" r="22"/><circle class="ring" r="7"/>';
      handlesGroup.append(group);
      return group;
    });

    function convex(q) {
      let sign = 0;
      for (let i = 0; i < 4; i += 1) {
        const a = q[i];
        const b = q[(i + 1) % 4];
        const c = q[(i + 2) % 4];
        const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross) < 200) return false;
        if (sign && Math.sign(cross) !== sign) return false;
        sign = Math.sign(cross);
      }
      return true;
    }
    function draw() {
      paperShape.setAttribute("points", pointsAttr(quad));
      shadow.setAttribute("points", pointsAttr(quad.map(([x, y]) => [x + 4, y + 7])));
      paths.forEach((path, i) => {
        const mapped = content[i].points.map((p) => map(p, quad));
        path.setAttribute("d", `M${mapped.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join("L")}`);
      });
      outline.setAttribute("points", pointsAttr(corners));
      outlineEdge.setAttribute("points", pointsAttr(corners));
      handles.forEach((handle, i) => handle.setAttribute("transform", `translate(${corners[i][0].toFixed(1)} ${corners[i][1].toFixed(1)})`));
      const valid = convex(corners);
      outline.classList.toggle("invalid", !valid);
      accept.disabled = state !== "review" || !valid;
      if (state === "review") status.textContent = t(valid ? "scanFound" : "scanCrossed");
    }
    function animate(from, to, duration, done) {
      cancelAnimationFrame(animation);
      if (reduced.matches) { to(1); draw(); done(); return; }
      const start = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - start) / duration);
        to(1 - Math.pow(1 - k, 3));
        draw();
        if (k < 1) animation = requestAnimationFrame(step); else done();
      };
      from();
      animation = requestAnimationFrame(step);
    }
    const lerp = (a, b, k) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * k, p[1] + (b[i][1] - p[1]) * k]);
    function find() {
      state = "finding";
      svg.classList.remove("accepted");
      quad = PHOTO.map((p) => p.slice());
      corners = FRAME.map((p) => p.slice());
      status.textContent = t("scanFinding");
      accept.disabled = true;
      reset.disabled = true;
      animate(() => {}, (k) => { corners = lerp(FRAME, FOUND, k); }, 900, () => { state = "review"; reset.disabled = false; draw(); });
    }
    accept.addEventListener("click", () => {
      if (state !== "review" || !convex(corners)) return;
      state = "done";
      svg.classList.add("accepted");
      accept.disabled = true;
      const fromQuad = quad.map((p) => p.slice());
      const fromCorners = corners.map((p) => p.slice());
      animate(() => {}, (k) => { quad = lerp(fromQuad, PAGE, k); corners = lerp(fromCorners, PAGE, k); }, 750, () => {
        status.textContent = t("scanAdded");
      });
    });
    reset.addEventListener("click", find);

    let drag = null;
    function svgPoint(event) {
      const matrix = svg.getScreenCTM().inverse();
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
      return [Math.max(4, Math.min(396, p.x)), Math.max(4, Math.min(296, p.y))];
    }
    handlesGroup.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest(".scan-handle");
      if (!handle || state !== "review") return;
      drag = { index: Number(handle.dataset.index), id: event.pointerId, handle };
      handle.classList.add("dragging");
      try { svg.setPointerCapture(event.pointerId); } catch (_) { /* Capture is best effort. */ }
      event.preventDefault();
    });
    svg.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      corners[drag.index] = svgPoint(event);
      draw();
    });
    const endDrag = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag.handle.classList.remove("dragging");
      drag = null;
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);
    handlesGroup.addEventListener("keydown", (event) => {
      const handle = event.target.closest(".scan-handle");
      const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!handle || !moves[event.key] || state !== "review") return;
      const index = Number(handle.dataset.index);
      const step = event.shiftKey ? 12 : 4;
      corners[index] = [
        Math.max(4, Math.min(396, corners[index][0] + moves[event.key][0] * step)),
        Math.max(4, Math.min(296, corners[index][1] + moves[event.key][1] * step)),
      ];
      draw();
      event.preventDefault();
    });

    onLocale(() => {
      handles.forEach((handle, i) => handle.setAttribute("aria-label", t(names[i])));
      if (state === "finding") status.textContent = t("scanFinding");
      else if (state === "done") status.textContent = t("scanAdded");
      else draw();
    });
    draw();
    let started = false;
    whenVisible(root, (isVisible) => { if (isVisible && !started) { started = true; find(); } });
  }

  // ── Storage and sync ────────────────────────────────────────────────
  function sync() {
    const root = $("[data-sync]");
    if (!root) return;
    const providerButtons = $$("[data-provider]", root);
    const offlineSwitch = $("[data-offline]", root);
    const link = $("[data-sync-link]", root);
    const packet = $("[data-packet]", root);
    const cloud = $("[data-cloud-node]", root);
    const providerName = $("[data-provider-name]", root);
    const providerNote = $("[data-provider-note]", root);
    const chip = $("[data-sync-status]", root);
    const chipText = $("[data-sync-text]", root);
    const writeButton = $("[data-write-line]", root);
    const mini = $("[data-mini-page]", root);
    const context = mini.getContext("2d");
    const rand = random(99);
    const names = { icloud: "iCloud", drive: "Google Drive", nextcloud: "Nextcloud" };
    let provider = "none";
    let offline = false;
    let pending = false;
    let state = "savedLocally";
    let timer = 0;
    let written = 0;

    function drawMini() {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, mini.width, mini.height);
      context.strokeStyle = "#C9D6E3";
      context.lineWidth = 1;
      context.beginPath();
      for (let y = 28; y < mini.height; y += 22) { context.moveTo(0, y + 0.5); context.lineTo(mini.width, y + 0.5); }
      context.stroke();
    }
    function writeLine() {
      if (written >= 4) { drawMini(); written = 0; }
      context.strokeStyle = "#18304F";
      context.lineWidth = 1.4;
      context.lineCap = "round";
      context.lineJoin = "round";
      scribble(rand, 14, 28 + written * 22 - 4, 150 + rand() * 50, 6).forEach((points) => { trace(context, points); context.stroke(); });
      written += 1;
    }

    function set(next) {
      state = next;
      chip.classList.toggle("pending", next === "syncPending");
      chip.classList.toggle("busy", next === "saving" || next === "syncing");
      chipText.textContent = t(next);
    }
    function render() {
      const connected = provider !== "none";
      cloud.classList.toggle("off", !connected);
      link.classList.toggle("live", connected && !offline);
      providerName.textContent = connected ? names[provider] : t("providerOff");
      providerNote.textContent = t(connected ? `providerNote_${provider}` : "providerOffNote");
      packet.classList.toggle("hold", connected && offline && pending);
      set(state);
    }
    function upload() {
      if (provider === "none" || !pending) { render(); return; }
      if (offline) { set("syncPending"); render(); return; }
      set("syncing");
      replay(packet, "go");
      clearTimeout(timer);
      timer = setTimeout(() => {
        pending = false;
        packet.classList.remove("go");
        replay(cloud, "pulse");
        setTimeout(() => cloud.classList.remove("pulse"), 600);
        set("syncCurrent");
        render();
      }, reduced.matches ? 0 : 900);
    }
    writeButton.addEventListener("click", () => {
      writeLine();
      clearTimeout(timer);
      set("saving");
      timer = setTimeout(() => {
        set("savedLocally");
        if (provider !== "none") {
          pending = true;
          timer = setTimeout(upload, reduced.matches ? 0 : 500);
          if (offline) { set("syncPending"); render(); }
        }
      }, reduced.matches ? 0 : 420);
    });
    providerButtons.forEach((button) => button.addEventListener("click", () => {
      provider = button.dataset.provider;
      providerButtons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      clearTimeout(timer);
      if (provider === "none") { pending = false; set("savedLocally"); render(); return; }
      pending = true;
      render();
      upload();
    }));
    offlineSwitch.addEventListener("change", () => {
      offline = offlineSwitch.checked;
      render();
      if (!offline) upload();
    });
    drawMini();
    writeLine();
    onLocale(render);
  }

  hero();
  book();
  library();
  study();
  scan();
  sync();
})();
