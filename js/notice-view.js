(() => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const titleEl = document.getElementById("notice-view-title");
  const metaEl = document.getElementById("notice-view-meta");
  const contentEl = document.getElementById("notice-view-content");
  const errorEl = document.getElementById("notice-view-error");
  const isEn = document.documentElement.lang === "en";

  if (!window.SiteApi || !window.NoticeUI || !titleEl || !contentEl) return;

  if (!id) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = isEn
        ? "Invalid access."
        : "잘못된 접근입니다.";
    }
    return;
  }

  SiteApi.getNotice(id)
    .then((post) => {
      const title =
        isEn && post.titleEn ? post.titleEn : post.title || "";
      titleEl.textContent = title;
      if (metaEl) {
        const pin = isEn ? "Pinned" : "고정";
        metaEl.innerHTML = post.pinned
          ? `<span class="notice-view__pin">${pin}</span><span>${NoticeUI.formatDate(post.createdAt)}</span>`
          : `<span>${NoticeUI.formatDate(post.createdAt)}</span>`;
      }
      contentEl.innerHTML = NoticeUI.renderContentHtml(post, {
        lang: isEn ? "en" : "ko",
      });
    })
    .catch(() => {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = isEn
          ? "Notice not found."
          : "게시글을 찾을 수 없습니다.";
      }
    });
})();
