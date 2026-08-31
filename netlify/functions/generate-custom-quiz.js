import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

function sanitizeQuizKey(domain, level, depth) {
  const normDomain = String(domain || '').toLowerCase().trim();
  const normLevel = String(level || '').toLowerCase().trim();
  const normDepth = parseInt(depth, 10) || 5;
  return `${normDomain}__${normLevel}__${normDepth}`;
}

// Convert static terms into structured quiz questions
function buildQuizFromStaticDb(domain, depth) {
  try {
    const staticPath = path.join(process.cwd(), 'data', 'business_slang.json');
    if (!fs.existsSync(staticPath)) return null;

    const raw = fs.readFileSync(staticPath, 'utf8');
    const staticDb = JSON.parse(raw || '{}');
    if (!staticDb.terms || !staticDb.terms.length) return null;

    const normDomain = String(domain || '').toLowerCase().trim();
    const indObj = staticDb.industries?.find(i =>
      i.id.toLowerCase() === normDomain ||
      i.name.toLowerCase().includes(normDomain) ||
      normDomain.includes(i.name.toLowerCase())
    );

    const matchedId = indObj ? indObj.id : null;
    let matchingTerms = staticDb.terms.filter(t => {
      if (matchedId) return t.industry === matchedId;
      return t.industry.toLowerCase().includes(normDomain) ||
             (t.full_name && t.full_name.toLowerCase().includes(normDomain)) ||
             t.meaning.toLowerCase().includes(normDomain);
    });

    if (!matchingTerms || matchingTerms.length === 0) return null;

    const shuffled = [...matchingTerms].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(depth, matchingTerms.length));

    return selected.map((term, idx) => {
      const peerTerms = staticDb.terms.filter(t => t.id !== term.id);
      const peerShuffled = [...peerTerms].sort(() => 0.5 - Math.random());
      const distractors = peerShuffled.slice(0, 3).map(t => t.meaning);

      const options = [term.meaning, ...distractors].sort(() => 0.5 - Math.random());
      const correctIdx = options.indexOf(term.meaning);

      return {
        id: `static_${term.id}_${idx}`,
        term: term.term,
        industry: indObj ? indObj.name : domain,
        context_question: term.context_question || `In a workplace scenario, what does "${term.term}" mean?`,
        options: options,
        correct_option: correctIdx,
        explanation: `${term.term} ${term.full_name ? `(${term.full_name})` : ''} means: ${term.meaning}`,
        real_world_example: term.sample_interview_response 
          ? `Example: "${term.sample_interview_response}"`
          : `Example: "In our team, we applied ${term.term} to optimize operational performance."`,
        interview_tip: term.interview_tip || `Mention your understanding of ${term.term} when asked about industry best practices.`
      };
    });
  } catch (e) {
    console.warn('[Netlify Function] Static DB load warning:', e.message);
    return null;
  }
}

// DeepSeek LLM Caller
async function callLlmForCustomQuiz(domain, level, count = 5) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is not configured');
  }

  const numQs = Math.min(Math.max(parseInt(count, 10) || 5, 3), 10);
  const systemPrompt = `You are an expert executive coach and master technical interviewer.
Generate an array of exactly ${numQs} multiple-choice workplace scenario quiz questions for domain "${domain}" at level "${level}".
JSON format:
{
  "quiz": [
    {
      "id": "custom_1",
      "term": "Term Name",
      "context_question": "Workplace scenario description...",
      "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "correct_option": 0,
      "explanation": "Rationale explanation...",
      "real_world_example": "Concrete workplace sentence example...",
      "interview_tip": "How to say this in an interview..."
    }
  ]
}`;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a ${numQs}-question quiz for domain: ${domain}, level: ${level}.` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API Error HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices[0]?.message?.content;
  const parsed = JSON.parse(content);
  return parsed.quiz || parsed;
}

export default async function handler(req, context) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const bodyText = await req.text();
    const { domain, level, depth, forceRefresh } = JSON.parse(bodyText || '{}');

    if (!domain) {
      return new Response(JSON.stringify({ success: false, error: 'Domain is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const requestedDepth = parseInt(depth, 10) || 5;
    const key = sanitizeQuizKey(domain, level || 'Intermediate', requestedDepth);
    
    // Netlify Blob Store
    let store = null;
    try {
      store = getStore({ name: 'generated_quizzes' });
    } catch (e) {
      console.warn('[Netlify Blobs Store Init Warning]', e.message);
    }

    // Tier 1: Check Netlify Cloud Blob Cache
    if (!forceRefresh && store) {
      try {
        const cached = await store.get(key, { type: 'json' });
        if (cached && Array.isArray(cached) && cached.length > 0) {
          console.log(`[Netlify Blob Hit] Loaded quiz for "${key}" (0 AI tokens)`);
          return new Response(JSON.stringify({ success: true, quiz: cached, fromCache: true, source: 'NETLIFY_BLOB' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      } catch (blobErr) {
        console.warn('[Netlify Blob Read Error]', blobErr.message);
      }
    }

    // Tier 2: Check Static Terms DB
    if (!forceRefresh) {
      const staticQuiz = buildQuizFromStaticDb(domain, requestedDepth);
      if (staticQuiz && staticQuiz.length > 0) {
        console.log(`[Static Terms DB Hit] Built quiz for "${domain}" (0 AI tokens)`);
        if (store) {
          try { await store.setJSON(key, staticQuiz); } catch (e) {}
        }
        return new Response(JSON.stringify({ success: true, quiz: staticQuiz, fromCache: true, source: 'STATIC_TERMS_DB' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Tier 3: DeepSeek AI Generation (For new custom topics)
    console.log(`[Netlify Function AI] Generating DeepSeek quiz for custom topic "${domain}"...`);
    const quizList = await callLlmForCustomQuiz(domain, level || 'Intermediate', requestedDepth);

    if (store && Array.isArray(quizList) && quizList.length > 0) {
      try {
        await store.setJSON(key, quizList);
        console.log(`[Netlify Blob Saved] Stored new AI quiz for key: "${key}"`);
      } catch (e) {
        console.warn('[Netlify Blob Write Error]', e.message);
      }
    }

    return new Response(JSON.stringify({ success: true, quiz: quizList, fromCache: false, source: 'AI_DEEPSEEK' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    console.error('[Netlify Function Error]', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
