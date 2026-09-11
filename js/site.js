(() => {
  const segs = location.pathname.split("/").filter(Boolean);
  const file = segs[segs.length - 1] || "index.html";
  const dir = segs[segs.length - 2] || "";
  const subdirs = new Set(["festival", "program", "intro", "community", "directions"]);
  const base = subdirs.has(dir) ? "../" : "./";

  const items = [
    {
      label: "허준축제",
      href: `${base}festival/timetable.html`,
      match: "/festival/",
      children: [
        { label: "타임테이블", href: `${base}festival/timetable.html`, file: "timetable.html" },
        { label: "축제장소", href: `${base}festival/place.html`, file: "place.html" },
      ],
    },
    {
      label: "축제프로그램",
      href: `${base}program/opening.html`,
      match: "/program/",
      children: [
        { label: "개막식 & 허준콘서트", href: `${base}program/opening.html`, file: "opening.html" },
        { label: "허준 음악회", href: `${base}program/music.html`, file: "music.html" },
        { label: "강서구 문화예술단체 공연", href: `${base}program/arts.html`, file: "arts.html" },
        { label: "전시 및 체험", href: `${base}program/exhibition.html`, file: "exhibition.html" },
        { label: "참여프로그램", href: `${base}program/participate.html`, file: "participate.html" },
        { label: "기타 프로그램", href: `${base}program/other.html`, file: "other.html" },
      ],
    },
    {
      label: "인트로 축제",
      href: `${base}intro/index.html`,
      match: "/intro/",
    },
    {
      label: "커뮤니티",
      href: `${base}community/notice.html`,
      match: "/community/",
      children: [
        { label: "공지사항", href: `${base}community/notice.html`, file: "notice.html" },
        { label: "FAQ", href: `${base}community/faq.html`, file: "faq.html" },
      ],
    },
    {
      label: "오시는길",
      href: `${base}directions/index.html`,
      match: "/directions/",
    },
  ];

  const path = location.pathname;
  const fileActive = (f) => f && file === f;
  const sectionActive = (match) => match && path.includes(match);

  const navMount = document.getElementById("site-nav");
  if (navMount) {
    navMount.innerHTML = `
      <img class="page-deco page-deco--tl" src="${base}img/deco-top.png" alt="" width="34" height="294" />
      <img class="page-deco page-deco--tr" src="${base}img/deco-top.png" alt="" width="34" height="294" />
      <img class="page-deco page-deco--bl" src="${base}img/deco-bot.png" alt="" width="33" height="294" />
      <img class="page-deco page-deco--br" src="${base}img/deco-bot.png" alt="" width="33" height="294" />
      <header class="site-header">
        <a class="site-header__brand" href="${base}index.html">
          <img src="${base}img/main-logo.png" alt="제24회 허준축제" width="1506" height="574" />
        </a>
        <button class="site-header__toggle" type="button" aria-expanded="false" aria-controls="site-menu" aria-label="메뉴 열기">
          <span></span><span></span><span></span><span></span><span></span>
        </button>
        <nav class="site-header__nav" id="site-menu" aria-label="주요 메뉴">
          <ul class="site-header__list">
            ${items
              .map((item) => {
                const childActive = (item.children || []).some((c) => fileActive(c.file));
                const active = sectionActive(item.match) || childActive;
                return `
                <li class="${item.children ? "has-sub" : ""} ${active ? "is-active" : ""}">
                  <a href="${item.href}">${item.label}</a>
                  ${
                    item.children
                      ? `<ul>
                          ${item.children
                            .map(
                              (c) =>
                                `<li><a class="${fileActive(c.file) ? "is-active" : ""}" href="${c.href}">${c.label}</a></li>`
                            )
                            .join("")}
                        </ul>`
                      : ""
                  }
                </li>`;
              })
              .join("")}
          </ul>
        </nav>
        <a class="site-header__gangseo" href="${base}index.html">
          <img src="${base}img/logo.png" alt="함께 더하는 미래, 같이 나누는 강서" width="258" height="80" />
        </a>
      </header>
    `;

    const toggle = navMount.querySelector(".site-header__toggle");
    const menu = navMount.querySelector("#site-menu");
    const isMobileNav = () => window.matchMedia("(max-width: 1024px)").matches;

    const syncMenuInert = (open) => {
      if (!menu) return;
      if (isMobileNav()) {
        menu.inert = !open;
        menu.setAttribute("aria-hidden", String(!open));
      } else {
        menu.inert = false;
        menu.removeAttribute("aria-hidden");
      }
    };

    const setOpen = (open) => {
      toggle?.setAttribute("aria-expanded", String(open));
      toggle?.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
      menu?.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);
      syncMenuInert(open);
    };

    setOpen(false);
    toggle?.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    menu?.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (isMobileNav()) setOpen(false);
      });
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
    window.addEventListener("resize", () => {
      if (!isMobileNav()) {
        setOpen(false);
      } else {
        syncMenuInert(toggle?.getAttribute("aria-expanded") === "true");
      }
    });
  }

  const footerMount = document.getElementById("site-footer");
  if (footerMount) {
    footerMount.innerHTML = `
      <footer class="site-footer">
        <div class="site-footer__inner">
          <div class="site-footer__top">
            <a class="site-footer__brand" href="${base}index.html">
              <img src="${base}img/main-logo.png" alt="제24회 허준축제" width="1506" height="574" />
            </a>
            <div class="site-footer__contact">
              <p>주소 : 서울 강서구 마곡동로 161 서울식물원</p>
              <p>대표문의 : 02-2600-6455</p>
            </div>
            <img class="site-footer__logo" src="${base}img/logo-1.png" alt="강서구" width="224" height="57" />
          </div>
          <div class="site-footer__bottom">
            <div class="site-footer__links">
              <a href="#">개인정보처리방침</a>
              <a href="#">이메일무단수집거부</a>
            </div>
            <p class="site-footer__copy">© 제24회 허준축제. All rights reserved</p>
          </div>
        </div>
      </footer>
    `;
  }
})();
