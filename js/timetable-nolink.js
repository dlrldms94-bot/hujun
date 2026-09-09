(() => {
  const roots = [
    ...document.querySelectorAll(".timetable-wrap, .page-body__meta, .timetable"),
  ];
  if (!roots.length) return;

  function unwrapAnchors(root) {
    root.querySelectorAll("a").forEach((anchor) => {
      const parent = anchor.parentNode;
      if (!parent) return;
      while (anchor.firstChild) {
        parent.insertBefore(anchor.firstChild, anchor);
      }
      parent.removeChild(anchor);
    });
  }

  function scrubAll() {
    roots.forEach(unwrapAnchors);
  }

  scrubAll();

  const observer = new MutationObserver(() => {
    scrubAll();
  });

  roots.forEach((root) => {
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const inTable = target.closest(".timetable-wrap, .timetable, .page-body__meta");
      if (!inTable) return;
      const link = target.closest("a");
      if (link && inTable.contains(link)) {
        event.preventDefault();
        event.stopPropagation();
        unwrapAnchors(inTable);
      }
    },
    true
  );

  document.addEventListener(
    "touchend",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const inTable = target.closest(".timetable-wrap, .timetable, .page-body__meta");
      if (!inTable) return;
      const link = target.closest("a");
      if (link && inTable.contains(link)) {
        event.preventDefault();
        event.stopPropagation();
        unwrapAnchors(inTable);
      }
    },
    { capture: true, passive: false }
  );

  // iOS sometimes injects detectors after a short delay
  [100, 500, 1000, 2000].forEach((ms) => {
    window.setTimeout(scrubAll, ms);
  });
})();
