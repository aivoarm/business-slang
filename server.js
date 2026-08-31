import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load environment variables from .env
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// 1. Single-question generator proxy
async function callLlmForQuizQuestion(termData, peerTerms) {
  const systemPrompt = `You are an expert executive coach creating multiple-choice questions for industry slang literacy.
Given a term, its meaning, sector, and peer terms in the same sector:
Generate a realistic workplace scenario context question and 4 plausible options.
Rules:
1. "options" must be an array of exactly 4 strings.
2. "correct_option" MUST be word-for-word identical to one of the 4 options.
3. "explanation" should be 1-2 concise sentences explaining why the correct choice is right and how it applies in job interviews.
4. "context_question" should describe a realistic workplace scenario where knowing this term is key.
5. Distractors (the 3 incorrect options) should be drawn or inspired by terms from the same sector so they are highly plausible.
Output MUST be strict raw JSON without markdown wrapping.`;

  const userPrompt = JSON.stringify({
    targetTerm: termData.term,
    sector: termData.industry,
    canonicalMeaning: termData.meaning,
    peerTerms: peerTerms ? peerTerms.slice(0, 5).map(p => ({ term: p.term, meaning: p.meaning })) : []
  });

  // DeepSeek API (Primary Provider)
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7
        })
      });
      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          console.log('[Proxy] Success using DeepSeek API');
          return JSON.parse(content);
        }
      } else {
        const errText = await res.text();
        console.warn(`[Proxy] DeepSeek failed (${res.status}):`, errText.substring(0, 150));
      }
    } catch (e) {
      console.warn('[Proxy] DeepSeek network error, trying fallback...', e.message);
    }
  }

  // Gemini API (Fallback 1)
  if (process.env.GEMINI_API_KEY) {
    for (const model of ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash']) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${systemPrompt}\n\nInput Data:\n${userPrompt}\n\nReturn strict JSON format with keys: context_question, options, correct_option, explanation.` }]
            }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
        if (res.ok) {
          const json = await res.json();
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            console.log(`[Proxy] Success using Gemini model ${model}`);
            return JSON.parse(text);
          }
        } else {
          const errText = await res.text();
          console.warn(`[Proxy] Gemini ${model} failed (${res.status}):`, errText.substring(0, 150));
        }
      } catch (e) {
        console.warn(`[Proxy] Gemini ${model} error:`, e.message);
      }
    }
  }

  // Anthropic API (Fallback 2)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.content?.[0]?.text;
        if (text) {
          console.log('[Proxy] Success using Anthropic API');
          return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        }
      } else {
        const errText = await res.text();
        console.warn(`[Proxy] Anthropic failed (${res.status}):`, errText.substring(0, 150));
      }
    } catch (e) {
      console.warn('[Proxy] Anthropic error:', e.message);
    }
  }

  throw new Error('All LLM providers failed or API keys invalid');
}

// 2. Custom Quiz Generator using DeepSeek API
async function callLlmForCustomQuiz(domain, level, count = 5) {
  const numQs = Math.min(Math.max(parseInt(count, 10) || 5, 3), 10);
  const systemPrompt = `You are an expert executive coach and master technical interviewer.
Generate an array of exactly ${numQs} multiple-choice workplace scenario quiz questions for the domain "${domain}" at proficiency level "${level}".
Rules for EACH question object in the array:
1. "term": Short name of the slang, acronym, or industry term being tested.
2. "context_question": A realistic workplace scenario situation where applying or knowing this term is key.
3. "options": Array of EXACTLY 4 distinct multiple-choice option strings.
4. "correct_option": Integer index (0, 1, 2, or 3) indicating which option in "options" is correct.
5. "explanation": 1-2 concise sentences explaining why the correct choice is right.
6. "real_world_example": A concrete real-world workplace sentence demonstrating how this term or concept is used in action on the job.
7. "interview_tip": A short practical candidate response tip for job interviews.

Return strict raw JSON without markdown wrapping with format:
{
  "quiz": [
    {
      "id": "custom_1",
      "term": "Term Name",
      "industry": "${domain}",
      "context_question": "Workplace scenario description...",
      "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "correct_option": 0,
      "explanation": "Rationale explanation...",
      "real_world_example": "Concrete workplace sentence example...",
      "interview_tip": "How to say this in an interview..."
    }
  ]
}`;

  // Primary: DeepSeek API
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate a ${numQs}-question custom quiz for domain: ${domain}, level: ${level}.` }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7
        })
      });
      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          console.log(`[Proxy] Custom Quiz generated via DeepSeek (${numQs} Qs for ${domain})`);
          const parsed = JSON.parse(content);
          return parsed.quiz || parsed;
        }
      } else {
        const errText = await res.text();
        console.warn(`[Proxy] DeepSeek Custom Quiz failed (${res.status}):`, errText.substring(0, 150));
      }
    } catch (e) {
      console.warn('[Proxy] DeepSeek Custom Quiz error:', e.message);
    }
  }

  // Fallback: Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\nGenerate ${numQs} questions for domain: ${domain}, level: ${level}.` }]
          }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          console.log(`[Proxy] Custom Quiz generated via Gemini (${numQs} Qs)`);
          const parsed = JSON.parse(text);
          return parsed.quiz || parsed;
        }
      }
    } catch (e) {
      console.warn('[Proxy] Gemini Custom Quiz error:', e.message);
    }
  }

  throw new Error('Could not generate custom quiz');
}

