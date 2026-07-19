/**
 * Lightweight DOM → Markdown converter for PageReset.
 * Handles headings, links, lists, code, blockquotes, emphasis, images, paragraphs.
 */
(function (global) {
  function escapeMd(text) {
    return String(text || "")
      .replace(/\\/g, "\\\\")
      .replace(/([*_`\[\]])/g, "\\$1");
  }

  function isBlock(el) {
    if (!el || el.nodeType !== 1) return false;
    const display = (global.getComputedStyle ? getComputedStyle(el).display : "") || "";
    return /^(block|list-item|table|flex|grid)$/i.test(display) ||
      /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV)$/i.test(el.tagName);
  }

  function textOf(node) {
    if (!node) return "";
    if (node.nodeType === 3) return node.nodeValue || "";
    if (node.nodeType !== 1) return "";
    const tag = node.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return "";
    let out = "";
    for (const child of node.childNodes) {
      out += walkInline(child);
    }
    return out;
  }

  function walkInline(node) {
    if (node.nodeType === 3) return node.nodeValue || "";
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "BR") {
      return tag === "BR" ? "  \n" : "";
    }
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      const label = textOf(node).trim() || href;
      try {
        const abs = new URL(href, document.baseURI || location.href).href;
        return `[${escapeMd(label)}](${abs})`;
      } catch {
        return escapeMd(label);
      }
    }
    if (tag === "STRONG" || tag === "B") {
      return `**${textOf(node).trim()}**`;
    }
    if (tag === "EM" || tag === "I") {
      return `*${textOf(node).trim()}*`;
    }
    if (tag === "CODE" && node.parentElement?.tagName !== "PRE") {
      const code = textOf(node);
      // Prefer a longer fence when the code contains backticks
      const ticks = "`".repeat(Math.max(1, (code.match(/`+/g) || []).reduce((n, s) => Math.max(n, s.length), 0) + 1));
      return ticks + code + ticks;
    }
    if (tag === "IMG") {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src") || "";
      try {
        const abs = new URL(src, document.baseURI || location.href).href;
        return `![${escapeMd(alt)}](${abs})`;
      } catch {
        return alt ? escapeMd(alt) : "";
      }
    }
    return textOf(node);
  }

  function walkBlock(node, depth) {
    if (node.nodeType === 3) {
      const t = (node.nodeValue || "").replace(/\s+/g, " ");
      return t.trim() ? t : "";
    }
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "SVG") return "";

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      return "\n" + "#".repeat(level) + " " + textOf(node).trim() + "\n\n";
    }
    if (tag === "P") {
      return "\n" + textOf(node).trim() + "\n\n";
    }
    if (tag === "BR") return "  \n";
    if (tag === "HR") return "\n---\n\n";
    if (tag === "BLOCKQUOTE") {
      const inner = Array.from(node.childNodes).map((c) => walkBlock(c, depth)).join("").trim();
      return "\n" + inner.split("\n").map((l) => "> " + l).join("\n") + "\n\n";
    }
    if (tag === "PRE") {
      const code = node.querySelector("code");
      const lang = (code?.className || "").match(/language-([\w-]+)/)?.[1] || "";
      const body = (code || node).textContent || "";
      return "\n```" + lang + "\n" + body.replace(/\n$/, "") + "\n```\n\n";
    }
    if (tag === "UL" || tag === "OL") {
      const items = Array.from(node.children).filter((c) => c.tagName === "LI");
      let out = "\n";
      items.forEach((li, i) => {
        const bullet = tag === "OL" ? `${i + 1}. ` : "- ";
        const indent = "  ".repeat(depth);
        const content = Array.from(li.childNodes)
          .map((c) => {
            if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) {
              return walkBlock(c, depth + 1);
            }
            return walkInline(c);
          })
          .join("")
          .trim()
          .replace(/\n+/g, "\n" + indent + "  ");
        out += indent + bullet + content + "\n";
      });
      return out + "\n";
    }
    if (tag === "TABLE") {
      // Simple markdown table from first rows
      const rows = Array.from(node.querySelectorAll("tr"));
      if (!rows.length) return "";
      const cells = (tr) =>
        Array.from(tr.querySelectorAll("th,td")).map((c) => textOf(c).trim().replace(/\|/g, "\\|"));
      const header = cells(rows[0]);
      if (!header.length) return "";
      let md = "\n| " + header.join(" | ") + " |\n";
      md += "| " + header.map(() => "---").join(" | ") + " |\n";
      for (let i = 1; i < rows.length; i++) {
        const row = cells(rows[i]);
        while (row.length < header.length) row.push("");
        md += "| " + row.slice(0, header.length).join(" | ") + " |\n";
      }
      return md + "\n";
    }
    if (tag === "A" || tag === "STRONG" || tag === "B" || tag === "EM" || tag === "I" || tag === "CODE" || tag === "IMG" || tag === "SPAN") {
      return walkInline(node);
    }

    // Generic container
    let out = "";
    for (const child of node.childNodes) {
      out += walkBlock(child, depth);
    }
    if (isBlock(node) && out && !out.endsWith("\n\n")) out += "\n";
    return out;
  }

  function selectionToMarkdown() {
    const sel = global.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    return normalize(walkBlock(container, 0));
  }

  function pageToMarkdown() {
    const root =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.body;
    const title = document.title ? `# ${document.title}\n\n` : "";
    const url = document.URL ? `Source: ${document.URL}\n\n` : "";
    return normalize(title + url + walkBlock(root, 0));
  }

  function normalize(md) {
    return String(md || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n";
  }

  global.PageResetMarkdown = {
    selectionToMarkdown,
    pageToMarkdown,
    nodeToMarkdown: (node) => normalize(walkBlock(node, 0))
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
