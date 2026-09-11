(() => {
  const DISMISS_PREFIX = "hujun_popup_dismiss_";

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

  function closeModal(root) {
    root.hidden = true;
    document.body.classList.remove("popup-open");
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

  function renderModal(popup) {
    let root = document.getElementById("site-popup");
    if (!root) {
      root = document.createElement("div");
      root.id = "site-popup";
      root.className = "site-popup";
      root.innerHTML =
        '<div class="site-popup__backdrop" data-close></div>' +
        '<div class="site-popup__dialog" role="dialog" aria-modal="true" aria-label="팝업">' +
        '<button type="button" class="site-popup__close" aria-label="닫기" data-close>&times;</button>' +
        '<div class="site-popup__image-wrap" hidden>' +
        '<img class="site-popup__image" alt="">' +
        "</div>" +
        '<div class="site-popup__footer">' +
        '<label class="site-popup__dismiss">' +
        '<input type="checkbox" id="site-popup-dismiss-check">' +
        "<span>오늘 하루 보지 않기</span>" +
        "</label>" +
        '<button type="button" class="site-popup__confirm" data-close>닫기</button>' +
        "</div>" +
        "</div>";
      document.body.appendChild(root);

      root.addEventListener("click", (event) => {
        if (event.target.closest("[data-close]")) {
          const dismissCheck = root.querySelector("#site-popup-dismiss-check");
          if (dismissCheck && dismissCheck.checked && root.dataset.popupId) {
            dismissForToday(root.dataset.popupId);
          }
          closeModal(root);
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !root.hidden) closeModal(root);
      });
    }

    root.dataset.popupId = String(popup.id);
    const dialogEl = root.querySelector(".site-popup__dialog");
    const imageWrap = root.querySelector(".site-popup__image-wrap");
    const imageEl = root.querySelector(".site-popup__image");
    const linkUrl = String(popup.linkUrl || "").trim();

    if (popup.imageUrl) {
      imageEl.src = popup.imageUrl;
      imageEl.alt = "팝업";
      imageWrap.hidden = false;
      if (dialogEl) dialogEl.classList.add("site-popup__dialog--has-image");
      applyImageLink(imageWrap, imageEl, linkUrl);
      imageWrap.classList.toggle("site-popup__image-wrap--linked", !!linkUrl);
    } else {
      imageEl.removeAttribute("src");
      imageWrap.hidden = true;
      if (dialogEl) dialogEl.classList.remove("site-popup__dialog--has-image");
      applyImageLink(imageWrap, imageEl, "");
      imageWrap.classList.remove("site-popup__image-wrap--linked");
    }

    const dismissCheck = root.querySelector("#site-popup-dismiss-check");
    if (dismissCheck) dismissCheck.checked = false;

    root.hidden = false;
    document.body.classList.add("popup-open");
  }

  async function initHomePopup() {
    if (document.body.dataset.page !== "home") return;
    if (!window.SiteApi || !window.SiteApi.fetchActivePopup) return;

    try {
      const popup = await window.SiteApi.fetchActivePopup();
      if (!popup || isDismissed(popup.id)) return;
      renderModal(popup);
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