// 3. Server-Side Persistent JSON Database for Custom Quizzes
const QUIZ_DB_PATH = path.join(__dirname, 'data', 'generated_quizzes.json');

function loadQuizDb() {
  try {
    if (fs.existsSync(QUIZ_DB_PATH)) {
      const raw = fs.readFileSync(QUIZ_DB_PATH, 'utf8');
      return JSON.parse(raw || '{}');
    }
  } catch (e) {
    console.warn('[DB Load Error] Initializing fresh quiz DB:', e.message);
  }
  return {};
}

function saveQuizDb(db) {
  try {
    const dataDir = path.dirname(QUIZ_DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(QUIZ_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB Save Error]', e.message);
  }
}

function sanitizeQuizKey(domain, level, depth) {
  const normDomain = String(domain || '').toLowerCase().trim();
  const normLevel = String(level || '').toLowerCase().trim();
  const normDepth = parseInt(depth, 10) || 5;
  return `${normDomain}__${normLevel}__${normDepth}`;
}

// Static Slang DB loader & Quiz Converter
const STATIC_SLANG_PATH = path.join(__dirname, 'data', 'business_slang.json');

function loadStaticSlangDb() {
  try {
    if (fs.existsSync(STATIC_SLANG_PATH)) {
      const raw = fs.readFileSync(STATIC_SLANG_PATH, 'utf8');
      return JSON.parse(raw || '{}');
    }
  } catch (e) {
    console.warn('[Static DB Load Error]', e.message);
  }
  return { terms: [], industries: [] };
}

function buildQuizFromStaticDb(domain, depth) {
  const staticDb = loadStaticSlangDb();
  if (!staticDb.terms || !staticDb.terms.length) return null;

  const normDomain = String(domain || '').toLowerCase().trim();
  
  // Find matching industry object or filter terms directly
  const indObj = staticDb.industries.find(i => 
    i.id.toLowerCase() === normDomain ||
    i.name.toLowerCase().includes(normDomain) ||
    normDomain.includes(i.name.toLowerCase())
  );

  const matchedIndustryId = indObj ? indObj.id : null;

  const matchingTerms = staticDb.terms.filter(t => {
    if (matchedIndustryId) return t.industry === matchedIndustryId;
    return t.industry.toLowerCase().includes(normDomain) || 
           (t.full_name && t.full_name.toLowerCase().includes(normDomain)) ||
           t.meaning.toLowerCase().includes(normDomain);
  });

  if (!matchingTerms || matchingTerms.length === 0) return null;

  const shuffled = [...matchingTerms].sort(() => 0.5 - Math.random());
  const selectedTerms = shuffled.slice(0, Math.min(depth, matchingTerms.length));

  const quiz = selectedTerms.map((term, idx) => {
    const peerTerms = staticDb.terms.filter(t => t.id !== term.id);
    const peerShuffled = [...peerTerms].sort(() => 0.5 - Math.random());
    const distractors = peerShuffled.slice(0, 3).map(t => t.meaning);

    const options = [term.meaning, ...distractors].sort(() => 0.5 - Math.random());
    const correctIdx = options.indexOf(term.meaning);

    return {
      id: `static_${term.id}_${idx}`,
      term: term.term,
      industry: indObj ? indObj.name : domain,
      context_question: term.context_question || `In a workplace setting, what does "${term.term}" refer to?`,
      options: options,
      correct_option: correctIdx,
      explanation: `${term.term} ${term.full_name ? `(${term.full_name})` : ''} means: ${term.meaning}`,
      real_world_example: term.sample_interview_response 
        ? `Example: "${term.sample_interview_response}"`
        : `Example: "In our project, we applied ${term.term} to optimize operational performance."`,
      interview_tip: term.interview_tip || `Mention your understanding of ${term.term} when asked about industry best practices.`
    };
  });

  return quiz;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Route 1: POST /api/generate-question (single term dynamic options)
  if (req.url === '/api/generate-question' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { term, peerTerms } = JSON.parse(body || '{}');
        if (!term || !term.term) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing term payload' }));
          return;
        }

        const generated = await callLlmForQuizQuestion(term, peerTerms);

        if (!generated || !Array.isArray(generated.options) || generated.options.length !== 4) {
          throw new Error('Generated response invalid format (must have 4 options)');
        }

        if (!generated.options.includes(generated.correct_option)) {
          const matched = generated.options.find(o => o.trim() === generated.correct_option?.trim());
          if (matched) {
            generated.correct_option = matched;
          } else {
            generated.correct_option = generated.options[0];
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, data: generated }));
      } catch (err) {
        console.error('[API Error]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Route 2: POST /api/generate-custom-quiz (DB-First Zero-Token Quiz Strategy)
  if (req.url === '/api/generate-custom-quiz' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { domain, level, depth, forceRefresh } = JSON.parse(body || '{}');
        if (!domain) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Domain is required' }));
          return;
        }

        const requestedDepth = parseInt(depth, 10) || 5;
        const key = sanitizeQuizKey(domain, level || 'Intermediate', requestedDepth);
        const db = loadQuizDb();

        // Tier 1: Check Exact DB Key match in generated_quizzes.json
        if (!forceRefresh && db[key] && Array.isArray(db[key].quiz) && db[key].quiz.length > 0) {
          console.log(`[DB Tier 1 - Exact Key] Instant load for "${key}" (0 AI tokens)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, quiz: db[key].quiz, fromCache: true, source: 'DB_EXACT' }));
          return;
        }

        // Tier 2: Check Fuzzy Domain Key match in generated_quizzes.json
        if (!forceRefresh) {
          const normDomain = domain.toLowerCase().trim();
          const foundKey = Object.keys(db).find(k => k.includes(normDomain) && Array.isArray(db[k].quiz) && db[k].quiz.length > 0);
          if (foundKey) {
            console.log(`[DB Tier 2 - Fuzzy Match] Instant load for "${domain}" from "${foundKey}" (0 AI tokens)`);
            const slicedQuiz = db[foundKey].quiz.slice(0, requestedDepth);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, quiz: slicedQuiz, fromCache: true, source: 'DB_FUZZY' }));
            return;
          }
        }

        // Tier 3: Check Static Database (data/business_slang.json)
        if (!forceRefresh) {
          const staticQuiz = buildQuizFromStaticDb(domain, requestedDepth);
          if (staticQuiz && staticQuiz.length > 0) {
            console.log(`[DB Tier 3 - Static Slang DB] Built quiz for "${domain}" (${staticQuiz.length} Qs, 0 AI tokens)`);
            db[key] = {
              domain,
              level,
              depth: requestedDepth,
              updatedAt: new Date().toISOString(),
              quiz: staticQuiz
            };
            saveQuizDb(db);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, quiz: staticQuiz, fromCache: true, source: 'STATIC_SLANG_DB' }));
            return;
          }
        }

        // Tier 4: DeepSeek API Call (Last Resort ONLY for unrecognized custom domains)
        console.log(`[DB Tier 4 - AI Generator] Calling DeepSeek API for custom topic "${domain}"...`);
        const quizList = await callLlmForCustomQuiz(domain, level || 'Intermediate', requestedDepth);
        
        db[key] = {
          domain,
          level,
          depth: requestedDepth,
          updatedAt: new Date().toISOString(),
          quiz: quizList
        };
        saveQuizDb(db);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, quiz: quizList, fromCache: false, source: 'AI_DEEPSEEK' }));
      } catch (err) {
        console.error('[Custom Quiz API Error]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static File Server
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 buz-slang server & AI proxy running at http://localhost:${PORT}`);
});
