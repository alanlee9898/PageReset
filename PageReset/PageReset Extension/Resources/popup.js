(function () {
  const api = globalThis.browser || globalThis.chrome;
  let currentHost = "";
  let busy = false;

  const statusEl = document.getElementById("status");
  const hostEl = document.getElementById("host");
  const overrideBadge = document.getElementById("overrideBadge");

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function setBusy(next) {
    busy = next;
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.disabled = next;
    });
  }

  function scope() {
    const checked = document.querySelector('input[name="scope"]:checked');
    return checked?.value || "site";
  }

  async function writeClipboard(text) {
    if (typeof text !== "string" || text === "") return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function sendAction(action) {
    return api.runtime.sendMessage({
      type: "pagereset-relay",
      action
    });
  }

  function applyCheckboxState(rules) {
    for (const key of PageResetRules.RULE_KEYS || [
      "restoreSelection",
      "restoreRightClick",
      "removeOverlaysOnLoad",
      "copyPlainOnCopy"
    ]) {
      const el = document.getElementById(key);
      if (el) el.checked = !!rules[key];
    }
  }

  async function refresh() {
    try {
      const tabs = await api.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      try {
        currentHost = tab?.url ? new URL(tab.url).hostname : "";
      } catch {
        currentHost = "";
      }
      if (hostEl) {
        hostEl.textContent = currentHost || "Unavailable on this page";
        hostEl.title = currentHost || "";
      }

      const merged = currentHost
        ? await PageResetRules.getRulesForHost(currentHost)
        : { ...PageResetRules.DEFAULT_GLOBAL };
      const globalRules = await PageResetRules.getGlobalRules();
      const siteOnly = currentHost ? await PageResetRules.getSiteOverride(currentHost) : {};
      const hasOverride = Object.keys(siteOnly).length > 0;

      if (overrideBadge) {
        overrideBadge.hidden = !hasOverride;
        overrideBadge.textContent = hasOverride ? "Site override" : "";
      }

      applyCheckboxState(scope() === "global" ? globalRules : merged);

      const clearBtn = document.getElementById("clearSite");
      if (clearBtn) clearBtn.disabled = !currentHost || !hasOverride;

      const sites = await PageResetRules.listSiteRules();
      const list = document.getElementById("siteList");
      if (!list) return;
      list.innerHTML = "";
      const hosts = Object.keys(sites).sort();
      if (!hosts.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "No overrides saved";
        list.appendChild(li);
      } else {
        for (const h of hosts) {
          const li = document.createElement("li");
          const span = document.createElement("span");
          span.textContent = h;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = "Clear";
          btn.setAttribute("aria-label", `Clear rules for ${h}`);
          btn.addEventListener("click", async () => {
            if (busy) return;
            try {
              await PageResetRules.clearSiteRules(h);
              if (h === currentHost) await sendAction("reapply");
              await refresh();
              setStatus(`Cleared rules for ${h}`);
            } catch (err) {
              setStatus(err?.message || String(err));
            }
          });
          li.append(span, btn);
          list.appendChild(li);
        }
      }
    } catch (err) {
      setStatus(`Failed to load settings: ${err?.message || err}`);
    }
  }

  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (busy) return;
      const action = btn.getAttribute("data-action");
      setBusy(true);
      setStatus("Working…");
      try {
        const result = await sendAction(action);
        if (!result?.ok) {
          setStatus(result?.error || "Couldn’t run that on this page");
          return;
        }

        if (typeof result.text === "string") {
          const copied = await writeClipboard(result.text);
          if (!copied) {
            setStatus("Couldn’t write to the clipboard");
            return;
          }
        }

        if (action === "remove-overlays") {
          setStatus(
            result.count
              ? `Hidden ${result.count} overlay(s)`
              : "No matching overlays — scroll unlocked if it was locked"
          );
        } else if (action === "copy-links") {
          setStatus(`Copied ${result.count || 0} link(s)`);
        } else if (action === "toggle-zap") {
          setStatus(
            result.active
              ? "Zap mode on — click an element, Esc to cancel"
              : "Zap mode off"
          );
        } else if (action === "undo-hide") {
          setStatus(result.restored ? "Restored last hidden element" : "Nothing to undo");
        } else if (action === "extract-csv") {
          setStatus("CSV copied");
        } else if (action === "copy-markdown") {
          setStatus("Markdown copied");
        } else if (action === "copy-plain") {
          setStatus("Plain text copied");
        } else {
          setStatus("Done");
        }
      } catch (err) {
        setStatus(err?.message || String(err));
      } finally {
        setBusy(false);
      }
    });
  });

  document.querySelectorAll("[data-rule]").forEach((input) => {
    input.addEventListener("change", async () => {
      if (busy) return;
      const key = input.getAttribute("data-rule");
      const value = input.checked;
      setBusy(true);
      try {
        if (scope() === "global") {
          await PageResetRules.setGlobalRules({ [key]: value });
          setStatus("Saved global default");
        } else if (currentHost) {
          const globalRules = await PageResetRules.getGlobalRules();
          if (globalRules[key] === value) {
            await PageResetRules.setSiteRules(currentHost, { [key]: null });
            setStatus(`Using global default for ${currentHost}`);
          } else {
            await PageResetRules.setSiteRules(currentHost, { [key]: value });
            setStatus(`Saved for ${currentHost}`);
          }
        } else {
          setStatus("No hostname for this tab");
          input.checked = !value;
          return;
        }
        await sendAction("reapply");
        await refresh();
      } catch (err) {
        setStatus(err?.message || String(err));
        await refresh();
      } finally {
        setBusy(false);
      }
    });
  });

  function updateScopeHint() {
    const hint = document.getElementById("scopeHint");
    if (!hint) return;
    if (scope() === "global") {
      hint.textContent =
        "Global: defaults for every site. Site overrides still win when set.";
    } else {
      hint.textContent =
        "This site: toggles save an override for the current hostname. Checkboxes show effective rules (global + site).";
    }
  }

  document.querySelectorAll('input[name="scope"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      updateScopeHint();
      refresh();
    });
  });

  document.getElementById("clearSite")?.addEventListener("click", async () => {
    if (!currentHost || busy) return;
    setBusy(true);
    try {
      await PageResetRules.clearSiteRules(currentHost);
      await sendAction("reapply");
      await refresh();
      setStatus(`Cleared overrides for ${currentHost}`);
    } catch (err) {
      setStatus(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  });

  updateScopeHint();
  refresh();
})();
