/**
 * PageReset background service worker — commands & context menus.
 */
const MENU_IDS = {
  copyPlain: "pagereset-copy-plain",
  copyMarkdown: "pagereset-copy-markdown",
  copyLinks: "pagereset-copy-links",
  extractCsv: "pagereset-extract-csv",
  removeOverlays: "pagereset-remove-overlays",
  toggleZap: "pagereset-toggle-zap"
};

function api() {
  return globalThis.browser || globalThis.chrome;
}

async function sendToActiveTab(action) {
  const tabs = await api().tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return { ok: false, error: "No active tab" };
  try {
    return await api().tabs.sendMessage(tab.id, {
      type: "pagereset-action",
      action
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
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
    { id: MENU_IDS.copyPlain, title: "Copy without formatting", contexts: ["selection", "page"] },
    { id: MENU_IDS.copyMarkdown, title: "Copy as Markdown", contexts: ["selection", "page"] },
    { id: MENU_IDS.copyLinks, title: "Copy all links", contexts: ["page", "selection"] },
    { id: MENU_IDS.extractCsv, title: "Extract tables as CSV", contexts: ["page", "selection"] },
    { id: MENU_IDS.removeOverlays, title: "Remove overlays", contexts: ["page"] },
    { id: MENU_IDS.toggleZap, title: "Zap element…", contexts: ["page"] }
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
  [MENU_IDS.toggleZap]: "toggle-zap"
};

api().runtime.onInstalled.addListener(() => {
  createMenus();
});

if (api().runtime.onStartup) {
  api().runtime.onStartup.addListener(() => {
    createMenus();
  });
}

createMenus();

if (api().commands && api().commands.onCommand) {
  api().commands.onCommand.addListener(async (command) => {
    const action = COMMAND_MAP[command];
    if (!action) return;
    await sendToActiveTab(action);
  });
}

if (api().contextMenus && api().contextMenus.onClicked) {
  api().contextMenus.onClicked.addListener(async (info) => {
    const action = MENU_ACTION_MAP[info.menuItemId];
    if (!action) return;
    await sendToActiveTab(action);
  });
}

api().runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "pagereset-relay") {
    sendToActiveTab(message.action)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
