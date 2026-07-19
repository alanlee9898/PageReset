/**
 * Per-site and global rule helpers for PageReset.
 * Stored in browser.storage.local.
 */
(function (global) {
  const DEFAULT_GLOBAL = {
    restoreSelection: true,
    restoreRightClick: true,
    removeOverlaysOnLoad: false,
    copyPlainOnCopy: false
  };

  async function getStorage() {
    const api = global.browser || global.chrome;
    return api.storage.local.get({
      globalRules: DEFAULT_GLOBAL,
      siteRules: {}
    });
  }

  async function getRulesForHost(hostname) {
    const { globalRules, siteRules } = await getStorage();
    const site = siteRules[hostname] || {};
    return {
      ...DEFAULT_GLOBAL,
      ...globalRules,
      ...site,
      _hostname: hostname,
      _hasSiteOverride: Object.keys(site).length > 0
    };
  }

  async function setGlobalRules(partial) {
    const api = global.browser || global.chrome;
    const { globalRules } = await getStorage();
    await api.storage.local.set({
      globalRules: { ...DEFAULT_GLOBAL, ...globalRules, ...partial }
    });
  }

  async function setSiteRules(hostname, partial) {
    const api = global.browser || global.chrome;
    const { siteRules } = await getStorage();
    const current = siteRules[hostname] || {};
    const next = { ...current, ...partial };
    // Remove undefined / null keys
    Object.keys(next).forEach((k) => {
      if (next[k] === null || next[k] === undefined) delete next[k];
    });
    if (Object.keys(next).length === 0) {
      delete siteRules[hostname];
    } else {
      siteRules[hostname] = next;
    }
    await api.storage.local.set({ siteRules });
  }

  async function clearSiteRules(hostname) {
    const api = global.browser || global.chrome;
    const { siteRules } = await getStorage();
    delete siteRules[hostname];
    await api.storage.local.set({ siteRules });
  }

  async function listSiteRules() {
    const { siteRules } = await getStorage();
    return siteRules;
  }

  global.PageResetRules = {
    DEFAULT_GLOBAL,
    getRulesForHost,
    setGlobalRules,
    setSiteRules,
    clearSiteRules,
    listSiteRules,
    getStorage
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
