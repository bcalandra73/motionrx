import type {
  AnalysisReport,
  AnthropicContent,
  AnthropicResponse,
  ExtractedFrame,
  Finding,
} from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANALYSIS_MODEL = 'claude-sonnet-4-6';
const ANALYSIS_MAX_TOKENS = 8192;

export interface GenerateReportParams {
  apiKey:   string;
  prompt:   string;
  frames:   ExtractedFrame[];
  frames2?: ExtractedFrame[];
}

export async function generateReport(params: GenerateReportParams): Promise<AnalysisReport> {
  const { apiKey, prompt, frames, frames2 = [] } = params;

  const content: AnthropicContent[] = [
    ...frames.map(f => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.imageData },
    })),
    ...frames2.map(f => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: f.imageData },
    })),
    { type: 'text' as const, text: prompt },
  ];

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      max_tokens: ANALYSIS_MAX_TOKENS,
      messages: [{ role: 'user', content }],
    }),
  });

  const data: AnthropicResponse = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `API error ${res.status}`);
  }

  const raw = data.content.map(b => b.text ?? '').join('');
  return parseReportResponse(raw);
}

function parseReportResponse(raw: string): AnalysisReport {
  // Primary: well-formed JSON
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim()) as AnalysisReport;
  } catch {
    // Fallback: regex extraction when the model wraps JSON in prose
  }

  const r: Partial<AnalysisReport> = {};

  const scoreMatch = raw.match(/"score"\s*:\s*(\d+)/);
  if (scoreMatch) r.score = parseInt(scoreMatch[1], 10);

  const summaryMatch = raw.match(/"score_summary"\s*:\s*"([^"]+)"/);
  if (summaryMatch) r.score_summary = summaryMatch[1];

  const bioMatch = raw.match(/"biomechanical_analysis"\s*:\s*"((?:[^"\\]|\\[\s\S])*?)"/);
  if (bioMatch) r.biomechanical_analysis = bioMatch[1].replace(/\\n/g, '\n');

  const clinMatch = raw.match(/"clinical_impressions"\s*:\s*"((?:[^"\\]|\\[\s\S])*?)"/);
  if (clinMatch) r.clinical_impressions = clinMatch[1].replace(/\\n/g, '\n');

  const findings: Finding[] = [];
  const findingIter = raw.matchAll(
    /\{[^{}]*?"priority"\s*:\s*"([^"]+)"[^{}]*?"title"\s*:\s*"([^"]+)"[^{}]*?"detail"\s*:\s*"([^"]+)"[^{}]*?\}/g,
  );
  for (const m of findingIter) {
    findings.push({ priority: m[1] as Finding['priority'], title: m[2], detail: m[3] });
  }
  if (findings.length) r.findings = findings;

  const recsBlock = raw.match(/"recommendations"\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  r.recommendations = [...recsBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map(m => m[1])
    .filter(s => s.length > 15);

  const eduBlock = raw.match(/"patient_education"\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  r.patient_education = [...eduBlock.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map(m => m[1])
    .filter(s => s.length > 15);

  const footwearMatch = raw.match(/"footwear_recommendation"\s*:\s*"([\s\S]*?)(?<!\\)"/);
  if (footwearMatch) {
    r.footwear_recommendation = footwearMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  if (!r.score && !r.findings?.length && !r.recommendations?.length) {
    throw new Error('Could not parse a valid report from the API response.');
  }

  return r as AnalysisReport;
}
