/**
 * PageReset background — commands, context menus, tab messaging + inject fallback.
 */
const MENU_IDS = {
  copyPlain: "pagereset-copy-plain",
  copyMarkdown: "pagereset-copy-markdown",
  copyLinks: "pagereset-copy-links",
  extractCsv: "pagereset-extract-csv",
  removeOverlays: "pagereset-remove-overlays",
  toggleZap: "pagereset-toggle-zap",
  undoHide: "pagereset-undo-hide"
};

const CONTENT_SCRIPTS = [
  "lib/rules.js",
  "lib/markdown.js",
  "lib/csv.js",
  "lib/links.js",
  "content.js"
];

const COPY_ACTIONS = new Set([
  "copy-plain",
  "copy-markdown",
  "copy-links",
  "extract-csv"
]);

let menusPromise = null;

function ensureMenus() {
  if (!menusPromise) {
    menusPromise = createMenus().catch(() => {
      menusPromise = null;
    });
  }
  return menusPromise;
}

function api() {
  return globalThis.browser || globalThis.chrome;
}

async function injectContentScripts(tabId) {
  const a = api();
  if (!a.scripting?.executeScript) return false;
  try {
    await a.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPTS
    });
    return true;
  } catch {
    return false;
  }
}

async function pingContent(tabId) {
  const a = api();
  try {
    const result = await a.tabs.sendMessage(tabId, {
      type: "pagereset-action",
      action: "get-status"
    });
    return !!(result && result.ok && result.libsReady !== false);
  } catch {
    return false;
  }
}

async function copyTextInTab(tabId, text) {
  const a = api();
  if (!a.scripting?.executeScript || typeof text !== "string" || !text) return false;
  try {
    const results = await a.scripting.executeScript({
      target: { tabId },
      func: (value) => {
        try {
          const ta = document.createElement("textarea");
          ta.value = value;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.documentElement.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand("copy");
          ta.remove();
          return ok;
        } catch {
          return false;
        }
      },
      args: [text]
    });
    return !!results?.[0]?.result;
  } catch {
    return false;
  }
}

function unsupportedPageError(url) {
  if (!url) {
    return "PageReset can’t run on this page. Open a website tab.";
  }
  if (url.startsWith("file:")) {
    return "Safari blocks extensions on file:// pages. Serve the file over http://localhost instead.";
  }
  return "PageReset can’t run on this page. Open a website tab.";
}

async function sendToActiveTab(action, options = {}) {
  const a = api();
  const tabs = await a.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return { ok: false, error: "No active tab" };

  const url = tab.url || "";
  if (!url || !/^https?:/i.test(url)) {
    return { ok: false, error: unsupportedPageError(url) };
  }

  const payload = {
    type: "pagereset-action",
    action
  };

  async function message() {
    return a.tabs.sendMessage(tab.id, payload);
  }

  let result;
  try {
    result = await message();
  } catch {
    const alive = await pingContent(tab.id);
    if (!alive) {
      const injected = await injectContentScripts(tab.id);
      if (!injected) {
        return {
          ok: false,
          error: "PageReset isn’t active on this tab. Reload the page, then try again."
        };
      }
    }
    try {
      result = await message();
    } catch {
      return {
        ok: false,
        error: "Reload the page to activate PageReset, then try again."
      };
    }
  }

  if (options.localCopy && result?.ok && typeof result.text === "string" && result.text) {
    const copied = await copyTextInTab(tab.id, result.text);
    result = { ...result, copied, needsCopy: !copied };
    if (!copied) {
      result = {
        ...result,
        ok: false,
        error: "Couldn’t copy from this shortcut. Use the toolbar popup instead."
      };
    }
  }

  return result || { ok: false, error: "No response from page" };
}

async function createMenus() {
  const a = api();
  if (!a.contextMenus) return;

  try {
    await a.contextMenus.removeAll();
  } catch {
    /* ignore */
  }

  const items = [
    { id: MENU_IDS.copyPlain, title: "Copy without formatting", contexts: ["selection"] },
    { id: MENU_IDS.copyMarkdown, title: "Copy as Markdown", contexts: ["selection", "page"] },
    { id: MENU_IDS.copyLinks, title: "Copy links", contexts: ["page", "selection"] },
    { id: MENU_IDS.extractCsv, title: "Extract tables as CSV", contexts: ["page", "selection"] },
    { id: MENU_IDS.removeOverlays, title: "Remove overlays", contexts: ["page"] },
    { id: MENU_IDS.toggleZap, title: "Zap element…", contexts: ["page"] },
    { id: MENU_IDS.undoHide, title: "Undo last hide", contexts: ["page"] }
  ];

  for (const item of items) {
    try {
      await a.contextMenus.create(item);
    } catch {
      /* Safari may not support all contexts */
    }
  }
}

const COMMAND_MAP = {
  "copy-plain": "copy-plain",
  "copy-markdown": "copy-markdown",
  "remove-overlays": "remove-overlays",
  "copy-links": "copy-links",
  "extract-csv": "extract-csv",
  "toggle-zap": "toggle-zap"
};

const MENU_ACTION_MAP = {
  [MENU_IDS.copyPlain]: "copy-plain",
  [MENU_IDS.copyMarkdown]: "copy-markdown",
  [MENU_IDS.copyLinks]: "copy-links",
  [MENU_IDS.extractCsv]: "extract-csv",
  [MENU_IDS.removeOverlays]: "remove-overlays",
  [MENU_IDS.toggleZap]: "toggle-zap",
  [MENU_IDS.undoHide]: "undo-hide"
};

api().runtime.onInstalled.addListener(() => {
  ensureMenus();
});

if (api().runtime.onStartup) {
  api().runtime.onStartup.addListener(() => {
    ensureMenus();
  });
}

ensureMenus();

if (api().commands?.onCommand) {
  api().commands.onCommand.addListener(async (command) => {
    const action = COMMAND_MAP[command];
    if (!action) return;
    await sendToActiveTab(action, { localCopy: COPY_ACTIONS.has(action) });
  });
}

if (api().contextMenus?.onClicked) {
  api().contextMenus.onClicked.addListener(async (info) => {
    const action = MENU_ACTION_MAP[info.menuItemId];
    if (!action) return;
    await sendToActiveTab(action, { localCopy: COPY_ACTIONS.has(action) });
  });
}

api().runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "pagereset-relay") {
    sendToActiveTab(message.action, { localCopy: false })
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
