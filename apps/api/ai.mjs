// AI 파이프라인 (백엔드) — 스텁/보조. 분류는 클라이언트(CLIP) 또는 Claude 비전이 수행.
// 여기서는 비식별 플래그, RAG 안내, 공문서 초안 생성만 담당.

// (R3) PII 비식별: 실제론 얼굴/번호판 탐지→블러. 여기선 처리 완료 플래그만 반환(원본 미저장 원칙 표현).
export function anonymizePhoto(photoName) {
  return { anonymizedName: `anon_${photoName || 'photo.jpg'}`, piiRemoved: true };
}

// (R5/R6) RAG 안내 — 스텁. report에 저장된 분야/부서를 활용.
export function assistantReply(message, report) {
  if (report) {
    const dept = report.department || '민원실';
    const stepByStatus = {
      received: '담당 부서 배정 대기 중입니다. 곧 검토가 시작됩니다.',
      in_progress: `${dept}에서 현장 확인·처리 중입니다.`,
      done: '처리가 완료되었습니다. 협조해 주셔서 감사합니다.',
      rejected: '검토 결과 반려되었습니다. 자세한 사유는 담당 창구로 문의해 주세요.',
      invalid: '유효하지 않은 신고로 분류되었습니다.',
    };
    return {
      reply: `접수번호 ${report.tracking_no} 신고(${report.subcategory_name || '미분류'})는 현재 "${report.status}" 상태입니다. ${stepByStatus[report.status] || ''}`,
      sources: ['처리 이력', `담당: ${dept}`],
      grounded: true,
    };
  }
  return {
    reply: '해당 질문에 대한 근거 자료를 찾지 못했습니다. 정확한 안내가 필요하시면 관할 지자체 민원실(국번없이 120)로 문의해 주세요.',
    sources: [], grounded: false,
  };
}

// LLM 공문서 초안 생성 (FR-015) — 스텁 텍스트 (신고 양식 내용 반영)
export function generateDocumentDraft(report) {
  return [
    `[표준 행정 처리 공문서 초안]`,
    `접수번호: ${report.tracking_no}`,
    `신고 분야: ${report.section_name || '-'} / ${report.subcategory_name || '미분류'}`,
    `담당 부서: ${report.department || '민원실'}`,
    `제목: ${report.title || '-'}`,
    `발생 일시: ${report.occurred_date || '-'} ${report.occurred_time || ''}`.trim(),
    report.vehicle_no ? `차량 번호: ${report.vehicle_no}` : null,
    `위치: (${report.location.lat}, ${report.location.lng})`,
    `신고 내용: ${report.content || '-'}`,
    `조치 요청: 현장 확인 후 신속한 조치를 요청합니다.`,
  ].filter(Boolean).join('\n');
}
