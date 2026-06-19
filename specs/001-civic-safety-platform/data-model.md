# Phase 1 Data Model: 시민 참여형 스마트시티 안전 플랫폼

**Feature**: 001-civic-safety-platform | **Date**: 2026-06-19 | **Source**: [spec.md](./spec.md) Key Entities + [research.md](./research.md)

모든 테넌트 종속 엔티티는 `tenant_id`를 가지며 RLS로 격리한다(R1). 좌표는 PostGIS `geography(Point,4326)`, RAG 임베딩은 `vector`(pgvector) 타입을 사용한다.

---

## 엔티티

### Tenant (지자체)
서비스를 구독·운영하는 행정 주체. 모든 운영 데이터의 격리 단위.

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | 테넌트 식별자 |
| name | text | NOT NULL | 지자체명(구청/시청) |
| boundary | geography(Polygon/MultiPolygon,4326) | NOT NULL | 관할 경계 |
| settings | jsonb | NOT NULL default '{}' | 공문서 양식·보상 정책 등 테넌트 설정 |
| status | enum(active,suspended) | NOT NULL | 구독 상태 |
| created_at | timestamptz | NOT NULL | 생성 시각 |

### HazardCategory (위험 유형)
테넌트별 신고 분류 체계 + 담당 부서 매핑.

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| tenant_id | uuid | FK→Tenant, NOT NULL | 소속 테넌트 |
| code | text | NOT NULL, unique(tenant_id,code) | 분류 코드(예: ROAD_DAMAGE) |
| name | text | NOT NULL | 표시명(도로 파손 등) |
| department | text | NOT NULL | 담당 부서 |
| default_priority | int | NOT NULL | 기본 우선순위 |

### CitizenAccount (시민 계정, 선택적)
회원가입한 시민. 익명 신고는 계정 없이 동작.

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK (Supabase Auth user) | |
| display_name | text | NULL | 표시명 |
| reward_balance | int | NOT NULL default 0 | 누적 보상 포인트 |
| trust_status | enum(normal,limited,blocked) | NOT NULL default 'normal' | 신뢰도/제한 상태 |
| created_at | timestamptz | NOT NULL | |

### Report (신고) — 핵심 엔티티
시민이 제출한 단일 위험 신고.

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| tracking_no | text | NOT NULL, unique | 접수 번호(조회용) |
| tenant_id | uuid | FK→Tenant, NULL 허용 | 라우팅된 관할 테넌트(관할 외 판정 시 NULL) |
| photo_url | text | NOT NULL | **비식별 처리본** 저장 경로(원본 미저장) |
| location | geography(Point,4326) | NOT NULL | 신고 위치 |
| captured_at | timestamptz | NULL | 촬영 시각(메타데이터) |
| submitted_at | timestamptz | NOT NULL | 접수 시각 |
| category_id | uuid | FK→HazardCategory, NULL | 확정/추정 위험 유형 |
| classification_confidence | numeric(4,3) | NULL | 자동 분류 신뢰도(0~1) |
| status | enum(received,in_progress,done,rejected,invalid) | NOT NULL default 'received' | 처리 상태 |
| priority | int | NOT NULL | 우선순위 |
| cluster_id | uuid | FK→ReportCluster, NULL | 중복/유사 묶음 |
| submitter_account_id | uuid | FK→CitizenAccount, NULL | 로그인 신고 시 시민 |
| submitter_device_hash | text | NULL | 익명 신고 시 기기/세션 식별 해시 |
| purge_after | timestamptz | NULL | 완료 후 1년 시점(파기 예약) |

**상태 전이**: `received → in_progress → done` / 어느 단계에서나 `→ rejected`(반려) 또는 `→ invalid`(허위/장난 무효). `done` 진입 시 `purge_after = now()+1년` 설정, 로그인 신고면 보상 적립 트리거.

**검증 규칙**: location 필수(FR-002), photo_url은 비식별 처리 완료본만 허용(FR-008), tracking_no는 전역 유일.

### ReportCluster (신고 묶음)
동일 위치·유형 중복/유사 신고의 처리 단위.

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| tenant_id | uuid | FK→Tenant, NOT NULL | |
| category_id | uuid | FK→HazardCategory | 대표 유형 |
| centroid | geography(Point,4326) | NOT NULL | 묶음 중심 좌표 |
| report_count | int | NOT NULL default 1 | 포함 신고 수 |
| status | enum(open,resolved) | NOT NULL | |

