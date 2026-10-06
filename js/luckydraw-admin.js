import { api, qs, toast, tierOf, tierLabel } from "./luckydraw-common.js";

const TOKEN_KEY = "adminToken";
const TIER_MAX = 10;
const MODE_LABEL = { single: "한 명씩", batch: "한 번에" };

let allRows = [];
let drawnRows = [];
let winnerRows = [];
let tiers = [];
let tierDraft = [];
let tierDirty = false;
let tiersLocked = false;
let currentPrizeNo = 0;

function adminApi(path, options = {}) {
  return api(path, {
    ...options,
    headers: { Authorization: "Bearer " + sessionStorage.getItem(TOKEN_KEY) },
  }).catch((error) => {
    if (error.status === 401) showLogin();
    throw error;
  });
}

function showLogin() {
  sessionStorage.removeItem(TOKEN_KEY);
  qs("admin-dashboard").hidden = true;
  qs("admin-login").hidden = false;
}

function showDashboard() {
  qs("admin-login").hidden = true;
  qs("admin-dashboard").hidden = false;
  load().catch((error) => toast(error.message));
}

function emptyRow(body, cols, text) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = cols;
  td.className = "is-muted";
  td.textContent = text;
  tr.appendChild(td);
  body.appendChild(tr);
}

function tag(text, tone) {
  const span = document.createElement("span");
  span.className = tone ? `ld-tag is-${tone}` : "ld-tag";
  span.textContent = text;
  return span;
}

function rowWithCells(count) {
  const tr = document.createElement("tr");
  for (let i = 0; i < count; i += 1) tr.appendChild(document.createElement("td"));
  return tr;
}

function smallButton(text, action, id, variant) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `admin-btn admin-btn--${variant}`;
  btn.textContent = text;
  btn.dataset.action = action;
  btn.dataset.id = String(id);
  return btn;
}

function statusTag(row) {
  const label = tierLabel(tiers, row.prize);
  if (row.confirmed) return tag(label);
  if (row.absent) return tag(`${label} 불참`, "absent");
  return tag(`${label} 미확정`, "wait");
}

/* ——— 등수 설정 ——— */

function setTierDirty(value) {
  tierDirty = value;
  qs("tierDirty").hidden = !value;
}

function tierInput(type, value, field, index, attrs = {}) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.className = "ld-input";
  input.dataset.field = field;
  input.dataset.index = String(index);
  Object.entries(attrs).forEach(([key, val]) => input.setAttribute(key, val));
  return input;
}

function renderTiers() {
  const body = qs("tierBody");
  body.innerHTML = "";
  qs("tierLockNote").hidden = !tiersLocked;
  qs("addTierBtn").disabled = tiersLocked || tierDraft.length >= TIER_MAX;

  tierDraft.forEach((tier, index) => {
    const tr = rowWithCells(6);
    const cells = tr.children;

    const number = tierInput("text", String(tierDraft.length - index), "number", index, { disabled: "" });
    number.classList.add("is-number");
    cells[0].appendChild(number);

    cells[1].appendChild(tierInput("text", tier.label, "label", index, { maxlength: "20" }));
    cells[2].appendChild(
      tierInput("number", String(tier.quota), "quota", index, { min: "0", max: "999", step: "1" })
    );

    const select = document.createElement("select");
    select.className = "ld-input";
    select.dataset.field = "mode";
    select.dataset.index = String(index);
    Object.entries(MODE_LABEL).forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      option.selected = tier.mode === value;
      select.appendChild(option);
    });
    cells[3].appendChild(select);

    cells[4].appendChild(
      tierInput("text", tier.item, "item", index, { maxlength: "40", placeholder: "상품명(선택)" })
    );

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ld-icon-btn";
    remove.dataset.remove = String(index);
    remove.setAttribute("aria-label", `${tier.label} 삭제`);
    remove.textContent = "삭제";
    remove.disabled = tiersLocked || tierDraft.length <= 1;
    cells[5].appendChild(remove);

    body.appendChild(tr);
  });
}

