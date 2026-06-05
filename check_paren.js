const fs = require('fs');
const path = require('path');

const filePath = path.join('c:/Users/daish/WorkBuddy/20260428215408/website', 'server.js');
const c = fs.readFileSync(filePath, 'utf8');
const lines = c.split('\n');

// Check parenthesis balance per line
let paren = 0;
let brace = 0;
let bracket = 0;
let inStr = false;

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  paren = 0; brace = 0; bracket = 0; inStr = false;

  for (let j = 0; j < l.length; j++) {
    const ch = l[j];
    // Simple string detection: toggle inStr on non-escaped quotes
    if (ch === '"' && l[j-1] !== '\\') {
      inStr = !inStr;
    }
    if (!inStr) {
      if (ch === '(') paren++;
      if (ch === ')') paren--;
      if (ch === '{') brace++;
      if (ch === '}') brace--;
      if (ch === '[') bracket++;
      if (ch === ']') bracket--;
    }
  }

  // Show lines near the problem area
  if (i >= 94 && i <= 105) {
    const marker = (paren !== 0 || brace !== 0 || bracket !== 0) ? ' <<< IMBALANCED' : '';
    console.log(`${i+1}: (${paren}/${brace}/${bracket}) ${l.slice(0, 100)}${marker}`);
  }
}
