(() => {
  const ADMIN_SESSION_KEY = "hujun_popup_admin_session";
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  const loginSection = document.getElementById("admin-login");
  const dashboard = document.getElementById("admin-dashboard");
  const loginForm = document.getElementById("admin-login-form");
  const listSection = document.getElementById("admin-list-section");
  const editorSection = document.getElementById("admin-editor-section");
  const listBody = document.getElementById("admin-popup-list");
  const listEmpty = document.getElementById("admin-list-empty");
  const popupForm = document.getElementById("popup-form");
  const editorHeading = document.getElementById("editor-heading");
  const imageUrlInput = document.getElementById("popup-image-url");
  const imagePreview = document.getElementById("popup-image-preview");
  const imageFileInput = document.getElementById("popup-image-file");
  const clearImageBtn = document.getElementById("btn-clear-image");
  const loginError = document.getElementById("admin-login-error");

  if (!loginSection || !dashboard) return;

  let popupsCache = [];

  function isAuthed() {
    return (
      sessionStorage.getItem(ADMIN_SESSION_KEY) === "1" &&
      !!sessionStorage.getItem("adminToken")
    );
  }

  function setAuthed(on) {
    if (on) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      sessionStorage.removeItem("adminToken");
    }
  }

  function showApp(on) {
    loginSection.hidden = on;
    dashboard.hidden = !on;
    if (on) renderList();
  }

  function handleAdminError(error) {
    if (error && error.status === 401) {
      setAuthed(false);
      showApp(false);
      if (loginError) {
        loginError.hidden = false;
        loginError.textContent = "세션이 만료되었습니다. 다시 로그인해 주세요.";
      }
      return true;
    }
    return false;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatPeriod(popup) {
    const start = popup.startsAt || "—";
    const end = popup.endsAt || "—";
    if (!popup.startsAt && !popup.endsAt) return "제한 없음";
    return start + " ~ " + end;
  }

  function imageLabel(popup) {
    if (!popup.imageUrl) return "(이미지 없음)";
    const name = popup.imageUrl.split("/").pop();
    return name || "이미지 등록됨";
  }

  function statusBadge(popup) {
    if (!popup.enabled) {
      return '<span class="popup-badge popup-badge--off">OFF</span>';
    }
    return '<span class="popup-badge popup-badge--on">ON</span>';
  }

  function setImagePreview(url) {
    if (url) {
      imagePreview.src = url;
      imagePreview.hidden = false;
      clearImageBtn.hidden = false;
    } else {
      imagePreview.removeAttribute("src");
      imagePreview.hidden = true;
      clearImageBtn.hidden = true;
    }
  }

  function showEditor(show) {
    listSection.hidden = show;
    editorSection.hidden = !show;
  }

  function resetForm() {
    popupForm.reset();
    document.getElementById("popup-id").value = "";
    imageUrlInput.value = "";
    setImagePreview("");
    imageFileInput.value = "";
  }

  function openEditor(popup) {
    resetForm();
    if (popup) {
      editorHeading.textContent = "팝업 수정";
      document.getElementById("popup-id").value = popup.id;
      imageUrlInput.value = popup.imageUrl || "";
      document.getElementById("popup-link-url").value = popup.linkUrl || "";
      document.getElementById("popup-starts").value = popup.startsAt || "";
      document.getElementById("popup-ends").value = popup.endsAt || "";
      document.getElementById("popup-enabled").checked = !!popup.enabled;
      setImagePreview(popup.imageUrl || "");
    } else {
      editorHeading.textContent = "팝업 작성";
    }
    showEditor(true);
  }

  async function renderList() {
    try {
      const json = await window.SiteApi.adminListPopups();
      popupsCache = json.popups || [];
    } catch (error) {
      if (handleAdminError(error)) return;
      alert(error.message || "팝업 목록을 불러오지 못했습니다.");
      return;
    }

    if (!popupsCache.length) {
      listBody.innerHTML = "";
      listEmpty.hidden = false;
      return;
    }

    listEmpty.hidden = true;
    listBody.innerHTML = popupsCache
      .map(
        (popup, index) =>
          "<tr>" +
          "<td>" +
          (popupsCache.length - index) +
          "</td>" +
          '<td class="popup-col-image">' +
          escapeHtml(imageLabel(popup)) +
          "</td>" +
          "<td>" +
          statusBadge(popup) +
          "</td>" +
          '<td class="popup-col-period">' +
          escapeHtml(formatPeriod(popup)) +
          "</td>" +
          "<td>" +
          '<div class="admin-row-actions">' +
          '<button type="button" class="admin-btn admin-btn--ghost" data-edit="' +
          popup.id +
          '">수정</button>' +
          '<button type="button" class="admin-btn admin-btn--danger" data-delete="' +
          popup.id +
          '">삭제</button>' +
          "</div>" +
          "</td>" +
          "</tr>"
      )
      .join("");
  }

  listBody.addEventListener("click", async (event) => {
    const editBtn = event.target.closest("[data-edit]");
    const deleteBtn = event.target.closest("[data-delete]");

    if (editBtn) {
      const popup = popupsCache.find(
        (item) => String(item.id) === editBtn.dataset.edit
      );
      if (popup) openEditor(popup);
      return;
    }

    if (deleteBtn) {
      if (!confirm("이 팝업을 삭제할까요?")) return;
      try {
        await window.SiteApi.adminDeletePopup(deleteBtn.dataset.delete);
        await renderList();
      } catch (error) {
        if (handleAdminError(error)) return;
        alert(error.message || "삭제에 실패했습니다.");
      }
    }
  });

  imageFileInput.addEventListener("change", async () => {
    const file = imageFileInput.files && imageFileInput.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      imageFileInput.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert("이미지는 10MB 이하여야 합니다.");
      imageFileInput.value = "";
      return;
    }
    try {
      const uploaded = await window.SiteApi.adminUpload(file, "image");
      imageUrlInput.value = uploaded.url;
      setImagePreview(uploaded.url);
    } catch (error) {
      if (handleAdminError(error)) return;
      alert(error.message || "이미지 업로드에 실패했습니다.");
    }
  });

  clearImageBtn.addEventListener("click", () => {
    imageUrlInput.value = "";
    imageFileInput.value = "";
    setImagePreview("");
  });

  document.getElementById("btn-new").addEventListener("click", () => {
    openEditor(null);
  });

  document.getElementById("btn-cancel").addEventListener("click", () => {
    showEditor(false);
    resetForm();
  });

  popupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const idRaw = document.getElementById("popup-id").value;
    const payload = {
      title: "",
      body: "",
      imageUrl: imageUrlInput.value.trim(),
      linkUrl: document.getElementById("popup-link-url").value.trim(),
      linkLabel: "",
      startsAt: document.getElementById("popup-starts").value,
      endsAt: document.getElementById("popup-ends").value,
      enabled: document.getElementById("popup-enabled").checked,
    };

    try {
      if (idRaw) {
        await window.SiteApi.adminUpdatePopup(idRaw, payload);
      } else {
        await window.SiteApi.adminCreatePopup(payload);
      }
      showEditor(false);
      resetForm();
      await renderList();
    } catch (error) {
      if (handleAdminError(error)) return;
      alert(error.message || "저장에 실패했습니다.");
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("admin-password").value;
    try {
      const result = await window.SiteApi.adminLogin(password);
      sessionStorage.setItem("adminToken", result.token);
      if (loginError) loginError.hidden = true;
      setAuthed(true);
      showApp(true);
    } catch (error) {
      if (loginError) {
        loginError.hidden = false;
        loginError.textContent = "비밀번호가 올바르지 않습니다.";
      }
    }
  });

  document.getElementById("admin-logout").addEventListener("click", () => {
    setAuthed(false);
    showApp(false);
  });

  if (sessionStorage.getItem("adminToken")) {
    setAuthed(true);
    showApp(true);
  } else if (isAuthed()) {
    showApp(true);
  } else {
    showApp(false);
  }
})();
