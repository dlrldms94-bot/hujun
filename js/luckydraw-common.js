export function tierOf(tiers, prize) {
  const n = Number(prize);
  return (tiers || []).find((tier) => tier.prize === n) || null;
}

export function tierLabel(tiers, prize) {
  const tier = tierOf(tiers, prize);
  return tier ? tier.label : `${prize}등`;
}

export function qs(id) {
  return document.getElementById(id);
}

export async function api(path, options = {}) {
  const { body, headers, ...rest } = options;
  const isRaw = body instanceof ArrayBuffer;
  const res = await fetch(path, {
    ...rest,
    headers: {
      "Content-Type": isRaw ? "application/octet-stream" : "application/json",
      ...(headers || {}),
    },
    body: body == null ? undefined : isRaw ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || "요청에 실패했습니다.");
    error.status = res.status;
    throw error;
  }
  return data;
}

export function toast(message) {
  let el = document.getElementById("ld-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "ld-toast";
    el.className = "ld-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("is-show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("is-show"), 2400);
}
