// 실제 브라우저 비전 (TensorFlow.js COCO-SSD 객체탐지 + 노면 손상 영상 분석 휴리스틱)
// 업로드 사진 픽셀을 실제로 분석하여 위험 유형 도출. 양쪽 채널 동일 동작(클라이언트).
// 주의: COCO-SSD는 '포트홀' 클래스가 없으므로, 노면 손상은 별도 픽셀 분석으로 보완.
(function (global) {
  'use strict';

  var SIGN = ['stop sign', 'traffic light'];
  var FACILITY = ['fire hydrant', 'bench', 'parking meter'];
  var VEHICLE = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train'];

  var CivicVision = {
    _model: null, _loading: null,
    available: function () { return typeof global.cocoSsd !== 'undefined' && typeof global.tf !== 'undefined'; },
    load: function () {
      if (this._model) return Promise.resolve(this._model);
      if (this._loading) return this._loading;
      if (!this.available()) return Promise.reject(new Error('vision-libs-unavailable'));
      var self = this;
      this._loading = global.cocoSsd.load().then(function (m) { self._model = m; return m; });
      return this._loading;
    },
    detect: function (imgEl) { return this.load().then(function (m) { return m.detect(imgEl); }); },

    // 노면 손상 영상 분석 (canvas 픽셀): 아스팔트 장면 여부 + 어둡고 거친 손상/균열 비율
    analyzeRoadSurface: function (imgEl) {
      var W = 180;
      var ow = imgEl.naturalWidth || imgEl.width, oh = imgEl.naturalHeight || imgEl.height;
      var scale = W / ow, H = Math.max(1, Math.round(oh * scale));
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var ctx = c.getContext('2d'); ctx.drawImage(imgEl, 0, 0, W, H);
      var data = ctx.getImageData(0, 0, W, H).data;
      var n = W * H, gray = new Float32Array(n), lowSat = 0, sum = 0;
      for (var i = 0, p = 0; i < data.length; i += 4, p++) {
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        var sat = mx === 0 ? 0 : (mx - mn) / mx;
        if (sat < 0.22) lowSat++;
        var lum = 0.299 * r + 0.587 * g + 0.114 * b; gray[p] = lum; sum += lum;
      }
      var mean = sum / n, grayFrac = lowSat / n;
      var v = 0; for (var q = 0; q < n; q++) { var d = gray[q] - mean; v += d * d; }
      var std = Math.sqrt(v / n);
      var darkRough = 0, roughSum = 0;
      for (var y = 1; y < H - 1; y++) {
        for (var x = 1; x < W - 1; x++) {
          var idx = y * W + x;
          var mag = Math.abs(gray[idx + 1] - gray[idx - 1]) + Math.abs(gray[idx + W] - gray[idx - W]);
          roughSum += mag;
          if (gray[idx] < mean - 0.45 * std && mag > 16) darkRough++;
        }
      }
      var darkRoughFrac = darkRough / n, avgRough = roughSum / n;
      var isAsphalt = grayFrac > 0.42 && mean > 40 && mean < 210;
      // 손상 점수: 어둡고 거친 영역(포트홀) + 전반적 거칠기(균열/자갈)
      var score = isAsphalt ? Math.min(1, darkRoughFrac * 14 + Math.max(0, (avgRough - 7)) / 35) : 0;
      return { isAsphalt: isAsphalt, score: score, grayFrac: grayFrac, darkRoughFrac: darkRoughFrac, avgRough: avgRough };
    },

    // 통합 분석: COCO 객체탐지 + 노면 손상 → 위험 유형/신뢰도/후보/객체요약
    analyze: function (imgEl) {
      var self = this;
      var road = this.analyzeRoadSurface(imgEl);
      return this.detect(imgEl).then(function (preds) {
        return self._decide(preds, road);
      }).catch(function () {
        return self._decide([], road); // 모델 실패해도 노면 분석만으로 판단
      });
    },

    _decide: function (predictions, road) {
      var objects = (predictions || []).map(function (p) { return { label: p.class, score: Math.round(p.score * 100) / 100 }; });
      var persons = objects.filter(function (o) { return o.label === 'person'; }).length;
      function top(list) { var b = 0; objects.forEach(function (o) { if (list.indexOf(o.label) >= 0 && o.score > b) b = o.score; }); return b; }
      var sign = top(SIGN), fac = top(FACILITY), veh = top(VEHICLE);

      var category_code = null, confidence = 0, note = '';
      if (sign >= 0.45 && sign >= fac) { category_code = 'SAFETY_THREAT'; confidence = sign; }
      else if (fac >= 0.45) { category_code = 'FACILITY_DAMAGE'; confidence = fac; }
      else if (road.isAsphalt && road.score >= 0.4) {
        category_code = 'ROAD_DAMAGE'; confidence = Math.max(0.6, Math.min(0.95, road.score));
        note = '노면 손상 패턴 감지';
      } else if (road.isAsphalt) {
        // 아스팔트 장면인데 손상 점수 낮음 → 도로 관련로 추정(낮은 신뢰도, 후보 제시)
        category_code = 'ROAD_DAMAGE'; confidence = 0.5; note = '도로 노면 추정';
      } else if (veh >= 0.5) {
        category_code = 'ROAD_DAMAGE'; confidence = veh * 0.7; note = '차량/도로 장면';
      }

      var candidates = [];
      if (!category_code || confidence < 0.55) {
        candidates = ['ROAD_DAMAGE', 'FACILITY_DAMAGE', 'FLOOD_RISK', 'SAFETY_THREAT'];
      }
      // UI 표시용 객체 요약 (COCO 객체 없고 노면 손상이면 합성 라벨)
      var shown = objects.slice();
      if (!shown.length && note) shown = [{ label: note, score: Math.round((road.score || confidence) * 100) / 100 }];

      return {
        category_code: category_code,
        confidence: confidence || (objects.length ? 0.4 : 0.3),
        candidate_categories: candidates,
        objects: shown, persons: persons, note: note,
        road: road,
      };
    },

    // 호환용 (이전 시그니처)
    classify: function (preds) { return this._decide(preds, { isAsphalt: false, score: 0 }); },

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
