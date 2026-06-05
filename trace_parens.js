// Track paren/brace ACCUMULATIVELY across lines (reset each line's tracking)
// but only count parens OUTSIDE strings
const fs = require('fs');
const code = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = code.split('\n');

let inStr = false, strChar = '', prevCh = '';
let lineParen = 0, lineBrace = 0;
let totalParen = 0, totalBrace = 0;

for (let n = 0; n < lines.length; n++) {
  const line = lines[n];
  lineParen = 0; lineBrace = 0; inStr = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    
    if (!inStr && (ch === '"' || ch === "'" || ch === '`')) {
      if (prevCh !== '\\') {
        inStr = true;
        strChar = ch;
      }
    } else if (inStr && ch === strChar && prevCh !== '\\') {
      inStr = false;
    }
    
    if (inStr) { prevCh = ch; continue; }
    if (ch === '/' && line[i+1] === '/') break; // line comment
    
    if (ch === '(') { lineParen++; totalParen++; }
    if (ch === ')') { lineParen--; totalParen--; }
    if (ch === '{') { lineBrace++; totalBrace++; }
    if (ch === '}') { lineBrace--; totalBrace--; }
    prevCh = ch;
  }
  
  if (n >= 50 && n <= 78) {
    const marker = totalParen > 0 || totalBrace > 0 ? '  <<< OPEN' : '';
    const p = totalParen > 0 ? `P:${totalParen}` : '';
    const b = totalBrace > 0 ? `B:${totalBrace}` : '';
    console.log(`L${n+1} [P=${totalParen} B=${totalBrace}]: ${line.trim().substring(0, 90)}${marker}`);
  }
}

console.log('\nFINAL: totalParen=' + totalParen + ' totalBrace=' + totalBrace);
