const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const XLSX = require("xlsx");

const DATA_FILE = path.join(__dirname, "data", "luckydraw.json");
const NAME_MAX = 40;
const PHONE_MAX = 40;
const TIER_MAX = 10;
const TIER_LABEL_MAX = 20;
const TIER_ITEM_MAX = 40;
const TIER_QUOTA_MAX = 999;
const DRAW_MODES = ["single", "batch"];

const NAME_HINTS = ["이름", "성명", "참가자", "성함", "name"];
const PHONE_HINTS = [
  "뒷번호", "뒷자리", "끝번호", "끝자리", "네자리",
  "전화", "연락처", "휴대폰", "핸드폰", "휴대",
  "phone", "mobile", "hp", "cell", "cel",
];

const DEMO_ROWS = [
  ["이기은", "2473"], ["문채원", "5678"], ["홍길동", "1234"], ["오준혁", "3456"],
  ["김민준", "8901"], ["이서연", "2345"], ["박지호", "6789"], ["최수아", "4567"],
  ["정도윤", "9012"], ["강하은", "0126"], ["윤서준", "3344"], ["임지민", "4455"],
  ["한소율", "5566"], ["신예린", "6677"], ["배도현", "7788"], ["조하늘", "8899"],
  ["서우진", "9900"], ["한가람", "0011"], ["노지후", "1122"], ["문수빈", "2233"],
];

let pool = null;
let state = emptyState();
let queue = Promise.resolve();

function defaultTiers() {
  return [4, 3, 2, 1].map(function (prize) {
    return { prize: prize, label: prize + "등", quota: 1, item: "", mode: "single" };
  });
}

function emptyState() {
  return {
    nextId: 1,
    participants: [],
    tiers: defaultTiers(),
    maskName: true,
    currentPrize: 4,
    drawSeq: 0,
    lastWinnerIds: [],
    overlayOpen: false,
  };
}

function normalizeStoredTiers(raw) {
  if (!Array.isArray(raw) || !raw.length) return defaultTiers();
  return raw
    .filter(function (tier) { return tier && Number.isInteger(tier.prize) && tier.prize > 0; })
    .map(function (tier) {
      return {
        prize: tier.prize,
        label: normalizeLabel(tier.label) || tier.prize + "등",
        quota: Number.isInteger(tier.quota) && tier.quota >= 0 ? tier.quota : 1,
        item: normalizeLabel(tier.item),
        mode: DRAW_MODES.includes(tier.mode) ? tier.mode : "single",
      };
    })
    .sort(function (a, b) { return b.prize - a.prize; });
}

function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  let lastWinnerIds = Array.isArray(raw.lastWinnerIds) ? raw.lastWinnerIds.map(Number).filter(Boolean) : [];
  if (!lastWinnerIds.length && Number(raw.lastWinnerId)) lastWinnerIds = [Number(raw.lastWinnerId)];
  const tiers = normalizeStoredTiers(raw.tiers);
  return {
    nextId: Number(raw.nextId) || 1,
    participants: (Array.isArray(raw.participants) ? raw.participants : []).map(function (p) {
      return Object.assign({ absent: false }, p);
    }),
    tiers: tiers.length ? tiers : defaultTiers(),
    maskName: raw.maskName !== false,
    currentPrize: Number.isInteger(raw.currentPrize) ? raw.currentPrize : 4,
    drawSeq: Number(raw.drawSeq) || 0,
    lastWinnerIds: lastWinnerIds,
    overlayOpen: Boolean(raw.overlayOpen),
  };
}

