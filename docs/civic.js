// 클라이언트 전용 엔진 (GitHub Pages 정적 배포용)
// 백엔드(domain.mjs/ai.mjs/store.mjs)를 브라우저로 포팅. 저장소는 localStorage.
// 동일한 도메인 로직·API 형태를 유지하여 서버 없이 동작.
(function (global) {
  'use strict';

  // ---- 도메인 (domain.mjs 포팅) ----
  var REPORT_STATUS = ['received', 'in_progress', 'done', 'rejected', 'invalid'];
  var TRANSITIONS = {
    received: ['in_progress', 'rejected', 'invalid'],
    in_progress: ['done', 'rejected', 'invalid'],
    done: [], rejected: [], invalid: [],
  };
  function canTransition(from, to) {
    return REPORT_STATUS.indexOf(to) >= 0 && (TRANSITIONS[from] || []).indexOf(to) >= 0;
  }
  var TENANTS = [{
    id: 'tnt-cheongju', name: '충북 청주시 (파일럿)',
    bbox: [127.38, 36.55, 127.62, 36.73],
    settings: { rewardPointsPerValidReport: 100 },
  }];
  var HAZARD_CATEGORIES = [
    { code: 'ROAD_DAMAGE', name: '도로 파손(포트홀 등)', department: '도로과', priority: 1 },
    { code: 'FACILITY_DAMAGE', name: '시설물 훼손', department: '시설관리과', priority: 2 },
    { code: 'FLOOD_RISK', name: '침수/치수 위험', department: '치수과', priority: 1 },
    { code: 'SAFETY_THREAT', name: '안전 위협(표지판/낙하물 등)', department: '안전총괄과', priority: 1 },
    { code: 'ETC', name: '기타', department: '민원실', priority: 3 },
  ];
  function categoryByCode(code) { return HAZARD_CATEGORIES.filter(function (c) { return c.code === code; })[0] || null; }
  function resolveTenant(lat, lng) {
    for (var i = 0; i < TENANTS.length; i++) {
      var b = TENANTS[i].bbox;
      if (lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]) return TENANTS[i];
    }
    return null;
  }
  function distanceMeters(a, b) {
    var R = 6371000, toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    var s = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  var DUP_RADIUS = 30;

  // ---- AI 스텁 (ai.mjs 포팅) ----
  function anonymizePhoto(name) { return { anonymizedName: 'anon_' + (name || 'photo.jpg'), piiRemoved: true }; }
  var KW = [
    { code: 'ROAD_DAMAGE', hints: ['road', 'pothole', '도로', '포트홀', 'crack'] },
    { code: 'FLOOD_RISK', hints: ['flood', 'water', '침수', '치수', 'rain'] },
    { code: 'FACILITY_DAMAGE', hints: ['facility', 'broken', '시설', '훼손', 'block'] },
    { code: 'SAFETY_THREAT', hints: ['sign', 'fall', '표지판', '낙하', '안전', 'danger'] },
  ];
  function classify(name, hint) {
    var hay = ((name || '') + ' ' + (hint || '')).toLowerCase(), matched = null;
    for (var i = 0; i < KW.length; i++) {
      for (var j = 0; j < KW[i].hints.length; j++) {
        if (hay.indexOf(KW[i].hints[j].toLowerCase()) >= 0) { matched = KW[i].code; break; }
      }
      if (matched) break;
    }
    if (matched) return { category_code: matched, confidence: 0.9, candidate_categories: [] };
    return {
      category_code: null, confidence: 0.4,
      candidate_categories: HAZARD_CATEGORIES.filter(function (c) { return c.code !== 'ETC'; }).map(function (c) { return c.code; }),
    };
  }
  function assistantReply(message, report) {
    if (report) {
      var cat = report.category_code ? categoryByCode(report.category_code) : null;
      var dept = cat ? cat.department : '민원실';
      var step = {
        received: '담당 부서 배정 대기 중입니다. 곧 검토가 시작됩니다.',
        in_progress: dept + '에서 현장 확인·처리 중입니다.',
        done: '처리가 완료되었습니다. 협조해 주셔서 감사합니다.',
        rejected: '검토 결과 반려되었습니다. 자세한 사유는 담당 창구로 문의해 주세요.',
        invalid: '유효하지 않은 신고로 분류되었습니다.',
      };
      return { reply: '접수번호 ' + report.tracking_no + ' 신고는 현재 "' + report.status + '" 상태입니다. ' + (step[report.status] || ''), sources: ['처리 이력', '담당: ' + dept], grounded: true };
    }
    return { reply: '해당 질문에 대한 근거 자료를 찾지 못했습니다. 정확한 안내가 필요하시면 관할 지자체 민원실(국번없이 120)로 문의해 주세요.', sources: [], grounded: false };
  }
  function generateDoc(r) {
    var cat = r.category_code ? categoryByCode(r.category_code) : null;
    return ['[표준 행정 처리 공문서 초안]', '접수번호: ' + r.tracking_no, '위험 유형: ' + (cat ? cat.name : '미분류'),
      '담당 부서: ' + (cat ? cat.department : '민원실'), '위치: (' + r.location.lat + ', ' + r.location.lng + ')',
      '접수 일시: ' + r.submitted_at, '조치 요청: 현장 확인 후 신속한 안전 조치를 요청합니다.'].join('\n');
  }

  // ---- 저장 (localStorage) ----
  var KEY = 'civic_db_v1';
  function db() {
    try { return JSON.parse(localStorage.getItem(KEY)) || empty(); } catch (e) { return empty(); }
  }
  function empty() { return { reports: [], clusters: [], rewards: [], logs: [], seq: 0 }; }
  function save(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 10); }

  // ---- 공개 API (서버 엔드포인트와 동일 형태 반환) ----
  var CivicAPI = {
    meta: function () { return { categories: HAZARD_CATEGORIES, tenants: TENANTS.map(function (t) { return { id: t.id, name: t.name }; }) }; },

    submitReport: function (input) {
      if (typeof input.lat !== 'number' || typeof input.lng !== 'number' || !input.photoName)
        return { error: true, errors: ['사진과 위치(lat,lng)는 필수입니다.'] };
      var d = db();
      var anon = anonymizePhoto(input.photoName);
      // 클라이언트(브라우저 비전 모델) 탐지 결과 우선, 없으면 파일명 휴리스틱
      var cls;
      if (input.category_code) cls = { category_code: input.category_code, confidence: typeof input.confidence === 'number' ? input.confidence : 1, candidate_categories: [] };
      else if (typeof input.confidence === 'number' || (input.objects && input.objects.length)) cls = { category_code: null, confidence: input.confidence || 0.4, candidate_categories: ['ROAD_DAMAGE', 'FACILITY_DAMAGE', 'FLOOD_RISK', 'SAFETY_THREAT'] };
      else cls = classify(input.photoName, input.hint);
      var tenant = resolveTenant(input.lat, input.lng);
      var point = { lat: input.lat, lng: input.lng };
      var clustered = null;
      if (tenant && cls.category_code) {
        var c = d.clusters.filter(function (x) {
          return x.tenant_id === tenant.id && x.status === 'open' && x.category_code === cls.category_code && distanceMeters(x.centroid, point) <= DUP_RADIUS;
        })[0];
        if (c) { c.report_count++; clustered = c.id; }
        else { var nc = { id: uid('cl'), tenant_id: tenant.id, category_code: cls.category_code, centroid: point, report_count: 1, status: 'open' }; d.clusters.push(nc); clustered = nc.id; }
      }
      d.seq++;
      var cat = cls.category_code ? categoryByCode(cls.category_code) : null;
      var r = {
        id: uid('rep'), tracking_no: 'CSR-2026-' + String(d.seq).padStart(5, '0'),
        tenant_id: tenant ? tenant.id : null,
        photo_url: input.photo || anon.anonymizedName,   // 실제 업로드 이미지(dataURL) 저장
        detected_objects: input.objects || [], ai_summary: input.ai_summary || null, ai_source: input.ai_source || null, pii_removed: true,
        location: point, submitted_at: new Date().toISOString(), category_code: cls.category_code,
        classification_confidence: cls.confidence, status: 'received', priority: cat ? cat.priority : 3,
        cluster_id: clustered, submitter_account_id: input.account_id || null, submitter_device_hash: input.device_token || null, purge_after: null,
      };
      d.reports.push(r);
      d.logs.push({ id: uid('log'), report_id: r.id, action: 'received', created_at: r.submitted_at });
      save(d);
      return {
        tracking_no: r.tracking_no, status: r.status, category: r.category_code,
        classification_confidence: r.classification_confidence, candidate_categories: cls.candidate_categories,
        clustered_into: clustered, tenant: tenant ? tenant.name : null, out_of_jurisdiction: !tenant,
      };
    },

    getStatus: function (tracking) {
      var r = db().reports.filter(function (x) { return x.tracking_no === tracking; })[0];
      if (!r) return null;
      var cat = r.category_code ? categoryByCode(r.category_code) : null;
      return { tracking_no: r.tracking_no, status: r.status, category: cat ? cat.name : null, department: cat ? cat.department : null, submitted_at: r.submitted_at, location: r.location, photo_url: r.photo_url };
    },

    officerList: function (tenantId, filter) {
      filter = filter || {};
      var rows = db().reports.filter(function (r) { return r.tenant_id === tenantId; });
      if (filter.status) rows = rows.filter(function (r) { return r.status === filter.status; });
      rows.sort(function (a, b) { return a.priority - b.priority || b.submitted_at.localeCompare(a.submitted_at); });
      var d = db();
      return rows.map(function (r) {
        var cat = r.category_code ? categoryByCode(r.category_code) : null;
        var cl = r.cluster_id ? d.clusters.filter(function (x) { return x.id === r.cluster_id; })[0] : null;
        return { id: r.id, tracking_no: r.tracking_no, category: cat ? cat.name : null, department: cat ? cat.department : null, priority: r.priority, status: r.status, location: r.location, photo_url: r.photo_url, detected_objects: r.detected_objects || [], ai_summary: r.ai_summary || null, ai_source: r.ai_source || null, cluster: cl ? { id: cl.id, report_count: cl.report_count } : null, submitted_at: r.submitted_at, confidence: r.classification_confidence };
      });
    },

    changeStatus: function (id, status) {
      var d = db(); var r = d.reports.filter(function (x) { return x.id === id; })[0];
      if (!r) return { error: true, message: 'not found' };
      if (!canTransition(r.status, status)) return { error: true, message: '허용되지 않은 전이: ' + r.status + ' → ' + status };
      var prev = r.status; r.status = status;
      if (status === 'done') {
        var dt = new Date(); dt.setFullYear(dt.getFullYear() + 1); r.purge_after = dt.toISOString();
        if (r.submitter_account_id && !d.rewards.some(function (x) { return x.report_id === r.id; })) {
          d.rewards.push({ id: uid('rw'), account_id: r.submitter_account_id, report_id: r.id, points: 100, created_at: new Date().toISOString() });
        }
      }
      d.logs.push({ id: uid('log'), report_id: r.id, action: 'status_change', detail: { from: prev, to: status }, created_at: new Date().toISOString() });
      save(d);
      return { ok: true, status: r.status };
    },

    genDoc: function (id) {
      var r = db().reports.filter(function (x) { return x.id === id; })[0];
      if (!r) return { error: true };
      return { id: uid('doc'), report_id: r.id, review_status: 'draft', content: generateDoc(r) };
    },

    assistant: function (message, tracking) {
      var r = tracking ? db().reports.filter(function (x) { return x.tracking_no === tracking; })[0] : null;
      return assistantReply(message, r);
    },

    rewards: function (account) {
      var rows = db().rewards.filter(function (r) { return r.account_id === account; });
      return { balance: rows.reduce(function (s, r) { return s + r.points; }, 0), history: rows };
    },

    reset: function () { localStorage.removeItem(KEY); },
    TENANTS: TENANTS,
  };

  global.CivicAPI = CivicAPI;
})(window);