function syncTiers(data) {
  tiers = data.tiers || [];
  tiersLocked = Boolean(data.locked);
  qs("maskName").checked = data.maskName !== false;
  if (tierDirty) {
    qs("tierLockNote").hidden = !tiersLocked;
    qs("addTierBtn").disabled = tiersLocked || tierDraft.length >= TIER_MAX;
    return;
  }
  tierDraft = tiers.map((tier) => ({ label: tier.label, quota: tier.quota, item: tier.item, mode: tier.mode }));
  renderTiers();
}

/* ——— 추첨 진행 ——— */

function setDrawControls(data) {
  const prize = data.currentPrize;
  const stats = data.stats;
  const count = data.nextDrawCount || 0;
  currentPrizeNo = prize ? prize.prize : 0;
  qs("statTotal").textContent = stats.total;
  qs("statReady").textContent = stats.remaining;
  qs("statWin").textContent = stats.winners;

  if (!prize) {
    qs("drawNow").textContent = "추첨 완료";
    qs("drawSub").textContent = `추첨 대기 ${stats.remaining}명`;
    qs("drawHelp").textContent = "모든 등수 추첨이 끝났습니다. 다시 하려면 당첨 초기화를 눌러 주세요.";
    qs("drawBtn").textContent = "추첨하기";
  } else {
    const confirmed = data.currentCount || 0;
    qs("drawNow").textContent = prize.quota
      ? `${prize.label} · ${prize.quota}명 중 ${confirmed}명 당첨`
      : `${prize.label} · ${confirmed}명 당첨 (인원 제한 없음)`;
    qs("drawSub").textContent =
      `추첨 대기 ${stats.remaining}명 (이미 뽑힌 사람 제외)` + (prize.item ? ` · 상품: ${prize.item}` : "");

    const idx = tiers.findIndex((tier) => tier.prize === prize.prize);
    const next = idx >= 0 ? tiers[idx + 1] : null;
    const nextText = next ? `다음은 ${next.label}입니다.` : "마지막 등수입니다.";
    const modeText = prize.mode === "batch" ? "남은 정원을 한 번에 뽑습니다." : "한 명씩 뽑습니다.";
    let nowText;
    if (count > 0) nowText = `이번에 ${count}명을 추첨합니다.`;
    else if (!stats.remaining) nowText = "추첨 대기 중인 참가자가 없습니다.";
    else nowText = "확정하지 않은 당첨자가 있습니다. 확정 또는 불참 처리 후 추첨할 수 있습니다.";
    const advanceText = prize.quota
      ? "정원이 모두 확정되면 자동으로 넘어갑니다."
      : "인원 제한이 없어 등수 마감을 눌러야 넘어갑니다.";
    qs("drawHelp").textContent = `${modeText} ${nowText} ${advanceText} ${nextText}`;
    qs("drawBtn").textContent = count > 1 ? `${prize.label} ${count}명 추첨하기` : `${prize.label} 추첨하기`;
  }

  qs("drawBtn").disabled = !prize || count < 1;
  qs("dismissBtn").disabled = !data.overlayOpen;
  qs("closePrizeBtn").disabled = !prize;
}

function renderTable() {
  const body = qs("tableBody");
  const q = qs("search").value.trim();
  const rows = allRows.filter((row) => !q || `${row.name} ${row.phoneFull}`.includes(q));
  body.innerHTML = "";
  if (!rows.length) {
    emptyRow(body, 4, "참가자가 없습니다.");
    return;
  }
  rows.forEach((row) => {
    const tr = rowWithCells(4);
    const cells = tr.children;
    cells[0].textContent = row.name;
    cells[1].textContent = row.phoneFull;
    cells[2].appendChild(row.prize ? statusTag(row) : tag("대기", "wait"));
    cells[3].textContent = row.drawnAt || "-";
    body.appendChild(tr);
  });
}

function renderDrawn(currentPrize) {
  const body = qs("drawnBody");
  const prizeNo = currentPrize && currentPrize.prize;
  const rows = drawnRows.filter((row) => !prizeNo || row.prize === prizeNo);
  body.innerHTML = "";
  if (!rows.length) {
    emptyRow(body, 4, "아직 뽑힌 사람이 없습니다.");
    return;
  }
  rows.forEach((row) => {
    const tr = rowWithCells(4);
    const cells = tr.children;
    cells[0].textContent = row.name;
    cells[1].textContent = row.phoneFull;
    cells[2].appendChild(
      row.confirmed ? tag("확정") : row.absent ? tag("불참", "absent") : tag("미확정", "wait")
    );
    if (row.confirmed || row.absent) {
      cells[3].textContent = "-";
    } else {
      cells[3].className = "ld-row-actions";
      cells[3].append(
        smallButton("확정", "confirm", row.id, "primary"),
        smallButton("불참", "absent", row.id, "ghost")
      );
    }
    body.appendChild(tr);
  });
}

