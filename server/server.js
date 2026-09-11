const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "hujun2026";
const SESSION_MS = 8 * 60 * 60 * 1000;
const TOKEN_PREFIX = "v1.";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DOC_BYTES = 4 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_BYTES },
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(ROOT));

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function createAdminToken() {
  const expiresAt = Date.now() + SESSION_MS;
  const payload = Buffer.from(
    JSON.stringify({ exp: expiresAt }),
    "utf8"
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", ADMIN_PASSWORD)
    .update(payload)
    .digest("base64url");
  return TOKEN_PREFIX + payload + "." + signature;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string" || token.indexOf(TOKEN_PREFIX) !== 0) {
    return null;
  }

  const body = token.slice(TOKEN_PREFIX.length);
  const dotIndex = body.lastIndexOf(".");
  if (dotIndex <= 0) return null;

  const payload = body.slice(0, dotIndex);
  const signature = body.slice(dotIndex + 1);
  const expected = crypto
    .createHmac("sha256", ADMIN_PASSWORD)
    .update(payload)
    .digest("base64url");

  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch (error) {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.indexOf("Bearer ") === 0 ? header.slice(7) : "";
  const session = verifyAdminToken(token);

  if (!session) {
    return res
      .status(401)
      .json({ message: "관리자 인증이 필요합니다. 다시 로그인해 주세요." });
  }

  next();
}

function handleAsync(handler) {
  return function (req, res) {
    Promise.resolve(handler(req, res)).catch(function (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: error.message || "서버 오류가 발생했습니다." });
    });
  };
}

function normalizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(function (item) {
      if (!item || !item.url) return null;
      return {
        id: String(item.id || ""),
        name: String(item.name || "file"),
        mime: String(item.mime || ""),
        url: String(item.url),
      };
    })
    .filter(Boolean);
}

app.get(
  "/api/health",
  handleAsync(async function (req, res) {
    const dbStatus = await db.pingDatabase();
    res.json({ ok: true, db: dbStatus.mode });
  })
);

app.post("/api/admin/login", function (req, res) {
  const password = String(req.body.password || "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "비밀번호가 올바르지 않습니다." });
  }

  res.json({
    token: createAdminToken(),
    expiresAt: Date.now() + SESSION_MS,
  });
});

app.post("/api/admin/logout", requireAdmin, function (req, res) {
  res.json({ ok: true });
});

app.get(
  "/api/notices",
  handleAsync(async function (req, res) {
    res.json(await db.listNoticesPublic());
  })
);

app.get(
  "/api/notices/:id",
  handleAsync(async function (req, res) {
    const notice = await db.getNotice(req.params.id);
    if (!notice) {
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }
    res.json(notice);
  })
);

app.get(
  "/api/popups/active",
  handleAsync(async function (req, res) {
    const popup = await db.getActivePopup();
    res.json({ ok: true, popup });
  })
);

app.get(
  "/api/admin/notices",
  requireAdmin,
  handleAsync(async function (req, res) {
    res.json(await db.listNoticesAdmin());
  })
);

app.post(
  "/api/admin/notices",
  requireAdmin,
  handleAsync(async function (req, res) {
    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    const createdAt = String(
      req.body.createdAt || formatDate(new Date())
    ).trim();

    if (!title || !content) {
      return res.status(400).json({ message: "제목과 내용을 입력해 주세요." });
    }

    const notice = await db.createNotice({
      title: title,
      content: content,
      createdAt: createdAt,
      pinned: Boolean(req.body.pinned),
      youtubeUrl: String(req.body.youtubeUrl || "").trim(),
      images: normalizeAttachments(req.body.images),
      documents: normalizeAttachments(req.body.documents),
    });

    res.status(201).json(notice);
  })
);

app.put(
  "/api/admin/notices/:id",
  requireAdmin,
  handleAsync(async function (req, res) {
    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    const createdAt = String(
      req.body.createdAt || formatDate(new Date())
    ).trim();

    if (!title || !content) {
      return res.status(400).json({ message: "제목과 내용을 입력해 주세요." });
    }

    const notice = await db.updateNotice(req.params.id, {
      title: title,
      content: content,
      createdAt: createdAt,
      pinned: Boolean(req.body.pinned),
      youtubeUrl: String(req.body.youtubeUrl || "").trim(),
      images: normalizeAttachments(req.body.images),
      documents: normalizeAttachments(req.body.documents),
    });

    if (!notice) {
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }

    res.json(notice);
  })
);

