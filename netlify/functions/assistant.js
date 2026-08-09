// UltraMed Field Ops — AI assistant proxy.
// Keeps the Anthropic API key server-side: the app POSTs the conversation plus
// a snapshot of its own data, and this function relays it to Claude.
// Requires the ANTHROPIC_API_KEY environment variable (Netlify site settings).
const Anthropic = require('@anthropic-ai/sdk');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM = `You are the built-in AI assistant of "UltraMed Field Ops", an internal app used by UltraMed's medical sales team in Kuwait (dental and oral-care products such as Philips Sonicare, TePe, Waterpik, HiSmile). Users are field sales reps and their supervisor.

Rules:
- Reply in the same language the user writes (Arabic or English). Kuwaiti-friendly, professional tone.
- For facts about clinics, visits, orders, revenue, products, targets or events, use ONLY the live app data JSON below. Never invent clinics, numbers, doctors or visits. If the data doesn't contain the answer, say so plainly.
- Money is in Kuwaiti Dinars (KD).
- Be concise and practical: short paragraphs or brief bullet lists, no filler.
- When asked for help acting (visit prep, follow-up WhatsApp/email drafts, weekly plans, which clinic to prioritize), be concrete and ground every suggestion in the actual data (e.g. name the clinic, its class, days since last visit).
- You cannot modify app data — if asked to change something, explain where in the app to do it.`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'NO_KEY' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'BAD_JSON' }) }; }

  const raw = Array.isArray(payload.messages) ? payload.messages : [];
  const messages = raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'NO_MESSAGE' }) };
  }

  const context = JSON.stringify(payload.context || {}).slice(0, 60000);
  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1000,
      output_config: { effort: 'low' },
      system: SYSTEM + '\n\nLive app data (JSON):\n' + context,
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ reply: "Sorry — I can't help with that request." }) };
    }
    const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ reply }) };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'UPSTREAM', detail: String((e && e.message) || e).slice(0, 200) }) };
  }
};
