(() => {
  const listEl = document.getElementById("notice-list");
  const emptyEl = document.getElementById("notice-empty");
  if (!listEl || !window.SiteApi || !window.NoticeUI) return;

  SiteApi.getNotices()
    .then((posts) => {
      if (!posts.length) {
        if (emptyEl) emptyEl.hidden = false;
        return;
      }

      let regularCount = 0;

      listEl.innerHTML = posts
        .map((post) => {
          const isPinned = Boolean(post.pinned);
          const numberCell = isPinned
            ? '<span class="notice-table__pin">공지</span>'
            : String(++regularCount);
          const rowClass = isPinned
            ? ' class="notice-table__row notice-table__row--pinned"'
            : ' class="notice-table__row"';

          return `<tr${rowClass}>
            <td class="notice-table__num">${numberCell}</td>
            <td class="notice-table__title">
              <a href="notice-view.html?id=${encodeURIComponent(post.id)}">${NoticeUI.escapeHtml(post.title)}</a>
            </td>
            <td class="notice-table__date">${NoticeUI.formatDate(post.createdAt)}</td>
          </tr>`;
        })
        .join("");
    })
    .catch(() => {
      listEl.innerHTML =
        '<tr><td colspan="3" class="notice-table__error">공지사항을 불러오지 못했습니다. 서버 연결을 확인해 주세요.</td></tr>';
    });
})();
