const fs = require('fs');
const c = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');
const lines = c.split('\n');

let found = false;
for (let n = 0; n < lines.length; n++) {
  const line = lines[n];
  for (let i = 0; i < line.length; i++) {
    const code = line.charCodeAt(i);
    if (code > 127) {
      // Check for curly/smart quotes
      if (code === 0x201C || code === 0x201D || code === 0x2018 || code === 0x2019) {
        console.log(`L${n+1} pos ${i}: Smart quote U+${code.toString(16).toUpperCase()} '${line[i]}'`);
        console.log(`  Line: ${line}`);
        found = true;
      } else if (code === 0x2014 || code === 0x2013 || code === 0x2010 || code === 0x2011) {
        // Em dash, en dash, hyphen variants
        console.log(`L${n+1} pos ${i}: Dash U+${code.toString(16).toUpperCase()} '${line[i]}'`);
        found = true;
      } else if (code === 0xFF0C || code === 0x3002 || code === 0xFF1B || code === 0xFF01) {
        console.log(`L${n+1} pos ${i}: Fullwidth/CJK U+${code.toString(16).toUpperCase()} '${line[i]}'`);
        found = true;
      }
    }
  }
}
if (!found) console.log('No smart quotes, dashes, or CJK found in file!');