### OfficerProfile (담당자)
신고를 처리하는 행정 사용자(권한·관할).

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK (Supabase Auth user) | |
| tenant_id | uuid | FK→Tenant, NOT NULL | 소속 지자체 |
| department | text | NOT NULL | 소속 부서 |
| role | enum(officer,manager,admin) | NOT NULL | 역할 |
| jurisdiction | text | NULL | 관할 범위(부서/구역) |

### ProcessingLog (처리 이력)
신고 관련 모든 행위의 감사 추적(FR-016).

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| report_id | uuid | FK→Report, NOT NULL | |
| actor_id | uuid | NULL | 행위자(담당자/시스템) |
| action | text | NOT NULL | assign/status_change/doc_generated 등 |
| detail | jsonb | NULL | 변경 내용 |
| created_at | timestamptz | NOT NULL | 시각 |

### OfficialDocument (공문서)
신고로부터 생성된 표준 행정 문서 초안.

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| report_id | uuid | FK→Report, NOT NULL | |
| tenant_id | uuid | FK→Tenant, NOT NULL | |
| format | enum(docx,pdf) | NOT NULL | 산출 형식 |
| file_url | text | NULL | 생성 파일 경로 |
| review_status | enum(draft,reviewed,finalized) | NOT NULL default 'draft' | |
| created_at | timestamptz | NOT NULL | |

### Notification (알림)
로그인 시민에게 전달되는 상태 변경·보상 안내.

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| account_id | uuid | FK→CitizenAccount, NOT NULL | 수신 시민 |
| report_id | uuid | FK→Report, NULL | 관련 신고 |
| channel | enum(webpush,email) | NOT NULL | 전달 채널 |
| body | text | NOT NULL | 내용 |
| sent_at | timestamptz | NULL | 전달 시각 |

### Reward (참여 보상)
로그인 시민의 유효 신고에 적립되는 포인트.

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| account_id | uuid | FK→CitizenAccount, NOT NULL | |
| report_id | uuid | FK→Report, NOT NULL, unique | 신고당 1회 |
| points | int | NOT NULL | 적립 포인트 |
| created_at | timestamptz | NOT NULL | |

### KnowledgeChunk (RAG 지식 조각)
안전 규정집·민원 양식·처리 이력의 임베딩(FR-019).

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| tenant_id | uuid | FK→Tenant, NULL | 공통 자료는 NULL |
| source | text | NOT NULL | 출처(규정/양식/이력) |
| content | text | NOT NULL | 원문 조각 |
| embedding | vector(1536) | NOT NULL | 임베딩(pgvector) |

### AggregateStat (비식별 집계 통계)
1년 파기 후에도 영구 보존되는 비식별 통계(FR-010a).

| 필드 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| tenant_id | uuid | FK→Tenant | |
| period | date | NOT NULL | 집계 기간 |
| category_code | text | NOT NULL | 위험 유형 |
| geo_cell | text | NOT NULL | 격자화된 위치(개인 식별 불가) |
| count | int | NOT NULL | 건수 |
| avg_resolution_hours | numeric | NULL | 평균 처리 시간 |

---

## 관계 요약

```text
Tenant 1─* HazardCategory
Tenant 1─* Report ─* ProcessingLog
Tenant 1─* OfficerProfile
Report *─1 ReportCluster
Report 1─* OfficialDocument
Report 0..1─1 Reward ─* CitizenAccount
CitizenAccount 1─* Report (로그인 신고) / 1─* Notification
Tenant 1─* KnowledgeChunk (+ 공통 NULL-tenant)
Tenant 1─* AggregateStat
```

## 인덱스/정책 메모

- 모든 테넌트 테이블에 `tenant_id` RLS 정책(R1) + `(tenant_id, ...)` 복합 인덱스.
- `Report.location`, `Tenant.boundary`, `ReportCluster.centroid`에 GiST 공간 인덱스(R4).
- `KnowledgeChunk.embedding`에 ivfflat/hnsw 벡터 인덱스(R5).
- `Report.tracking_no` 고유 인덱스(익명 조회), `Report.purge_after` 인덱스(파기 배치).
