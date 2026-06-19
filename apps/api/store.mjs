// 저장 계층 (백엔드) — JSON 파일 영속화 인메모리 스토어
// 실서비스: Supabase(PostgreSQL + PostGIS + pgvector) + RLS. 본 MVP: 파일 기반 단순 스토어.
// 모든 테넌트 종속 레코드는 tenant_id 로 격리(코드 레벨 필터로 RLS 표현).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data', 'db.json');

function emptyDb() {
  return { reports: [], clusters: [], logs: [], documents: [], rewards: [], seq: 0 };
}

let db = emptyDb();

export function load() {
  try {
    if (existsSync(DB_PATH)) db = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } catch {
    db = emptyDb();
  }
  return db;
}

export function persist() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function nextTrackingNo() {
  db.seq += 1;
  const yyyy = '2026';
  return `CSR-${yyyy}-${String(db.seq).padStart(5, '0')}`;
}

export function addReport(report) {
  db.reports.push(report);
  persist();
  return report;
}

export function getReportByTracking(trackingNo) {
  return db.reports.find((r) => r.tracking_no === trackingNo) || null;
}

export function getReportById(id) {
  return db.reports.find((r) => r.id === id) || null;
}

// 테넌트 격리 조회 (FR-026)
export function listReportsByTenant(tenantId, filter = {}) {
  let rows = db.reports.filter((r) => r.tenant_id === tenantId);
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.category) rows = rows.filter((r) => r.category_code === filter.category);
  return rows.sort((a, b) => a.priority - b.priority || b.submitted_at.localeCompare(a.submitted_at));
}

export function findOpenCluster(tenantId, categoryCode, point, radiusM, distanceFn) {
  return (
    db.clusters.find(
      (c) =>
        c.tenant_id === tenantId &&
        c.status === 'open' &&
        c.category_code === categoryCode &&
        distanceFn(c.centroid, point) <= radiusM
    ) || null
  );
}

export function addCluster(cluster) {
  db.clusters.push(cluster);
  persist();
  return cluster;
}

export function getCluster(id) {
  return db.clusters.find((c) => c.id === id) || null;
}

export function addLog(log) {
  db.logs.push(log);
  persist();
}

export function logsForReport(reportId) {
  return db.logs.filter((l) => l.report_id === reportId);
}

export function addDocument(doc) {
  db.documents.push(doc);
  persist();
  return doc;
}

export function addReward(reward) {
  // 신고당 1회 (FR-023 unique)
  if (db.rewards.some((r) => r.report_id === reward.report_id)) return null;
  db.rewards.push(reward);
  persist();
  return reward;
}

export function rewardsForAccount(accountId) {
  return db.rewards.filter((r) => r.account_id === accountId);
}

export function all() {
  return db;
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${db.reports.length}`;
}
