(() => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const titleEl = document.getElementById("notice-view-title");
  const metaEl = document.getElementById("notice-view-meta");
  const contentEl = document.getElementById("notice-view-content");
  const errorEl = document.getElementById("notice-view-error");

  if (!window.SiteApi || !window.NoticeUI || !titleEl || !contentEl) return;

  if (!id) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = "잘못된 접근입니다.";
    }
    return;
  }

  SiteApi.getNotice(id)
    .then((post) => {
      titleEl.textContent = post.title;
      if (metaEl) {
        metaEl.innerHTML = post.pinned
          ? `<span class="notice-view__pin">고정</span><span>${NoticeUI.formatDate(post.createdAt)}</span>`
          : `<span>${NoticeUI.formatDate(post.createdAt)}</span>`;
      }
      contentEl.innerHTML = NoticeUI.renderContentHtml(post);
    })
    .catch(() => {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = "게시글을 찾을 수 없습니다.";
      }
    });
})();
