/**
 * Collect absolute, deduped links from page or selection.
 */
(function (global) {
  function collectFromRoot(root) {
    const anchors = Array.from(root.querySelectorAll("a[href]"));
    const seen = new Set();
    const links = [];
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) continue;
      let abs;
      try {
        abs = new URL(href, document.baseURI).href;
      } catch {
        continue;
      }
      if (seen.has(abs)) continue;
      seen.add(abs);
      const text = (a.innerText || a.textContent || "").trim().replace(/\s+/g, " ");
      links.push({ url: abs, text });
    }
    return links;
  }

  function allLinks() {
    return collectFromRoot(document);
  }

  function selectionLinks() {
    const sel = global.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return allLinks();
    const range = sel.getRangeAt(0);
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    const links = collectFromRoot(container);
    return links.length ? links : allLinks();
  }

  function formatLinks(links, style) {
    if (style === "markdown") {
      return links.map((l) => `- [${l.text || l.url}](${l.url})`).join("\n") + (links.length ? "\n" : "");
    }
    return links.map((l) => l.url).join("\n") + (links.length ? "\n" : "");
  }

  global.PageResetLinks = {
    allLinks,
    selectionLinks,
    formatLinks
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
