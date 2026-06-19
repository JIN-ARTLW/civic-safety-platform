# 시민 참여형 스마트시티 안전 플랫폼 (Civic Safety Platform) — MVP

사진 한 장으로 도시 위험을 신고하면 AI가 자동 분류·관할 지자체로 라우팅하고, 담당자가 관제 대시보드에서 처리하는 멀티테넌트 웹 서비스. (Spec-Kit 기반 설계 → `specs/001-civic-safety-platform/`)

## 포트 / 도메인

| 구성 | 값 |
|------|-----|
| Front-end | `:9503` |
| Back-end (API) | `:9523` |
| 도메인 | `p3.sumzip.com` |

## 실행

```bash
# 백엔드 + 프론트 동시 실행
npm start
# 또는 개별
npm run start:api   # node apps/api/server.mjs  (:9523)
npm run start:web   # node apps/web/server.mjs  (:9503)
npm run stop        # 종료
```

- 시민 신고: http://localhost:9503/  (또는 http://p3.sumzip.com/)
- 관제 대시보드: http://localhost:9503/officer
- API 헬스: http://localhost:9523/v1/health

의존성 설치 불필요 — Node 내장 모듈만 사용 (Node ≥ 18).

## 도메인 접근 (p3.sumzip.com)

서버는 `0.0.0.0`에 바인딩되어 도메인 접근을 지원합니다. DNS A 레코드를 서버 IP로 지정한 뒤, 리버스 프록시로 `/`→9503, `/v1/*`→9523 라우팅:

```bash
# Caddy (자동 HTTPS)
caddy run --config deploy/Caddyfile

# 또는 nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/p3.sumzip.com
sudo ln -s /etc/nginx/sites-available/p3.sumzip.com /etc/nginx/sites-enabled/
sudo nginx -s reload
sudo certbot --nginx -d p3.sumzip.com   # HTTPS
```

프록시 없이 포트 직접 접근도 가능: `http://p3.sumzip.com:9503` (FE), `http://p3.sumzip.com:9523/v1/health` (BE) — 방화벽에서 두 포트 개방 필요.

## 구조 (3대 요소)

```text
apps/
├── api/                 # 백엔드(Back-end) + 도메인(Domain)
│   ├── domain.mjs       # 도메인: 엔티티·상태전이·테넌트·관할 라우팅·중복 규칙
│   ├── ai.mjs           # AI 파이프라인(비식별/분류/RAG/공문서) — 동작 스텁
│   ├── store.mjs        # 저장(JSON 파일, 테넌트 격리)
│   └── server.mjs       # HTTP API (:9523)
└── web/                 # 프론트엔드(Front-end)
    ├── server.mjs       # 정적 서버 (:9503)
    └── public/
        ├── index.html   # 시민용 (Intercom 테마 — 친근한 블루)
        ├── officer.html # 관제 대시보드 (IBM Carbon 테마 — 구조적 블루)
        └── styles.css   # 공통 디자인 토큰

deploy/                  # p3.sumzip.com 리버스 프록시 (Caddy/nginx)
specs/001-civic-safety-platform/   # Spec-Kit 산출물 (spec/plan/tasks/...)
```

## 구현된 기능 (MVP)

- **US1 시민 신고**: 사진+위치 → 자동 분류·신뢰도, 저신뢰 시 후보 제시, 비식별 처리, 관할 라우팅, 중복 묶음, 접수번호 발급, 상태 조회
- **US2 관제**: 테넌트 격리 목록(우선순위·묶음), 상태 전이(검증), 처리 이력, 공문서 초안 자동 생성
- **US3 대화형 안내**: 접수번호 진행 상황 근거 기반 안내, 근거 없으면 담당 창구 안내
- **US4 신뢰도·보상**: 중복 묶음, 로그인 신고 보상 적립(신고당 1회), 무효 처리

> AI(분류/비식별/RAG)는 결정론적 휴리스틱 **스텁**이며 동일 인터페이스로 실제 모델 교체 가능. 데이터는 파일 스토어(추후 Supabase/RLS 전환). 자세한 상태는 `specs/001-civic-safety-platform/tasks.md`의 *Implementation Status* 참조.
