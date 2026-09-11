# Render Node 배포 (공지·팝업 API)

허준축제는 Static Site가 아니라 **Web Service (Node) + PostgreSQL**로 올려야
공지사항·팝업 관리가 동작합니다. (사회서비스 박람회·결혼페스타와 동일)

## 1) Blueprint로 생성

1. [Blueprint 새 배포](https://dashboard.render.com/blueprints/new?repo=https%3A%2F%2Fgithub.com%2Fdlrldms94-bot%2Fhujun)
2. 저장소 `dlrldms94-bot/hujun` / branch `main` 선택
3. `render.yaml`이 **hujun-web**(Node) + **hujun-db**(Postgres) 생성
4. `ADMIN_PASSWORD`에 관리자 비밀번호 입력 후 Apply

## 2) 배포 확인

- `https://hujun-web.onrender.com/api/health` → `{"ok":true,"db":"postgres"}`
- 관리자: `https://hujun-web.onrender.com/admin/`
- 팝업: `https://hujun-web.onrender.com/admin/popup.html`
- 홈: `https://hujun-web.onrender.com/index.html`

## 3) 커스텀 도메인 (허준축제.com)

1. 새 **hujun-web** → Settings → Custom Domains  
   `xn--9y5b9p53i3tk.com` / `www.xn--9y5b9p53i3tk.com` 추가
2. DNS를 **hujun-web**의 CNAME/A 값으로 변경 (기존 Static 연결 해제)
3. 예전 Static Site `hujun`은 Suspend 또는 Delete

## 4) 로컬

```bash
npm install
npm start
# http://localhost:3000/admin/popup.html
```

`DATABASE_URL` 없으면 JSON 파일 모드로 동작합니다.
