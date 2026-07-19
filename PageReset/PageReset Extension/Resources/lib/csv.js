/**
 * HTML table → CSV helpers for PageReset.
 */
(function (global) {
  function cellText(cell) {
    return String(cell.innerText || cell.textContent || "")
      .replace(/\r?\n+/g, " ")
      .trim();
  }

  function escapeCsv(value) {
    const s = String(value ?? "");
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  /**
   * Expand a table into a 2D grid respecting colspan/rowspan (basic).
   */
  function tableToGrid(table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    const grid = [];
    const occupancy = {};

    rows.forEach((tr, rowIndex) => {
      if (!grid[rowIndex]) grid[rowIndex] = [];
      let colIndex = 0;
      const cells = Array.from(tr.children).filter((c) =>
        /^(TD|TH)$/i.test(c.tagName)
      );

      for (const cell of cells) {
        while (occupancy[`${rowIndex},${colIndex}`]) colIndex++;
        const colspan = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
        const rowspan = Math.max(1, parseInt(cell.getAttribute("rowspan") || "1", 10) || 1);
        const text = cellText(cell);

        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            const rr = rowIndex + r;
            const cc = colIndex + c;
            if (!grid[rr]) grid[rr] = [];
            if (r === 0 && c === 0) {
              grid[rr][cc] = text;
            } else {
              grid[rr][cc] = grid[rr][cc] ?? "";
              occupancy[`${rr},${cc}`] = true;
            }
            if (!(r === 0 && c === 0)) occupancy[`${rr},${cc}`] = true;
          }
        }
        colIndex += colspan;
      }
    });

    // Normalize column widths
    const width = Math.max(0, ...grid.map((r) => r.length));
    return grid.map((row) => {
      const next = [];
      for (let i = 0; i < width; i++) next[i] = row[i] ?? "";
      return next;
    });
  }

  function gridToCsv(grid) {
    return grid.map((row) => row.map(escapeCsv).join(",")).join("\n") + (grid.length ? "\n" : "");
  }

  function tablesToCsv(root) {
    const scope = root || document;
    const tables = Array.from(scope.querySelectorAll("table"));
    if (!tables.length) return "";
    return tables
      .map((table) => gridToCsv(tableToGrid(table)).replace(/\n$/, ""))
      .filter(Boolean)
      .join("\n\n") + (tables.length ? "\n" : "");
  }

  function tablesToCsvFromList(tables) {
    if (!tables.length) return "";
    return tables
      .map((table) => gridToCsv(tableToGrid(table)).replace(/\n$/, ""))
      .filter(Boolean)
      .join("\n\n") + (tables.length ? "\n" : "");
  }

  /** Tables intersecting the selection (no whole-page fallback). */
  function tablesInSelection(sel) {
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const found = [];
    const seen = new Set();

    const add = (table) => {
      if (!table || seen.has(table)) return;
      seen.add(table);
      found.push(table);
    };

    let start = range.startContainer;
    if (start.nodeType === 3) start = start.parentElement;
    if (start && start.nodeType === 1 && start.closest) {
      add(start.closest("table"));
    }

    for (const table of document.querySelectorAll("table")) {
      try {
        if (typeof sel.containsNode === "function") {
          if (sel.containsNode(table, true)) add(table);
        } else if (range.intersectsNode(table)) {
          add(table);
        }
      } catch {
        /* ignore */
      }
    }

    return found;
  }

  function selectionTablesToCsv() {
    const sel = global.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      return tablesToCsv(document);
    }
    return tablesToCsvFromList(tablesInSelection(sel) || []);
  }

  global.PageResetCSV = {
    tableToGrid,
    gridToCsv,
    tablesToCsv,
    selectionTablesToCsv
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
