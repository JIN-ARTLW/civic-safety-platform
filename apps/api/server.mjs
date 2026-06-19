// 백엔드 API 서버 (Node 내장 http, 의존성 없음)
// 포트 9523, 0.0.0.0 바인딩 → 도메인 p3.sumzip.com 접근 보장.
// contracts/openapi.yaml 의 핵심 엔드포인트를 /v1 prefix 로 구현.

import http from 'node:http';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.mjs';
import * as dom from './domain.mjs';
import * as ai from './ai.mjs';
import * as claude from './vision_claude.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, 'data', 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

// API 키를 환경변수 또는 gitignore된 .run/anthropic.key 파일에서 로드 (채팅·git 노출 방지)
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const k = readFileSync(join(__dirname, '..', '..', '.run', 'anthropic.key'), 'utf8').trim();
    if (k) process.env.ANTHROPIC_API_KEY = k;
  } catch { /* 키 파일 없음 → Claude 비전 비활성, 브라우저 모델로 폴백 */ }
}

// base64 dataURL → 파일 저장. 반환: 상대 경로(uploads/<id>.jpg)
function saveImage(id, dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = `${id}.${ext}`;
  try { writeFileSync(join(UPLOAD_DIR, file), Buffer.from(m[2], 'base64')); return `uploads/${file}`; }
  catch { return null; }
}
const IMG_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const PORT = Number(process.env.API_PORT || 9523);
const HOST = '0.0.0.0';
// 도메인 + 로컬 + 프론트 포트 허용 (CORS)
const ALLOWED_ORIGIN_RE = /^(https?:\/\/)?(p3\.sumzip\.com|localhost|127\.0\.0\.1)(:\d+)?$/;

store.load();

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// 데모용 담당자 인증 (실서비스: Supabase Auth + JWT tenant claim + RLS)
function officerFromAuth(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const token = h.slice(7);
  // 데모 토큰 형식: officer:<tenantId>:<role>
  if (token.startsWith('officer:')) {
    const [, tenantId, role] = token.split(':');
    return { tenant_id: tenantId || 'tnt-seoul-jung', role: role || 'officer' };
  }
  if (token === 'demo') return { tenant_id: 'tnt-seoul-jung', role: 'admin' };
  return null;
}

// ---- 신고 접수 (US1 / FR-001~008) ----
async function postReport(req, res) {
  const b = await readBody(req);
  const errors = dom.validateReportInput(b);
  if (errors.length) return send(res, 422, { errors });

  // 1) PII 비식별 (FR-008, R3) — 현재는 플래그만(실제 블러는 후속)
  const anon = ai.anonymizePhoto(b.photoName);
  // 2) 세부유형(클라이언트 AI 분류) → 분야/부서/우선순위
  const sub = b.subcategory ? dom.subByCode(b.subcategory) : null;
  const subCode = sub ? b.subcategory : null;
  const section = sub ? sub.section : (dom.SECTIONS[b.section] ? b.section : null);
  // 3) 관할 테넌트 라우팅 (FR-028, R4)
  const tenant = dom.resolveTenant(b.lat, b.lng);
  // 4) 중복 묶음 (세부유형+위치)
  const point = { lat: b.lat, lng: b.lng };
  let clustered_into = null;
  if (tenant && subCode) {
    const c = store.findOpenCluster(tenant.id, subCode, point, dom.DUPLICATE_RADIUS_M, dom.distanceMeters);
    if (c) { c.report_count += 1; store.persist(); clustered_into = c.id; }
    else {
      const nc = { id: store.uid('cl'), tenant_id: tenant.id, category_code: subCode, centroid: point, report_count: 1, status: 'open' };
      store.addCluster(nc); clustered_into = nc.id;
    }
  }

  const reportId = store.uid('rep');
  const storedPath = saveImage(reportId, b.photo) || anon.anonymizedName;
  const report = {
    id: reportId,
    tracking_no: store.nextTrackingNo(),
    tenant_id: tenant ? tenant.id : null,
    photo_url: storedPath,
    section: section,
    section_name: section ? dom.SECTIONS[section] : null,
    subcategory: subCode,
    subcategory_name: sub ? sub.name : (b.subcategory_name || null),
    department: sub ? sub.department : null,
    title: b.title || null,
    content: b.content || null,
    vehicle_no: b.vehicle_no || null,
    occurred_date: b.occurred_date || null,
    occurred_time: b.occurred_time || null,
    detected_objects: Array.isArray(b.objects) ? b.objects : [],
    ai_summary: b.ai_summary || null,
    ai_source: b.ai_source || null,
    pii_removed: anon.piiRemoved,
    location: point,
    captured_at: b.captured_at || null,
    submitted_at: new Date().toISOString(),
    classification_confidence: typeof b.confidence === 'number' ? b.confidence : null,
    status: 'received',
    priority: sub ? sub.priority : 3,
    cluster_id: clustered_into,
    submitter_account_id: b.account_id || null,
    submitter_device_hash: b.device_token || null,
    purge_after: null,
  };
  store.addReport(report);
  store.addLog({ id: store.uid('log'), report_id: report.id, actor_id: 'system', action: 'received', detail: { subcategory: subCode }, created_at: report.submitted_at });

  return send(res, 201, {
    tracking_no: report.tracking_no, status: report.status,
    section: report.section_name, subcategory: report.subcategory_name,
    department: report.department, clustered_into,
    tenant: tenant ? tenant.name : null, out_of_jurisdiction: !tenant,
  });
}

