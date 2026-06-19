// 안전신문고식 신고 양식 빌더 — 섹션(분야)별로 다른 양식 + AI 자동 채움.
// CivicVision.TAXONOMY를 단일 소스로 사용. 개인정보(인적사항) 항목은 구현하지 않음.
(function (global) {
  'use strict';
  var T = function () { return global.CivicVision.TAXONOMY; };

  function el(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }

  var CivicForm = {
    build: function (container) {
      var tax = T();
      var secOpts = Object.keys(tax).map(function (s) { return '<option value="' + s + '">' + tax[s].name + '</option>'; }).join('');
      container.innerHTML = [
        '<label>신고 분야</label>',
        '<select id="rf_section">' + secOpts + '</select>',
        '<label>세부 유형</label>',
        '<select id="rf_sub"></select>',
        '<label>제목 <span class="muted">(AI 자동작성 · 수정 가능)</span></label>',
        '<input id="rf_title" placeholder="제목" />',
        '<label>신고 내용 <span class="muted">(AI 자동작성 · 수정 가능)</span></label>',
        '<textarea id="rf_content" rows="5" placeholder="신고 내용"></textarea>',
        '<div class="row">',
        '  <div><label>발생 일자</label><input id="rf_date" type="date" /></div>',
        '  <div><label>발생 시각</label><input id="rf_time" type="time" /></div>',
        '</div>',
        '<div id="rf_vehicleWrap" class="hidden"><label>차량 번호 <span class="muted">(선택)</span></label><input id="rf_vehicle" placeholder="예: 12가 3456" /></div>',
        '<p class="muted">📷 일시는 사진 정보가 있으면 자동 입력됩니다. 없으면 직접 입력하세요. (개인정보 항목은 데모에서 생략)</p>',
      ].join('\n');
      el('rf_section').addEventListener('change', function () { CivicForm.populateSubs(el('rf_section').value); CivicForm._toggleVehicle(); });
      this.populateSubs(el('rf_section').value);
      this._toggleVehicle();
    },

    populateSubs: function (section) {
      var subs = T()[section].subs;
      el('rf_sub').innerHTML = Object.keys(subs).map(function (c) { return '<option value="' + c + '">' + subs[c] + '</option>'; }).join('');
    },

    _toggleVehicle: function () {
      var isTraffic = el('rf_section').value === 'TRAFFIC';
      el('rf_vehicleWrap').classList.toggle('hidden', !isTraffic);
    },

    // AI 결과 + EXIF로 양식 자동 채움
    prefill: function (result, exifDate) {
      var tax = T();
      var sec = result.section && tax[result.section] ? result.section : 'SAFETY';
      el('rf_section').value = sec; this.populateSubs(sec); this._toggleVehicle();
      if (result.subcategory && tax[sec].subs[result.subcategory]) el('rf_sub').value = result.subcategory;

      var subName = el('rf_sub').selectedOptions[0] ? el('rf_sub').selectedOptions[0].textContent : '';
      var topLabel = (result.objects && result.objects[0]) ? result.objects[0].label : subName;
      // 제목/내용 AI 자동작성
      if (result.subcategory) {
        el('rf_title').value = '[' + subName + '] ' + topLabel + ' 신고';
        var lines = [];
        lines.push('첨부 사진을 AI가 분석한 결과 "' + subName + '"에 해당하는 것으로 추정됩니다.');
        if (result.objects && result.objects.length) lines.push('· AI 인식 근거: ' + result.objects.map(function (o) { return o.label + '(' + (o.score * 100).toFixed(0) + '%)'; }).join(', '));
        if (typeof result.confidence === 'number') lines.push('· 분류 신뢰도: ' + (result.confidence * 100).toFixed(0) + '%');
        lines.push('현장 확인 및 신속한 조치를 요청드립니다.');
        el('rf_content').value = lines.join('\n');
      } else {
        el('rf_title').value = '';
        el('rf_content').value = (result.summary || '') + '\n사진을 확인하여 분야/유형을 선택하고 내용을 보완해 주세요.';
      }
      // 발생 일시 (EXIF 우선)
      if (exifDate instanceof Date && !isNaN(exifDate)) {
        el('rf_date').value = exifDate.getFullYear() + '-' + pad(exifDate.getMonth() + 1) + '-' + pad(exifDate.getDate());
        el('rf_time').value = pad(exifDate.getHours()) + ':' + pad(exifDate.getMinutes());
      }
      // 없으면 비워둠(요구사항) — 자동 현재시각 채우지 않음
    },

    collect: function () {
      var sec = el('rf_section').value;
      var sub = el('rf_sub').value;
      return {
        section: sec, section_name: T()[sec].name,
        subcategory: sub, subcategory_name: el('rf_sub').selectedOptions[0] ? el('rf_sub').selectedOptions[0].textContent : '',
        title: el('rf_title').value.trim(),
        content: el('rf_content').value.trim(),
        occurred_date: el('rf_date').value || null,
        occurred_time: el('rf_time').value || null,
        vehicle_no: sec === 'TRAFFIC' ? (el('rf_vehicle').value.trim() || null) : null,
      };
    },

    validate: function () {
      if (!el('rf_title').value.trim() || el('rf_title').value.trim().length < 2) return '제목을 2자 이상 입력하세요.';
      if (!el('rf_content').value.trim()) return '신고 내용을 입력하세요.';
      return null;
    },
  };
  global.CivicForm = CivicForm;
})(window);
