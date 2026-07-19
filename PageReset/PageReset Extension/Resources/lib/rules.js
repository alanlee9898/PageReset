/**
 * Per-site and global rule helpers for PageReset.
 * Stored in browser.storage.local.
 */
(function (global) {
  const RULE_KEYS = [
    "restoreSelection",
    "restoreRightClick",
    "removeOverlaysOnLoad",
    "copyPlainOnCopy"
  ];

  const DEFAULT_GLOBAL = Object.freeze({
    restoreSelection: false,
    restoreRightClick: false,
    removeOverlaysOnLoad: false,
    copyPlainOnCopy: false
  });

  function api() {
    return global.browser || global.chrome;
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeRuleBag(partial) {
    const out = {};
    if (!isPlainObject(partial)) return out;
    for (const key of RULE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(partial, key)) {
        const v = partial[key];
        if (v === null || v === undefined) {
          out[key] = null; // signal delete for site overrides
        } else {
          out[key] = !!v;
        }
      }
    }
    return out;
  }

  function normalizeStoredRules(partial) {
    const out = { ...DEFAULT_GLOBAL };
    if (!isPlainObject(partial)) return out;
    for (const key of RULE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(partial, key)) {
        out[key] = !!partial[key];
      }
    }
    return out;
  }

  function isValidHostname(hostname) {
    return typeof hostname === "string" && hostname.length > 0 && hostname !== "unknown";
  }

  async function getStorage() {
    const raw = await api().storage.local.get({
      globalRules: { ...DEFAULT_GLOBAL },
      siteRules: {}
    });

    let globalRules = normalizeStoredRules(raw.globalRules);
    let siteRules = {};

    if (isPlainObject(raw.siteRules)) {
      for (const [host, rules] of Object.entries(raw.siteRules)) {
        if (!isValidHostname(host) || !isPlainObject(rules)) continue;
        const cleaned = {};
        for (const key of RULE_KEYS) {
          if (Object.prototype.hasOwnProperty.call(rules, key) && rules[key] !== null && rules[key] !== undefined) {
            cleaned[key] = !!rules[key];
          }
        }
        if (Object.keys(cleaned).length) siteRules[host] = cleaned;
      }
    }

    return { globalRules, siteRules };
  }

  async function getGlobalRules() {
    const { globalRules } = await getStorage();
    return { ...globalRules };
  }

  async function getSiteOverride(hostname) {
    if (!isValidHostname(hostname)) return {};
    const { siteRules } = await getStorage();
    return { ...(siteRules[hostname] || {}) };
  }

  async function getRulesForHost(hostname) {
    const { globalRules, siteRules } = await getStorage();
    const site = isValidHostname(hostname) ? siteRules[hostname] || {} : {};
    return {
      ...globalRules,
      ...site,
      _hostname: hostname || "",
      _hasSiteOverride: Object.keys(site).length > 0
    };
  }

  async function setGlobalRules(partial) {
    const { globalRules } = await getStorage();
    const patch = normalizeRuleBag(partial);
    const next = { ...globalRules };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next[key] = DEFAULT_GLOBAL[key];
      else next[key] = value;
    }
    await api().storage.local.set({ globalRules: next });
  }

  async function setSiteRules(hostname, partial) {
    if (!isValidHostname(hostname)) {
      throw new Error("No valid hostname for this tab");
    }
    const { siteRules } = await getStorage();
    const current = { ...(siteRules[hostname] || {}) };
    const patch = normalizeRuleBag(partial);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete current[key];
      else current[key] = value;
    }
    if (Object.keys(current).length === 0) {
      delete siteRules[hostname];
    } else {
      siteRules[hostname] = current;
    }
    await api().storage.local.set({ siteRules });
  }

  async function clearSiteRules(hostname) {
    if (!isValidHostname(hostname)) return;
    const { siteRules } = await getStorage();
    delete siteRules[hostname];
    await api().storage.local.set({ siteRules });
  }

  async function listSiteRules() {
    const { siteRules } = await getStorage();
    return { ...siteRules };
  }

  global.PageResetRules = {
    DEFAULT_GLOBAL: { ...DEFAULT_GLOBAL },
    RULE_KEYS,
    getRulesForHost,
    getGlobalRules,
    getSiteOverride,
    setGlobalRules,
    setSiteRules,
    clearSiteRules,
    listSiteRules,
    getStorage,
    isValidHostname
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
