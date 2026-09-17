(() => {
  const root = document.querySelector("[data-program-tabs]");
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll('[role="tabpanel"]'));
  if (!tabs.length || !panels.length) return;

  function activate(tabId, focusTab) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.tab === tabId;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus();
    });

    panels.forEach((panel) => {
      const selected = panel.dataset.panel === tabId;
      panel.classList.toggle("is-active", selected);
      panel.hidden = !selected;
    });

    if (history.replaceState) {
      const url = new URL(location.href);
      url.hash = tabId;
      history.replaceState(null, "", url);
    }
  }

  root.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab || !root.contains(tab)) return;
    activate(tab.dataset.tab, false);
  });

  root.addEventListener("keydown", (event) => {
    const current = event.target.closest('[role="tab"]');
    if (!current || !root.contains(current)) return;

    const index = tabs.indexOf(current);
    if (index < 0) return;

    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    }

    if (next < 0) return;
    event.preventDefault();
    activate(tabs[next].dataset.tab, true);
  });

  const hash = (location.hash || "").replace(/^#/, "");
  const initial =
    tabs.find((tab) => tab.dataset.tab === hash)?.dataset.tab ||
    tabs[0].dataset.tab;
  activate(initial, false);
})();
