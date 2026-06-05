// Better auto-fix: find '});' lines that close an asyncHandler route body
const fs = require('fs');
const code = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = code.split('\n');

// First, identify all asyncHandler route opening lines (where route starts)
const asyncHandlerOpens = [];
for (let n = 0; n < lines.length; n++) {
  if (lines[n].includes('asyncHandler(async')) {
    asyncHandlerOpens.push(n);
  }
}

// For each asyncHandler opening, find its closing '});'
let fixed = 0;
for (const openLine of asyncHandlerOpens) {
  // Start from the next line, count brace depth
  let braceDepth = 0;
  for (let n = openLine; n < lines.length; n++) {
    const line = lines[n];
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth === 0 && n > openLine) {
      // This line ends the asyncHandler function body
      // Check if it ends with '});' (needs fixing)
      if (line.trim() === '});') {
        const indent = line.match(/^(\s*)/)[1];
        lines[n] = indent + '}));\n';
        fixed++;
        console.log(`Fixed L${n+1}: '});' → '}));'`);
      }
      break;
    }
  }
}

if (fixed > 0) {
  fs.writeFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', lines.join('\n'));
  console.log(`\nTotal fixed: ${fixed}`);
} else {
  console.log('No lines needed fixing.');
}
