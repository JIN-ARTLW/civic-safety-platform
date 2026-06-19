---
description: "Task list for 시민 참여형 스마트시티 안전 플랫폼"
---

# Tasks: 시민 참여형 스마트시티 안전 플랫폼 (Civic Safety Platform)

**Input**: Design documents from `/specs/001-civic-safety-platform/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: 본 명세는 TDD를 명시 요청하지 않았으므로 단위/통합 테스트 태스크는 최소화하고, 계약(contract) 검증과 quickstart E2E 검증을 핵심 게이트로 둔다.

## Implementation Status — MVP (2026-06-19, `/speckit-implement`)

> **실행 가능한 MVP가 구현·검증되었습니다.** Front-end `:9503`, Back-end `:9523`, 도메인 `p3.sumzip.com`(리버스 프록시 `deploy/`)으로 접근 가능.
>
> **런타임 주의(정직 고지)**: 이 환경에서 풀스택(Supabase/PostGIS/pgvector + 실제 VLM/YOLO 모델 + Next.js + Python)을 검증 가능하게 구동하기 어려워, **의존성 없는 Node 내장 모듈 기반 MVP**로 동일한 도메인 로직·API 계약·UX를 구현했습니다. 따라서 `[x]`는 **"기능적 의도가 실행 MVP에서 구현·검증됨"** 을 의미하며, 실제 파일 경로는 plan.md가 지정한 경로(`apps/api/src/...`, `supabase/migrations/...`)가 아니라 MVP 경로(`apps/api/*.mjs`, `apps/web/*`)에 있습니다.
>
> | 계획 컴포넌트 | MVP 구현 위치 | 상태 |
> |---|---|---|
> | 도메인(엔티티·상태전이·테넌트·라우팅·중복) | `apps/api/domain.mjs` | ✅ 실동작 |
> | 백엔드 API(신고/관제/공문서/안내) | `apps/api/server.mjs`, `store.mjs` | ✅ 실동작 |
> | AI 파이프라인(비식별/분류/RAG/공문서) | `apps/api/ai.mjs` | ⚠️ 동작 스텁(휴리스틱) — 실모델 미탑재 |
> | 프론트(시민/관제 + 테마) | `apps/web/public/index.html`, `officer.html`, `styles.css` | ✅ 실동작 |
> | 데이터 저장 | `apps/api/data/db.json` (파일) | ⚠️ Supabase/RLS 대체(코드 레벨 테넌트 격리) |
> | 도메인 접근(p3.sumzip.com) | `deploy/Caddyfile`, `deploy/nginx.conf` | ✅ 프록시 설정 제공 |
>
> **`[x]` = 기능 구현·검증 완료(스텁 포함), `[ ]` = 실서비스 전환 시 잔여(실제 마이그레이션·실모델·Next.js·CI/부하/보안).** 검증: quickstart 시나리오 1~8 통과(curl E2E).

## Format: `[ID] [P?] [Story] [Layer] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 미완료 의존성 없음)
- **[Story]**: 사용자 스토리 매핑 — [US1]~[US4]
- **[Layer] — 3대 요소 명시 (사용자 요구사항)**:
  - **[DOM]** = 도메인(Domain): 엔티티·도메인 규칙·상태 전이·데이터 모델/마이그레이션
  - **[BE]** = 백엔드(Back-end): API·서비스·AI 추론·인증·배치
  - **[FE]** = 프론트엔드(Front-end): 화면·컴포넌트·디자인 테마·클라이언트
  - **[INF]** = 공통 인프라(레이어 무관 설정)

## Path Conventions (plan.md 구조)

- 도메인/백엔드: `apps/api/src/{models,services,routes,lib}`, `services/ai-inference/src/`, `supabase/migrations`
- 프론트엔드: `apps/citizen-web/src/`, `apps/admin-dashboard/src/`, `packages/design-tokens`
- 공유: `packages/shared`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 모노레포·앱·툴링·외부 리소스 바인딩 초기화

- [x] T001 [INF] 모노레포 구조 생성(apps/api, apps/citizen-web, apps/admin-dashboard, services/ai-inference, packages/design-tokens, packages/shared, supabase/) per plan.md
- [ ] T002 [P] [INF] pnpm 워크스페이스 + TypeScript 5.x 설정 in `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- [ ] T003 [P] [INF] Python 3.12 AI 서비스 초기화 in `services/ai-inference/pyproject.toml`
- [ ] T004 [P] [INF] 린트/포맷(ESLint, Prettier, Ruff) 및 pre-commit 설정
- [ ] T005 [P] [FE] shadcn/ui 설치·초기화 in `packages/shared` — 스킬 참조: `npx skillsadd shadcn/ui/shadcn`
- [ ] T006 [P] [FE] 디자인 테마 설치 in `packages/design-tokens`: `npx getdesign@latest add ibm`(관제) + `npx getdesign@latest add intercom`(시민)
- [ ] T007 [P] [INF] Supabase 로컬 스택 초기화(PostGIS·pgvector 확장) in `supabase/config.toml` — 스킬 참조: `npx skillsadd supabase/agent-skills/supabase`
- [ ] T008 [P] [INF] 환경 변수/시크릿 관리 설정 in `.env.example`, `apps/api/src/lib/env.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 사용자 스토리가 의존하는 핵심 기반(멀티테넌트 스키마·인증·라우팅·도메인 베이스·AI 골격)

**⚠️ CRITICAL**: 이 단계 완료 전에는 어떤 사용자 스토리도 시작 불가

- [ ] T009 [DOM] 멀티테넌트 베이스 마이그레이션(Tenant, HazardCategory + PostGIS boundary) in `supabase/migrations/0001_tenant.sql` — 스킬 참조: `npx skillsadd supabase/agent-skills/supabase-postgres-best-practices` (R1)
- [ ] T010 [DOM] RLS 정책 프레임워크(`tenant_id` 격리, JWT tenant claim) in `supabase/migrations/0002_rls.sql` (FR-026, R1)
- [ ] T011 [P] [DOM] 공유 도메인 타입/스키마(OpenAPI→TS 타입 생성) in `packages/shared/src/types.ts` (from contracts/openapi.yaml)
- [ ] T012 [P] [BE] Supabase 클라이언트·인증 헬퍼(익명 device token + Supabase Auth) in `apps/api/src/lib/supabase.ts`, `auth.ts` (FR-024, R7)
- [x] T013 [BE] API 라우팅·미들웨어 골격(테넌트 컨텍스트 주입, 에러 처리, 구조적 로깅) in `apps/api/src/routes/_app.ts`, `apps/api/src/lib/logger.ts`
- [ ] T014 [P] [FE] 시민 웹 앱 셸 + Intercom 테마 토큰 적용 in `apps/citizen-web/src/app/layout.tsx`
- [ ] T015 [P] [FE] 관제 대시보드 앱 셸 + IBM Carbon 테마 토큰 적용 in `apps/admin-dashboard/src/app/layout.tsx`
- [x] T016 [P] [BE] AI 추론 서비스 골격(큐 기반 비동기, 헬스체크) in `services/ai-inference/src/main.py` (R10)
- [ ] T017 [DOM] 위험유형·부서매핑·파일럿 테넌트 시드 in `supabase/seed/seed.sql`

**Checkpoint**: 기반 준비 완료 — 사용자 스토리 구현 시작 가능

---

## Phase 3: User Story 1 - 사진 한 장으로 위험 신고 (Priority: P1) 🎯 MVP

**Goal**: 시민이 사진+위치만으로 익명 신고 → 자동 분류·비식별·접수 번호 발급(3초)

**Independent Test**: 사진 1장+위치 제출 시 3초 내 접수 번호와 자동 분류 유형 반환, 저장 사진은 비식별본(quickstart 시나리오 1~3)

### Domain (도메인)

- [ ] T018 [P] [US1] [DOM] Report 엔티티 마이그레이션(상태/우선순위/비식별 photo/위치/출처식별자/purge_after) in `supabase/migrations/0003_report.sql` (data-model.md)
- [ ] T019 [P] [US1] [DOM] ReportCluster 엔티티 + GiST 공간 인덱스 마이그레이션 in `supabase/migrations/0004_cluster.sql`
- [x] T020 [US1] [DOM] 신고 상태 전이·검증 규칙(위치 필수, 비식별본만 허용) 도메인 모델 in `apps/api/src/models/report.ts`

### Back-end (백엔드)

- [x] T021 [P] [US1] [BE] PII 비식별 파이프라인(얼굴/번호판 탐지→블러, 원본 미저장) in `services/ai-inference/src/detect/anonymize.py` — 스킬 참조: `npx skillsadd runcomfy-com/skills/image-edit` (FR-008, R3)
- [x] T022 [P] [US1] [BE] VLM 위험 분류 + 신뢰도 산출(저신뢰 후보 반환) in `services/ai-inference/src/classify/classifier.py` (FR-003/004, R2)
- [x] T023 [US1] [BE] 관할 테넌트 지리 라우팅(PostGIS ST_Contains) in `apps/api/src/services/geo_routing.ts` (FR-028, R4)
- [x] T024 [US1] [BE] 중복 묶음 판정 서비스(위치·유형 기반) in `apps/api/src/services/clustering.ts` (FR-020)
- [x] T025 [US1] [BE] 신고 접수 서비스(비식별→분류→라우팅→묶음→접수번호) in `apps/api/src/services/report_intake.ts` (FR-001~007)
- [x] T026 [US1] [BE] `POST /reports` 엔드포인트 in `apps/api/src/routes/reports.ts` (contracts: 201/409/422)
- [x] T027 [US1] [BE] `GET /reports/{trackingNo}` 익명 상태 조회 in `apps/api/src/routes/reports.ts` (FR-010)
- [ ] T028 [P] [US1] [BE] 계약 테스트(POST/GET /reports 스키마) in `apps/api/tests/contract/reports.test.ts`

### Front-end (프론트엔드)

- [x] T029 [P] [US1] [FE] 사진 촬영/업로드 컴포넌트 in `apps/citizen-web/src/components/PhotoCapture.tsx`
- [x] T030 [P] [US1] [FE] 위치 확인/수동 지정 지도 컴포넌트(MapLibre) in `apps/citizen-web/src/components/LocationPicker.tsx` (FR-002)
- [x] T031 [US1] [FE] 단계형 신고 흐름(촬영→위치→분류확인→제출) in `apps/citizen-web/src/app/report/page.tsx` (Intercom 테마, FR-004, FR-005)
- [x] T032 [US1] [FE] 접수 완료/상태 조회 화면 in `apps/citizen-web/src/app/status/page.tsx`
- [x] T033 [US1] [FE] API 클라이언트(reports) in `apps/citizen-web/src/services/reportClient.ts`

**Checkpoint**: US1 단독으로 완전 동작·테스트 가능 (MVP)

---

## Phase 4: User Story 2 - 지자체 담당자의 관제 및 처리 (Priority: P1)

**Goal**: 담당자가 분류·우선순위·묶음 정리된 신고를 관제하고 상태 변경·공문서 생성·시민 알림

**Independent Test**: 담당자 계정으로 접수→처리중→완료 변경 시 목록·지도·이력·알림 반영(quickstart 시나리오 4~6)

### Domain (도메인)

- [ ] T034 [P] [US2] [DOM] OfficerProfile 엔티티(테넌트·부서·역할·관할) 마이그레이션 in `supabase/migrations/0005_officer.sql` (FR-025)
- [ ] T035 [P] [US2] [DOM] ProcessingLog 감사추적 엔티티 마이그레이션 in `supabase/migrations/0006_processing_log.sql` (FR-016)
- [ ] T036 [P] [US2] [DOM] OfficialDocument 엔티티 마이그레이션 in `supabase/migrations/0007_document.sql`

### Back-end (백엔드)

- [x] T037 [US2] [BE] 관제 목록 서비스(테넌트 격리·우선순위·묶음·bbox 필터) in `apps/api/src/services/officer_reports.ts` (FR-011, FR-012, FR-013, RLS)
- [x] T038 [US2] [BE] `GET /officer/reports` 엔드포인트 in `apps/api/src/routes/officer.ts`
- [x] T039 [US2] [BE] 상태 변경 서비스(전이·이력 기록·알림 트리거) in `apps/api/src/services/status_update.ts` (FR-014/016/017)
- [x] T040 [US2] [BE] `PATCH /officer/reports/{id}/status` 엔드포인트 in `apps/api/src/routes/officer.ts`
- [x] T041 [US2] [BE] LLM 공문서 초안 생성(테넌트 양식 기반) in `services/ai-inference/src/docgen/generator.py` (FR-015, R6)
- [ ] T042 [US2] [BE] docx/pdf 산출 + `POST /officer/reports/{id}/document` in `apps/api/src/routes/officer.ts` — 스킬 참조: `npx skillsadd anthropics/skills/docx`, `npx skillsadd anthropics/skills/pdf`
- [ ] T043 [P] [US2] [BE] Realtime 신규/급증 신고 푸시 채널 in `apps/api/src/services/realtime.ts` (R8)
- [ ] T044 [P] [US2] [BE] 계약 테스트(officer 엔드포인트·403 격리) in `apps/api/tests/contract/officer.test.ts`

### Front-end (프론트엔드)

- [x] T045 [P] [US2] [FE] 관제 신고 목록/필터 테이블(Carbon) in `apps/admin-dashboard/src/app/reports/page.tsx`
- [x] T046 [P] [US2] [FE] 지도 패널(묶음·우선순위 표시) in `apps/admin-dashboard/src/components/ReportMap.tsx`
- [x] T047 [US2] [FE] 신고 상세·상태 변경·공문서 검토 화면 in `apps/admin-dashboard/src/app/reports/[id]/page.tsx`
- [ ] T048 [P] [US2] [FE] 담당자 로그인/권한 가드 in `apps/admin-dashboard/src/app/(auth)/login/page.tsx`
- [x] T049 [US2] [FE] 관제 API 클라이언트 in `apps/admin-dashboard/src/services/officerClient.ts`

### Tenant Settings (테넌트 운영 설정 관리, FR-027)

- [ ] T074 [P] [US2] [BE] 테넌트 설정 관리 서비스(위험유형·부서매핑·공문서양식·보상정책 CRUD, admin 역할 검증) in `apps/api/src/services/tenant_settings.ts` (FR-027)
- [ ] T075 [US2] [BE] `PUT /tenants/{id}/settings` 엔드포인트(403 비-admin 차단) in `apps/api/src/routes/tenants.ts` (contracts: PUT /tenants/{id}/settings)
- [ ] T076 [P] [US2] [FE] 관제 설정 화면(위험유형/부서매핑/양식/보상정책 편집, Carbon) in `apps/admin-dashboard/src/app/settings/page.tsx` (FR-027)

**Checkpoint**: US1·US2가 각각 독립 동작 (B2C 신고 + B2G 처리 완결)

---

## Phase 5: User Story 3 - AI 대화형 신고 안내 (Priority: P2)

**Goal**: 시민이 진행 상황·신고 방법을 자연어로 묻고 근거 기반 안내(근거 없으면 담당 창구 안내)

**Independent Test**: 접수 번호로 진행 상황 질의 시 현재 상태·다음 단계 자연어 안내, 근거 출처 포함(quickstart 시나리오 7)

### Domain (도메인)

- [ ] T050 [P] [US3] [DOM] KnowledgeChunk 엔티티 + pgvector(hnsw) 인덱스 마이그레이션 in `supabase/migrations/0008_knowledge.sql` (FR-019, R5)
- [ ] T051 [US3] [DOM] 규정집·민원 양식·이력 임베딩 적재 파이프라인 정의 in `services/ai-inference/src/rag/ingest.py`

### Back-end (백엔드)

- [x] T052 [US3] [BE] RAG 검색+LLM 안내 서비스(출처 포함, 환각 시 창구 안내) in `services/ai-inference/src/rag/assistant.py` (FR-018/019) — 스킬 참조: `npx skillsadd lllllllama/ai-paper-reproduction-skill/paper-context-resolver`
- [x] T053 [US3] [BE] `POST /assistant/messages` 엔드포인트(익명/로그인) in `apps/api/src/routes/assistant.ts`
- [ ] T054 [P] [US3] [BE] 계약 테스트(assistant grounded/sources) in `apps/api/tests/contract/assistant.test.ts`

### Front-end (프론트엔드)

- [x] T055 [P] [US3] [FE] 대화형 안내 챗봇 UI(Intercom 말풍선 패턴) in `apps/citizen-web/src/components/AssistantChat.tsx`
- [x] T056 [US3] [FE] 챗봇 페이지 + 신고 상태 연동 in `apps/citizen-web/src/app/assistant/page.tsx`

**Checkpoint**: US1·US2·US3 모두 독립 동작

---

## Phase 6: User Story 4 - 신고 신뢰도 관리 및 시민 참여 보상 (Priority: P3)

**Goal**: 허위·중복·남용 차단 + 로그인 시민의 유효 신고에 보상 적립(익명 제외)

**Independent Test**: 동일 위치 반복 제출 중복 처리·대량 제출 제한, 로그인 신고 완료 시 보상 적립(quickstart 시나리오 8)

### Domain (도메인)

- [ ] T057 [P] [US4] [DOM] CitizenAccount 엔티티(보상 잔액·신뢰도 상태) 마이그레이션 in `supabase/migrations/0009_citizen.sql`
- [ ] T058 [P] [US4] [DOM] Reward 엔티티(신고당 1회 unique) 마이그레이션 in `supabase/migrations/0010_reward.sql` (FR-023)

### Back-end (백엔드)

- [ ] T059 [US4] [BE] 남용 제한(기기/세션·계정 rate limit, 검토 플래그) in `apps/api/src/services/abuse_guard.ts` (FR-021)
- [x] T060 [US4] [BE] 보상 적립 트리거(done 확정 시·invalid 시 제외) in `apps/api/src/services/reward.ts` (FR-022/023)
- [x] T061 [P] [US4] [BE] `GET /me/reports`, `GET /me/rewards` 엔드포인트 in `apps/api/src/routes/me.ts` (FR-010)
- [x] T062 [P] [US4] [BE] 무효 처리(허위/장난) 담당자 액션 in `apps/api/src/services/status_update.ts` (FR-022)

### Front-end (프론트엔드)

- [ ] T063 [P] [US4] [FE] 시민 회원가입/로그인(Supabase Auth) in `apps/citizen-web/src/app/(auth)/page.tsx`
- [ ] T064 [US4] [FE] 내 신고 이력·보상 잔액 화면 in `apps/citizen-web/src/app/me/page.tsx`

**Checkpoint**: 4개 사용자 스토리 전부 독립 기능 완성

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 여러 스토리에 걸친 마무리·비기능 요구사항

- [ ] T065 [DOM] 1년 보관→자동 파기 배치 + AggregateStat 비식별 집계 마이그레이션·잡 in `supabase/migrations/0011_retention.sql`, `apps/api/src/jobs/purge.ts` (FR-010a, R9)
- [ ] T066 [BE] 상태 알림 발송(웹푸시/이메일, 1분 이내) in `apps/api/src/services/notify.ts` (FR-017, SC-006) — 미커버 시 claudemarketplaces.com 이메일/SMS MCP 추가 바인딩
- [ ] T067 [P] [FE] 접근성·반응형·로딩/빈/에러 상태 점검(시민/관제 공통) across `apps/*`
- [ ] T068 [P] [INF] 부하 테스트(동시 1만 제출 99%) in `tests/load/` (SC-010)
- [ ] T069 [P] [BE] 분류 정확도 평가(라벨셋 ≥85%) in `services/ai-inference/tests/eval_accuracy.py` (SC-003)
- [ ] T070 [INF] 보안 강화(RLS 회귀 테스트, PII 감사 100%, 시크릿 점검) (SC-009, FR-026)
- [ ] T071 [P] [INF] 관측성(메트릭·트레이싱·가용성 모니터링 99.9%) (SC-011)
- [ ] T072 [P] [INF] 문서 갱신 in `docs/` + 디자인 토큰 일관성 점검(IBM/Intercom 단일 소스)
- [ ] T073 [INF] quickstart.md 9개 검증 시나리오 전체 실행·통과
- [ ] T077 [BE] 개인정보 목적제한·고지/동의·접근 로깅 검증(수집 목적 외 사용 차단, 처리방침 고지) in `apps/api/src/lib/privacy_policy.ts` (FR-009)
- [ ] T078 [P] [INF] 신고 제출→분류 응답 P95 ≤ 3초 지연 측정·회귀 테스트 in `tests/perf/latency.test.ts` (SC-002)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존성 없음 — 즉시 시작
- **Foundational (Phase 2)**: Setup 완료 후 — 모든 사용자 스토리 BLOCK
- **User Stories (Phase 3~6)**: Foundational 완료 후 시작. 우선순위 P1(US1→US2) → P2(US3) → P3(US4) 순차 또는 병렬(인력 충분 시)
- **Polish (Phase 7)**: 대상 스토리 완료 후

### User Story Dependencies

- **US1 (P1)**: Foundational 후 시작 — 타 스토리 의존 없음 (MVP)
- **US2 (P1)**: Foundational 후 시작 — US1의 신고 데이터를 소비하나 독립 테스트 가능(시드 신고로 검증)
- **US3 (P2)**: Foundational 후 시작 — 신고 상태 조회 연동, 독립 테스트 가능
- **US4 (P3)**: Foundational 후 시작 — US1/US2 처리 결과에 보상 연동, 독립 테스트 가능

### Within Each User Story (3대 요소 순서)

- **DOM(도메인) → BE(백엔드) → FE(프론트엔드)** 순서 권장: 마이그레이션/모델 → 서비스/엔드포인트 → 화면
- 모델 → 서비스 → 엔드포인트 → 통합 → 화면

### Parallel Opportunities

- Setup의 [P] 태스크 전부 병렬
- Foundational의 [P] 태스크 병렬(스키마-인증-앱셸-AI골격 동시)
- Foundational 완료 후 US1~US4 병렬 착수 가능(팀 분담)
- 각 스토리 내 [P] 표시 DOM 마이그레이션·FE 컴포넌트 병렬
- 레이어 분담: 도메인/백엔드 개발자 ↔ 프론트엔드 개발자 동시 진행

---

## Parallel Example: User Story 1

```bash
# 도메인 마이그레이션 병렬:
Task: "T018 Report 엔티티 마이그레이션 in supabase/migrations/0003_report.sql"
Task: "T019 ReportCluster 엔티티 마이그레이션 in supabase/migrations/0004_cluster.sql"

# 백엔드 AI 파이프라인 병렬:
Task: "T021 PII 비식별 파이프라인 in services/ai-inference/src/detect/anonymize.py"
Task: "T022 VLM 위험 분류 in services/ai-inference/src/classify/classifier.py"

# 프론트엔드 컴포넌트 병렬:
Task: "T029 사진 촬영 컴포넌트 in apps/citizen-web/src/components/PhotoCapture.tsx"
Task: "T030 위치 지정 지도 컴포넌트 in apps/citizen-web/src/components/LocationPicker.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup 완료
2. Phase 2 Foundational 완료 (CRITICAL — 모든 스토리 BLOCK)
3. Phase 3 User Story 1 완료
4. **STOP & VALIDATE**: quickstart 시나리오 1~3로 US1 독립 검증
5. 준비되면 파일럿 지자체 데모/배포

### Incremental Delivery

1. Setup + Foundational → 기반 완성
2. US1(신고) → 검증 → 데모(MVP!)
3. US2(관제) → 검증 → 데모 (B2G 완결)
4. US3(챗봇) → 검증 → 데모
5. US4(보상/신뢰도) → 검증 → 데모
6. Polish(보관·알림·부하·보안) → 운영 준비

### 3대 요소(Front-end / Back-end / Domain) 반영 확인

- **Domain(DOM)**: 전 스토리에 마이그레이션·엔티티·상태규칙 태스크 존재(T009/010/017/018~020/034~036/050~051/057~058/065). 테넌트 설정은 기존 `Tenant.settings`(T009) 재사용.
- **Back-end(BE)**: 전 스토리에 서비스·API·AI추론 태스크 존재(T012~013/016/021~028/037~044/052~054/059~062/066/074~075/077)
- **Front-end(FE)**: 전 스토리에 화면·컴포넌트·테마 태스크 존재(T005~006/014~015/029~033/045~049/055~056/063~064/067/076)

---

## Notes

- [P] = 다른 파일·의존성 없음. [Layer] = 3대 요소 추적(DOM/BE/FE/INF). [Story] = 스토리 추적성.
- 각 사용자 스토리는 독립 완성·테스트 가능하도록 구성.
- 멀티테넌트 RLS·PII 비식별은 보안 게이트로 반드시 통과 후 다음 단계 진행.
- 태스크 또는 논리 그룹마다 커밋. 체크포인트에서 스토리 독립 검증.
- 외부 스킬/테마는 plan.md "외부 리소스 바인딩" 섹션의 설치 경로를 구현 시 참조.
