// 브라우저 비전 (무료·키 불필요): CLIP 제로샷 이미지 분류 (Transformers.js)
// 우리가 정의한 위험 라벨로 사진을 "의미 기반" 채점 → 포트홀/침수/시설물 훼손/안전위협을 세분 구분.
// Transformers.js(pipeline)는 모듈 스크립트에서 setPipeline()으로 주입. 미주입/오프라인 시 노면 휴리스틱 폴백.
(function (global) {
  'use strict';

  // 라벨(영문이 CLIP에 유리) → 우리 카테고리 코드 매핑. 여러 표현으로 앙상블.
  var LABELS = [
    { t: 'a pothole in the road', c: 'ROAD_DAMAGE' },
    { t: 'cracked and damaged asphalt road surface', c: 'ROAD_DAMAGE' },
    { t: 'a hole or sinkhole in the street pavement', c: 'ROAD_DAMAGE' },
    { t: 'a broken or bent street sign', c: 'FACILITY_DAMAGE' },
    { t: 'a damaged guardrail or street fence', c: 'FACILITY_DAMAGE' },
    { t: 'a broken public bench or street facility', c: 'FACILITY_DAMAGE' },
    { t: 'a damaged or open manhole cover', c: 'FACILITY_DAMAGE' },
    { t: 'a broken streetlight or utility pole', c: 'FACILITY_DAMAGE' },
    { t: 'a flooded street with standing water', c: 'FLOOD_RISK' },
    { t: 'water flooding over the road', c: 'FLOOD_RISK' },
    { t: 'an overflowing river or drain', c: 'FLOOD_RISK' },
    { t: 'a fallen tree blocking the road', c: 'SAFETY_THREAT' },
    { t: 'debris or dangerous objects on the road', c: 'SAFETY_THREAT' },
    { t: 'a collapsed or fallen structure', c: 'SAFETY_THREAT' },
    { t: 'a normal clean road with no damage', c: 'NONE' },
    { t: 'an ordinary building or street scene', c: 'NONE' },
    { t: 'people walking on a sidewalk', c: 'NONE' },
  ];
  var CODE_KO = {
    ROAD_DAMAGE: '도로 파손(포트홀 등)', FACILITY_DAMAGE: '시설물 훼손',
    FLOOD_RISK: '침수/치수 위험', SAFETY_THREAT: '안전 위협', NONE: '위험 요소 불명확',
  };
  var LABEL_KO = {
    'a pothole in the road': '도로 포트홀', 'cracked and damaged asphalt road surface': '아스팔트 균열/손상',
    'a hole or sinkhole in the street pavement': '노면 구멍/싱크홀', 'a broken or bent street sign': '파손/휜 표지판',
    'a damaged guardrail or street fence': '가드레일/펜스 파손', 'a broken public bench or street facility': '벤치/시설물 파손',
    'a damaged or open manhole cover': '맨홀 파손/개방', 'a broken streetlight or utility pole': '가로등/전주 파손',
    'a flooded street with standing water': '도로 침수/물고임', 'water flooding over the road': '노면 범람',
    'an overflowing river or drain': '하천/배수구 범람', 'a fallen tree blocking the road': '쓰러진 나무',
    'debris or dangerous objects on the road': '노면 낙하물/위험물', 'a collapsed or fallen structure': '붕괴/쓰러진 구조물',
    'a normal clean road with no damage': '정상 도로', 'an ordinary building or street scene': '일반 거리/건물',
    'people walking on a sidewalk': '보행자',
  };

  var CivicVision = {
    _pipelineFn: null, _env: null, _pipe: null, _loading: null,
    MODEL: 'Xenova/clip-vit-base-patch16',

    // 모듈 스크립트에서 Transformers.js의 pipeline/env 주입
    setPipeline: function (pipelineFn, env) {
      this._pipelineFn = pipelineFn; this._env = env || null;
      try { global.dispatchEvent(new Event('vision-ready')); } catch (e) {}
    },
    available: function () { return !!this._pipelineFn; },

    load: function (onProgress) {
      if (this._pipe) return Promise.resolve(this._pipe);
      if (this._loading) return this._loading;
      if (!this._pipelineFn) return Promise.reject(new Error('transformers-unavailable'));
      var self = this;
      this._loading = this._pipelineFn('zero-shot-image-classification', this.MODEL, onProgress ? { progress_callback: onProgress } : undefined)
        .then(function (p) { self._pipe = p; return p; });
      return this._loading;
    },

    // 핵심: CLIP 제로샷 분류 (입력: 다운스케일된 dataURL, 폴백용 imgEl)
    analyze: function (dataUrl, imgEl, onProgress) {
      var self = this;
      if (!this._pipelineFn) return Promise.resolve(this._heuristic(imgEl));
      return this.load(onProgress).then(function (pipe) {
        return pipe(dataUrl, LABELS.map(function (l) { return l.t; }), { hypothesis_template: '{}' });
      }).then(function (out) {
        return self._decide(out);
      }).catch(function () {
        return self._heuristic(imgEl);
      });
    },

    _decide: function (out) {
      // out: [{label, score}] — 라벨별 확률. 카테고리별 합산.
      var byCat = { ROAD_DAMAGE: 0, FACILITY_DAMAGE: 0, FLOOD_RISK: 0, SAFETY_THREAT: 0, NONE: 0 };
      var labelScore = {};
      out.forEach(function (o) {
        labelScore[o.label] = o.score;
        var hit = LABELS.filter(function (l) { return l.t === o.label; })[0];
        if (hit) byCat[hit.c] += o.score;
      });
      // 최고 카테고리
      var best = 'NONE', bestScore = -1;
      Object.keys(byCat).forEach(function (c) { if (byCat[c] > bestScore) { bestScore = byCat[c]; best = c; } });
      // 상위 라벨 3개 (UI 근거)
      var top = out.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 3)
        .map(function (o) { return { label: LABEL_KO[o.label] || o.label, score: Math.round(o.score * 100) / 100 }; });

      var category_code = null, confidence = bestScore, candidates = [];
      if (best === 'NONE') {
        category_code = null; confidence = Math.min(0.5, bestScore);
        candidates = ['ROAD_DAMAGE', 'FACILITY_DAMAGE', 'FLOOD_RISK', 'SAFETY_THREAT'];
      } else {
        category_code = best;
        if (bestScore < 0.45) candidates = ['ROAD_DAMAGE', 'FACILITY_DAMAGE', 'FLOOD_RISK', 'SAFETY_THREAT'];
      }
      var summary = category_code
        ? (CODE_KO[category_code] + ' 추정 (근거: ' + (top[0] ? top[0].label : '') + ' ' + (top[0] ? (top[0].score * 100).toFixed(0) + '%' : '') + ')')
        : '위험 유형이 불명확합니다 — 유형을 선택해 주세요';
      return {
        category_code: category_code, confidence: confidence,
        candidate_categories: candidates, objects: top, persons: 0,
        summary: summary, source: 'clip',
      };
    },

    // ---- 폴백: 노면 손상 휴리스틱(이전 버전) ----
    _heuristic: function (imgEl) {
      if (!imgEl) return { category_code: null, confidence: 0.3, candidate_categories: ['ROAD_DAMAGE', 'FACILITY_DAMAGE', 'FLOOD_RISK', 'SAFETY_THREAT'], objects: [], persons: 0, summary: 'AI 모델 미로드 — 유형을 직접 선택하세요', source: 'none' };
      var road = this.analyzeRoadSurface(imgEl);
      var code = road.isAsphalt ? 'ROAD_DAMAGE' : null;
      return {
        category_code: code,
        confidence: code ? Math.max(0.5, Math.min(0.9, road.score)) : 0.3,
        candidate_categories: code && road.score >= 0.45 ? [] : ['ROAD_DAMAGE', 'FACILITY_DAMAGE', 'FLOOD_RISK', 'SAFETY_THREAT'],
        objects: code ? [{ label: '노면 손상 패턴', score: Math.round((road.score || 0.5) * 100) / 100 }] : [],
        persons: 0, summary: code ? '도로 노면 손상 추정(폴백 분석)' : '브라우저 모델 미로드(폴백)', source: 'heuristic',
      };
    },

    analyzeRoadSurface: function (imgEl) {
      var W = 180, ow = imgEl.naturalWidth || imgEl.width, oh = imgEl.naturalHeight || imgEl.height;
      var scale = W / ow, H = Math.max(1, Math.round(oh * scale));
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(imgEl, 0, 0, W, H);
      var data = c.getContext('2d').getImageData(0, 0, W, H).data;
      var n = W * H, gray = new Float32Array(n), lowSat = 0, sum = 0;
      for (var i = 0, p = 0; i < data.length; i += 4, p++) {
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if ((mx === 0 ? 0 : (mx - mn) / mx) < 0.22) lowSat++;
        var lum = 0.299 * r + 0.587 * g + 0.114 * b; gray[p] = lum; sum += lum;
      }
      var mean = sum / n, grayFrac = lowSat / n, v = 0;
      for (var q = 0; q < n; q++) { var d = gray[q] - mean; v += d * d; }
      var std = Math.sqrt(v / n), darkRough = 0, roughSum = 0;
      for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
        var idx = y * W + x, mag = Math.abs(gray[idx + 1] - gray[idx - 1]) + Math.abs(gray[idx + W] - gray[idx - W]);
        roughSum += mag; if (gray[idx] < mean - 0.45 * std && mag > 16) darkRough++;
      }
      var isAsphalt = grayFrac > 0.42 && mean > 40 && mean < 210;
      var score = isAsphalt ? Math.min(1, (darkRough / n) * 14 + Math.max(0, (roughSum / n - 7)) / 35) : 0;
      return { isAsphalt: isAsphalt, score: score };
    },

    downscale: function (imgEl, maxSize, quality) {
      maxSize = maxSize || 640; quality = quality || 0.7;
      var w = imgEl.naturalWidth || imgEl.width, h = imgEl.naturalHeight || imgEl.height;
      var scale = Math.min(1, maxSize / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
      canvas.getContext('2d').drawImage(imgEl, 0, 0, cw, ch);
      return canvas.toDataURL('image/jpeg', quality);
    },
  };

  global.CivicVision = CivicVision;
})(window);
