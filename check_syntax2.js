const fs = require('fs');

const filePath = 'c:/Users/daish/WorkBuddy/20260428215408/website/server.js';
const c = fs.readFileSync(filePath, 'utf8');
const lines = c.split('\n');

let paren = 0;  // ( )
let brace = 0;  // { }
let bracket = 0; // [ ]
let inSingle = false;
let inDouble = false;
let inTemplate = false;
let inBlockComment = false;
let inLineComment = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let j = 0;
  
  while (j < line.length) {
    const ch = line[j];
    const nextCh = line[j+1];
    
    // Handle comments
    if (!inSingle && !inDouble && !inTemplate) {
      if (!inBlockComment && ch === '/' && nextCh === '*') { inBlockComment = true; j += 2; continue; }
      if (inBlockComment && ch === '*' && nextCh === '/') { inBlockComment = false; j += 2; continue; }
      if (!inBlockComment && ch === '/' && nextCh === '/') { inLineComment = true; }
      if (inLineComment) break; // skip rest of line
    }
    
    if (inBlockComment) { j++; continue; }
    
    // Handle strings
    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === "'") { inSingle = true; j++; continue; }
      if (ch === '"') { inDouble = true; j++; continue; }
      if (ch === '`') { inTemplate = true; j++; continue; }
    } else {
      // Inside string
      if (inSingle && ch === "'" && line[j-1] !== '\\') { inSingle = false; j++; continue; }
      if (inDouble && ch === '"' && line[j-1] !== '\\') { inDouble = false; j++; continue; }
      if (inTemplate && ch === '`' && line[j-1] !== '\\') { inTemplate = false; j++; continue; }
      // Skip escape sequences
      if (ch === '\\') { j += 2; continue; }
      j++; continue;
    }
    
    // Now we're not in a string/comment, track brackets
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (ch === '{') brace++;
    if (ch === '}') brace--;
    if (ch === '[') bracket++;
    if (ch === ']') bracket--;
    
    j++;
  }
  
  // Show problematic lines
  if (paren < 0 || brace < 0 || bracket < 0) {
    console.log(`LINE ${i+1}: NEGATIVE BALANCE! paren=${paren} brace=${brace} bracket=${bracket}`);
    console.log(`  Content: ${line.substring(0, 120)}`);
  }
  
  // Show lines near the error
  if (i >= 74 && i <= 102) {
    const marker = (paren !== 0 || brace !== 0 || bracket !== 0) ? `  <<< (${paren}/${brace}/${bracket})` : '';
    console.log(`${(i+1+'').padStart(4)}: ${line.substring(0, 100)}${marker}`);
  }
  
  inLineComment = false; // reset line comment at end of line
}

console.log(`\nFINAL BALANCE: paren=${paren} brace=${brace} bracket=${bracket}`);
