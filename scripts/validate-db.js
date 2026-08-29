import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../data/business_slang.json');

try {
  const content = fs.readFileSync(dbPath, 'utf8');
  const data = JSON.parse(content);

  console.log(`✅ Loaded JSON successfully!`);
  console.log(`📊 Industries count: ${data.industries.length}`);
  console.log(`📊 Terms count: ${data.terms.length}`);

  let errors = 0;
  const requiredFields = ['id', 'term', 'industry', 'type', 'level', 'meaning', 'interview_tip', 'sample_interview_response', 'options', 'correct_option'];

  data.terms.forEach((term, index) => {
    requiredFields.forEach(field => {
      if (term[field] === undefined || term[field] === null || term[field] === '') {
        console.error(`❌ Term #${index + 1} (${term.term || 'UNKNOWN'}) missing field: ${field}`);
        errors++;
      }
    });

    if (!Array.isArray(term.options) || term.options.length !== 4) {
      console.error(`❌ Term (${term.term}) must have exactly 4 options`);
      errors++;
    }

    if (term.correct_option < 0 || term.correct_option > 3) {
      console.error(`❌ Term (${term.term}) correct_option must be 0-3`);
      errors++;
    }
  });

  if (errors === 0) {
    console.log(`🎉 Validation Passed! All ${data.terms.length} terms are valid and complete.`);
    process.exit(0);
  } else {
    console.error(`💥 Validation failed with ${errors} error(s).`);
    process.exit(1);
  }
} catch (err) {
  console.error(`💥 JSON Parse Error: ${err.message}`);
  process.exit(1);
}
