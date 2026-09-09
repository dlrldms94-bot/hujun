(() => {
  const loginSection = document.getElementById("admin-login");
  const dashboard = document.getElementById("admin-dashboard");
  const loginForm = document.getElementById("admin-login-form");
  const loginError = document.getElementById("admin-login-error");
  const logoutBtn = document.getElementById("admin-logout");
  const form = document.getElementById("admin-notice-form");
  const listEl = document.getElementById("admin-notice-list");
  const resetBtn = document.getElementById("admin-notice-reset");
  const submitBtn = document.getElementById("admin-notice-submit");
  const imageInput = document.getElementById("admin-notice-images");
  const docInput = document.getElementById("admin-notice-docs");
  const imagePreview = document.getElementById("admin-image-preview");
  const docPreview = document.getElementById("admin-doc-preview");

  if (!window.SiteApi || !window.NoticeUI || !loginSection || !dashboard || !form) {
    return;
  }

  let editingId = null;
  let images = [];
  let documents = [];

  function showLogin(message) {
    loginSection.hidden = false;
    dashboard.hidden = true;
    sessionStorage.removeItem("adminToken");
    if (loginError) {
      loginError.hidden = !message;
      loginError.textContent = message || "";
    }
  }

  function showDashboard() {
    loginSection.hidden = true;
    dashboard.hidden = false;
    if (loginError) loginError.hidden = true;
    resetForm();
    renderList();
  }

  function handleAdminError(error) {
    if (error && error.status === 401) {
      showLogin(error.message || "세션이 만료되었습니다. 다시 로그인해 주세요.");
      return true;
    }
    return false;
  }

  function resetForm() {
    editingId = null;
    images = [];
    documents = [];
    form.reset();
    document.getElementById("admin-notice-id").value = "";
    document.getElementById("admin-notice-date").value = NoticeUI.todayString();
    document.getElementById("admin-notice-pinned").checked = false;
    if (submitBtn) submitBtn.textContent = "공지 등록";
    if (imageInput) imageInput.value = "";
    if (docInput) docInput.value = "";
    renderPreviews();
  }

  function renderPreviews() {
    if (imagePreview) {
      imagePreview.innerHTML = images.length
        ? images
            .map(
              (img, index) =>
                `<div class="admin-attach"><img src="${NoticeUI.escapeAttr(img.url)}" alt=""><button type="button" data-remove-image="${index}" aria-label="이미지 제거">×</button><span>${NoticeUI.escapeHtml(img.name)}</span></div>`
            )
            .join("")
        : '<p class="admin-field__hint">선택된 이미지 없음</p>';
    }

    if (docPreview) {
      docPreview.innerHTML = documents.length
        ? documents
            .map(
              (doc, index) =>
                `<div class="admin-attach admin-attach--file"><button type="button" data-remove-doc="${index}" aria-label="문서 제거">×</button><span>${NoticeUI.escapeHtml(doc.name)}</span></div>`
            )
            .join("")
        : '<p class="admin-field__hint">선택된 문서 없음</p>';
    }
  }

  function renderList() {
    if (!listEl) return;

    SiteApi.adminListNotices()
      .then((posts) => {
        if (!posts.length) {
          listEl.innerHTML = '<p class="admin-empty">등록된 공지가 없습니다.</p>';
          return;
        }

        listEl.innerHTML = posts
          .map((post) => {
            const pin = post.pinned
              ? '<span class="admin-item__badge">고정</span>'
              : "";
            return `<article class="admin-item" data-id="${NoticeUI.escapeAttr(post.id)}">
              <div class="admin-item__main">
                <h3 class="admin-item__title">${pin}${NoticeUI.escapeHtml(post.title)}</h3>
                <p class="admin-item__meta">${NoticeUI.formatDate(post.createdAt)}</p>
              </div>
              <div class="admin-item__actions">
                <button type="button" class="admin-btn admin-btn--ghost" data-edit="${NoticeUI.escapeAttr(post.id)}">수정</button>
                <button type="button" class="admin-btn admin-btn--danger" data-delete="${NoticeUI.escapeAttr(post.id)}">삭제</button>
              </div>
            </article>`;
          })
          .join("");
      })
      .catch((error) => {
        if (handleAdminError(error)) return;
        listEl.innerHTML =
          '<p class="admin-empty">목록을 불러오지 못했습니다.</p>';
      });
  }

  async function appendFiles(fileList, kind) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      try {
        const uploaded = await SiteApi.adminUpload(file, kind);
        if (kind === "image") images.push(uploaded);
        else documents.push(uploaded);
      } catch (error) {
        if (handleAdminError(error)) return;
        alert(error.message || "파일 첨부 중 오류가 발생했습니다.");
      }
    }
    renderPreviews();
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    SiteApi.adminLogin(document.getElementById("admin-password").value)
      .then((data) => {
        sessionStorage.setItem("adminToken", data.token);
        showDashboard();
      })
      .catch((error) => {
        showLogin(error.message || "로그인에 실패했습니다.");
      });
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      SiteApi.adminLogout().catch(() => {}).finally(() => showLogin(""));
    });
  }

  if (resetBtn) resetBtn.addEventListener("click", resetForm);

  if (imageInput) {
    imageInput.addEventListener("change", () => {
      appendFiles(imageInput.files, "image").finally(() => {
        imageInput.value = "";
      });
    });
  }

  if (docInput) {
    docInput.addEventListener("change", () => {
      appendFiles(docInput.files, "doc").finally(() => {
        docInput.value = "";
      });
    });
  }

  if (imagePreview) {
    imagePreview.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-image]");
      if (!btn) return;
      images.splice(Number(btn.getAttribute("data-remove-image")), 1);
      renderPreviews();
    });
  }

  if (docPreview) {
    docPreview.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-remove-doc]");
      if (!btn) return;
      documents.splice(Number(btn.getAttribute("data-remove-doc")), 1);
      renderPreviews();
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      title: document.getElementById("admin-notice-title").value,
      content: document.getElementById("admin-notice-content").value,
      createdAt: document.getElementById("admin-notice-date").value,
      pinned: document.getElementById("admin-notice-pinned").checked,
      youtubeUrl: document.getElementById("admin-notice-youtube").value,
      images,
      documents,
    };

    const request = editingId
      ? SiteApi.adminUpdateNotice(editingId, payload)
      : SiteApi.adminCreateNotice(payload);

    request
      .then(() => {
        resetForm();
        renderList();
      })
      .catch((error) => {
        if (handleAdminError(error)) return;
        alert(error.message || "저장에 실패했습니다.");
      });
  });

  if (listEl) {
    listEl.addEventListener("click", (event) => {
      const editId = event.target.closest("[data-edit]")?.getAttribute("data-edit");
      const deleteId = event.target
        .closest("[data-delete]")
        ?.getAttribute("data-delete");

      if (deleteId) {
        if (!confirm("이 공지를 삭제할까요?")) return;
        SiteApi.adminDeleteNotice(deleteId)
          .then(() => {
            if (String(editingId) === String(deleteId)) resetForm();
            renderList();
          })
          .catch((error) => {
            if (handleAdminError(error)) return;
            alert(error.message || "삭제에 실패했습니다.");
          });
        return;
      }

      if (!editId) return;

      SiteApi.getNotice(editId)
        .then((post) => {
          editingId = post.id;
          document.getElementById("admin-notice-id").value = post.id;
          document.getElementById("admin-notice-title").value = post.title;
          document.getElementById("admin-notice-content").value = post.content;
          document.getElementById("admin-notice-date").value = String(
            post.createdAt
          ).slice(0, 10);
          document.getElementById("admin-notice-pinned").checked = Boolean(
            post.pinned
          );
          document.getElementById("admin-notice-youtube").value =
            post.youtubeUrl || "";
          images = Array.isArray(post.images) ? [...post.images] : [];
          documents = Array.isArray(post.documents) ? [...post.documents] : [];
          if (submitBtn) submitBtn.textContent = "공지 수정";
          renderPreviews();
          form.scrollIntoView({ behavior: "smooth", block: "start" });
        })
        .catch((error) => {
          if (handleAdminError(error)) return;
          alert(error.message || "게시글을 불러오지 못했습니다.");
        });
    });
  }

  if (sessionStorage.getItem("adminToken")) showDashboard();
  else showLogin("");
})();