function reportStatus(report) {
  return {
    tracking_no: report.tracking_no, status: report.status,
    section: report.section_name || null, subcategory: report.subcategory_name || null,
    department: report.department || null, title: report.title || null,
    submitted_at: report.submitted_at, location: report.location, photo_url: report.photo_url,
  };
}

// ---- 라우팅 ----
const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname.replace(/\/+$/, '') || '/';

  try {
    if (p === '/' || p === '/v1/health') {
      return send(res, 200, { ok: true, service: 'civic-safety-api', port: PORT, domain: 'p3.sumzip.com' });
    }

    // POST /v1/reports
    if (p === '/v1/reports' && req.method === 'POST') return postReport(req, res);

    // GET /v1/reports/:trackingNo  (익명 상태 조회 FR-010)
    let m = p.match(/^\/v1\/reports\/([^/]+)$/);
    if (m && req.method === 'GET') {
      const r = store.getReportByTracking(decodeURIComponent(m[1]));
      if (!r) return send(res, 404, { error: 'not found' });
      return send(res, 200, reportStatus(r));
    }

    // GET /v1/meta  (위험유형/테넌트 + Claude 비전 가용 여부 — FE용)
    if (p === '/v1/meta' && req.method === 'GET') {
      return send(res, 200, { sections: dom.SECTIONS, subcategories: dom.SUBCATEGORIES, tenants: dom.TENANTS.map(t => ({ id: t.id, name: t.name })), claude_vision: claude.available() });
    }

    // POST /v1/vision/classify  (Claude 비전 — 키는 서버에만, FR-003 전 유형)
    if (p === '/v1/vision/classify' && req.method === 'POST') {
      const b = await readBody(req);
      const result = await claude.classifyWithClaude(b.photo);
      return send(res, result.error ? 200 : 200, result);
    }

    // GET /v1/uploads/:file  (저장된 (비식별 예정) 이미지 제공)
    let mi = p.match(/^\/v1\/uploads\/([A-Za-z0-9._-]+)$/);
    if (mi && req.method === 'GET') {
      const file = mi[1];
      const fp = join(UPLOAD_DIR, file);
      if (!existsSync(fp)) return send(res, 404, { error: 'no image' });
      const ext = (file.split('.').pop() || '').toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', IMG_MIME[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(readFileSync(fp));
    }

    // ---- 담당자 (US2) ----
    // GET /v1/officer/reports
    if (p === '/v1/officer/reports' && req.method === 'GET') {
      const officer = officerFromAuth(req);
      if (!officer) return send(res, 403, { error: '담당자 인증 필요' });
      const rows = store.listReportsByTenant(officer.tenant_id, {
        status: url.searchParams.get('status') || undefined,
      }).map((r) => {
        const cl = r.cluster_id ? store.getCluster(r.cluster_id) : null;
        return { id: r.id, tracking_no: r.tracking_no,
          section: r.section_name || null, category: r.subcategory_name || null,
          department: r.department || null, title: r.title || null, content: r.content || null,
          vehicle_no: r.vehicle_no || null, occurred_date: r.occurred_date || null, occurred_time: r.occurred_time || null,
          priority: r.priority, status: r.status,
          location: r.location, photo_url: r.photo_url, detected_objects: r.detected_objects || [],
          ai_summary: r.ai_summary || null, ai_source: r.ai_source || null,
          cluster: cl ? { id: cl.id, report_count: cl.report_count } : null,
          submitted_at: r.submitted_at, confidence: r.classification_confidence };
      });
      return send(res, 200, rows);
    }

    // PATCH /v1/officer/reports/:id/status  (FR-014/016/017)
    m = p.match(/^\/v1\/officer\/reports\/([^/]+)\/status$/);
    if (m && req.method === 'PATCH') {
      const officer = officerFromAuth(req);
      if (!officer) return send(res, 403, { error: '담당자 인증 필요' });
      const r = store.getReportById(m[1]);
      if (!r) return send(res, 404, { error: 'not found' });
      if (r.tenant_id !== officer.tenant_id) return send(res, 403, { error: '테넌트 격리 위반' });
      const b = await readBody(req);
      if (!dom.canTransition(r.status, b.status)) {
        return send(res, 422, { error: `허용되지 않은 상태 전이: ${r.status} → ${b.status}` });
      }
      const prev = r.status;
      r.status = b.status;
      if (b.status === 'done') {
        const d = new Date(); d.setFullYear(d.getFullYear() + 1);
        r.purge_after = d.toISOString();
        // 보상 적립: 로그인 신고만 (FR-022/023)
        if (r.submitter_account_id) {
          const t = dom.TENANTS.find((x) => x.id === r.tenant_id);
          store.addReward({ id: store.uid('rw'), account_id: r.submitter_account_id,
            report_id: r.id, points: (t?.settings?.rewardPointsPerValidReport) || 100,
            created_at: new Date().toISOString() });
        }
      }
      store.persist();
      store.addLog({ id: store.uid('log'), report_id: r.id, actor_id: officer.role,
        action: 'status_change', detail: { from: prev, to: b.status, note: b.note || null },
        created_at: new Date().toISOString() });
      return send(res, 200, { ok: true, status: r.status });
    }

    // POST /v1/officer/reports/:id/document  (FR-015)
    m = p.match(/^\/v1\/officer\/reports\/([^/]+)\/document$/);
    if (m && req.method === 'POST') {
      const officer = officerFromAuth(req);
      if (!officer) return send(res, 403, { error: '담당자 인증 필요' });
      const r = store.getReportById(m[1]);
      if (!r) return send(res, 404, { error: 'not found' });
      if (r.tenant_id !== officer.tenant_id) return send(res, 403, { error: '테넌트 격리 위반' });
      const doc = { id: store.uid('doc'), report_id: r.id, tenant_id: r.tenant_id,
        format: 'text', review_status: 'draft', content: ai.generateDocumentDraft(r),
        created_at: new Date().toISOString() };
      store.addDocument(doc);
      store.addLog({ id: store.uid('log'), report_id: r.id, actor_id: officer.role,
        action: 'doc_generated', detail: { doc_id: doc.id }, created_at: doc.created_at });
      return send(res, 201, doc);
    }

    // ---- 대화형 안내 (US3 / FR-018/019) ----
    if (p === '/v1/assistant/messages' && req.method === 'POST') {
      const b = await readBody(req);
      const report = b.tracking_no ? store.getReportByTracking(b.tracking_no) : null;
      return send(res, 200, ai.assistantReply(b.message || '', report));
    }

    // GET /v1/me/rewards?account=...  (FR-023)
    if (p === '/v1/me/rewards' && req.method === 'GET') {
      const acc = url.searchParams.get('account');
      if (!acc) return send(res, 400, { error: 'account 필요' });
      const rows = store.rewardsForAccount(acc);
      return send(res, 200, { balance: rows.reduce((s, r) => s + r.points, 0), history: rows });
    }

    return send(res, 404, { error: 'route not found', path: p });
  } catch (e) {
    return send(res, 500, { error: 'internal', message: String(e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[api] listening on http://${HOST}:${PORT} (domain: p3.sumzip.com)`);
});
