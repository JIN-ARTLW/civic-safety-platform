# Implementation Plan: 시민 참여형 스마트시티 안전 플랫폼 (Civic Safety Platform)

**Branch**: `001-civic-safety-platform` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-civic-safety-platform/spec.md`

## Summary

시민이 촬영한 한 장의 사진으로 도시 위험 요소를 익명/로그인 신고하면, 시스템이 **이미지 AI(VLM)** 로 위험 유형을 자동 분류하고 위치 좌표로 관할 지자체(테넌트)를 판별하여 표준 신고서를 생성, 지자체 담당자의 관제 대시보드로 라우팅한다. 담당자는 분류·우선순위·중복 묶음이 정리된 신고를 처리하고, **LLM + RAG** 로 표준 공문서 초안을 자동 생성한다. 시민은 **대화형 안내(RAG 챗봇)** 로 진행 상황을 묻고, 로그인 시민은 보상·알림·이력을 받는다.

**기술 접근 요약**: 멀티테넌트 웹 애플리케이션으로 구축한다. 프론트엔드는 React(Next.js) + shadcn/ui 단일 컴포넌트 시스템에 **두 개의 표면(surface)** — 시민용 모바일 웹(친근한 대화형 테마)과 지자체 관제 대시보드(엔터프라이즈 테마) — 을 둔다. 백엔드는 Supabase(PostgreSQL + PostGIS 지리연산 + pgvector 벡터검색 + Auth + Storage)를 데이터·인증·저장 기반으로 삼고, AI 파이프라인(VLM 객체탐지 → 위험 분류 → LLM 공문서 생성 → RAG 안내)은 별도 추론 서비스로 분리한다. 외부 스킬 마켓플레이스(skills.sh)와 디자인 테마(getdesign.md)를 구현 참조로 바인딩한다(아래 별도 섹션).

## Technical Context

**Language/Version**: TypeScript 5.x (웹/백엔드), Python 3.12 (AI 추론 서비스)

**Primary Dependencies**:
- 프론트엔드: Next.js(App Router) + React + shadcn/ui + Tailwind CSS + 지도 라이브러리(MapLibre GL)
- 백엔드/데이터: Supabase (PostgreSQL 15 + PostGIS + pgvector + Auth + Storage + Realtime)
- AI 추론: 경량 객체탐지 비전 모델(예: YOLO 계열) + 시각-언어 정렬 모델(VLM, 예: Qwen-VL/LLaVA 계열) + LLM(공문서 생성) + 임베딩 모델(RAG)
- 비식별 처리: 얼굴·번호판 탐지 후 블러 처리 파이프라인

**Storage**: PostgreSQL(메타데이터·신고·테넌트·이력), PostGIS(좌표·관할 경계), pgvector(RAG 임베딩), Object Storage(원본→비식별 처리본 사진)

**Testing**: Vitest/Jest(단위), Playwright(E2E 웹), pytest(AI 서비스), contract test(OpenAPI 스키마 검증)

**Target Platform**: 모바일 웹 우선(반응형) + 데스크톱 관제 대시보드, 서버는 Linux 컨테이너(GPU 노드 = AI 추론)

**Project Type**: Web application (frontend + backend + AI inference service)

**Performance Goals**:
- 신고 제출~자동 분류 결과 표시 ≤ 3초 (SC-002)
- 자동 위험 분류 정확도 ≥ 85% (SC-003)
- 동시 시민 10,000명에서 제출 성공률 ≥ 99% (SC-010)
- 가용성 월 99.9% (SC-011)

**Constraints**:
- 멀티테넌트 데이터 격리(테넌트 간 접근 불가, FR-026)
- 개인정보 비식별 처리율 100% (SC-009), 처리 완료 후 1년 보관→자동 파기(FR-010a)
- 익명 신고는 기기/세션 식별자만 사용, 계정 없이 동작(FR-024)

**Scale/Scope**: 멀티테넌트(파일럿 1개 지자체 → 다수 확장), 신고 P1~P3 4개 사용자 스토리, 화면 약 12~16개(시민 4~6 + 관제 8~10)

## 외부 리소스 바인딩 (Skills.sh / GetDesign.md)

> 사용자 지시에 따라 구현 시 참조할 외부 마켓플레이스 스킬과 UI 디자인 테마를 계획에 바인딩한다. 각 항목은 "설치하여 기능을 구현할 때 참조하여 구현한다"는 원칙으로 사용한다.

### A. 기능·스킬 스택 (https://www.skills.sh)

| 영역 | 스킬 | 설치 경로 | 사용 설명 |
|------|------|-----------|-----------|
| 백엔드/DB/인증 | **supabase** | `npx skillsadd supabase/agent-skills/supabase` | Supabase 백엔드(인증·DB·스토리지·Realtime) 관련 스킬이다. 설치하여 테넌트 데이터 모델·RLS·Storage 연동을 구현할 때 참조하여 구현한다. |
| DB 모범사례 | **supabase-postgres-best-practices** | `npx skillsadd supabase/agent-skills/supabase-postgres-best-practices` | PostgreSQL/RLS 설계 모범사례 스킬이다. 설치하여 멀티테넌트 격리(FR-026)·인덱스·PostGIS/pgvector 스키마를 구현할 때 참조하여 구현한다. |
| 프론트엔드 UI | **shadcn** | `npx skillsadd shadcn/ui/shadcn` | React 컴포넌트 라이브러리(shadcn/ui) 스킬이다. 설치하여 시민/관제 화면의 공통 컴포넌트 시스템을 구현할 때 참조하여 구현한다. |
| 공문서 생성 | **docx** | `npx skillsadd anthropics/skills/docx` | Word 문서 생성 스킬이다. 설치하여 LLM이 만든 표준 행정 공문서 초안(FR-015)을 .docx로 출력할 때 참조하여 구현한다. |
| 공문서 생성 | **pdf** | `npx skillsadd anthropics/skills/pdf` | PDF 생성/조작 스킬이다. 설치하여 신고서·공문서의 PDF 산출 및 첨부 처리를 구현할 때 참조하여 구현한다. |
| RAG/문서 컨텍스트 | **paper-context-resolver** | `npx skillsadd lllllllama/ai-paper-reproduction-skill/paper-context-resolver` | 문서 검색·컨텍스트화 스킬이다. 설치하여 RAG 안내(FR-018/019)의 규정집·민원 이력 검색 패턴을 구현할 때 참조하여 구현한다. |
| 이미지 처리 | **image-edit** | `npx skillsadd runcomfy-com/skills/image-edit` | 이미지 프로그램적 편집 스킬이다. 설치하여 얼굴·번호판 비식별(블러) 처리 파이프라인(FR-008)을 구현할 때 참조하여 구현한다. |
| 웹/지도 접근 | **agent-browser** | `npx skillsadd vercel-labs/agent-browser/agent-browser` | 웹 리소스(지도 서비스 포함) 접근 스킬이다. 설치하여 지도/관할 경계 조회 등 외부 데이터 연동을 구현할 때 참조하여 구현한다. |

> 보완 마켓플레이스: https://claudemarketplaces.com (21,600+ skills / 2,500+ marketplaces / 12,500+ MCP). 위 스킬로 커버되지 않는 영역(알림 발송용 이메일/SMS MCP, 모니터링 MCP 등)은 `/skills`·`/mcp` 카테고리에서 검색하여 추가 바인딩한다.

### B. UI/UX 디자인 테마 (https://getdesign.md)

전체 시스템은 **하나의 디자인 토큰 체계**를 공유하되, 사용자 그룹별로 두 테마를 적용해 일관성을 유지한다. 두 테마 모두 shadcn/ui 토큰 위에 매핑한다.

**1) 지자체 관제 대시보드(B2G) — IBM Carbon 테마**
```bash
npx getdesign@latest add ibm
```
- 프리뷰: 엔터프라이즈 기술, Carbon 디자인 시스템 기반, **구조적 블루(structured blue) 팔레트**. 데이터 밀도가 높은 관제 화면(목록·지도·통계)에 적합.
- 적용 지침: 관제 대시보드의 표·필터·상태 배지·지도 패널을 Carbon 토큰(타이포·간격·블루 스케일)에 맞춰 구성하여 신뢰감 있는 행정용 UI로 통일한다.

**2) 시민용 모바일 웹 + 대화형 안내(B2C) — Intercom 테마**
```bash
npx getdesign@latest add intercom
```
- 프리뷰: 고객 메시징, **친근한 블루 팔레트**, 대화형(conversational) UI 패턴. 챗봇 안내(User Story 3)와 "3초 신고" 흐름에 적합.
- 적용 지침: 사진 촬영→위치 확인→제출의 단계형 카드와 챗봇 말풍선을 Intercom 패턴으로 구성하여 비전문 시민도 직관적으로 사용하게 한다.

**대안 테마(참고)**: HashiCorp(`npx getdesign@latest add hashicorp`, 블랙&화이트 엔터프라이즈), Notion(`...add notion`, 따뜻한 미니멀), Starbucks(`...add starbucks`, 그린/풀-필 버튼). 브랜드 방향 변경 시 교체 후보로 둔다.

> 일관성 규칙: 두 테마의 **공통 토큰(색 스케일·타이포 스케일·간격·라운드·상태색)** 을 `design-tokens` 단일 소스에 정의하고, 시민/관제 표면은 동일 토큰을 참조한 테마 변형으로만 분기한다. 컴포넌트는 shadcn/ui 단일 라이브러리에서 파생하여 중복 구현을 막는다.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 현재 **템플릿(원칙 미설정)** 상태이므로 강제 게이트로 평가할 구체 조항이 없다. 다음을 권고한다: 향후 `/speckit-constitution`으로 원칙을 비준한다. 그때까지 본 계획은 아래 **일반 베스트프랙티스 게이트**를 자가 적용하며, 위반 없음으로 판정한다.

| 게이트 | 판정 | 근거 |
|--------|------|------|
| 프라이버시 우선(비식별·최소보관) | ✅ Pass | FR-008/009/010a, 비식별 100%·1년 파기 설계 |
| 멀티테넌트 격리 | ✅ Pass | FR-026/027/028, RLS 기반 테넌트 격리 |
| 테스트 가능성(계약/E2E) | ✅ Pass | OpenAPI contract + Playwright/pytest 계획 |
| 단순성(YAGNI) | ✅ Pass | BaaS(Supabase)로 인프라 단순화, 불필요한 서비스 분리 회피 |
| 관측 가능성 | ✅ Pass | 처리 이력 감사추적(FR-016) + 구조적 로깅 계획 |

→ **초기 게이트 통과.** (Phase 1 이후 재평가 섹션은 본 문서 말미 참조)

## Project Structure

### Documentation (this feature)

```text
specs/001-civic-safety-platform/
├── plan.md              # 본 문서 (/speckit-plan)
├── research.md          # Phase 0 산출물
├── data-model.md        # Phase 1 산출물
├── quickstart.md        # Phase 1 산출물
├── contracts/           # Phase 1 산출물 (OpenAPI)
│   └── openapi.yaml
└── tasks.md             # Phase 2 (/speckit-tasks 에서 생성 — 본 명령은 생성 안 함)
```

### Source Code (repository root)

```text
apps/
├── citizen-web/             # 시민용 모바일 웹 (Next.js, Intercom 테마)
│   ├── src/
│   │   ├── app/             # 라우트: 신고하기/상태조회/챗봇/내신고(로그인)
│   │   ├── components/      # shadcn 기반 컴포넌트 (촬영/위치/단계카드/말풍선)
│   │   └── services/        # API 클라이언트
│   └── tests/               # Playwright E2E, 단위
│
├── admin-dashboard/         # 지자체 관제 대시보드 (Next.js, IBM Carbon 테마)
│   ├── src/
│   │   ├── app/             # 라우트: 신고목록/지도/상세/공문서/통계/설정
│   │   ├── components/      # 표·필터·지도패널·상태배지
│   │   └── services/
│   └── tests/
│
└── api/                     # 백엔드 API (Next.js Route Handlers 또는 Node 서비스)
    ├── src/
    │   ├── models/          # 도메인 모델 (Tenant/Report/Officer/...)
    │   ├── services/        # 신고 접수·라우팅·중복묶음·공문서·보상
    │   ├── routes/          # REST 엔드포인트 (contracts/openapi.yaml 준수)
    │   └── lib/             # supabase 클라이언트·인증·RLS 헬퍼
    └── tests/               # contract, integration

