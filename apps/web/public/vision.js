// 브라우저 비전 (무료·키 불필요): CLIP 제로샷 분류 (Transformers.js)
// 안전신문고 3대 분류(자동차·교통 / 생활불편 / 안전) + 세부유형 체계로 사진을 의미 기반 분류.
(function (global) {
  'use strict';

  // 안전신문고 기준 분류 체계 (UI·분류 공용 단일 소스)
  var TAXONOMY = {
    TRAFFIC: {
      name: '자동차·교통 위반',
      subs: {
        T_PARKING: '불법 주·정차',
        T_VIOLATION: '교통법규 위반(신호·과속 등)',
        T_PLATE: '번호판 규정 위반',
        T_TUNING: '불법 튜닝·등화·반사판',
      },
    },
    LIVING: {
      name: '생활불편',
      subs: {
        L_TRASH: '쓰레기·폐기물 무단투기',
        L_AD: '불법 광고물',
        L_BIKE: '자전거·이륜차 방치',
        L_ETC: '기타 생활불편',
      },
    },
    SAFETY: {
      name: '안전',
      subs: {
        S_ROAD: '도로·시설물 파손/고장',
        S_FLOOD: '여름철 침수·수해 위험',
        S_AIR: '대기오염',
        S_WATER: '수질오염',
        S_FIRE: '소방안전(소화전 등)',
        S_ETC: '기타 안전·환경 위험',
      },
    },
  };
  function sectionOf(sub) {
    for (var s in TAXONOMY) if (TAXONOMY[s].subs[sub]) return s;
    return null;
  }

  // CLIP 라벨(영문이 유리) → 세부유형 코드
  var LABELS = [
    { t: 'a car illegally parked on the street or sidewalk', c: 'T_PARKING' },
    { t: 'a vehicle blocking traffic or a crosswalk', c: 'T_PARKING' },
    { t: 'a car with an altered, broken or obscured license plate', c: 'T_PLATE' },
    { t: 'an illegally modified or tuned car', c: 'T_TUNING' },
    { t: 'a pile of illegally dumped garbage bags or household waste', c: 'L_TRASH' },
    { t: 'scattered trash or construction debris dumped on the street', c: 'L_TRASH' },
    { t: 'illegal advertising banners, posters or flyers on the street', c: 'L_AD' },
    { t: 'abandoned bicycles or scooters left blocking the path', c: 'L_BIKE' },
    { t: 'a pothole or cracked damaged asphalt road surface', c: 'S_ROAD' },
    { t: 'a broken street sign, guardrail, bench or manhole cover', c: 'S_ROAD' },
    { t: 'a broken or fallen streetlight or utility pole', c: 'S_ROAD' },
    { t: 'a flooded street with standing water', c: 'S_FLOOD' },
    { t: 'an overflowing river, stream or storm drain', c: 'S_FLOOD' },
    { t: 'thick smoke or air pollution from a factory or vehicle exhaust', c: 'S_AIR' },
    { t: 'polluted, dirty or contaminated water in a river or stream', c: 'S_WATER' },
    { t: 'a blocked, damaged or leaking fire hydrant', c: 'S_FIRE' },
    { t: 'a fallen tree or dangerous debris blocking the road', c: 'S_ETC' },
    { t: 'a normal clean road with no problem', c: 'NONE' },
    { t: 'an ordinary building or street scene', c: 'NONE' },
    { t: 'people walking on a sidewalk', c: 'NONE' },
  ];
  var LABEL_KO = {
    'a car illegally parked on the street or sidewalk': '불법 주·정차 차량',
    'a vehicle blocking traffic or a crosswalk': '통행 방해 차량',
    'a car with an altered, broken or obscured license plate': '번호판 위반 차량',
    'an illegally modified or tuned car': '불법 튜닝 차량',
    'a pile of illegally dumped garbage bags or household waste': '무단 투기 쓰레기',
    'scattered trash or construction debris dumped on the street': '노상 폐기물',
    'illegal advertising banners, posters or flyers on the street': '불법 광고물',
    'abandoned bicycles or scooters left blocking the path': '방치 자전거/이륜차',
    'a pothole or cracked damaged asphalt road surface': '도로 포트홀/균열',
    'a broken street sign, guardrail, bench or manhole cover': '시설물 파손',
    'a broken or fallen streetlight or utility pole': '가로등/전주 파손',
    'a flooded street with standing water': '도로 침수',
    'an overflowing river, stream or storm drain': '하천/배수구 범람',
    'thick smoke or air pollution from a factory or vehicle exhaust': '대기오염(매연)',
    'polluted, dirty or contaminated water in a river or stream': '수질오염',
    'a blocked, damaged or leaking fire hydrant': '소화전 이상',
    'a fallen tree or dangerous debris blocking the road': '쓰러진 나무/낙하물',
    'a normal clean road with no problem': '정상 도로',
    'an ordinary building or street scene': '일반 거리',
    'people walking on a sidewalk': '보행자',
  };

  var CivicVision = {
    _pipelineFn: null, _pipe: null, _loading: null, MODEL: 'Xenova/clip-vit-base-patch16',
    TAXONOMY: TAXONOMY, sectionOf: sectionOf,
    setPipeline: function (fn) { this._pipelineFn = fn; try { global.dispatchEvent(new Event('vision-ready')); } catch (e) {} },
    available: function () { return !!this._pipelineFn; },
    load: function (cb) {
      if (this._pipe) return Promise.resolve(this._pipe);
      if (this._loading) return this._loading;
      if (!this._pipelineFn) return Promise.reject(new Error('transformers-unavailable'));
      var self = this;
      this._loading = this._pipelineFn('zero-shot-image-classification', this.MODEL, cb ? { progress_callback: cb } : undefined).then(function (p) { self._pipe = p; return p; });
      return this._loading;
    },

    analyze: function (dataUrl, imgEl, cb) {
      var self = this;
      if (!this._pipelineFn) return Promise.resolve(this._heuristic(imgEl));
      return this.load(cb).then(function (pipe) {
        return pipe(dataUrl, LABELS.map(function (l) { return l.t; }), { hypothesis_template: '{}' });
      }).then(function (out) { return self._decide(out); }).catch(function () { return self._heuristic(imgEl); });
    },

    _decide: function (out) {
      var bySub = {}, labelScore = {};
      out.forEach(function (o) {
        labelScore[o.label] = o.score;
        var hit = LABELS.filter(function (l) { return l.t === o.label; })[0];
        if (hit) bySub[hit.c] = (bySub[hit.c] || 0) + o.score;
      });
      var best = 'NONE', bestScore = -1;
      Object.keys(bySub).forEach(function (c) { if (bySub[c] > bestScore) { bestScore = bySub[c]; best = c; } });
      var top = out.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 3)
        .map(function (o) { return { label: LABEL_KO[o.label] || o.label, score: Math.round(o.score * 100) / 100 }; });

      if (best === 'NONE' || bestScore < 0.30) {
        return { section: 'SAFETY', subcategory: null, confidence: Math.min(0.4, Math.max(0, bestScore)),
          objects: top, summary: '위험 유형이 불명확합니다 — 분야/유형을 선택해 주세요', source: 'clip' };
      }
      var sec = sectionOf(best);
      return {
        section: sec, subcategory: best,
        section_name: TAXONOMY[sec].name, subcategory_name: TAXONOMY[sec].subs[best],
        confidence: bestScore, objects: top,
        summary: TAXONOMY[sec].subs[best] + ' 추정 (근거: ' + (top[0] ? top[0].label + ' ' + (top[0].score * 100).toFixed(0) + '%' : '') + ')',
        source: 'clip',
      };
    },

    _heuristic: function (imgEl) {
      if (!imgEl) return { section: 'SAFETY', subcategory: null, confidence: 0.3, objects: [], summary: 'AI 모델 미로드 — 분야/유형을 선택하세요', source: 'none' };
      var road = this.analyzeRoadSurface(imgEl);
      if (road.isAsphalt) return { section: 'SAFETY', subcategory: 'S_ROAD', section_name: '안전', subcategory_name: '도로·시설물 파손/고장', confidence: Math.max(0.5, Math.min(0.9, road.score)), objects: [{ label: '노면 손상 패턴', score: Math.round((road.score || 0.5) * 100) / 100 }], summary: '도로 노면 손상 추정(폴백)', source: 'heuristic' };
      return { section: 'SAFETY', subcategory: null, confidence: 0.3, objects: [], summary: '브라우저 모델 미로드(폴백)', source: 'heuristic' };
    },

    analyzeRoadSurface: function (imgEl) {
      var W = 180, ow = imgEl.naturalWidth || imgEl.width, oh = imgEl.naturalHeight || imgEl.height;
      var scale = W / ow, H = Math.max(1, Math.round(oh * scale));
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(imgEl, 0, 0, W, H);
      var data = c.getContext('2d').getImageData(0, 0, W, H).data;
      var n = W * H, gray = new Float32Array(n), lowSat = 0, sum = 0;
      for (var i = 0, p = 0; i < data.length; i += 4, p++) {
        var r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
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
      return { isAsphalt: isAsphalt, score: isAsphalt ? Math.min(1, (darkRough / n) * 14 + Math.max(0, (roughSum / n - 7)) / 35) : 0 };
    },

    downscale: function (imgEl, maxSize, quality) {
      maxSize = maxSize || 640; quality = quality || 0.7;
      var w = imgEl.naturalWidth || imgEl.width, h = imgEl.naturalHeight || imgEl.height;
      var scale = Math.min(1, maxSize / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(imgEl, 0, 0, cw, ch);
      return cv.toDataURL('image/jpeg', quality);
    },
  };
  global.CivicVision = CivicVision;
})(window);
