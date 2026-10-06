import { api, qs, tierOf } from "./luckydraw-common.js";

const ITEM_HEIGHT = 120;
const COPIES = 8;
const POLL_MS = 800;

class Reel {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.offset = 0;
    this.speed = 1.6;
    this.spinning = false;
    this.raf = 0;
    this.loopHeight = 0;
  }

  setItems(items) {
    this.items = items;
    this.root.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "ld-reel-empty";
      empty.textContent = "추첨 대기 중인 참가자가 없습니다.";
      this.root.appendChild(empty);
      this.stop();
      this.offset = 0;
      this.apply();
      return;
    }
    const frag = document.createDocumentFragment();
    for (let copy = 0; copy < COPIES; copy += 1) {
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "ld-reel-item";
        const name = document.createElement("span");
        name.className = "ld-reel-name";
        name.textContent = item.name;
        const phone = document.createElement("span");
        phone.className = "ld-reel-phone";
        phone.textContent = item.phone;
        row.append(name, phone);
        frag.appendChild(row);
      });
    }
    this.root.appendChild(frag);
    this.loopHeight = items.length * ITEM_HEIGHT;
    this.offset %= this.loopHeight || 1;
    this.apply();
    this.start();
  }

  apply() {
    this.root.style.transform = `translateY(${-this.offset}px)`;
  }

  start() {
    if (this.raf) return;
    this.spinning = true;
    const tick = () => {
      if (!this.spinning) {
        this.raf = 0;
        return;
      }
      if (this.loopHeight) {
        this.offset = (this.offset + this.speed) % this.loopHeight;
        this.apply();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.spinning = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.root.classList.remove("is-spinning");
  }

  boost() {
    this.speed = 8;
    this.root.classList.add("is-spinning");
    this.start();
  }

  landOn(id) {
    return new Promise((resolve) => {
      const index = this.items.findIndex((item) => item.id === id);
      if (index < 0 || !this.loopHeight) {
        this.stop();
        resolve();
        return;
      }

      // The highlight sits on the second visible row, so park the winner one row down.
      let target = (index - 1) * ITEM_HEIGHT;
      if (target < 0) target += this.loopHeight;

      const current = this.offset % this.loopHeight;
      let dist = target - current;
      while (dist < this.loopHeight * 3) dist += this.loopHeight;

      const start = current;
      const duration = 2800;
      const t0 = performance.now();
      this.spinning = false;
      this.root.classList.add("is-spinning");

      const step = (time) => {
        const t = Math.min(1, (time - t0) / duration);
        const eased = 1 - (1 - t) ** 3;
        this.offset = start + dist * eased;
        this.apply();
        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }
        this.offset = target;
        this.apply();
        this.root.classList.remove("is-spinning");
        this.speed = 1.6;
        resolve();
      };
      requestAnimationFrame(step);
    });
  }
}

function burstConfetti() {
  const canvas = qs("confetti");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ["#ff4fa3", "#ffd84d", "#ffffff", "#5fd3ff", "#9b7bff"];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 200,
    r: 3 + Math.random() * 5,
    vx: -2 + Math.random() * 4,
    vy: 3 + Math.random() * 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI,
  }));

  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += 0.08;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    });
    frame += 1;
    if (frame < 160) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  tick();
}

function winnerRow(winner, badgeText) {
  const li = document.createElement("li");
  const badge = document.createElement("span");
  badge.className = "ld-badge";
  badge.textContent = badgeText;
  const name = document.createElement("strong");
  name.textContent = winner.name;
  const phone = document.createElement("span");
  phone.textContent = winner.phone;
  li.append(badge, name, phone);
  return li;
}

let boardKey = "";

