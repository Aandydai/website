const fs = require('fs');
const c = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = c.split('\n');

// Check line 238 (index 237)
const l238 = lines[237];
console.log('=== Line 238 ===');
console.log('Raw content:');
for (let i = 0; i < l238.length; i++) {
  const ch = l238[i];
  const code = ch.charCodeAt(0);
  if (code === 96) console.log(`  pos ${i}: BACKTICK (${code})`);
  else if (ch === '"') console.log(`  pos ${i}: DOUBLE-QUOTE ASCII (${code})`);
  else if (ch === '\'') console.log(`  pos ${i}: SINGLE-QUOTE ASCII (${code})`);
  else if (code > 127) console.log(`  pos ${i}: NON-ASCII '${ch}' (${code})`);
}
console.log('');

// Also check lines 238-250 for template literal issues
console.log('=== Lines 238-250 (checking backticks) ===');
for (let n = 237; n <= 249 && n < lines.length; n++) {
  const line = lines[n];
  let btCount = 0;
  for (const ch of line) {
    if (ch === '`') btCount++;
  }
  if (btCount > 0 || n <= 245) {
    console.log(`L${n+1}: ${btCount} backtick(s) - ${line.substring(0, 100)}`);
  }
}
