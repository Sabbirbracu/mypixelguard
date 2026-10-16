/* MyPixelGuard landing page */

// ────────────────────────────────────────────────────────────────
// 1. DOWNLOAD LINKS — put your real installer URLs here.
//    Every button with data-download="mac" or data-download="windows" is updated automatically.
// ────────────────────────────────────────────────────────────────
const DOWNLOADS = {
  mac: "#download",      // e.g. "https://example.com/MyPixelGuard.dmg"
  windows: "#download",  // e.g. "https://example.com/MyPixelGuard-Setup.exe"
};

// A platform marked "soon" shows a "Coming soon" badge and is not clickable.
// When the Windows installer is ready: set its URL above and change "soon" to "ready".
const STATUS = { mac: "ready", windows: "soon" };

document.querySelectorAll("[data-download]").forEach((a) => {
  const platform = a.dataset.download;
  if (STATUS[platform] === "soon") {
    a.classList.add("is-soon");
    a.setAttribute("aria-disabled", "true");
    a.removeAttribute("href");
    return;
  }
  const url = DOWNLOADS[platform];
  if (url) a.setAttribute("href", url);
});

// ────────────────────────────────────────────────────────────────
// 2. Language: English (written in the HTML) / বাংলা (data-bn attributes)
// ────────────────────────────────────────────────────────────────
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const translatable = [...document.querySelectorAll("[data-bn]")];
translatable.forEach((el) => { el.dataset.en = el.innerHTML; });

function setLanguage(code) {
  const bn = code === "bn";
  document.documentElement.lang = bn ? "bn" : "en";
  translatable.forEach((el) => { el.innerHTML = bn ? el.dataset.bn : el.dataset.en; });
  document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === code)));
  document.querySelectorAll("[data-bn-alt]").forEach((el) => { el.alt = bn ? el.dataset.bnAlt : el.dataset.enAlt; });
  document.title = bn ? document.documentElement.dataset.bnTitle : document.documentElement.dataset.enTitle;
  store.set("mpg-lang", code);
}

document.querySelectorAll("[data-bn-alt]").forEach((el) => { el.dataset.enAlt = el.alt; });
document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => setLanguage(b.dataset.lang)));
document.documentElement.dataset.enTitle = document.title;
const saved = store.get("mpg-lang");
const preferred = saved || ((navigator.language || "").toLowerCase().startsWith("bn") ? "bn" : "en");
if (preferred === "bn") setLanguage("bn");

// ────────────────────────────────────────────────────────────────
// 3. Tool explorer tabs
// ────────────────────────────────────────────────────────────────
const tabs = [...document.querySelectorAll(".tab")];
const panels = [...document.querySelectorAll(".panel")];

function selectTab(tab) {
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
  panels.forEach((p) => { p.hidden = p.id !== tab.getAttribute("aria-controls"); });
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (e) => {
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    target.focus();
    selectTab(target);
  });
});

// ────────────────────────────────────────────────────────────────
// 4. Before / after slider
// ────────────────────────────────────────────────────────────────
document.querySelectorAll(".compare").forEach((box) => {
  const range = box.querySelector("input[type=range]");
  const apply = () => box.style.setProperty("--pos", range.value + "%");
  range.addEventListener("input", apply);
  apply();
});

// ────────────────────────────────────────────────────────────────
// 5. Gentle reveal on scroll
// ────────────────────────────────────────────────────────────────
const items = document.querySelectorAll(".rv");
if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach((el) => io.observe(el));
} else {
  items.forEach((el) => el.classList.add("in"));
}


// ────────────────────────────────────────────────────────────────
// 6. Language gate: asks English or বাংলা right after the page loads.
//    Shown until the visitor picks once. To see it again: add ?choose-language to the address.
// ────────────────────────────────────────────────────────────────
(function languageGate() {
  const gate = document.getElementById("lang-gate");
  if (!gate) return;
  const params = new URLSearchParams(location.search);

  // A direct link such as ?lang=bn skips the question.
  const forced = params.get("lang");
  if (forced === "en" || forced === "bn") {
    setLanguage(forced);
    store.set("mpg-lang-chosen", "1");
    return;
  }
  if (store.get("mpg-lang-chosen") && !params.has("choose-language")) return;

  const options = [...gate.querySelectorAll(".lang-opt")];
  const guess = (navigator.language || "").toLowerCase().startsWith("bn") ? "bn" : "en";
  options.find((o) => o.dataset.pick === guess)?.classList.add("suggested");

  let opener = null;
  function open() {
    opener = document.activeElement;
    gate.hidden = false;
    document.body.classList.add("lang-open");
    void gate.offsetWidth;                       // make the browser register opacity 0 before fading in
    setTimeout(() => gate.classList.add("show"), 20);
    (options.find((o) => o.dataset.pick === guess) || options[0]).focus({ preventScroll: true });
  }
  function close(chosen) {
    if (chosen) store.set("mpg-lang-chosen", "1");
    gate.classList.remove("show");
    gate.classList.add("leaving");
    document.body.classList.remove("lang-open");
    setTimeout(() => { gate.hidden = true; gate.classList.remove("leaving"); }, 380);
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  options.forEach((o) => o.addEventListener("click", () => { setLanguage(o.dataset.pick); close(true); }));
  gate.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(false); return; }         // keeps the automatic choice, asks again next visit
    if (e.key === "Tab") {                                    // keep focus inside the dialog
      const first = options[0], last = options[options.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // "after the page loads": wait for load, then a short beat so the hero is visible behind the dialog.
  const show = () => setTimeout(open, 500);
  if (document.readyState === "complete") show(); else window.addEventListener("load", show, { once: true });
})();
