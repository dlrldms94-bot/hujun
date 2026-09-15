(() => {
  const DISMISS_PREFIX = "hujun_popup_dismiss_";
  const MAX_VISIBLE = 2;

  function todayKey() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + m + day;
  }

  function isDismissed(popupId) {
    return (
      localStorage.getItem(DISMISS_PREFIX + popupId + "_" + todayKey()) === "1"
    );
  }

  function dismissForToday(popupId) {
    localStorage.setItem(DISMISS_PREFIX + popupId + "_" + todayKey(), "1");
  }

  function applyImageLink(imageWrap, imageEl, linkUrl) {
    let linkEl = imageWrap.querySelector(".site-popup__image-link");

    if (linkUrl) {
      if (!linkEl) {
        linkEl = document.createElement("a");
        linkEl.className = "site-popup__image-link";
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
        linkEl.appendChild(imageEl);
        imageWrap.appendChild(linkEl);
      }
      linkEl.href = linkUrl;
      linkEl.setAttribute("aria-label", "팝업 링크로 이동");
    } else if (linkEl) {
      imageWrap.insertBefore(imageEl, linkEl);
      linkEl.remove();
    }
  }

  function syncLayerState(root) {
    const openDialogs = root.querySelectorAll(
      ".site-popup__dialog:not([hidden])"
    );
    if (!openDialogs.length) {
      root.hidden = true;
      document.body.classList.remove("popup-open");
      root.classList.remove("site-popup--multi", "site-popup--single");
      return;
    }
    root.hidden = false;
    document.body.classList.add("popup-open");
    root.classList.toggle("site-popup--multi", openDialogs.length > 1);
    root.classList.toggle("site-popup--single", openDialogs.length === 1);
  }

  function closeDialog(root, dialog) {
    if (!dialog) return;
    const dismissCheck = dialog.querySelector(".site-popup__dismiss-check");
    if (dismissCheck && dismissCheck.checked && dialog.dataset.popupId) {
      dismissForToday(dialog.dataset.popupId);
    }
    dialog.hidden = true;
    syncLayerState(root);
  }

  function closeAllDialogs(root) {
    root.querySelectorAll(".site-popup__dialog:not([hidden])").forEach((dialog) => {
      const dismissCheck = dialog.querySelector(".site-popup__dismiss-check");
      if (dismissCheck && dismissCheck.checked && dialog.dataset.popupId) {
        dismissForToday(dialog.dataset.popupId);
      }
      dialog.hidden = true;
    });
    syncLayerState(root);
  }

  function buildDialog(popup) {
    const dialog = document.createElement("div");
    dialog.className = "site-popup__dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "팝업");
    dialog.dataset.popupId = String(popup.id);
    dialog.innerHTML =
      '<button type="button" class="site-popup__close" aria-label="닫기" data-close>&times;</button>' +
      '<div class="site-popup__image-wrap" hidden>' +
      '<img class="site-popup__image" alt="">' +
      "</div>" +
      '<div class="site-popup__footer">' +
      '<label class="site-popup__dismiss">' +
      '<input type="checkbox" class="site-popup__dismiss-check">' +
      "<span>오늘 하루 보지 않기</span>" +
      "</label>" +
      '<button type="button" class="site-popup__confirm" data-close>닫기</button>' +
      "</div>";

    const imageWrap = dialog.querySelector(".site-popup__image-wrap");
    const imageEl = dialog.querySelector(".site-popup__image");
    const linkUrl = String(popup.linkUrl || "").trim();

    if (popup.imageUrl) {
      imageEl.src = popup.imageUrl;
      imageEl.alt = "팝업";
      imageWrap.hidden = false;
      dialog.classList.add("site-popup__dialog--has-image");
      applyImageLink(imageWrap, imageEl, linkUrl);
      imageWrap.classList.toggle("site-popup__image-wrap--linked", !!linkUrl);
    }

    return dialog;
  }

  function ensureLayer() {
    let root = document.getElementById("site-popup");
    if (root) return root;

    root = document.createElement("div");
    root.id = "site-popup";
    root.className = "site-popup";
    root.hidden = true;
    root.innerHTML =
      '<div class="site-popup__backdrop" data-close-all></div>' +
      '<div class="site-popup__stage"></div>';
    document.body.appendChild(root);

    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-all]")) {
        closeAllDialogs(root);
        return;
      }
      const closeBtn = event.target.closest("[data-close]");
      if (closeBtn) {
        closeDialog(root, closeBtn.closest(".site-popup__dialog"));
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !root.hidden) {
        closeAllDialogs(root);
      }
    });

    return root;
  }

  function renderPopups(popups) {
    const root = ensureLayer();
    const stage = root.querySelector(".site-popup__stage");
    stage.innerHTML = "";

    popups.forEach((popup) => {
      stage.appendChild(buildDialog(popup));
    });

    syncLayerState(root);
  }

  async function initHomePopup() {
    if (document.body.dataset.page !== "home") return;
    if (!window.SiteApi) return;

    const fetchPopups =
      window.SiteApi.fetchActivePopups ||
      (async () => {
        const popup = await window.SiteApi.fetchActivePopup();
        return popup ? [popup] : [];
      });

    try {
      const list = await fetchPopups();
      const visible = (list || [])
        .filter((popup) => popup && !isDismissed(popup.id))
        .slice(0, MAX_VISIBLE);
      if (!visible.length) return;
      renderPopups(visible);
    } catch (error) {
      console.warn("[popup]", error.message || error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomePopup);
  } else {
    initHomePopup();
  }
})();