async function load() {
  const data = await adminApi("/api/luckydraw/admin/state");
  allRows = data.all || [];
  drawnRows = data.drawn || [];
  winnerRows = data.winners || [];
  syncTiers(data);
  setDrawControls(data);
  renderDrawn(data.currentPrize);
  renderTable();
}

function addedMessage(data) {
  const extra = data.errors && data.errors.length ? ` / 형식 오류 ${data.errors.length}건` : "";
  return `${data.added}명 등록, 중복 ${data.skipped}명 건너뜀${extra}`;
}

async function run(button, task) {
  if (button) button.disabled = true;
  try {
    await task();
  } catch (error) {
    if (error.status !== 401) toast(error.message);
  } finally {
    if (button) button.disabled = false;
    await load().catch(() => {});
  }
}

function advancedMessage(advanced) {
  if (!advanced) return "";
  return advanced.current
    ? ` ${advanced.closed.label} 정원이 찼습니다. 이제 ${advanced.current.label} 차례입니다.`
    : ` ${advanced.closed.label} 정원이 찼습니다. 모든 추첨이 끝났습니다.`;
}

function downloadCsv() {
  const escape = (value) => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
  const lines = [["등수", "순번", "이름", "연락처", "상품", "추첨시각"].join(",")];
  winnerRows.forEach((row) => {
    const tier = tierOf(tiers, row.prize);
    lines.push(
      [tierLabel(tiers, row.prize), row.rank, row.name, row.phoneFull, tier ? tier.item : "", row.drawnAt || ""]
        .map(escape)
        .join(",")
    );
  });
  const blob = new Blob(["\uFEFF" + lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "luckydraw-winners.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

qs("admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = qs("admin-login-error");
  errorEl.hidden = true;
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: { password: qs("admin-password").value },
    });
    sessionStorage.setItem(TOKEN_KEY, data.token);
    qs("admin-password").value = "";
    showDashboard();
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.hidden = false;
  }
});

qs("admin-logout").addEventListener("click", showLogin);

qs("maskName").addEventListener("change", (event) => {
  const checked = event.currentTarget.checked;
  run(event.currentTarget, async () => {
    await adminApi("/api/luckydraw/admin/settings", { method: "POST", body: { maskName: checked } });
    toast(checked ? "추첨 화면에서 이름을 가립니다." : "추첨 화면에 이름 전체를 보여줍니다.");
  });
});

qs("tierBody").addEventListener("input", (event) => {
  const el = event.target;
  const index = Number(el.dataset.index);
  const field = el.dataset.field;
  if (!tierDraft[index] || !field || field === "number") return;
  tierDraft[index][field] = el.value;
  setTierDirty(true);
});

qs("tierBody").addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-remove]");
  if (!btn || tiersLocked) return;
  tierDraft.splice(Number(btn.dataset.remove), 1);
  setTierDirty(true);
  renderTiers();
});

qs("addTierBtn").addEventListener("click", () => {
  if (tiersLocked || tierDraft.length >= TIER_MAX) return;
  const prize = tierDraft.length + 1;
  tierDraft.unshift({ label: `${prize}등`, quota: 1, item: "", mode: "single" });
  setTierDirty(true);
  renderTiers();
});

qs("saveTiersBtn").addEventListener("click", (event) => {
  const payload = tierDraft.map((tier) => ({
    label: String(tier.label).trim(),
    quota: tier.quota === "" ? NaN : Number(tier.quota),
    item: String(tier.item || "").trim(),
    mode: tier.mode,
  }));
  const invalid = payload.find((tier) => !Number.isInteger(tier.quota) || tier.quota < 0);
  if (invalid) {
    toast(`${invalid.label || "등수"}: 인원은 0 이상의 숫자로 입력해 주세요.`);
    return;
  }
  run(event.currentTarget, async () => {
    const data = await adminApi("/api/luckydraw/admin/tiers", { method: "POST", body: { tiers: payload } });
    setTierDirty(false);
    toast("등수 설정을 저장했습니다." + advancedMessage(data.advanced));
  });
});