function renderBoard(tiers, winners) {
  const key = JSON.stringify([tiers, winners]);
  if (key === boardKey) return;
  boardKey = key;

  const board = qs("board");
  board.innerHTML = "";
  const display = (tiers || []).slice().sort((a, b) => a.prize - b.prize);
  display.forEach((tier, index) => {
    const rows = winners.filter((winner) => winner.prize === tier.prize).sort((a, b) => a.rank - b.rank);
    if (!rows.length) return;

    const article = document.createElement("article");
    article.className = "ld-prize";
    const title = document.createElement("h2");
    title.textContent = `${tier.label} 당첨을 축하드립니다!`;
    article.appendChild(title);
    if (tier.item) {
      const item = document.createElement("p");
      item.className = "ld-prize__item";
      item.textContent = tier.item;
      article.appendChild(item);
    }
    const list = document.createElement("ul");
    list.className = index === 0 ? "ld-winner-list is-top" : "ld-winner-list";
    rows.forEach((winner) => list.appendChild(winnerRow(winner, winner.rank)));
    article.appendChild(list);
    board.appendChild(article);
  });
}

function setStatus(prize) {
  qs("drawStatus").textContent = prize ? `${prize.label} 추첨 중` : "추첨 완료";
}

const reel = new Reel(qs("reel"));
let busy = false;
let cancelPlay = false;
let lastSeenSeq = 0;
let readyKey = "";
let latestTiers = [];

function showWinners(winners) {
  if (!winners.length) return;
  const tier = tierOf(latestTiers, winners[0].prize);
  qs("overlayRank").textContent = `${tier ? tier.label : "당첨"} 당첨을 축하드립니다!`;
  qs("overlayItem").textContent = tier && tier.item ? tier.item : "";
  qs("overlayItem").hidden = !(tier && tier.item);
  const list = qs("overlayWinners");
  list.innerHTML = "";
  list.classList.toggle("is-multi", winners.length > 3);
  list.classList.toggle("is-many", winners.length > 8);
  winners.forEach((winner, index) => list.appendChild(winnerRow(winner, index + 1)));
  qs("overlay").classList.add("is-open");
  burstConfetti();
}

function hideWinner() {
  qs("overlay").classList.remove("is-open");
}

function applyState(data, resetReel) {
  latestTiers = data.tiers || [];
  setStatus(data.currentPrize);
  renderBoard(latestTiers, data.winners || []);
  const nextKey = (data.ready || []).map((row) => `${row.id}:${row.name}`).join(",");
  if (resetReel || nextKey !== readyKey) {
    readyKey = nextKey;
    reel.setItems(data.ready || []);
  }
}

async function playWinners(winners) {
  hideWinner();
  cancelPlay = false;
  busy = true;
  reel.boost();
  try {
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (cancelPlay) return;
    await reel.landOn(winners[winners.length - 1].id);
    if (cancelPlay) return;
    showWinners(winners);
  } finally {
    busy = false;
  }
}

async function poll() {
  const data = await api("/api/luckydraw/state");
  const incoming = Number(data.drawSeq || 0);
  if (!data.overlayOpen) {
    cancelPlay = true;
    if (qs("overlay").classList.contains("is-open")) {
      hideWinner();
      applyState(data, true);
    } else if (!busy) {
      applyState(data, false);
    }
    lastSeenSeq = incoming;
    return;
  }
  if (busy) return;
  const winners = data.lastWinners || [];
  if (incoming > lastSeenSeq && winners.length) {
    lastSeenSeq = incoming;
    latestTiers = data.tiers || [];
    setStatus(data.currentPrize);
    renderBoard(latestTiers, data.winners || []);
    await playWinners(winners);
    return;
  }
  lastSeenSeq = incoming;
  applyState(data, false);
}

async function start() {
  const data = await api("/api/luckydraw/state");
  lastSeenSeq = Number(data.drawSeq || 0);
  applyState(data, true);
  if (data.overlayOpen && (data.lastWinners || []).length) showWinners(data.lastWinners);
  setInterval(() => {
    poll().catch((error) => console.error(error));
  }, POLL_MS);
}

start().catch((error) => console.error(error));