async function init(dbPool) {
  pool = dbPool || null;

  if (pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS luckydraw_state (
        id INT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const result = await pool.query("SELECT data FROM luckydraw_state WHERE id = 1");
    state = normalizeState(result.rows[0] && result.rows[0].data);
    return;
  }

  try {
    state = normalizeState(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch (error) {
    state = emptyState();
  }
}

async function persist(next) {
  if (pool) {
    await pool.query(
      `INSERT INTO luckydraw_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify(next)]
    );
    return;
  }
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2), "utf8");
}

// Mutations run one at a time on a copy, so a failed save never leaves memory ahead of storage.
function mutate(fn) {
  const run = queue.then(async function () {
    const next = structuredClone(state);
    const result = fn(next);
    await persist(next);
    state = next;
    return result;
  });
  queue = run.catch(function () {});
  return run;
}

function now() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
}

function tierOf(s, prize) {
  const n = Number(prize);
  return s.tiers.find(function (tier) { return tier.prize === n; }) || null;
}

function nextTierAfter(s, prize) {
  const idx = s.tiers.findIndex(function (tier) { return tier.prize === Number(prize); });
  return idx < 0 ? null : s.tiers[idx + 1] || null;
}

function firstPrize(s) {
  return s.tiers.length ? s.tiers[0].prize : 0;
}

function publicTier(tier) {
  return { prize: tier.prize, label: tier.label, quota: tier.quota, item: tier.item, mode: tier.mode };
}

function isPending(p) {
  return Boolean(p.prize) && !p.confirmed && !p.absent;
}

function tierCounts(s, prize) {
  const counts = { confirmed: 0, pending: 0, absent: 0 };
  s.participants.forEach(function (p) {
    if (p.prize !== prize) return;
    if (p.confirmed) counts.confirmed += 1;
    else if (p.absent) counts.absent += 1;
    else counts.pending += 1;
  });
  return counts;
}

// Absent winners give their slot back; pending ones hold it until confirmed or marked absent.
function slotsLeft(s, tier) {
  if (!tier.quota) return Infinity;
  const counts = tierCounts(s, tier.prize);
  return Math.max(0, tier.quota - counts.confirmed - counts.pending);
}

function readyRows(s) {
  return s.participants.filter(function (p) { return !p.prize; });
}

function drawSize(s, tier) {
  const wanted = tier.mode === "batch" ? slotsLeft(s, tier) : 1;
  return Math.max(0, Math.min(wanted, slotsLeft(s, tier), readyRows(s).length));
}

function drawStarted(s) {
  return s.participants.some(function (p) { return p.prize; });
}

function advanceIfFull(s) {
  const from = tierOf(s, s.currentPrize);
  let tier = from;
  while (tier && tier.quota && tierCounts(s, tier.prize).confirmed >= tier.quota) {
    const upcoming = nextTierAfter(s, tier.prize);
    s.currentPrize = upcoming ? upcoming.prize : 0;
    tier = upcoming;
  }
  return tier === from ? null : { closed: publicTier(from), current: tier ? publicTier(tier) : null };
}

function pickRandom(rows, count) {
  const copy = rows.slice();
  for (let i = 0; i < count; i += 1) {
    const j = i + crypto.randomInt(copy.length - i);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, count);
}

function normalizeLabel(raw) {
  return String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
}

function maskPhone(value) {
  const raw = String(value == null ? "" : value).trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) {
    return digits.slice(0, 3) + "-****-" + digits.slice(-4);
  }
  return raw;
}

function maskName(value) {
  const name = String(value == null ? "" : value).trim();
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name.slice(-1);
}

function formatPhone(value) {
  const raw = String(value == null ? "" : value).trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (digits.length === 4) return digits;
  if (digits.startsWith("82") && digits.length >= 12 && digits.length <= 13) {
    digits = "0" + digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith("10")) digits = "0" + digits;
  if (digits.length === 11) {
    return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
  }
  if (digits.length === 10) {
    return digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6);
  }
  return raw;
}

function splitNameAndTail(raw) {
  const matched = normalizeLabel(raw).match(/^(.+?)\s+(\d{4})$/);
  return matched ? { name: matched[1].trim(), phone: matched[2] } : null;
}

function publicParticipant(row, hideName) {
  return {
    id: row.id,
    name: hideName === false ? row.name : maskName(row.name),
    phone: maskPhone(row.phone),
    rank: row.rank,
    prize: Number(row.prize || 0),
    confirmed: Boolean(row.confirmed),
    absent: Boolean(row.absent),
    drawnAt: row.drawnAt || null,
  };
}

function adminParticipant(row) {
  return Object.assign(publicParticipant(row, false), {
    name: row.name,
    phoneFull: row.phone,
    createdAt: row.createdAt,
  });
}

function validateRows(input) {
  const rows = [];
  const errors = [];
  const seen = new Set();

  input.forEach(function (item, index) {
    const line = index + 1;
    let name = normalizeLabel(item.name);
    let phone = formatPhone(normalizeLabel(item.phone));

    if (!phone) {
      const combined = splitNameAndTail(name);
      if (combined) {
        name = combined.name;
        phone = combined.phone;
      }
    }
    if (!name || !phone) {
      errors.push(line + "행: 이름과 연락처를 함께 입력하세요.");
      return;
    }
    if (name.length > NAME_MAX) {
      errors.push(line + "행: 이름은 1~" + NAME_MAX + "자여야 합니다.");
      return;
    }
    if (phone.length > PHONE_MAX) {
      errors.push(line + "행: 연락처는 1~" + PHONE_MAX + "자여야 합니다.");
      return;
    }
    const key = name + "|" + phone;
    if (seen.has(key)) {
      errors.push(line + "행: 같은 목록 안에서 중복입니다.");
      return;
    }
    seen.add(key);
    rows.push({ name: name, phone: phone });
  });

  return { rows: rows, errors: errors };
}

function parseText(text) {
  const input = [];
  String(text == null ? "" : text).split(/\r?\n/).forEach(function (raw) {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[|\t,]/).map(function (part) { return part.trim(); }).filter(Boolean);
    if (parts.length >= 2) {
      input.push({ name: parts[0], phone: parts[1] });
    } else {
      input.push(splitNameAndTail(line) || { name: line, phone: "" });
    }
  });
  return validateRows(input);
}

function cellText(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Number.isInteger(value) ? value : Math.round(value));
  }
  return String(value).trim();
}

function hasHint(text, hints) {
  const compact = text.replace(/\s+/g, "").toLowerCase();
  return hints.some(function (hint) { return compact.includes(hint.toLowerCase()); });
}

function parseSheet(grid) {
  const table = (grid || [])
    .map(function (row) { return Array.isArray(row) ? row : []; })
    .filter(function (row) { return row.some(function (cell) { return cellText(cell); }); });
  if (!table.length) return { rows: [], errors: ["엑셀에 데이터가 없습니다."] };

  const header = table[0].map(cellText);
  let nameIdx = -1;
  let phoneIdx = -1;
  header.forEach(function (cell, index) {
    if (nameIdx < 0 && hasHint(cell, NAME_HINTS)) nameIdx = index;
    if (phoneIdx < 0 && hasHint(cell, PHONE_HINTS)) phoneIdx = index;
  });
  const hasHeader = nameIdx >= 0 || phoneIdx >= 0;
  if (!hasHeader) {
    nameIdx = 0;
    phoneIdx = 1;
  } else if (nameIdx < 0) {
    nameIdx = 0;
  }

  const input = table.slice(hasHeader ? 1 : 0).map(function (row) {
    const nameCell = cellText(row[nameIdx]);
    const phone = formatPhone(phoneIdx >= 0 ? cellText(row[phoneIdx]) : "");
    if (phone) return { name: nameCell, phone: phone };
    return splitNameAndTail(nameCell) || { name: nameCell, phone: "" };
  });
  return validateRows(input);
}

function readWorkbook(buffer) {
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
  if (isZip || isOle) {
    return XLSX.read(buffer, { type: "buffer", cellDates: false });
  }
  // CSV: SheetJS misreads BOM-less UTF-8, and Korean Excel saves CSV as CP949.
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    text = new TextDecoder("euc-kr").decode(buffer);
  }
  return XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string", cellDates: false });
}

function addRows(next, rows) {
  const existing = new Set(next.participants.map(function (p) { return p.name + "|" + p.phone; }));
  let added = 0;
  let skipped = 0;
  rows.forEach(function (row) {
    const key = row.name + "|" + row.phone;
    if (existing.has(key)) {
      skipped += 1;
      return;
    }
    existing.add(key);
    next.participants.push({
      id: next.nextId,
      name: row.name,
      phone: row.phone,
      prize: 0,
      rank: 0,
      confirmed: false,
      absent: false,
      createdAt: now(),
      drawnAt: null,
    });
    next.nextId += 1;
    added += 1;
  });
  return { added: added, skipped: skipped };
}

function resetDrawState(next) {
  next.currentPrize = firstPrize(next);
  next.drawSeq = 0;
  next.lastWinnerIds = [];
  next.overlayOpen = false;
}

function validateTiers(s, input) {
  if (!Array.isArray(input) || !input.length) throw httpError(400, "등수를 하나 이상 만들어 주세요.");
  if (input.length > TIER_MAX) throw httpError(400, "등수는 최대 " + TIER_MAX + "개까지 만들 수 있습니다.");
  const started = drawStarted(s);
  if (started && input.length !== s.tiers.length) {
    throw httpError(409, "추첨이 시작된 뒤에는 등수를 추가하거나 삭제할 수 없습니다. 당첨 초기화 후 다시 시도해 주세요.");
  }

  return input.map(function (raw, index) {
    const prize = input.length - index;
    const item = raw || {};
    const label = normalizeLabel(item.label) || prize + "등";
    const quota = Number(item.quota);
    const prizeName = normalizeLabel(item.item);
    const mode = DRAW_MODES.includes(item.mode) ? item.mode : "single";

    if (label.length > TIER_LABEL_MAX) {
      throw httpError(400, label + ": 라벨은 " + TIER_LABEL_MAX + "자 이내로 입력해 주세요.");
    }
    if (!Number.isInteger(quota) || quota < 0 || quota > TIER_QUOTA_MAX) {
      throw httpError(400, label + ": 인원은 0~" + TIER_QUOTA_MAX + " 사이 숫자로 입력해 주세요.");
    }
    if (prizeName.length > TIER_ITEM_MAX) {
      throw httpError(400, label + ": 상품명은 " + TIER_ITEM_MAX + "자 이내로 입력해 주세요.");
    }
    if (mode === "batch" && !quota) {
      throw httpError(400, label + ": 한 번에 추첨하려면 인원을 1명 이상으로 정해 주세요.");
    }
    if (started && quota) {
      const counts = tierCounts(s, prize);
      const taken = counts.confirmed + counts.pending;
      if (quota < taken) {
        throw httpError(409, label + ": 이미 " + taken + "명이 뽑혀서 인원을 그보다 줄일 수 없습니다.");
      }
    }
    return { prize: prize, label: label, quota: quota, item: prizeName, mode: mode };
  });
}

function stats(s) {
  return {
    total: s.participants.length,
    remaining: s.participants.filter(function (p) { return !p.prize; }).length,
    winners: s.participants.filter(function (p) { return p.confirmed; }).length,
  };
}

function winnersOf(s) {
  return s.participants
    .filter(function (p) { return p.confirmed; })
    .sort(function (a, b) { return a.prize - b.prize || a.rank - b.rank || a.id - b.id; });
}

function drawPayload(s) {
  const tier = tierOf(s, s.currentPrize);
  const counts = tier ? tierCounts(s, tier.prize) : null;
  const byId = new Map(s.participants.map(function (p) { return [p.id, p]; }));
  return {
    stats: stats(s),
    tiers: s.tiers.map(publicTier),
    maskName: s.maskName,
    locked: drawStarted(s),
    currentPrize: tier ? publicTier(tier) : null,
    currentCount: counts ? counts.confirmed : 0,
    currentPending: counts ? counts.pending : 0,
    nextDrawCount: tier ? drawSize(s, tier) : 0,
    drawSeq: s.drawSeq,
    overlayOpen: s.overlayOpen,
    lastWinners: s.lastWinnerIds
      .map(function (id) { return byId.get(id); })
      .filter(Boolean)
      .map(function (p) { return publicParticipant(p, s.maskName); }),
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function register(app, helpers) {
  const requireAdmin = helpers.requireAdmin;

  function handle(fn) {
    return function (req, res) {
      Promise.resolve(fn(req, res)).catch(function (error) {
        if (!error.status) console.error(error);
        res.status(error.status || 500).json({ message: error.message || "서버 오류가 발생했습니다." });
      });
    };
  }

  function addAndRespond(res, parsed) {
    if (!parsed.rows.length) {
      throw httpError(400, parsed.errors[0] || "등록할 참가자가 없습니다.");
    }
    return mutate(function (next) { return addRows(next, parsed.rows); }).then(function (result) {
      res.json(Object.assign({ ok: true, errors: parsed.errors, stats: stats(state) }, result));
    });
  }

  app.get("/api/luckydraw/state", function (req, res) {
    res.json(Object.assign({
      ok: true,
      ready: readyRows(state).map(function (p) { return publicParticipant(p, state.maskName); }),
      winners: winnersOf(state).map(function (p) { return publicParticipant(p, state.maskName); }),
    }, drawPayload(state)));
  });

  app.get("/api/luckydraw/template.csv", function (req, res) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="luckydraw-template.csv"');
    res.send("\uFEFF이름,뒷번호\n홍길동,1234\n김민준,5678\n");
  });

  app.get("/api/luckydraw/admin/state", requireAdmin, function (req, res) {
    const drawn = state.participants
      .filter(function (p) { return p.prize; })
      .sort(function (a, b) {
        return b.prize - a.prize || String(a.drawnAt).localeCompare(String(b.drawnAt)) || a.id - b.id;
      });
    res.json(Object.assign({
      ok: true,
      all: state.participants.map(adminParticipant),
      drawn: drawn.map(adminParticipant),
      winners: winnersOf(state).map(adminParticipant),
    }, drawPayload(state)));
  });

  app.post("/api/luckydraw/admin/participants", requireAdmin, handle(function (req, res) {
    return addAndRespond(res, parseText(req.body && req.body.text));
  }));

  app.post(
    "/api/luckydraw/admin/participants/excel",
    requireAdmin,
    express.raw({ type: function () { return true; }, limit: "8mb" }),
    handle(function (req, res) {
      if (!req.body || !req.body.length) throw httpError(400, "엑셀 파일이 없습니다.");
      let workbook;
      try {
        workbook = readWorkbook(req.body);
      } catch (error) {
        throw httpError(400, "엑셀 파일을 읽지 못했습니다. xlsx, xls, csv 파일로 올려주세요.");
      }
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw httpError(400, "엑셀에 시트가 없습니다.");
      const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: true,
        defval: "",
      });
      return addAndRespond(res, parseSheet(grid));
    })
  );

  app.post("/api/luckydraw/admin/participants/demo", requireAdmin, handle(function (req, res) {
    const rows = DEMO_ROWS.map(function (row) { return { name: row[0], phone: row[1] }; });
    return addAndRespond(res, { rows: rows, errors: [] });
  }));

  app.post("/api/luckydraw/admin/reset", requireAdmin, handle(async function (req, res) {
    await mutate(function (next) {
      next.participants.forEach(function (p) {
        p.prize = 0;
        p.rank = 0;
        p.confirmed = false;
        p.absent = false;
        p.drawnAt = null;
      });
      resetDrawState(next);
    });
    res.json(Object.assign({ ok: true }, drawPayload(state)));
  }));

  app.post("/api/luckydraw/admin/settings", requireAdmin, handle(async function (req, res) {
    const body = req.body || {};
    if (typeof body.maskName !== "boolean") throw httpError(400, "설정 값이 올바르지 않습니다.");
    await mutate(function (next) { next.maskName = body.maskName; });
    res.json(Object.assign({ ok: true }, drawPayload(state)));
  }));

  app.post("/api/luckydraw/admin/tiers", requireAdmin, handle(async function (req, res) {
    const result = await mutate(function (next) {
      next.tiers = validateTiers(next, req.body && req.body.tiers);
      if (!drawStarted(next)) {
        next.currentPrize = firstPrize(next);
        return { advanced: null };
      }
      return { advanced: advanceIfFull(next) };
    });
    res.json(Object.assign({ ok: true }, result, drawPayload(state)));
  }));

  app.post("/api/luckydraw/admin/clear", requireAdmin, handle(async function (req, res) {
    await mutate(function (next) {
      next.participants = [];
      resetDrawState(next);
    });
    res.json(Object.assign({ ok: true }, drawPayload(state)));
  }));

  app.post("/api/luckydraw/admin/draw", requireAdmin, handle(async function (req, res) {
    const result = await mutate(function (next) {
      const tier = tierOf(next, next.currentPrize);
      if (!tier) throw httpError(409, "모든 등수 추첨이 끝났습니다.");
      const ready = readyRows(next);
      if (!ready.length) throw httpError(409, "추첨 대기 중인 참가자가 없습니다.");
      const size = drawSize(next, tier);
      if (size < 1) {
        throw httpError(409, "확정하지 않은 당첨자가 있습니다. 확정 또는 불참 처리 후 다시 추첨해 주세요.");
      }

      const drawnAt = now();
      const winners = pickRandom(ready, size);
      winners.forEach(function (winner) {
        winner.prize = tier.prize;
        winner.rank = 0;
        winner.confirmed = false;
        winner.absent = false;
        winner.drawnAt = drawnAt;
      });
      next.drawSeq += 1;
      next.lastWinnerIds = winners.map(function (winner) { return winner.id; });
      next.overlayOpen = true;
      return { prize: publicTier(tier), count: winners.length };
    });
    res.json(Object.assign({ ok: true }, result, drawPayload(state)));
  }));

  app.post("/api/luckydraw/admin/draw/confirm", requireAdmin, handle(async function (req, res) {
    const id = Number(req.body && req.body.id);
    const result = await mutate(function (next) {
      const row = next.participants.find(function (p) { return p.id === id; });
      if (!row || !row.prize) throw httpError(404, "확정할 당첨자를 찾지 못했습니다.");
      if (row.confirmed) throw httpError(409, "이미 확정된 당첨자입니다.");
      if (row.absent) throw httpError(409, "불참 처리된 당첨자입니다.");
      row.confirmed = true;
      row.rank = tierCounts(next, row.prize).confirmed;
      return { winner: adminParticipant(row), advanced: advanceIfFull(next) };
    });
    res.json(Object.assign({ ok: true }, result, drawPayload(state)));
  }));

  app.post("/api/luckydraw/admin/draw/absent", requireAdmin, handle(async function (req, res) {
    const id = Number(req.body && req.body.id);
    await mutate(function (next) {
      const row = next.participants.find(function (p) { return p.id === id; });
      if (!row || !row.prize) throw httpError(404, "불참 처리할 당첨자를 찾지 못했습니다.");
      if (row.confirmed) throw httpError(409, "이미 확정된 당첨자입니다.");
      row.absent = true;
    });
    res.json(Object.assign({ ok: true }, drawPayload(state)));
  }));

  app.post("/api/luckydraw/admin/draw/dismiss", requireAdmin, handle(async function (req, res) {
    await mutate(function (next) { next.overlayOpen = false; });
    res.json(Object.assign({ ok: true }, drawPayload(state)));
  }));

  app.post("/api/luckydraw/admin/draw/close", requireAdmin, handle(async function (req, res) {
    const result = await mutate(function (next) {
      const closed = tierOf(next, next.currentPrize);
      if (!closed) throw httpError(409, "이미 모든 등수 추첨이 끝났습니다.");
      const upcoming = nextTierAfter(next, closed.prize);
      next.currentPrize = upcoming ? upcoming.prize : 0;
      return { closed: publicTier(closed) };
    });
    res.json(Object.assign({ ok: true }, result, drawPayload(state)));
  }));
}

module.exports = { init, register };
