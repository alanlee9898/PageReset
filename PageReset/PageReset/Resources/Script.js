function show(enabled, useSettingsInsteadOfPreferences) {
    const on = document.querySelector(".state-on");
    const off = document.querySelector(".state-off");
    const unknown = document.querySelector(".state-unknown");
    const button = document.querySelector(".open-preferences");

    if (!on || !off || !unknown || !button) return;

    if (useSettingsInsteadOfPreferences) {
        on.textContent = "Extension is on. Use the Safari toolbar button on any page.";
        off.textContent = "Extension is off. Enable PageReset in Safari Settings → Extensions.";
        unknown.textContent = "Turn on the extension in Safari Settings to use PageReset on websites.";
        button.textContent = "Open Safari Settings…";
    } else {
        button.textContent = "Open Safari Extensions Preferences…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle("state-on", enabled);
        document.body.classList.toggle("state-off", !enabled);
    } else {
        document.body.classList.remove("state-on", "state-off");
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

const preferencesButton = document.querySelector(".open-preferences");
if (preferencesButton) {
    preferencesButton.addEventListener("click", openPreferences);
}
