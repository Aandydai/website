// Auto-fix: find all '});' that should be '}));' for asyncHandler routes
const fs = require('fs');
const code = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = code.split('\n');

let fixed = 0;
for (let n = 0; n < lines.length; n++) {
  // Find lines that are exactly '});' (possibly with leading whitespace)
  if (lines[n].trim() === '});') {
    // Check if this is an asyncHandler route closing
    // Look backwards for the matching 'asyncHandler(async' line
    for (let k = n-1; k >= 0 && k >= n-30; k--) {
      if (lines[k].includes('asyncHandler(async')) {
        // This '});' should be '}));'
        lines[n] = lines[n].replace('});', '}));');
        fixed++;
        console.log(`Fixed L${n+1}: '});' → '}));'`);
        break;
      }
      // If we hit another '});' or '}));' before finding asyncHandler, skip
      if (lines[k].trim() === '});' || lines[k].trim() === '}));') break;
    }
  }
}

if (fixed > 0) {
  fs.writeFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', lines.join('\n'));
  console.log(`\nTotal fixed: ${fixed}`);
} else {
  console.log('No lines needed fixing.');
}