services/
└── ai-inference/            # AI 추론 서비스 (Python)
    ├── src/
    │   ├── detect/          # 객체탐지 + 비식별(얼굴/번호판 블러)
    │   ├── classify/        # VLM 위험 유형 분류 + 신뢰도
    │   ├── docgen/          # LLM 공문서 초안 생성
    │   └── rag/             # 임베딩 + pgvector 검색 + 챗봇 안내
    └── tests/               # pytest

packages/
├── design-tokens/           # 공통 디자인 토큰 (IBM/Intercom 테마 변형의 단일 소스)
└── shared/                  # 공유 타입·스키마(OpenAPI 생성 타입)

supabase/
├── migrations/              # SQL 마이그레이션 (PostGIS/pgvector/RLS 정책)
└── seed/                    # 위험유형·부서매핑·테넌트 시드
```

**Structure Decision**: 멀티테넌트 웹 애플리케이션으로, 사용자 그룹별 표면을 `apps/citizen-web`·`apps/admin-dashboard`로 분리하고 공통 API를 `apps/api`, GPU 의존 AI 파이프라인을 `services/ai-inference`로 격리한다. 디자인 토큰·공유 스키마는 `packages/`로 단일화하여 두 표면의 일관성과 코드 재사용을 보장한다. 데이터·인증·스토리지는 `supabase/`(PostgreSQL+PostGIS+pgvector)로 통합한다.

## Complexity Tracking

> Constitution 위반 없음 → 본 섹션 비워둔다. (AI 추론 서비스 분리는 GPU 자원·언어(Python) 요건상 정당화되며, 단일 프로젝트로 합치는 단순안은 GPU 스케일링·배포 독립성 측면에서 부적합하여 기각.)

## Phase 1 이후 Constitution 재평가

Phase 1(data-model·contracts·quickstart) 설계 후 재점검: 멀티테넌트 격리는 RLS + 테넌트 컬럼으로 모든 엔티티에 일관 적용(data-model.md), 프라이버시는 원본 비저장·비식별본만 저장 + 1년 TTL로 강화, 외부 인터페이스는 OpenAPI 계약으로 테스트 가능. **위반 없음, 게이트 통과 유지.**
