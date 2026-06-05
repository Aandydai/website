// Very simple paren tracker - per line, resetting each line
// Goal: find where an unclosed ( opens (accumulates paren > 0 across lines)
const fs = require('fs');
const code = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = code.split('\n');

let paren = 0, brace = 0;
let inStr = false, strChar = '', prevCh = '';

for (let n = 0; n < lines.length; n++) {
  const line = lines[n];
  paren = 0; brace = 0; inStr = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    
    // String handling
    if (!inStr && (ch === '"' || ch === "'" || ch === '`')) {
      if (prevCh !== '\\') {
        inStr = true;
        strChar = ch;
      }
    } else if (inStr && ch === strChar && prevCh !== '\\') {
      inStr = false;
    }
    
    if (inStr) { prevCh = ch; continue; }
    
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (ch === '{') brace++;
    if (ch === '}') brace--;
    prevCh = ch;
  }
  
  // Show only lines where something was opened but NOT closed in this line
  if (paren > 0 || brace > 0) {
    console.log(`L${n+1}: paren=${paren} brace=${brace} | ${line.trim().substring(0, 90)}`);
  }
}
