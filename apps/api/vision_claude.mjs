// Claude 비전 분류 (백엔드 전용 — API 키는 서버에만). 안전신문고 3대 분류 체계로 사진을 의미 분류.
import Anthropic from '@anthropic-ai/sdk';
import { SUBCATEGORIES, SECTIONS } from './domain.mjs';

const MODEL = process.env.ANTHROPIC_VISION_MODEL || 'claude-opus-4-8';

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}
export function available() { return !!process.env.ANTHROPIC_API_KEY; }

function buildPrompt() {
  const lines = ['당신은 안전신문고 신고 사진 분류기입니다. 사진을 분석해 가장 적합한 세부유형 코드 하나를 고르세요.', '세부유형 코드 목록:'];
  for (const [code, v] of Object.entries(SUBCATEGORIES)) lines.push(`- ${code}: [${SECTIONS[v.section]}] ${v.name}`);
  lines.push('어디에도 해당하지 않으면 code를 "NONE"으로.');
  lines.push('JSON만 출력(코드펜스 금지): {"subcategory":"<코드>","confidence":<0~1>,"summary":"<한국어 한 문장>","detected":["<근거>", ...]}');
  return lines.join('\n');
}

export async function classifyWithClaude(dataUrl) {
  const c = client();
  if (!c) return { error: 'no_key' };
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return { error: 'bad_image' };
  const [, media_type, data] = m;

  let res;
  try {
    res = await c.messages.create({
      model: MODEL, max_tokens: 512,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type, data } },
        { type: 'text', text: buildPrompt() },
      ] }],
    });
  } catch (e) { return { error: 'api', message: String(e && e.message || e) }; }
  if (res.stop_reason === 'refusal') return { error: 'refusal' };

  const tb = (res.content || []).find((b) => b.type === 'text');
  let raw = (tb && tb.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let p; try { p = JSON.parse(raw); } catch { return { error: 'parse', raw }; }

  const code = SUBCATEGORIES[p.subcategory] ? p.subcategory : null;
  const conf = typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.7;
  const section = code ? SUBCATEGORIES[code].section : 'SAFETY';
  return {
    section, section_name: SECTIONS[section],
    subcategory: code, subcategory_name: code ? SUBCATEGORIES[code].name : null,
    confidence: conf,
    objects: Array.isArray(p.detected) ? p.detected.map((d) => ({ label: String(d), score: conf })) : [],
    summary: typeof p.summary === 'string' ? p.summary : '',
    model: MODEL, source: 'claude',
  };
}
