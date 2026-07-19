/**
 * PageReset content script — restore usability on hostile pages.
 * Does NOT bypass authentication, paid content, DRM, or paywalls.
 *
 * Clipboard writes for toolbar actions happen in the popup (user gesture).
 * Menu/command copies finish in the background via executeScript.
 */
(function () {
  if (globalThis.__pageResetContentLoaded) return;
  globalThis.__pageResetContentLoaded = true;

  const STYLE_ID = "pagereset-selection-style";
  const OVERLAY_ATTR = "data-pagereset-hidden-overlay";
  const ZAP_CLASS = "pagereset-zap-mode";
  const ZAP_HOVER = "pagereset-zap-hover";
  const INLINE_SCAN_CAP = 4000;

  let rules = null;
  let zapActive = false;
  let zapHoverEl = null;
  let observer = null;
  let observerTimer = null;
  let selectionHooksInstalled = false;
  let rightClickHookInstalled = false;
  let copyHooksInstalled = false;
  let propertiesNeutralized = false;
  let storageApplyTimer = null;

  function hostname() {
    try {
      return location.hostname || "";
    } catch {
      return "";
    }
  }

  async function loadRules() {
    if (!globalThis.PageResetRules) {
      rules = {};
      return rules;
    }
    rules = await PageResetRules.getRulesForHost(hostname());
    return rules;
  }

  function libsReady() {
    return !!(
      globalThis.PageResetRules &&
      globalThis.PageResetMarkdown &&
      globalThis.PageResetCSV &&
      globalThis.PageResetLinks
    );
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
        outline: 2px solid #007aff !important;
        outline-offset: 2px !important;
      }
    `;
    (document.documentElement || document.head || document.body).appendChild(style);
  }

  function clearInlineUserSelect(root) {
    if (!root?.querySelectorAll) return;
    const nodes = root.querySelectorAll("*");
    const limit = Math.min(nodes.length, INLINE_SCAN_CAP);
    for (let i = 0; i < limit; i++) {
      const el = nodes[i];
      if (!el.style) continue;
      if (el.style.userSelect === "none" || el.style.webkitUserSelect === "none") {
        el.style.userSelect = "text";
        el.style.webkitUserSelect = "text";
      }
    }
  }

  function neutralizeSelectProps() {
    if (propertiesNeutralized) return;
    propertiesNeutralized = true;
    const neutralize = (obj, prop) => {
      try {
        Object.defineProperty(obj, prop, {
          configurable: true,
          get() {
            return null;
          },
          set() {}
        });
      } catch {
        /* ignore */
      }
    };
    neutralize(document, "onselectstart");
    neutralize(document, "oncontextmenu");
    neutralize(document, "oncopy");
    if (document.body) {
      neutralize(document.body, "onselectstart");
      neutralize(document.body, "oncontextmenu");
      neutralize(document.body, "oncopy");
    }
  }

  function installSelectionHooks() {
    if (selectionHooksInstalled) return;
    selectionHooksInstalled = true;
    document.addEventListener(
      "selectstart",
      (e) => {
        if (!rules?.restoreSelection) return;
        e.stopPropagation();
      },
      true
    );
  }

  function installRightClickHook() {
    if (rightClickHookInstalled) return;
    rightClickHookInstalled = true;
    document.addEventListener(
      "contextmenu",
      (e) => {
        if (!rules?.restoreRightClick) return;
        e.stopPropagation();
      },
      true
    );
  }

  function installCopyHooks() {
    if (copyHooksInstalled) return;
    copyHooksInstalled = true;
    document.addEventListener(
      "copy",
      (e) => {
        if (!rules?.restoreSelection && !rules?.copyPlainOnCopy) return;
        const text = window.getSelection()?.toString() || "";
        if (!text) return;
        try {
          e.stopPropagation();
          if (rules.copyPlainOnCopy) {
            e.preventDefault();
            e.clipboardData?.setData("text/plain", text);
          } else if (rules.restoreSelection) {
            e.clipboardData?.setData("text/plain", text);
          }
        } catch {
          /* ignore */
        }
      },
      true
    );
  }

  function applySelectionVisual() {
    if (!rules?.restoreSelection) {
      document.documentElement?.classList.remove("pagereset-select");
      return;
    }
    ensureSelectionStyle();
    document.documentElement.classList.add("pagereset-select");
    if (document.body) clearInlineUserSelect(document.body);
    neutralizeSelectProps();
  }

  function applyRightClickVisual() {
    if (rules?.restoreRightClick) neutralizeSelectProps();
  }

  function looksLikeConsentOverlay(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.id === STYLE_ID) return false;
    if (el === document.body || el === document.documentElement) return false;
    if (el.getAttribute(OVERLAY_ATTR) === "1") return false;

    const style = getComputedStyle(el);
    const position = style.position;
    if (position !== "fixed" && position !== "sticky") return false;

    const z = parseInt(style.zIndex, 10);
    if (!Number.isFinite(z) || z < 100) return false;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.width < vw * 0.35 && rect.height < vh * 0.25) return false;

    // Sticky nav / toolbars
    if (rect.height < 88 && rect.top < 12 && rect.width > vw * 0.8) return false;

    const text = (el.innerText || el.textContent || "").toLowerCase().slice(0, 800);
    const classAttr =
      (typeof el.className === "string" && el.className) ||
      el.getAttribute?.("class") ||
      (el.classList ? [...el.classList].join(" ") : "");
    const classId = `${classAttr} ${el.id || ""}`.toLowerCase();

    // Real paywall / auth gates — do not hide these.
    // Ignore negated phrasing like "not a paywall" (used in tests / disclaimers).
    const probe = text.replace(/\bnot a paywall\b/g, " ").replace(/\bno paywall\b/g, " ");
    const blocked =
      /\bpaywall\b|subscribe to (read|continue reading)|sign[\s-]?in to (continue|read|view)|log[\s-]?in to (continue|read|view)|create (an )?account to (continue|read)|payment required|members?[- ]only|\bmetered\b|remaining free (article|articles|stor(y|ies))|unlock (this|full) (article|story)/;
    if (blocked.test(probe) || blocked.test(classId)) return false;

    const keywords =
      /cookie|consent|gdpr|ccpa|newsletter|sign up for|subscribe to our|join our (newsletter|mailing)|promo|announcement|backdrop|onetrust|cookiebot|consent-banner|cookie-banner|email[- ]signup|mailing list/;
    const keywordHit = keywords.test(text) || keywords.test(classId);
    if (!keywordHit) return false;

    return rect.width >= vw * 0.4 || rect.height >= vh * 0.3;
  }

  function hideElement(el) {
    if (!el || el.getAttribute(OVERLAY_ATTR) === "1") return;
    el.setAttribute(OVERLAY_ATTR, "1");
    el.dataset.pageresetPrevDisplay = el.style.getPropertyValue("display") || "";
    el.dataset.pageresetPrevVisibility = el.style.getPropertyValue("visibility") || "";
    el.dataset.pageresetPrevPointer = el.style.getPropertyValue("pointer-events") || "";
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }

  function unhideElement(el) {
    if (!el || el.getAttribute(OVERLAY_ATTR) !== "1") return false;
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
    el.style.removeProperty("pointer-events");
    const prevDisplay = el.dataset.pageresetPrevDisplay || "";
    const prevVisibility = el.dataset.pageresetPrevVisibility || "";
    const prevPointer = el.dataset.pageresetPrevPointer || "";
    if (prevDisplay) el.style.display = prevDisplay;
    if (prevVisibility) el.style.visibility = prevVisibility;
    if (prevPointer) el.style.pointerEvents = prevPointer;
    delete el.dataset.pageresetPrevDisplay;
    delete el.dataset.pageresetPrevVisibility;
    delete el.dataset.pageresetPrevPointer;
    el.removeAttribute(OVERLAY_ATTR);
    return true;
  }

  function unlockScroll() {
    const html = document.documentElement;
    const body = document.body;
    [html, body].forEach((el) => {
      if (!el) return;
      if (el.style.overflow === "hidden" || getComputedStyle(el).overflow === "hidden") {
        el.style.overflow = "auto";
      }
      if (el.style.position === "fixed") el.style.position = "";
      el.classList.remove("modal-open", "no-scroll", "overflow-hidden");
    });
  }

  function removeOverlays({ forceUnlock = false } = {}) {
    const matched = new Set();
    const candidates = document.body
      ? document.body.querySelectorAll("div,aside,section,dialog,form")
      : [];
    for (const el of candidates) {
      if (looksLikeConsentOverlay(el)) matched.add(el);
    }
    document.querySelectorAll('[aria-modal="true"], [role="dialog"]').forEach((el) => {
      if (looksLikeConsentOverlay(el)) matched.add(el);
    });
    for (const el of matched) hideElement(el);
    if (matched.size > 0 || forceUnlock) unlockScroll();
    return matched.size;
  }

  function restoreLastHidden() {
    const hidden = document.querySelectorAll(`[${OVERLAY_ATTR}="1"]`);
    const last = hidden[hidden.length - 1];
    return last ? unhideElement(last) : false;
  }

  function clearZapHover() {
    if (zapHoverEl) {
      zapHoverEl.classList.remove(ZAP_HOVER);
      zapHoverEl = null;
    }
  }

  function onZapOver(e) {
    if (!zapActive) return;
    const el = e.target;
    if (!(el instanceof Element) || el === zapHoverEl) return;
    clearZapHover();
    zapHoverEl = el;
    el.classList.add(ZAP_HOVER);
  }

  function onZapOut(e) {
    if (!zapActive) return;
    const el = e.target;
    const related = e.relatedTarget;
    if (
      el instanceof Element &&
      el === zapHoverEl &&
      !(related instanceof Node && el.contains(related))
    ) {
      clearZapHover();
    }
  }

  function onZapClick(e) {
    if (!zapActive) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = e.target;
    if (el instanceof Element && el !== document.body && el !== document.documentElement) {
      hideElement(el);
    }
    toggleZapMode(false);
  }

  function onZapKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      toggleZapMode(false);
    }
  }

  function toggleZapMode(force) {
    const next = typeof force === "boolean" ? force : !zapActive;
    if (next === zapActive) return zapActive;
    zapActive = next;
    document.documentElement.classList.toggle(ZAP_CLASS, zapActive);
    if (zapActive) {
      ensureSelectionStyle();
      document.addEventListener("mouseover", onZapOver, true);
      document.addEventListener("mouseout", onZapOut, true);
      document.addEventListener("click", onZapClick, true);
      document.addEventListener("keydown", onZapKey, true);
    } else {
      document.removeEventListener("mouseover", onZapOver, true);
      document.removeEventListener("mouseout", onZapOut, true);
      document.removeEventListener("click", onZapClick, true);
      document.removeEventListener("keydown", onZapKey, true);
      clearZapHover();
      document.querySelectorAll(`.${ZAP_HOVER}`).forEach((el) => el.classList.remove(ZAP_HOVER));
    }
    return zapActive;
  }

  function stopOverlayObserver() {
    if (observerTimer) {
      clearTimeout(observerTimer);
      observerTimer = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function startOverlayObserver() {
    if (!document.body) return;
    stopOverlayObserver();
    let scheduled = false;
    observer = new MutationObserver(() => {
      if (!rules?.removeOverlaysOnLoad) return;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        removeOverlays({ forceUnlock: false });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    observerTimer = setTimeout(() => {
      stopOverlayObserver();
    }, 8000);
  }

  function applyRules() {
    if (!rules) return;
    installSelectionHooks();
    installRightClickHook();
    installCopyHooks();
    applySelectionVisual();
    applyRightClickVisual();
    if (rules.removeOverlaysOnLoad) {
      removeOverlays({ forceUnlock: false });
      startOverlayObserver();
    } else {
      stopOverlayObserver();
    }
  }

  async function handleAction(action) {
    if (!libsReady() && action !== "get-status") {
      return {
        ok: false,
        error: "PageReset isn’t fully loaded on this tab. Reload the page, then try again."
      };
    }

    await loadRules();

    switch (action) {
      case "copy-plain": {
        const text = window.getSelection()?.toString() || "";
        if (!text) return { ok: false, error: "Nothing selected — select text first." };
        return { ok: true, text, length: text.length, needsCopy: true };
      }
      case "copy-markdown": {
        const md =
          PageResetMarkdown.selectionToMarkdown() || PageResetMarkdown.pageToMarkdown();
        if (!md?.trim()) return { ok: false, error: "Nothing to copy" };
        return { ok: true, text: md, length: md.length, needsCopy: true };
      }
      case "remove-overlays": {
        const count = removeOverlays({ forceUnlock: true });
        return { ok: true, count };
      }
      case "copy-links": {
        const links = PageResetLinks.selectionLinks();
        const text = PageResetLinks.formatLinks(links, "plain");
        if (!text) return { ok: false, error: "No links found" };
        return { ok: true, text, count: links.length, needsCopy: true };
      }
      case "extract-csv": {
        const csv = PageResetCSV.selectionTablesToCsv();
        if (!csv) return { ok: false, error: "No tables found" };
        return { ok: true, text: csv, length: csv.length, needsCopy: true };
      }
      case "toggle-zap": {
        return { ok: true, active: toggleZapMode() };
      }
      case "undo-hide": {
        return { ok: true, restored: restoreLastHidden() };
      }
      case "get-status": {
        return {
          ok: true,
          hostname: hostname(),
          rules,
          zapActive,
          libsReady: libsReady(),
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

  const api = globalThis.browser || globalThis.chrome;
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "pagereset-action") return false;
    handleAction(message.action)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  });

  (async function boot() {
    try {
      await loadRules();
    } catch (err) {
      console.error("PageReset: failed to load rules", err);
      rules = {};
    }

    installSelectionHooks();
    installRightClickHook();
    installCopyHooks();

    const start = () => {
      try {
        applyRules();
      } catch (err) {
        console.error("PageReset: failed to apply rules", err);
      }
    };

    if (document.documentElement && rules?.restoreSelection) {
      ensureSelectionStyle();
      document.documentElement.classList.add("pagereset-select");
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }

    api.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes.globalRules && !changes.siteRules) return;
      if (storageApplyTimer) clearTimeout(storageApplyTimer);
      storageApplyTimer = setTimeout(async () => {
        storageApplyTimer = null;
        try {
          await loadRules();
          applyRules();
        } catch (err) {
          console.error("PageReset: failed to apply rule changes", err);
        }
      }, 50);
    });
  })();
})();
