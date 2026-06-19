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

// 안전신문고 3대 분류
export const SECTIONS = {
  TRAFFIC: '자동차·교통 위반', LIVING: '생활불편', SAFETY: '안전',
};

// 세부유형 → {분야, 표시명, 담당부서, 우선순위}
export const SUBCATEGORIES = {
  T_PARKING:   { section: 'TRAFFIC', name: '불법 주·정차',            department: '교통지도과',   priority: 2 },
  T_VIOLATION: { section: 'TRAFFIC', name: '교통법규 위반(신호·과속 등)', department: '경찰서(연계)', priority: 1 },
  T_PLATE:     { section: 'TRAFFIC', name: '번호판 규정 위반',         department: '차량등록과',   priority: 3 },
  T_TUNING:    { section: 'TRAFFIC', name: '불법 튜닝·등화·반사판',    department: '차량등록과',   priority: 3 },
  L_TRASH:     { section: 'LIVING',  name: '쓰레기·폐기물 무단투기',   department: '청소행정과',   priority: 2 },
  L_AD:        { section: 'LIVING',  name: '불법 광고물',             department: '도시미관과',   priority: 3 },
  L_BIKE:      { section: 'LIVING',  name: '자전거·이륜차 방치',       department: '교통행정과',   priority: 3 },
  L_ETC:       { section: 'LIVING',  name: '기타 생활불편',           department: '민원실',       priority: 3 },
  S_ROAD:      { section: 'SAFETY',  name: '도로·시설물 파손/고장',    department: '도로관리과',   priority: 1 },
  S_FLOOD:     { section: 'SAFETY',  name: '여름철 침수·수해 위험',    department: '치수과',       priority: 1 },
  S_AIR:       { section: 'SAFETY',  name: '대기오염',               department: '환경관리과',   priority: 2 },
  S_WATER:     { section: 'SAFETY',  name: '수질오염',               department: '환경관리과',   priority: 2 },
  S_FIRE:      { section: 'SAFETY',  name: '소방안전(소화전 등)',      department: '소방서(연계)', priority: 1 },
  S_ETC:       { section: 'SAFETY',  name: '기타 안전·환경 위험',      department: '안전총괄과',   priority: 2 },
};

export function subByCode(code) {
  return SUBCATEGORIES[code] || null;
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
