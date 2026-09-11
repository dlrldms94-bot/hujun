(() => {
  function request(path, options) {
    const opts = options || {};
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      opts.headers || {}
    );

    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then((response) =>
      response
        .json()
        .catch(() => ({}))
        .then((data) => {
          if (!response.ok) {
            const error = new Error(data.message || "요청에 실패했습니다.");
            error.status = response.status;
            throw error;
          }
          return data;
        })
    );
  }

  function adminRequest(path, options) {
    const token = sessionStorage.getItem("adminToken");
    const opts = options || {};
    opts.headers = Object.assign({}, opts.headers || {}, {
      Authorization: "Bearer " + token,
    });
    return request(path, opts);
  }

  function adminUpload(file, kind) {
    const token = sessionStorage.getItem("adminToken");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind || "document");

    return fetch("/api/admin/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: formData,
    }).then((response) =>
      response
        .json()
        .catch(() => ({}))
        .then((data) => {
          if (!response.ok) {
            const error = new Error(data.message || "업로드에 실패했습니다.");
            error.status = response.status;
            throw error;
          }
          return data;
        })
    );
  }

  window.SiteApi = {
    request,
    adminRequest,
    adminUpload,
    getNotices: () => request("/api/notices"),
    getNotice: (id) => request("/api/notices/" + encodeURIComponent(id)),
    fetchActivePopup: () =>
      request("/api/popups/active").then((data) => data.popup || null),
    adminLogin: (password) =>
      request("/api/admin/login", {
        method: "POST",
        body: { password },
      }),
    adminLogout: () =>
      adminRequest("/api/admin/logout", { method: "POST" }),
    adminListNotices: () => adminRequest("/api/admin/notices"),
    adminCreateNotice: (body) =>
      adminRequest("/api/admin/notices", { method: "POST", body }),
    adminUpdateNotice: (id, body) =>
      adminRequest("/api/admin/notices/" + encodeURIComponent(id), {
        method: "PUT",
        body,
      }),
    adminDeleteNotice: (id) =>
      adminRequest("/api/admin/notices/" + encodeURIComponent(id), {
        method: "DELETE",
      }),
    adminListPopups: () => adminRequest("/api/admin/popups"),
    adminCreatePopup: (body) =>
      adminRequest("/api/admin/popups", { method: "POST", body }),
    adminUpdatePopup: (id, body) =>
      adminRequest("/api/admin/popups/" + encodeURIComponent(id), {
        method: "PUT",
        body,
      }),
    adminDeletePopup: (id) =>
      adminRequest("/api/admin/popups/" + encodeURIComponent(id), {
        method: "DELETE",
      }),
  };
})();
