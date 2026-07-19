/**
 * PageReset content script — restore usability on hostile pages.
 * Does NOT bypass authentication, paid content, DRM, or paywalls.
 */
(function () {
  const STYLE_ID = "pagereset-selection-style";
  const OVERLAY_ATTR = "data-pagereset-hidden-overlay";
  const ZAP_CLASS = "pagereset-zap-mode";
  const ZAP_HOVER = "pagereset-zap-hover";

  let rules = null;
  let zapActive = false;
  let observer = null;

  function hostname() {
    try {
      return location.hostname || "unknown";
    } catch {
      return "unknown";
    }
  }

  async function loadRules() {
    if (!globalThis.PageResetRules) return PageResetRules?.DEFAULT_GLOBAL || {};
    rules = await PageResetRules.getRulesForHost(hostname());
    return rules;
  }

  function ensureSelectionStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html.pagereset-select, html.pagereset-select * {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      .${ZAP_CLASS}, .${ZAP_CLASS} * { cursor: crosshair !important; }
      .${ZAP_HOVER} {
        outline: 2px solid #e85d04 !important;
        outline-offset: 2px !important;
      }
    `;
    (document.documentElement || document.head || document.body).appendChild(style);
  }

  function restoreSelection() {
    ensureSelectionStyle();
    document.documentElement.classList.add("pagereset-select");

    // Clear inline user-select:none on elements we encounter
    const clearInline = (root) => {
      const els = root.querySelectorAll
        ? root.querySelectorAll("*")
        : [];
      for (const el of els) {
        if (el.style && (el.style.userSelect === "none" || el.style.webkitUserSelect === "none")) {
          el.style.userSelect = "text";
          el.style.webkitUserSelect = "text";
        }
      }
    };
    if (document.body) clearInline(document.body);

    // Capturing listeners so site handlers are less likely to cancel selection.
    ["selectstart", "mousedown", "dragstart"].forEach((type) => {
      document.addEventListener(
        type,
        (e) => {
          if (!rules?.restoreSelection) return;
          e.stopPropagation();
        },
        true
      );
    });

    // Soften document-level property assignments sites use to block selection
    try {
      const neutralize = (obj, prop) => {
        try {
          Object.defineProperty(obj, prop, {
            configurable: true,
            get() {
              return null;
            },
            set() {
              /* ignore site assignments */
            }
          });
        } catch {
          /* ignore */
        }
      };
      if (rules?.restoreSelection) {
        neutralize(document, "onselectstart");
        neutralize(document.body || document.documentElement, "onselectstart");
      }
    } catch {
      /* ignore */
    }
  }

  function restoreRightClick() {
    const handler = (e) => {
      if (!rules?.restoreRightClick) return;
      e.stopPropagation();
      // Do not preventDefault — we want the menu
    };
    document.addEventListener("contextmenu", handler, true);

    try {
      Object.defineProperty(document, "oncontextmenu", {
        configurable: true,
        get() {
          return null;
        },
        set() {}
      });
    } catch {
      /* ignore */
    }
  }

  function unlockScroll() {
    const html = document.documentElement;
    const body = document.body;
    [html, body].forEach((el) => {
      if (!el) return;
      el.style.overflow = "auto";
      el.style.position = "";
      el.style.height = "";
      el.classList.remove("modal-open", "no-scroll", "overflow-hidden");
    });
  }

  function looksLikeOverlay(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === STYLE_ID) return false;
    if (el === document.body || el === document.documentElement) return false;

    const style = getComputedStyle(el);
    const position = style.position;
    if (position !== "fixed" && position !== "sticky") return false;

    const z = parseInt(style.zIndex, 10);
    if (!Number.isFinite(z) || z < 100) return false;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.width < vw * 0.4 && rect.height < vh * 0.3) return false;

    // Skip obvious UI chrome that isn't an overlay (nav bars that are sticky but short)
    if (rect.height < 80 && rect.top < 10 && rect.width > vw * 0.8) return false;

    const text = (el.innerText || "").toLowerCase();
    const classId = `${el.className || ""} ${el.id || ""}`.toLowerCase();
    const keywords =
      /cookie|consent|gdpr|newsletter|subscribe|modal|overlay|popup|interstitial|paywall|promo|banner|backdrop|dialog/;
    const keywordHit = keywords.test(text.slice(0, 500)) || keywords.test(classId);

    // Large high-z fixed layer OR keyword match
    const large = rect.width >= vw * 0.5 && rect.height >= vh * 0.4;
    return keywordHit || large;
  }

  function hideOverlay(el) {
    if (!el || el.getAttribute(OVERLAY_ATTR) === "1") return;
    el.setAttribute(OVERLAY_ATTR, "1");
    el.dataset.pageresetPrevDisplay = el.style.display || "";
    el.dataset.pageresetPrevVisibility = el.style.visibility || "";
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }

  function removeOverlays() {
    unlockScroll();
    let count = 0;
    const candidates = document.body
      ? document.body.querySelectorAll("div,aside,section,dialog,form")
      : [];
    for (const el of candidates) {
      if (looksLikeOverlay(el)) {
        hideOverlay(el);
        count++;
      }
    }
    // Also unlock aria-modal dialogs that trap focus visually
    document.querySelectorAll('[aria-modal="true"], [role="dialog"]').forEach((el) => {
      const style = getComputedStyle(el);
      if (style.position === "fixed" || style.position === "absolute") {
        hideOverlay(el);
        count++;
      }
    });
    return count;
  }

  function copyPlainText(text) {
    const value = text ?? (window.getSelection()?.toString() || "");
    if (!value) return false;
    // Prefer async clipboard if available
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => fallbackCopy(value));
      return true;
    }
    return fallbackCopy(value);
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  function installPlainCopyHook() {
    document.addEventListener(
      "copy",
      (e) => {
        if (!rules?.copyPlainOnCopy) return;
        const text = window.getSelection()?.toString() || "";
        if (!text) return;
        e.clipboardData?.setData("text/plain", text);
        // Strip rich formats by preventing default after setting plain
        e.preventDefault();
      },
      true
    );
  }

  function toggleZapMode(force) {
    zapActive = typeof force === "boolean" ? force : !zapActive;
    document.documentElement.classList.toggle(ZAP_CLASS, zapActive);
    if (zapActive) {
      document.addEventListener("mouseover", onZapOver, true);
      document.addEventListener("mouseout", onZapOut, true);
      document.addEventListener("click", onZapClick, true);
      document.addEventListener("keydown", onZapKey, true);
    } else {
      document.removeEventListener("mouseover", onZapOver, true);
      document.removeEventListener("mouseout", onZapOut, true);
      document.removeEventListener("click", onZapClick, true);
      document.removeEventListener("keydown", onZapKey, true);
      document.querySelectorAll(`.${ZAP_HOVER}`).forEach((el) => el.classList.remove(ZAP_HOVER));
    }
    return zapActive;
  }

  function onZapOver(e) {
    if (!zapActive) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    el.classList.add(ZAP_HOVER);
  }

  function onZapOut(e) {
    if (!zapActive) return;
    const el = e.target;
    if (!(el instanceof Element)) return;
    el.classList.remove(ZAP_HOVER);
  }

  function onZapClick(e) {
    if (!zapActive) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (el instanceof Element && el !== document.body && el !== document.documentElement) {
      hideOverlay(el);
    }
    toggleZapMode(false);
  }

  function onZapKey(e) {
    if (e.key === "Escape") toggleZapMode(false);
  }

  function applyRules() {
    if (!rules) return;
    if (rules.restoreSelection) restoreSelection();
    if (rules.restoreRightClick) restoreRightClick();
    if (rules.removeOverlaysOnLoad) {
      removeOverlays();
      // Watch for late-injected overlays briefly
      if (!observer && document.body) {
        observer = new MutationObserver(() => {
          if (rules?.removeOverlaysOnLoad) removeOverlays();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => {
          observer?.disconnect();
          observer = null;
        }, 8000);
      }
    }
  }

  async function handleAction(action) {
    await loadRules();
    switch (action) {
      case "copy-plain": {
        const text = window.getSelection()?.toString() || document.body?.innerText || "";
        return { ok: copyPlainText(text), length: text.length };
      }
      case "copy-markdown": {
        const md =
          PageResetMarkdown.selectionToMarkdown() || PageResetMarkdown.pageToMarkdown();
        return { ok: copyPlainText(md), length: md.length, preview: md.slice(0, 200) };
      }
      case "remove-overlays": {
        const count = removeOverlays();
        return { ok: true, count };
      }
      case "copy-links": {
        const links = PageResetLinks.selectionLinks();
        const text = PageResetLinks.formatLinks(links, "plain");
        return { ok: copyPlainText(text), count: links.length };
      }
      case "copy-links-markdown": {
        const links = PageResetLinks.selectionLinks();
        const text = PageResetLinks.formatLinks(links, "markdown");
        return { ok: copyPlainText(text), count: links.length };
      }
      case "extract-csv": {
        const csv = PageResetCSV.selectionTablesToCsv();
        if (!csv) return { ok: false, error: "No tables found" };
        return { ok: copyPlainText(csv), length: csv.length };
      }
      case "toggle-zap": {
        const active = toggleZapMode();
        return { ok: true, active };
      }
      case "get-status": {
        return {
          ok: true,
          hostname: hostname(),
          rules,
          zapActive,
          url: location.href
        };
      }
      case "reapply": {
        applyRules();
        return { ok: true };
      }
      default:
        return { ok: false, error: "Unknown action" };
    }
  }

  // Message bridge
  const api = globalThis.browser || globalThis.chrome;
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "pagereset-action") return false;
    handleAction(message.action)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  });

  // Boot
  (async function boot() {
    await loadRules();
    installPlainCopyHook();

    const start = () => {
      applyRules();
    };

    if (document.documentElement) {
      // Early for selection CSS
      if (rules?.restoreSelection) {
        ensureSelectionStyle();
        document.documentElement.classList.add("pagereset-select");
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }

    // Reload rules when storage changes
    api.storage.onChanged.addListener(async (changes, area) => {
      if (area !== "local") return;
      if (changes.globalRules || changes.siteRules) {
        await loadRules();
        applyRules();
      }
    });
  })();
})();
