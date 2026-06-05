// Find all lines with 'asyncHandler(async' and check if the corresponding closing has enough )
const fs = require('fs');
const code = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = code.split('\n');

// Find all lines with 'asyncHandler(async'
for (let n = 0; n < lines.length; n++) {
  if (lines[n].includes('asyncHandler(async')) {
    console.log(`L${n+1}: ${lines[n].trim()}`);
    // Count open parens on this line
    let open = 0, close = 0;
    for (const ch of lines[n]) {
      if (ch === '(') open++;
      if (ch === ')') close++;
    }
    console.log(`  Open ( on this line: ${open}, Close ) on this line: ${close}`);
    console.log(`  Net open parens from this line: ${open - close}`);
  }
}
