// Claude 비전 분류 (백엔드 전용 — API 키는 서버에만)
// 사진을 의미로 이해하여 5개 위험 유형으로 분류 + 설명. 키 없으면 비활성(프론트는 브라우저 모델로 폴백).
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_VISION_MODEL || 'claude-opus-4-8';
const CATEGORIES = ['ROAD_DAMAGE', 'FACILITY_DAMAGE', 'FLOOD_RISK', 'SAFETY_THREAT', 'ETC'];

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return _client;
}
export function available() { return !!process.env.ANTHROPIC_API_KEY; }

const PROMPT = [
  '당신은 도시 안전 신고 사진 분류기입니다. 업로드된 사진의 위험 요소를 분석해 한 가지 유형으로 분류하세요.',
  '유형 정의:',
  '- ROAD_DAMAGE: 도로 파손, 포트홀, 균열, 노면 손상',
  '- FACILITY_DAMAGE: 시설물 훼손(파손된 표지판·가드레일·벤치·맨홀·가로등 등)',
  '- FLOOD_RISK: 침수, 물고임, 하천 범람 등 치수 위험',
  '- SAFETY_THREAT: 낙하물, 위험물, 쓰러진 구조물 등 직접적 안전 위협',
  '- ETC: 위 어디에도 해당하지 않거나 위험 요소가 불명확',
  '',
  '아래 형식의 JSON만 출력하세요(코드펜스·설명 금지):',
  '{"category_code":"<코드>","confidence":<0~1 숫자>,"summary":"<한국어 한 문장>","detected":["<핵심 객체/근거>", ...]}',
].join('\n');

export async function classifyWithClaude(dataUrl) {
  const c = client();
  if (!c) return { error: 'no_key' };
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return { error: 'bad_image' };
  const [, media_type, data] = m;

  let res;
  try {
    res = await c.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type, data } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } catch (e) {
    return { error: 'api', message: String(e && e.message || e) };
  }
  if (res.stop_reason === 'refusal') return { error: 'refusal' };

  const textBlock = (res.content || []).find((b) => b.type === 'text');
  let raw = (textBlock && textBlock.text || '').trim();
  raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim(); // 코드펜스 방어
  let p;
  try { p = JSON.parse(raw); } catch { return { error: 'parse', raw }; }

  const code = CATEGORIES.includes(p.category_code) ? p.category_code : 'ETC';
  const conf = typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.7;
  return {
    category_code: code,
    confidence: conf,
    candidate_categories: conf < 0.55 ? CATEGORIES.filter((x) => x !== 'ETC') : [],
    summary: typeof p.summary === 'string' ? p.summary : '',
    objects: Array.isArray(p.detected) ? p.detected.map((d) => ({ label: String(d), score: conf })) : [],
    model: MODEL,
    source: 'claude',
  };
}
