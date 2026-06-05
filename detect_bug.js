// Detect exact char-by-char bracket count per line with per-line reset
const fs = require('fs');
const code = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = code.split('\n');

let totalP = 0, totalB = 0;
let inStr = false, strChar = '', prev = '';
let lineInStr = false;

for (let n = 0; n < lines.length; n++) {
  const line = lines[n];
  let p = 0, b = 0;
  lineInStr = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    
    if (!inStr && (ch === '"' || ch === "'" || ch === '`')) {
      if (prev !== '\\') { inStr = true; strChar = ch; }
    } else if (inStr && ch === strChar && prev !== '\\') {
      inStr = false;
    }
    
    if (inStr) { prev = ch; continue; }
    if (ch === '/' && line[i+1] === '/') break;
    
    if (ch === '(') { p++; totalP++; }
    if (ch === ')') { p--; totalP--; }
    if (ch === '{') { b++; totalB++; }
    if (ch === '}') { b--; totalB--; }
    prev = ch;
  }
  
  // Show lines 76-100 with delta info
  if (n >= 75 && n <= 100) {
    const deltaP = p > 0 ? `+${p}` : (p < 0 ? `${p}` : ' ');
    const deltaB = b > 0 ? `+${b}` : (b < 0 ? `${b}` : ' ');
    const total = `(totalP=${totalP} totalB=${totalB})`;
    const marker = totalP > 0 || totalB > 0 ? ' <<< OPEN' : '';
    console.log(`L${n+1} delta(${deltaP}/${deltaB}) ${total}: ${line.trim().substring(0, 85)}${marker}`);
  }
}
