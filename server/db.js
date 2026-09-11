const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const DATA_DIR = path.join(__dirname, "data");
const NOTICES_SEED = path.join(DATA_DIR, "notices.json");
const POPUPS_FILE = path.join(DATA_DIR, "popups.json");
const FILES_DIR = path.join(DATA_DIR, "files");

let pool = null;
let useJson = false;

function readSeed() {
  try {
    return JSON.parse(fs.readFileSync(NOTICES_SEED, "utf8"));
  } catch (error) {
    return [];
  }
}

function writeSeed(data) {
  fs.writeFileSync(NOTICES_SEED, JSON.stringify(data, null, 2), "utf8");
}

function readPopups() {
  try {
    const list = JSON.parse(fs.readFileSync(POPUPS_FILE, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function writePopups(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(POPUPS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function ensureFilesDir() {
  if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
  }
}

function formatCreatedAt(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function mapNoticeRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: formatCreatedAt(row.created_at),
    pinned: Boolean(row.pinned),
    youtubeUrl: row.youtube_url || "",
    images: parseJsonArray(row.images),
    documents: parseJsonArray(row.documents),
  };
}

function sortNotices(notices) {
  return notices.slice().sort(function (a, b) {
    const pinDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinDiff !== 0) return pinDiff;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

function mapNoticePublic(notice) {
  return {
    id: notice.id,
    title: notice.title,
    createdAt: notice.createdAt,
    pinned: Boolean(notice.pinned),
  };
}

async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    useJson = true;
    ensureFilesDir();
    console.log("[db] DATABASE_URL 없음 — JSON 파일 모드 (로컬 개발)");
    return;
  }

  pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notices (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATE NOT NULL,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      youtube_url TEXT NOT NULL DEFAULT '',
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      documents JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS popups (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      link_url TEXT NOT NULL DEFAULT '',
      link_label TEXT NOT NULL DEFAULT '자세히 보기',
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      starts_at DATE,
      ends_at DATE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const countResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM notices"
  );
  if (countResult.rows[0].count === 0) {
    const seed = readSeed();
    for (const notice of seed) {
      await pool.query(
        `INSERT INTO notices (id, title, content, created_at, pinned, youtube_url, images, documents)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          notice.id,
          notice.title,
          notice.content,
          notice.createdAt,
          Boolean(notice.pinned),
          notice.youtubeUrl || "",
          JSON.stringify(notice.images || []),
          JSON.stringify(notice.documents || []),
        ]
      );
    }
    if (seed.length) {
      await pool.query(
        "SELECT setval('notices_id_seq', (SELECT MAX(id) FROM notices))"
      );
    }
    console.log("[db] 초기 공지 시드 완료");
  }

  console.log("[db] PostgreSQL 연결 완료");
}

function isUsingJson() {
  return useJson;
}

async function listNoticesPublic() {
  if (useJson) {
    return sortNotices(readSeed()).map(mapNoticePublic);
  }

  const result = await pool.query(
    "SELECT id, title, created_at, pinned FROM notices ORDER BY pinned DESC, created_at DESC, id DESC"
  );
  return result.rows.map(function (row) {
    return mapNoticePublic(mapNoticeRow(row));
  });
}

async function listNoticesAdmin() {
  if (useJson) {
    return sortNotices(readSeed());
  }

  const result = await pool.query(
    "SELECT * FROM notices ORDER BY pinned DESC, created_at DESC, id DESC"
  );
  return result.rows.map(mapNoticeRow);
}

async function getNotice(id) {
  if (useJson) {
    return (
      readSeed().find(function (item) {
        return String(item.id) === String(id);
      }) || null
    );
  }

  const result = await pool.query("SELECT * FROM notices WHERE id = $1", [id]);
  return result.rows[0] ? mapNoticeRow(result.rows[0]) : null;
}

async function createNotice(data) {
  if (useJson) {
    const notices = readSeed();
    const notice = {
      id: notices.length
        ? Math.max.apply(
            null,
            notices.map(function (item) {
              return Number(item.id) || 0;
            })
          ) + 1
        : 1,
      title: data.title,
      content: data.content,
      createdAt: data.createdAt,
      pinned: Boolean(data.pinned),
      youtubeUrl: data.youtubeUrl || "",
      images: data.images || [],
      documents: data.documents || [],
    };
    notices.unshift(notice);
    writeSeed(notices);
    return notice;
  }

  const result = await pool.query(
    `INSERT INTO notices (title, content, created_at, pinned, youtube_url, images, documents)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     RETURNING *`,
    [
      data.title,
      data.content,
      data.createdAt,
      Boolean(data.pinned),
      data.youtubeUrl || "",
      JSON.stringify(data.images || []),
      JSON.stringify(data.documents || []),
    ]
  );
  return mapNoticeRow(result.rows[0]);
}

async function updateNotice(id, data) {
  if (useJson) {
    const notices = readSeed();
    const index = notices.findIndex(function (item) {
      return String(item.id) === String(id);
    });
    if (index === -1) return null;
    notices[index] = {
      id: notices[index].id,
      title: data.title,
      content: data.content,
      createdAt: data.createdAt,
      pinned: Boolean(data.pinned),
      youtubeUrl: data.youtubeUrl || "",
      images: data.images || [],
      documents: data.documents || [],
    };
    writeSeed(notices);
    return notices[index];
  }

  const result = await pool.query(
    `UPDATE notices
     SET title = $2,
         content = $3,
         created_at = $4,
         pinned = $5,
         youtube_url = $6,
         images = $7::jsonb,
         documents = $8::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      data.title,
      data.content,
      data.createdAt,
      Boolean(data.pinned),
      data.youtubeUrl || "",
      JSON.stringify(data.images || []),
      JSON.stringify(data.documents || []),
    ]
  );
  return result.rows[0] ? mapNoticeRow(result.rows[0]) : null;
}

async function deleteNotice(id) {
  if (useJson) {
    const notices = readSeed();
    const next = notices.filter(function (item) {
      return String(item.id) !== String(id);
    });
    if (next.length === notices.length) return false;
    writeSeed(next);
    return true;
  }

  const result = await pool.query("DELETE FROM notices WHERE id = $1", [id]);
  return result.rowCount > 0;
}

async function saveFile(file) {
  const id = crypto.randomUUID();
  const filename = file.originalname || "file";
  const mime = file.mimetype || "application/octet-stream";
  const buffer = file.buffer;

  if (useJson) {
    ensureFilesDir();
    const ext = path.extname(filename);
    const diskName = id + ext;
    fs.writeFileSync(path.join(FILES_DIR, diskName), buffer);
    return {
      id: id,
      name: filename,
      mime: mime,
      url: "/api/files/" + id,
    };
  }

  await pool.query(
    `INSERT INTO files (id, filename, mime, data)
     VALUES ($1, $2, $3, $4)`,
    [id, filename, mime, buffer]
  );

  return {
    id: id,
    name: filename,
    mime: mime,
    url: "/api/files/" + id,
  };
}

async function getFile(id) {
  if (useJson) {
    ensureFilesDir();
    const entries = fs.readdirSync(FILES_DIR);
    const match = entries.find(function (name) {
      return name.indexOf(id) === 0;
    });
    if (!match) return null;

    const notices = readSeed();
    let meta = null;
    notices.forEach(function (notice) {
      []
        .concat(notice.images || [], notice.documents || [])
        .forEach(function (item) {
          if (String(item.id) === String(id)) meta = item;
        });
    });

    return {
      id: id,
      filename: (meta && meta.name) || match,
      mime: (meta && meta.mime) || "application/octet-stream",
      data: fs.readFileSync(path.join(FILES_DIR, match)),
    };
  }

  const result = await pool.query("SELECT * FROM files WHERE id = $1", [id]);
  if (!result.rows[0]) return null;
  return {
    id: result.rows[0].id,
    filename: result.rows[0].filename,
    mime: result.rows[0].mime,
    data: result.rows[0].data,
  };
}

async function pingDatabase() {
  if (useJson) return { mode: "json" };
  await pool.query("SELECT 1");
  return { mode: "postgres" };
}

function normalizePopupDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return "";
}

function normalizePopup(popup) {
  return {
    id: Number(popup.id),
    title: String(popup.title || "").trim(),
    body: String(popup.body || "").trim(),
    imageUrl: String(popup.image_url || popup.imageUrl || "").trim(),
    linkUrl: String(popup.link_url || popup.linkUrl || "").trim(),
    linkLabel:
      String(popup.link_label || popup.linkLabel || "자세히 보기").trim() ||
      "자세히 보기",
    enabled: Boolean(popup.enabled),
    startsAt: normalizePopupDate(popup.starts_at || popup.startsAt),
    endsAt: normalizePopupDate(popup.ends_at || popup.endsAt),
    updatedAt: popup.updated_at || popup.updatedAt || new Date().toISOString(),
  };
}

function mapPopupRow(row) {
  return normalizePopup({
    id: row.id,
    title: row.title,
    body: row.body,
    image_url: row.image_url,
    link_url: row.link_url,
    link_label: row.link_label,
    enabled: row.enabled,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    updated_at: row.updated_at,
  });
}

function isPopupInRange(popup, today) {
  if (popup.startsAt && today < popup.startsAt) return false;
  if (popup.endsAt && today > popup.endsAt) return false;
  return true;
}

function sortPopups(list) {
  return list.slice().sort(function (a, b) {
    return b.id - a.id;
  });
}

async function listPopupsAdmin() {
  if (useJson) {
    return sortPopups(readPopups().map(normalizePopup));
  }

  const result = await pool.query("SELECT * FROM popups ORDER BY id DESC");
  return result.rows.map(mapPopupRow);
}

async function getPopup(id) {
  if (useJson) {
    const popup = readPopups().find(function (item) {
      return String(item.id) === String(id);
    });
    return popup ? normalizePopup(popup) : null;
  }

  const result = await pool.query("SELECT * FROM popups WHERE id = $1", [id]);
  return result.rows[0] ? mapPopupRow(result.rows[0]) : null;
}

async function getActivePopup() {
  const today = new Date().toISOString().slice(0, 10);
  const list = await listPopupsAdmin();
  return (
    list.find(function (popup) {
      return popup.enabled && isPopupInRange(popup, today);
    }) || null
  );
}

async function createPopup(payload) {
  const data = normalizePopup(
    Object.assign({}, payload, {
      id: 0,
      updatedAt: new Date().toISOString(),
    })
  );

  if (useJson) {
    const list = readPopups();
    const nextId =
      list.reduce(function (max, item) {
        return Math.max(max, Number(item.id) || 0);
      }, 0) + 1;
    const popup = normalizePopup(Object.assign({}, data, { id: nextId }));
    list.push(popup);
    writePopups(list);
    return popup;
  }

  const result = await pool.query(
    `INSERT INTO popups (title, body, image_url, link_url, link_label, enabled, starts_at, ends_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING *`,
    [
      data.title,
      data.body,
      data.imageUrl,
      data.linkUrl,
      data.linkLabel,
      data.enabled,
      data.startsAt || null,
      data.endsAt || null,
    ]
  );
  return mapPopupRow(result.rows[0]);
}

async function updatePopup(id, payload) {
  const data = normalizePopup(
    Object.assign({}, payload, {
      id: id,
      updatedAt: new Date().toISOString(),
    })
  );

  if (useJson) {
    const list = readPopups();
    const index = list.findIndex(function (item) {
      return String(item.id) === String(id);
    });
    if (index === -1) return null;
    const popup = normalizePopup(
      Object.assign({}, data, { id: list[index].id })
    );
    list[index] = popup;
    writePopups(list);
    return popup;
  }

  const result = await pool.query(
    `UPDATE popups
     SET title = $1,
         body = $2,
         image_url = $3,
         link_url = $4,
         link_label = $5,
         enabled = $6,
         starts_at = $7,
         ends_at = $8,
         updated_at = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      data.title,
      data.body,
      data.imageUrl,
      data.linkUrl,
      data.linkLabel,
      data.enabled,
      data.startsAt || null,
      data.endsAt || null,
      id,
    ]
  );
  return result.rows[0] ? mapPopupRow(result.rows[0]) : null;
}

async function deletePopup(id) {
  if (useJson) {
    const list = readPopups();
    const next = list.filter(function (item) {
      return String(item.id) !== String(id);
    });
    if (next.length === list.length) return false;
    writePopups(next);
    return true;
  }

  const result = await pool.query("DELETE FROM popups WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  initDatabase,
  isUsingJson,
  listNoticesPublic,
  listNoticesAdmin,
  getNotice,
  createNotice,
  updateNotice,
  deleteNotice,
  saveFile,
  getFile,
  pingDatabase,
  listPopupsAdmin,
  getPopup,
  getActivePopup,
  createPopup,
  updatePopup,
  deletePopup,
};
