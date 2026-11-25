// Vercel 서버리스 — 기사 요약 + 분야 분류 (선택 기능)
// ANTHROPIC_API_KEY 가 설정돼 있을 때만 동작한다. 없으면 501 을 돌려주고,
// 앱은 기기 안에서 무료로 요약(핵심 문장 추출)한다.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const SummarySchema = z.object({
  category: z.enum(['society', 'ai', 'beauty', 'other']),
  headline: z.string(),
  summary: z.array(z.string()),
  keywords: z.array(z.string()),
});

const SYSTEM = `당신은 운전 중 귀로 듣는 사람을 위해 기사를 정리하는 편집자입니다.
기사를 읽고 아래를 한국어로 돌려주세요.
- category: 기사의 분야. 정치·경제·사회·국제·사건 소식은 "society", 인공지능·IT 기술·개발 소식은 "ai",
  화장품·스킨케어·뷰티 업계·소비 트렌드 소식은 "beauty", 어디에도 맞지 않으면 "other".
- headline: 기사의 핵심을 한 문장(40자 이내)으로.
- summary: 핵심 내용 3개. 각각 귀로 들어도 이해되는 완결된 한 문장(60자 안팎). 기사에 없는 내용은 쓰지 마세요.
- keywords: 핵심 키워드 3~5개.
여러 소식을 묶은 뉴스레터라면 가장 비중이 큰 분야로 분류하고, summary 에는 주요 소식을 하나씩 담으세요.`;

export default async function handler(req, res) {
  const origin  = req.headers['origin']  || '';
  const referer = req.headers['referer'] || '';
  const allowed = origin.includes('vercel.app') || origin.includes('localhost') ||
                  referer.includes('vercel.app') || referer.includes('localhost');
  if (origin && !allowed) return res.status(403).json({ error: 'Forbidden' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // 키가 없으면 앱이 기기 안 요약으로 넘어가도록 알린다
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'no-key' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const title = String(body.title || '').slice(0, 300);
  const text  = String(body.text  || '');
  if (text.length < 80) return res.status(400).json({ error: 'text too short' });
  if (text.length > 12000) return res.status(413).json({ error: 'text too long' });

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: {
        effort: 'low',                       // 요약·분류는 짧은 작업이라 낮은 effort 로 충분
        format: zodOutputFormat(SummarySchema),
      },
      system: SYSTEM,
      messages: [{ role: 'user', content: `제목: ${title}\n\n본문:\n${text}` }],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return res.status(502).json({ error: 'no-summary' });   // 앱이 기기 안 요약으로 대체
    }
    const out = response.parsed_output;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      category: out.category,
      headline: out.headline,
      summary: out.summary.slice(0, 5),
      keywords: out.keywords.slice(0, 6),
      by: 'claude',
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'bad-key' });
    if (error instanceof Anthropic.RateLimitError)     return res.status(429).json({ error: 'rate-limited' });
    if (error instanceof Anthropic.APIError)           return res.status(502).json({ error: `api ${error.status}` });
    return res.status(500).json({ error: 'failed' });
  }
}
