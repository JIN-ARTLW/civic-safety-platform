# Quickstart & Validation Guide: 시민 참여형 스마트시티 안전 플랫폼

**Feature**: 001-civic-safety-platform | **Date**: 2026-06-19

이 문서는 기능이 **엔드투엔드로 동작함을 증명**하는 실행/검증 시나리오를 정의한다. 구체 구현 코드는 `tasks.md`(/speckit-tasks)와 구현 단계에서 다룬다. 데이터 구조는 [data-model.md](./data-model.md), API는 [contracts/openapi.yaml](./contracts/openapi.yaml) 참조.

## 사전 준비 (Prerequisites)

- Node.js 20+, pnpm, Python 3.12, Docker
- Supabase 프로젝트(로컬 `supabase start` 또는 클라우드) — PostGIS·pgvector 확장 활성화
- (선택) GPU 노드 또는 AI 추론 서비스 엔드포인트

## 셋업 (외부 리소스 바인딩 적용)

```bash
# 1) 의존성
pnpm install

# 2) 외부 스킬 설치 (skills.sh — plan.md 외부 리소스 바인딩 참조)
npx skillsadd supabase/agent-skills/supabase
npx skillsadd supabase/agent-skills/supabase-postgres-best-practices
npx skillsadd shadcn/ui/shadcn
npx skillsadd anthropics/skills/docx
npx skillsadd anthropics/skills/pdf
npx skillsadd runcomfy-com/skills/image-edit
npx skillsadd lllllllama/ai-paper-reproduction-skill/paper-context-resolver

# 3) UI 디자인 테마 설치 (getdesign.md)
npx getdesign@latest add ibm        # 관제 대시보드(B2G)
npx getdesign@latest add intercom   # 시민 모바일 웹(B2C)

# 4) DB 마이그레이션/시드 (PostGIS/pgvector/RLS + 테넌트·위험유형 시드)
supabase db reset

# 5) 실행
pnpm --filter api dev
pnpm --filter citizen-web dev
pnpm --filter admin-dashboard dev
# AI 추론
python services/ai-inference/src/main.py
```

## 검증 시나리오 (Acceptance → Test 매핑)

### 시나리오 1 — 익명 "3초 신고" (User Story 1 / FR-001~008, SC-002)
1. 시민 웹에서 사진 업로드 + 위치 지정 후 제출.
2. **기대**: 3초 이내 `201` + `tracking_no`·자동 분류 유형 반환. 저장된 사진은 얼굴/번호판이 블러된 비식별본(원본 미저장).
   ```bash
   curl -F photo=@hazard.jpg -F lat=37.56 -F lng=126.97 \
        -F device_token=anon-xyz https://localhost/v1/reports
   ```

### 시나리오 2 — 저신뢰 분류 시 시민 선택 (FR-004)
1. 야간/저화질 사진 제출.
2. **기대**: 응답에 `candidate_categories` 후보 제시 → 시민이 `category_code` 지정 재제출 시 접수.

### 시나리오 3 — 관할 라우팅 & 멀티테넌트 격리 (FR-026/028)
1. 테넌트 A 경계 내 좌표로 신고.
2. **기대**: 신고가 테넌트 A로 라우팅. 테넌트 B 담당자 토큰으로 `/officer/reports` 조회 시 해당 신고 **미노출**(403/격리).
3. 경계 밖 좌표 → 관할 외 안내(테넌트 NULL).

### 시나리오 4 — 담당자 처리 & 시민 알림 (User Story 2 / FR-014/016/017, SC-006)
1. 담당자가 `/officer/reports/{id}/status`로 `in_progress`→`done` 변경.
2. **기대**: ProcessingLog 기록 생성, 로그인 신고자에겐 1분 이내 알림, 익명 신고자는 `/reports/{trackingNo}`에서 상태 갱신 확인.

### 시나리오 5 — 중복 묶음 (FR-013/020, SC-005)
1. 같은 위치·유형 신고를 2건 이상 제출.
2. **기대**: 두 번째 제출은 `409` + 기존 묶음 `clustered_into`. 관제 목록에서 단일 묶음(건수 표시).

### 시나리오 6 — 공문서 자동 생성 (FR-015, SC-004)
1. 담당자가 `/officer/reports/{id}/document` 호출(format=docx).
2. **기대**: `draft` 상태 공문서 초안 생성, 검토·확정 가능.

### 시나리오 7 — RAG 대화형 안내 (User Story 3 / FR-018/019)
1. `/assistant/messages`에 "내 신고 어떻게 됐나요?" + tracking_no.
2. **기대**: 현재 상태·다음 단계 자연어 안내 + 근거 `sources`. 근거 없는 질의는 `grounded:false` + 담당 창구 안내(추측 금지).

### 시나리오 8 — 보상 적립 (User Story 4 / FR-022/023)
1. 로그인 시민 신고가 `done`으로 확정.
2. **기대**: `/me/rewards` 잔액 증가(신고당 1회). 담당자가 `invalid` 처리 시 적립 안 됨.

### 시나리오 9 — 보관/파기 (FR-010a)
1. 완료된 신고의 `purge_after` 도달(테스트는 시간 단축).
2. **기대**: 사진·식별 데이터 파기, `AggregateStat` 비식별 통계만 잔존.

## 성능/품질 게이트
- 신고 제출→분류 응답 P95 ≤ 3초 (SC-002), 분류 정확도 ≥ 85% (SC-003, 라벨셋 평가)
- 동시 1만 부하에서 제출 성공률 ≥ 99% (SC-010, 부하 테스트)
- 비식별 처리율 100% (SC-009, 샘플 감사)
- 가용성 99.9% (SC-011, 운영 모니터링)