app.delete(
  "/api/admin/notices/:id",
  requireAdmin,
  handleAsync(async function (req, res) {
    const deleted = await db.deleteNotice(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }
    res.json({ ok: true });
  })
);

app.get(
  "/api/admin/popups",
  requireAdmin,
  handleAsync(async function (req, res) {
    res.json({ ok: true, popups: await db.listPopupsAdmin() });
  })
);

app.post(
  "/api/admin/popups",
  requireAdmin,
  handleAsync(async function (req, res) {
    const popup = await db.createPopup({
      title: String(req.body.title || "").trim(),
      body: String(req.body.body || "").trim(),
      imageUrl: String(req.body.imageUrl || "").trim(),
      linkUrl: String(req.body.linkUrl || "").trim(),
      linkLabel: String(req.body.linkLabel || "자세히 보기").trim(),
      enabled: Boolean(req.body.enabled),
      startsAt: String(req.body.startsAt || "").trim(),
      endsAt: String(req.body.endsAt || "").trim(),
    });
    res.status(201).json({ ok: true, popup });
  })
);

app.put(
  "/api/admin/popups/:id",
  requireAdmin,
  handleAsync(async function (req, res) {
    const popup = await db.updatePopup(req.params.id, {
      title: String(req.body.title || "").trim(),
      body: String(req.body.body || "").trim(),
      imageUrl: String(req.body.imageUrl || "").trim(),
      linkUrl: String(req.body.linkUrl || "").trim(),
      linkLabel: String(req.body.linkLabel || "자세히 보기").trim(),
      enabled: Boolean(req.body.enabled),
      startsAt: String(req.body.startsAt || "").trim(),
      endsAt: String(req.body.endsAt || "").trim(),
    });

    if (!popup) {
      return res.status(404).json({ message: "팝업을 찾을 수 없습니다." });
    }

    res.json({ ok: true, popup });
  })
);

app.delete(
  "/api/admin/popups/:id",
  requireAdmin,
  handleAsync(async function (req, res) {
    const deleted = await db.deletePopup(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "팝업을 찾을 수 없습니다." });
    }
    res.json({ ok: true });
  })
);

app.post("/api/admin/upload", requireAdmin, function (req, res) {
  upload.single("file")(req, res, function (error) {
    if (error) {
      return res
        .status(400)
        .json({ message: error.message || "업로드에 실패했습니다." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "파일을 선택해 주세요." });
    }

    const kind = String(req.body.kind || "document");
    const isImage = kind === "image" || /^image\//.test(req.file.mimetype);

    if (isImage && req.file.size > MAX_IMAGE_BYTES) {
      return res
        .status(400)
        .json({ message: "이미지는 2MB 이하만 업로드할 수 있습니다." });
    }

    if (!isImage && req.file.size > MAX_DOC_BYTES) {
      return res
        .status(400)
        .json({ message: "문서는 4MB 이하만 업로드할 수 있습니다." });
    }

    if (kind === "image" && !/^image\//.test(req.file.mimetype)) {
      return res
        .status(400)
        .json({ message: "이미지 파일만 업로드할 수 있습니다." });
    }

    db.saveFile(req.file)
      .then(function (file) {
        res.status(201).json(file);
      })
      .catch(function (uploadError) {
        console.error(uploadError);
        res
          .status(500)
          .json({ message: uploadError.message || "업로드에 실패했습니다." });
      });
  });
});

app.get(
  "/api/files/:id",
  handleAsync(async function (req, res) {
    const file = await db.getFile(req.params.id);
    if (!file) {
      return res.status(404).json({ message: "파일을 찾을 수 없습니다." });
    }

    res.setHeader("Content-Type", file.mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      'inline; filename*=UTF-8\'\'' + encodeURIComponent(file.filename || "file")
    );
    res.send(file.data);
  })
);

async function start() {
  await db.initDatabase();

  app.listen(PORT, function () {
    console.log("제24회 허준축제 서버: http://localhost:" + PORT);
    console.log("공지 관리: http://localhost:" + PORT + "/admin/");
    console.log("팝업 관리: http://localhost:" + PORT + "/admin/popup.html");
    console.log("DB:", db.isUsingJson() ? "JSON (local)" : "PostgreSQL");
  });
}

start().catch(function (error) {
  console.error("서버 시작 실패:", error);
  process.exit(1);
});
