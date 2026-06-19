// Domain layer (도메인) — 엔티티 규칙·상태 전이·검증
// data-model.md 의 엔티티(Report/Tenant/HazardCategory/ReportCluster/...)를 코드로 표현.
// 멀티테넌트(테넌트별 격리)·하이브리드 신원(익명/로그인)·상태 전이 규칙을 포함.

export const REPORT_STATUS = ['received', 'in_progress', 'done', 'rejected', 'invalid'];

// 허용된 상태 전이 (spec FR-014 / data-model 상태 전이)
const TRANSITIONS = {
  received: ['in_progress', 'rejected', 'invalid'],
  in_progress: ['done', 'rejected', 'invalid'],
  done: [],
  rejected: [],
  invalid: [],
};

export function canTransition(from, to) {
  return REPORT_STATUS.includes(to) && (TRANSITIONS[from] || []).includes(to);
}

// 파일럿 테넌트 + 관할 경계(bbox). 실서비스는 PostGIS 폴리곤(R4).
// p3.sumzip.com 파일럿: 단일 지자체. 경계 밖 좌표는 관할 외.
export const TENANTS = [
  {
    id: 'tnt-cheongju',
    name: '충북 청주시 (파일럿)',
    // 대략적인 청주시 관할 bbox [minLng, minLat, maxLng, maxLat] (중심 ≈ 36.6424, 127.489)
    bbox: [127.38, 36.55, 127.62, 36.73],
    settings: { rewardPointsPerValidReport: 100 },
  },
];

// 테넌트별 위험 유형 분류 체계 + 담당 부서 매핑 (HazardCategory)
export const HAZARD_CATEGORIES = [
  { code: 'ROAD_DAMAGE', name: '도로 파손(포트홀 등)', department: '도로과', priority: 1 },
  { code: 'FACILITY_DAMAGE', name: '시설물 훼손', department: '시설관리과', priority: 2 },
  { code: 'FLOOD_RISK', name: '침수/치수 위험', department: '치수과', priority: 1 },
  { code: 'SAFETY_THREAT', name: '안전 위협(표지판/낙하물 등)', department: '안전총괄과', priority: 1 },
  { code: 'ETC', name: '기타', department: '민원실', priority: 3 },
];

export function categoryByCode(code) {
  return HAZARD_CATEGORIES.find((c) => c.code === code) || null;
}

// 좌표 → 관할 테넌트 판별 (FR-028, R4 의 단순화 버전)
export function resolveTenant(lat, lng) {
  for (const t of TENANTS) {
    const [minLng, minLat, maxLng, maxLat] = t.bbox;
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) return t;
  }
  return null; // 관할 외
}

// 신고 입력 검증 (FR-002 위치 필수 등)
export function validateReportInput(input) {
  const errors = [];
  if (typeof input.lat !== 'number' || typeof input.lng !== 'number') {
    errors.push('위치(lat,lng)는 필수입니다.');
  }
  if (!input.photoName) {
    errors.push('사진은 필수입니다.');
  }
  return errors;
}

// 두 좌표 거리(m) — 중복 묶음 판정용 (Haversine)
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const DUPLICATE_RADIUS_M = 30; // 동일 위치 판정 반경
