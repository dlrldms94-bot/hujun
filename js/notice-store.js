(() => {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    if (!value) return "";
    const text = String(value).slice(0, 10);
    const parts = text.split("-");
    if (parts.length !== 3) return String(value);
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  function todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function extractYoutubeId(url) {
    if (!url) return null;
    const value = String(url).trim();
    let match = value.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    match = value.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    match = value.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    match = value.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    return null;
  }

  function linkifyText(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(
      /(https?:\/\/[^\s<]+[^\s<.,;:!?"')\]}>]*)|(www\.[^\s<]+[^\s<.,;:!?"')\]}>]*)/gi,
      (match) => {
        let href = match;
        if (/^www\./i.test(href)) href = `https://${href}`;
        return `<a href="${escapeAttr(href)}" class="notice-view__link" target="_blank" rel="noopener noreferrer">${match}</a>`;
      }
    );
  }

  function fileUrl(item) {
    return item && item.url ? item.url : "";
  }

  function renderContentHtml(post) {
    const paragraphs = String(post.content || "")
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block
          .split("\n")
          .map((line) => linkifyText(line))
          .join("<br />");
        return `<p>${lines || "&nbsp;"}</p>`;
      })
      .join("");

    let html = `<div class="notice-view__body">${paragraphs}</div>`;

    if (Array.isArray(post.images) && post.images.length) {
      html += `<div class="notice-view__images">${post.images
        .map((img) => {
          const src = fileUrl(img);
          if (!src) return "";
          return `<figure class="notice-view__figure"><img src="${escapeAttr(src)}" alt="${escapeAttr(img.name || "")}" /></figure>`;
        })
        .join("")}</div>`;
    }

    const youtubeId = extractYoutubeId(post.youtubeUrl);
    if (youtubeId) {
      html += `<div class="notice-view__video"><div class="notice-view__video-wrap"><iframe src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div></div>`;
    }

    if (Array.isArray(post.documents) && post.documents.length) {
      html += `<ul class="notice-view__files">${post.documents
        .map((doc) => {
          const href = fileUrl(doc);
          if (!href) return "";
          return `<li><a href="${escapeAttr(href)}" download="${escapeAttr(doc.name || "file")}" target="_blank" rel="noopener noreferrer">${escapeHtml(doc.name || "첨부파일")}</a></li>`;
        })
        .join("")}</ul>`;
    }

    return html;
  }

  window.NoticeUI = {
    escapeHtml,
    escapeAttr,
    formatDate,
    todayString,
    renderContentHtml,
  };
})();
