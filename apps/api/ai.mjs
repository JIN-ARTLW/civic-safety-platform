// AI 파이프라인 (백엔드) — 동작하는 스텁
// 실서비스(plan.md/research.md): YOLO 객체탐지 + VLM 위험분류 + 얼굴/번호판 블러 + RAG.
// 본 MVP: 결정론적 휴리스틱으로 대체하되 동일 인터페이스를 유지하여 추후 실제 모델로 교체 가능.

import { HAZARD_CATEGORIES, categoryByCode } from './domain.mjs';

// (R3) PII 비식별: 실제론 얼굴/번호판 탐지→블러. 여기선 처리 완료 플래그만 반환(원본 미저장 원칙 표현).
export function anonymizePhoto(photoName) {
  return {
    anonymizedName: `anon_${photoName || 'photo.jpg'}`,
    piiRemoved: true, // SC-009: 비식별 처리율 100% 표현
  };
}

// (R2) 위험 분류 + 신뢰도. 파일명/힌트 키워드 기반 결정론적 분류 + 신뢰도.
const KEYWORDS = [
  { code: 'ROAD_DAMAGE', hints: ['road', 'pothole', '도로', '포트홀', 'crack'] },
  { code: 'FLOOD_RISK', hints: ['flood', 'water', '침수', '치수', 'rain'] },
  { code: 'FACILITY_DAMAGE', hints: ['facility', 'broken', '시설', '훼손', 'block'] },
  { code: 'SAFETY_THREAT', hints: ['sign', 'fall', '표지판', '낙하', '안전', 'danger'] },
];

export function classifyHazard(photoName, hint) {
  const hay = `${photoName || ''} ${hint || ''}`.toLowerCase();
  let matched = null;
  for (const k of KEYWORDS) {
    if (k.hints.some((h) => hay.includes(h.toLowerCase()))) {
      matched = k.code;
      break;
    }
  }
  if (matched) {
    return {
      category_code: matched,
      confidence: 0.9, // 고신뢰 → 자동 분류 (FR-003)
      candidate_categories: [],
    };
  }
  // 저신뢰: 후보 제시하여 시민 선택 유도 (FR-004)
  return {
    category_code: null,
    confidence: 0.4,
    candidate_categories: HAZARD_CATEGORIES.filter((c) => c.code !== 'ETC').map((c) => c.code),
  };
}

// (R5/R6) RAG 안내 + LLM 공문서 — 스텁.
export function assistantReply(message, report) {
  if (report) {
    const cat = report.category_code ? categoryByCode(report.category_code) : null;
    const dept = cat ? cat.department : '민원실';
    const stepByStatus = {
      received: '담당 부서 배정 대기 중입니다. 곧 검토가 시작됩니다.',
      in_progress: `${dept}에서 현장 확인·처리 중입니다.`,
      done: '처리가 완료되었습니다. 협조해 주셔서 감사합니다.',
      rejected: '검토 결과 반려되었습니다. 자세한 사유는 담당 창구로 문의해 주세요.',
      invalid: '유효하지 않은 신고로 분류되었습니다.',
    };
    return {
      reply: `접수번호 ${report.tracking_no} 신고는 현재 "${report.status}" 상태입니다. ${stepByStatus[report.status] || ''}`,
      sources: ['처리 이력', cat ? `담당: ${dept}` : '담당: 민원실'],
      grounded: true,
    };
  }
  // 근거 없는 일반 질의 → 추측 금지, 담당 창구 안내 (FR-019)
  return {
    reply:
      '해당 질문에 대한 근거 자료를 찾지 못했습니다. 정확한 안내가 필요하시면 관할 지자체 민원실(국번없이 120)로 문의해 주세요.',
    sources: [],
    grounded: false,
  };
}

// LLM 공문서 초안 생성 (FR-015) — 스텁 텍스트
export function generateDocumentDraft(report) {
  const cat = report.category_code ? categoryByCode(report.category_code) : null;
  return [
    `[표준 행정 처리 공문서 초안]`,
    `접수번호: ${report.tracking_no}`,
    `위험 유형: ${cat ? cat.name : '미분류'}`,
    `담당 부서: ${cat ? cat.department : '민원실'}`,
    `위치: (${report.location.lat}, ${report.location.lng})`,
    `접수 일시: ${report.submitted_at}`,
    `조치 요청: 현장 확인 후 신속한 안전 조치를 요청합니다.`,
  ].join('\n');
}
