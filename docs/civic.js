// 클라이언트 전용 엔진 (GitHub Pages) — 안전신문고 3대 분류 체계. localStorage 저장.
(function (global) {
  'use strict';
  var REPORT_STATUS = ['received', 'in_progress', 'done', 'rejected', 'invalid'];
  var TRANS = { received:['in_progress','rejected','invalid'], in_progress:['done','rejected','invalid'], done:[], rejected:[], invalid:[] };
  function canTransition(f, t){ return REPORT_STATUS.indexOf(t)>=0 && (TRANS[f]||[]).indexOf(t)>=0; }

  var TENANTS = [{ id:'tnt-cheongju', name:'충북 청주시 (파일럿)', bbox:[127.38,36.55,127.62,36.73], settings:{ rewardPointsPerValidReport:100 } }];
  var SECTIONS = { TRAFFIC:'자동차·교통 위반', LIVING:'생활불편', SAFETY:'안전' };
  var SUBCATEGORIES = {
    T_PARKING:{section:'TRAFFIC',name:'불법 주·정차',department:'교통지도과',priority:2},
    T_VIOLATION:{section:'TRAFFIC',name:'교통법규 위반(신호·과속 등)',department:'경찰서(연계)',priority:1},
    T_PLATE:{section:'TRAFFIC',name:'번호판 규정 위반',department:'차량등록과',priority:3},
    T_TUNING:{section:'TRAFFIC',name:'불법 튜닝·등화·반사판',department:'차량등록과',priority:3},
    L_TRASH:{section:'LIVING',name:'쓰레기·폐기물 무단투기',department:'청소행정과',priority:2},
    L_AD:{section:'LIVING',name:'불법 광고물',department:'도시미관과',priority:3},
    L_BIKE:{section:'LIVING',name:'자전거·이륜차 방치',department:'교통행정과',priority:3},
    L_ETC:{section:'LIVING',name:'기타 생활불편',department:'민원실',priority:3},
    S_ROAD:{section:'SAFETY',name:'도로·시설물 파손/고장',department:'도로관리과',priority:1},
    S_FLOOD:{section:'SAFETY',name:'여름철 침수·수해 위험',department:'치수과',priority:1},
    S_AIR:{section:'SAFETY',name:'대기오염',department:'환경관리과',priority:2},
    S_WATER:{section:'SAFETY',name:'수질오염',department:'환경관리과',priority:2},
    S_FIRE:{section:'SAFETY',name:'소방안전(소화전 등)',department:'소방서(연계)',priority:1},
    S_ETC:{section:'SAFETY',name:'기타 안전·환경 위험',department:'안전총괄과',priority:2},
  };
  function subBy(c){ return SUBCATEGORIES[c]||null; }
  function resolveTenant(lat,lng){ for(var i=0;i<TENANTS.length;i++){ var b=TENANTS[i].bbox; if(lng>=b[0]&&lng<=b[2]&&lat>=b[1]&&lat<=b[3]) return TENANTS[i]; } return null; }
  function dist(a,b){ var R=6371000,tr=function(d){return d*Math.PI/180;}; var dLat=tr(b.lat-a.lat),dLng=tr(b.lng-a.lng); var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(tr(a.lat))*Math.cos(tr(b.lat))*Math.sin(dLng/2)*Math.sin(dLng/2); return 2*R*Math.asin(Math.sqrt(s)); }
  var DUP=30;

  var KEY='civic_db_v2';
  function db(){ try{ return JSON.parse(localStorage.getItem(KEY))||empty(); }catch(e){ return empty(); } }
  function empty(){ return { reports:[], clusters:[], rewards:[], logs:[], seq:0 }; }
  function save(d){ localStorage.setItem(KEY, JSON.stringify(d)); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,10); }

  function assistantReply(message, r){
    if(r){ var dept=r.department||'민원실'; var step={received:'담당 부서 배정 대기 중입니다.',in_progress:dept+'에서 처리 중입니다.',done:'처리가 완료되었습니다.',rejected:'반려되었습니다. 담당 창구로 문의해 주세요.',invalid:'유효하지 않은 신고로 분류되었습니다.'};
      return { reply:'접수번호 '+r.tracking_no+' 신고('+(r.subcategory_name||'미분류')+')는 현재 "'+r.status+'" 상태입니다. '+(step[r.status]||''), sources:['처리 이력','담당: '+dept], grounded:true }; }
    return { reply:'근거 자료를 찾지 못했습니다. 관할 지자체 민원실(국번없이 120)로 문의해 주세요.', sources:[], grounded:false };
  }
  function genDoc(r){ return ['[표준 행정 처리 공문서 초안]','접수번호: '+r.tracking_no,'신고 분야: '+(r.section_name||'-')+' / '+(r.subcategory_name||'미분류'),'담당 부서: '+(r.department||'민원실'),'제목: '+(r.title||'-'),'발생 일시: '+((r.occurred_date||'-')+' '+(r.occurred_time||'')).trim(), (r.vehicle_no?'차량 번호: '+r.vehicle_no:null),'위치: ('+r.location.lat+', '+r.location.lng+')','신고 내용: '+(r.content||'-'),'조치 요청: 현장 확인 후 신속한 조치를 요청합니다.'].filter(Boolean).join('\n'); }

  var CivicAPI = {
    meta: function(){ return { sections:SECTIONS, subcategories:SUBCATEGORIES, tenants:TENANTS.map(function(t){return {id:t.id,name:t.name};}) }; },
    submitReport: function(input){
      if(typeof input.lat!=='number'||typeof input.lng!=='number'||!input.photo) return { error:true, errors:['사진과 위치는 필수입니다.'] };
      var d=db(); var sub=input.subcategory?subBy(input.subcategory):null; var section=sub?sub.section:(SECTIONS[input.section]?input.section:null);
      var tenant=resolveTenant(input.lat,input.lng); var point={lat:input.lat,lng:input.lng}; var clustered=null;
      if(tenant&&input.subcategory){
        var c=d.clusters.filter(function(x){return x.tenant_id===tenant.id&&x.status==='open'&&x.code===input.subcategory&&dist(x.centroid,point)<=DUP;})[0];
        if(c){ c.report_count++; clustered=c.id; } else { var nc={id:uid('cl'),tenant_id:tenant.id,code:input.subcategory,centroid:point,report_count:1,status:'open'}; d.clusters.push(nc); clustered=nc.id; }
      }
      d.seq++;
      var r={ id:uid('rep'), tracking_no:'CSR-2026-'+String(d.seq).padStart(5,'0'), tenant_id:tenant?tenant.id:null,
        photo_url:input.photo, section:section, section_name:section?SECTIONS[section]:null,
        subcategory:input.subcategory||null, subcategory_name:sub?sub.name:(input.subcategory_name||null), department:sub?sub.department:null,
        title:input.title||null, content:input.content||null, vehicle_no:input.vehicle_no||null,
        occurred_date:input.occurred_date||null, occurred_time:input.occurred_time||null,
        detected_objects:input.objects||[], ai_summary:input.ai_summary||null, ai_source:input.ai_source||null,
        location:point, submitted_at:new Date().toISOString(), classification_confidence:(typeof input.confidence==='number'?input.confidence:null),
        status:'received', priority:sub?sub.priority:3, cluster_id:clustered, submitter_account_id:input.account_id||null, purge_after:null };
      d.reports.push(r); d.logs.push({id:uid('log'),report_id:r.id,action:'received',created_at:r.submitted_at}); save(d);
      return { tracking_no:r.tracking_no, status:r.status, section:r.section_name, subcategory:r.subcategory_name, department:r.department, clustered_into:clustered, tenant:tenant?tenant.name:null, out_of_jurisdiction:!tenant };
    },
    getStatus: function(t){ var r=db().reports.filter(function(x){return x.tracking_no===t;})[0]; if(!r) return null;
      return { tracking_no:r.tracking_no, status:r.status, section:r.section_name, subcategory:r.subcategory_name, department:r.department, title:r.title, submitted_at:r.submitted_at, location:r.location, photo_url:r.photo_url }; },
    officerList: function(tenantId, filter){ filter=filter||{}; var rows=db().reports.filter(function(r){return r.tenant_id===tenantId;}); if(filter.status) rows=rows.filter(function(r){return r.status===filter.status;});
      rows.sort(function(a,b){return a.priority-b.priority||b.submitted_at.localeCompare(a.submitted_at);}); var d=db();
      return rows.map(function(r){ var cl=r.cluster_id?d.clusters.filter(function(x){return x.id===r.cluster_id;})[0]:null;
        return { id:r.id, tracking_no:r.tracking_no, section:r.section_name, category:r.subcategory_name, department:r.department, title:r.title, content:r.content, vehicle_no:r.vehicle_no, occurred_date:r.occurred_date, occurred_time:r.occurred_time, priority:r.priority, status:r.status, location:r.location, photo_url:r.photo_url, detected_objects:r.detected_objects||[], ai_summary:r.ai_summary||null, ai_source:r.ai_source||null, cluster:cl?{id:cl.id,report_count:cl.report_count}:null, submitted_at:r.submitted_at, confidence:r.classification_confidence }; }); },
    changeStatus: function(id,status){ var d=db(); var r=d.reports.filter(function(x){return x.id===id;})[0]; if(!r) return {error:true,message:'not found'}; if(!canTransition(r.status,status)) return {error:true,message:'허용되지 않은 전이: '+r.status+' → '+status}; r.status=status;
      if(status==='done'){ var dt=new Date(); dt.setFullYear(dt.getFullYear()+1); r.purge_after=dt.toISOString(); if(r.submitter_account_id&&!d.rewards.some(function(x){return x.report_id===r.id;})) d.rewards.push({id:uid('rw'),account_id:r.submitter_account_id,report_id:r.id,points:100,created_at:new Date().toISOString()}); }
      d.logs.push({id:uid('log'),report_id:r.id,action:'status_change',detail:{to:status},created_at:new Date().toISOString()}); save(d); return {ok:true,status:r.status}; },
    genDoc: function(id){ var r=db().reports.filter(function(x){return x.id===id;})[0]; if(!r) return {error:true}; return { id:uid('doc'), report_id:r.id, review_status:'draft', content:genDoc(r) }; },
    assistant: function(message,tracking){ var r=tracking?db().reports.filter(function(x){return x.tracking_no===tracking;})[0]:null; return assistantReply(message,r); },
    rewards: function(account){ var rows=db().rewards.filter(function(r){return r.account_id===account;}); return { balance:rows.reduce(function(s,r){return s+r.points;},0), history:rows }; },
    reset: function(){ localStorage.removeItem(KEY); }, TENANTS:TENANTS,
  };
  global.CivicAPI = CivicAPI;
})(window);
