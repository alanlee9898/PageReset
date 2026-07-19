(function () {
  const api = globalThis.browser || globalThis.chrome;
  let currentHost = "";

  const statusEl = document.getElementById("status");
  const hostEl = document.getElementById("host");

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  function scope() {
    const checked = document.querySelector('input[name="scope"]:checked');
    return checked?.value || "site";
  }

  async function activeTab() {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async function sendAction(action) {
    const result = await api.runtime.sendMessage({
      type: "pagereset-relay",
      action
    });
    return result;
  }

  async function refresh() {
    const tab = await activeTab();
    try {
      currentHost = tab?.url ? new URL(tab.url).hostname : "";
    } catch {
      currentHost = "";
    }
    hostEl.textContent = currentHost || "This page isn’t available to PageReset";

    const rules = currentHost
      ? await PageResetRules.getRulesForHost(currentHost)
      : { ...PageResetRules.DEFAULT_GLOBAL };

    document.getElementById("restoreSelection").checked = !!rules.restoreSelection;
    document.getElementById("restoreRightClick").checked = !!rules.restoreRightClick;
    document.getElementById("removeOverlaysOnLoad").checked = !!rules.removeOverlaysOnLoad;
    document.getElementById("copyPlainOnCopy").checked = !!rules.copyPlainOnCopy;

    const sites = await PageResetRules.listSiteRules();
    const list = document.getElementById("siteList");
    list.innerHTML = "";
    const hosts = Object.keys(sites).sort();
    if (!hosts.length) {
      list.innerHTML = "<li><span>No site overrides yet</span></li>";
    } else {
      for (const h of hosts) {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = h;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Clear";
        btn.addEventListener("click", async () => {
          await PageResetRules.clearSiteRules(h);
          await refresh();
          setStatus(`Cleared rules for ${h}`);
        });
        li.append(span, btn);
        list.appendChild(li);
      }
    }
  }

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-action");
      setStatus("Working…");
      const result = await sendAction(action);
      if (!result?.ok) {
        setStatus(result?.error || "Couldn’t run that on this page");
        return;
      }
      if (action === "remove-overlays") {
        setStatus(`Hidden ${result.count || 0} overlay(s)`);
      } else if (action === "copy-links") {
        setStatus(`Copied ${result.count || 0} link(s)`);
      } else if (action === "toggle-zap") {
        setStatus(result.active ? "Zap mode on — click an element, Esc to cancel" : "Zap mode off");
      } else if (action === "extract-csv") {
        setStatus("CSV copied to clipboard");
      } else if (action === "copy-markdown") {
        setStatus("Markdown copied");
      } else if (action === "copy-plain") {
        setStatus("Plain text copied");
      } else {
        setStatus("Done");
      }
    });
  });

  document.querySelectorAll("[data-rule]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.getAttribute("data-rule");
      const value = input.checked;
      const payload = { [key]: value };
      if (scope() === "global") {
        await PageResetRules.setGlobalRules(payload);
        setStatus("Saved global default");
      } else if (currentHost) {
        await PageResetRules.setSiteRules(currentHost, payload);
        setStatus(`Saved for ${currentHost}`);
      } else {
        setStatus("No hostname for this tab");
        return;
      }
      await sendAction("reapply");
      await refresh();
    });
  });

  document.getElementById("clearSite").addEventListener("click", async () => {
    if (!currentHost) return;
    await PageResetRules.clearSiteRules(currentHost);
    await sendAction("reapply");
    await refresh();
    setStatus(`Cleared overrides for ${currentHost}`);
  });

  refresh().catch((e) => setStatus(String(e)));
})();