qs("addForm").addEventListener("submit", (event) => {
  event.preventDefault();
  run(null, async () => {
    const data = await adminApi("/api/luckydraw/admin/participants", {
      method: "POST",
      body: { text: qs("userText").value },
    });
    toast(addedMessage(data));
    if (data.added) qs("userText").value = "";
  });
});

qs("excelFile").addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  run(null, async () => {
    toast("엑셀 파일을 읽는 중입니다…");
    const data = await adminApi("/api/luckydraw/admin/participants/excel", {
      method: "POST",
      body: await file.arrayBuffer(),
    });
    toast(addedMessage(data));
  }).finally(() => {
    event.target.value = "";
  });
});

qs("demoBtn").addEventListener("click", (event) => {
  run(event.currentTarget, async () => {
    const data = await adminApi("/api/luckydraw/admin/participants/demo", { method: "POST", body: {} });
    toast(`데모 참가자 ${data.added}명 등록`);
  });
});

qs("drawBtn").addEventListener("click", (event) => {
  run(event.currentTarget, async () => {
    const data = await adminApi("/api/luckydraw/admin/draw", { method: "POST", body: {} });
    toast(`${data.prize.label} ${data.count}명을 추첨했습니다. 큰 화면을 확인해 주세요.`);
  });
});

qs("drawnBody").addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (btn.dataset.action === "absent") {
    if (!confirm("불참 처리할까요? 이 사람은 명단에 오르지 않고, 빈 자리는 다시 추첨할 수 있습니다.")) return;
    run(btn, async () => {
      await adminApi("/api/luckydraw/admin/draw/absent", { method: "POST", body: { id } });
      toast("불참 처리했습니다.");
    });
    return;
  }
  run(btn, async () => {
    const data = await adminApi("/api/luckydraw/admin/draw/confirm", { method: "POST", body: { id } });
    toast("확정했습니다. 추첨 화면 명단에 올라갑니다." + advancedMessage(data.advanced));
  });
});

qs("dismissBtn").addEventListener("click", (event) => {
  run(event.currentTarget, async () => {
    await adminApi("/api/luckydraw/admin/draw/dismiss", { method: "POST", body: {} });
    toast("큰 화면 당첨 창을 닫았습니다.");
  });
});

qs("closePrizeBtn").addEventListener("click", (event) => {
  const pending = drawnRows.some((row) => !row.confirmed && !row.absent && row.prize === currentPrizeNo);
  const label = tierLabel(tiers, currentPrizeNo);
  const warn = pending ? "\n확정하지 않은 당첨자는 명단에 오르지 않습니다." : "";
  if (!confirm(`${label} 추첨을 마감할까요?${warn}`)) return;
  run(event.currentTarget, async () => {
    const data = await adminApi("/api/luckydraw/admin/draw/close", { method: "POST", body: {} });
    toast(
      data.currentPrize
        ? `${data.closed.label}을 마감했습니다. 이제 ${data.currentPrize.label} 차례입니다.`
        : `${data.closed.label}을 마감했습니다. 모든 추첨이 끝났습니다.`
    );
  });
});

qs("resetBtn").addEventListener("click", (event) => {
  if (!confirm("모든 당첨 정보를 초기화할까요? 참가자 명단과 등수 설정은 유지됩니다.")) return;
  run(event.currentTarget, async () => {
    await adminApi("/api/luckydraw/admin/reset", { method: "POST", body: {} });
    toast("당첨 정보가 초기화되었습니다.");
  });
});

qs("clearBtn").addEventListener("click", (event) => {
  if (!confirm("참가자를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
  run(event.currentTarget, async () => {
    await adminApi("/api/luckydraw/admin/clear", { method: "POST", body: {} });
    toast("참가자를 모두 삭제했습니다.");
  });
});

qs("csvBtn").addEventListener("click", downloadCsv);
qs("search").addEventListener("input", renderTable);

if (sessionStorage.getItem(TOKEN_KEY)) showDashboard();
else showLogin();
