// 실제 브라우저 비전 모델 (TensorFlow.js + COCO-SSD 객체탐지)
// 업로드된 사진 픽셀을 실제로 추론하여 객체를 탐지하고 위험 유형을 도출.
// 양쪽 채널(터널 풀스택 / GitHub Pages)에서 동일하게 동작 (클라이언트 사이드).
(function (global) {
  'use strict';

  // COCO 클래스 → 위험 유형 매핑 (휴리스틱). 탐지 자체는 실제 모델.
  var SIGN = ['stop sign', 'traffic light'];
  var FACILITY = ['fire hydrant', 'bench', 'parking meter'];
  var ROAD = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train'];

  var CivicVision = {
    _model: null,
    _loading: null,

    available: function () {
      return typeof global.cocoSsd !== 'undefined' && typeof global.tf !== 'undefined';
    },

    load: function () {
      if (this._model) return Promise.resolve(this._model);
      if (this._loading) return this._loading;
      if (!this.available()) return Promise.reject(new Error('vision-libs-unavailable'));
      var self = this;
      this._loading = global.cocoSsd.load().then(function (m) { self._model = m; return m; });
      return this._loading;
    },

    // 이미지 엘리먼트(또는 canvas)에서 실제 객체 탐지
    detect: function (imgEl) {
      return this.load().then(function (m) { return m.detect(imgEl); });
    },

    // 탐지 결과 → 위험 유형/신뢰도/후보/요약
    classify: function (predictions) {
      var objects = (predictions || []).map(function (p) {
        return { label: p.class, score: Math.round(p.score * 100) / 100 };
      });
      var persons = objects.filter(function (o) { return o.label === 'person'; }).length;

      function topScoreFor(list) {
        var best = 0;
        objects.forEach(function (o) { if (list.indexOf(o.label) >= 0 && o.score > best) best = o.score; });
        return best;
      }
      var sign = topScoreFor(SIGN), fac = topScoreFor(FACILITY), road = topScoreFor(ROAD);

      var category_code = null, confidence = 0;
      if (sign >= fac && sign >= road && sign > 0) { category_code = 'SAFETY_THREAT'; confidence = sign; }
      else if (fac >= road && fac > 0) { category_code = 'FACILITY_DAMAGE'; confidence = fac; }
      else if (road > 0) { category_code = 'ROAD_DAMAGE'; confidence = road; }

      // 신뢰도 0.55 미만이거나 매칭 없음 → 후보 제시 (FR-004)
      var candidates = [];
      if (!category_code || confidence < 0.55) {
        candidates = ['ROAD_DAMAGE', 'FACILITY_DAMAGE', 'FLOOD_RISK', 'SAFETY_THREAT'];
        if (confidence < 0.55) category_code = null;
      }
      return {
        category_code: category_code,
        confidence: confidence || (objects.length ? 0.4 : 0.3),
        candidate_categories: candidates,
        objects: objects,
        persons: persons,
      };
    },

    // 사진 다운스케일 → JPEG dataURL (저장·전송용 경량화)
    downscale: function (imgEl, maxSize, quality) {
      maxSize = maxSize || 640; quality = quality || 0.7;
      var w = imgEl.naturalWidth || imgEl.width, h = imgEl.naturalHeight || imgEl.height;
      var scale = Math.min(1, maxSize / Math.max(w, h));
      var cw = Math.round(w * scale), ch = Math.round(h * scale);
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      canvas.getContext('2d').drawImage(imgEl, 0, 0, cw, ch);
      return canvas.toDataURL('image/jpeg', quality);
    },
  };

  global.CivicVision = CivicVision;
})(window);
