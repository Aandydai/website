// Find all standalone '});' lines that need to be '}));'
const fs = require('fs');
const code = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = code.split('\n');

// Track paren count per line to find where extra ) is needed
let totalP = 0;
let inStr = false, strChar = '', prev = '';

for (let n = 0; n < lines.length; n++) {
  const line = lines[n];
  let p = 0; // paren delta on this line
  
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
    prev = ch;
  }
  
  // A line that ENDS with '});' but after processing the line totalP > 0
  // means there's an unclosed ( that should have been closed on this line
  const trimmed = line.trim();
  if (trimmed === '});' && totalP > 0) {
    console.log(`L${n+1}: needs '}));' (totalP=${totalP})`);
    console.log(`  Context: ${lines[Math.max(0,n-2)].trim().substring(0,60)}`);
    console.log(`           ${lines[Math.max(0,n-1)].trim().substring(0,60)}`);
    console.log(`           >>> ${trimmed}`);
  }
}
