/**
 * Collect absolute, deduped links from page or selection.
 */
(function (global) {
  function collectFromAnchors(anchors) {
    const seen = new Set();
    const links = [];
    for (const a of anchors) {
      const href = (a.getAttribute("href") || "").trim();
      if (!href || href.startsWith("#")) continue;
      const lower = href.toLowerCase();
      if (lower.startsWith("javascript:") || lower.startsWith("data:")) continue;
      let abs;
      try {
        abs = new URL(href, document.baseURI || location.href).href;
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

  function collectFromRoot(root) {
    if (!root?.querySelectorAll) return [];
    return collectFromAnchors(root.querySelectorAll("a[href]"));
  }

  function allLinks() {
    return collectFromRoot(document);
  }

  function nodeIsElement(node) {
    return node && node.nodeType === 1;
  }

  /** Anchors intersecting the current selection (no whole-page fallback). */
  function anchorsInSelection(sel) {
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const found = [];
    const seen = new Set();

    const add = (a) => {
      if (!a || seen.has(a)) return;
      seen.add(a);
      found.push(a);
    };

    // Text caret inside a link (cloneContents often omits the <a>)
    let start = range.startContainer;
    if (start.nodeType === 3) start = start.parentElement;
    if (nodeIsElement(start) && start.closest) {
      add(start.closest("a[href]"));
    }

    let root = range.commonAncestorContainer;
    if (root.nodeType === 3) root = root.parentElement;
    if (nodeIsElement(root)) {
      if (root.matches?.("a[href]")) add(root);
      if (root.querySelectorAll) {
        for (const a of root.querySelectorAll("a[href]")) {
          try {
            if (typeof sel.containsNode === "function") {
              if (sel.containsNode(a, true)) add(a);
            } else if (range.intersectsNode(a)) {
              add(a);
            }
          } catch {
            /* detached / foreign node */
          }
        }
      }
    }

    return found;
  }

  function selectionLinks() {
    const sel = global.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return allLinks();
    return collectFromAnchors(anchorsInSelection(sel) || []);
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
