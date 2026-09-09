const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const DATA_DIR = path.join(__dirname, "data");
const NOTICES_SEED = path.join(DATA_DIR, "notices.json");
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
};
