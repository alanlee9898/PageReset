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
      .map((table, i) => {
        const csv = gridToCsv(tableToGrid(table));
        if (tables.length === 1) return csv;
        return `### Table ${i + 1}\n${csv}`;
      })
      .join("\n");
  }

  function selectionTablesToCsv() {
    const sel = global.getSelection?.();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      return tablesToCsv(document);
    }
    const range = sel.getRangeAt(0);
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    const csv = tablesToCsv(container);
    return csv || tablesToCsv(document);
  }

  global.PageResetCSV = {
    tableToGrid,
    gridToCsv,
    tablesToCsv,
    selectionTablesToCsv
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
