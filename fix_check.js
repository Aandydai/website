// Smart bracket counter - properly handles strings, comments, template literals
const fs = require('fs');
const content = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');

// State machine
let paren = 0, brace = 0, bracket = 0;
let i = 0;
let lineNum = 1;
let lastErrorLine = 0;
let inSingle = false, inDouble = false, inBacktick = false;
let inLineComment = false, inBlockComment = false;

while (i < content.length) {
  const ch = content[i];
  const next = content[i+1];
  const prev = i > 0 ? content[i-1] : '';

  // Newline resets line comment
  if (ch === '\n') {
    lineNum++;
    inLineComment = false;
    i++;
    continue;
  }

  // Block comment
  if (inBlockComment) {
    if (ch === '*' && next === '/') { inBlockComment = false; i += 2; }
    else i++;
    continue;
  }

  // Line comment
  if (inLineComment) { i++; continue; }

  // Comments
  if (!inSingle && !inDouble && !inBacktick) {
    if (ch === '/' && next === '/') { inLineComment = true; i += 2; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
  }

  // Strings
  if (!inSingle && !inDouble && !inBacktick && !inLineComment && !inBlockComment) {
    if (ch === "'" && prev !== '\\') { inSingle = true; i++; continue; }
    if (ch === '"' && prev !== '\\') { inDouble = true; i++; continue; }
    if (ch === '`' && prev !== '\\') { inBacktick = true; i++; continue; }
  } else {
    // Inside string
    if (inSingle && ch === "'" && prev !== '\\') { inSingle = false; i++; continue; }
    if (inDouble && ch === '"' && prev !== '\\') { inDouble = false; i++; continue; }
    if (inBacktick && ch === '`' && prev !== '\\') { inBacktick = false; i++; continue; }
    if (prev === '\\') { i++; continue; } // escaped char
    i++;
    continue;
  }

  // Track brackets (only when not in string/comment)
  if (ch === '(') paren++;
  if (ch === ')') paren--;
  if (ch === '{') brace++;
  if (ch === '}') brace--;
  if (ch === '[') bracket++;
  if (ch === ']') bracket--;

  // Report negative balance
  if (paren < 0 || brace < 0 || bracket < 0) {
    console.log(`ERROR at line ${lineNum}: paren=${paren} brace=${brace} bracket=${bracket}`);
    // Find the line text
    let start = i;
    while (start > 0 && content[start-1] !== '\n') start--;
    let end = i;
    while (end < content.length && content[end] !== '\n') end++;
    console.log('  Line: ' + JSON.stringify(content.substring(start, end)));
    lastErrorLine = lineNum;
  }

  // Show state around specific lines
  if (lineNum >= 74 && lineNum <= 102) {
    if (paren !== 0 || brace !== 0 || bracket !== 0) {
      let start = i;
      while (start > 0 && content[start-1] !== '\n') start--;
      let end = i;
      while (end < content.length && content[end] !== '\n') end++;
      const lineText = content.substring(start, end).trim();
      console.log(`L${lineNum} (${paren}/${brace}/${bracket}): ${lineText.substring(0, 100)}`);
    }
  }

  i++;
}

console.log('\nFINAL: paren=' + paren + ' brace=' + brace + ' bracket=' + bracket);
console.log('Last error line:', lastErrorLine);
