const vm = require('vm');
const fs = require('fs');
const code = fs.readFileSync('c:/Users/daish/WorkBuddy/20260428215408/website/server.js', 'utf8');

try {
  new vm.Script(code, { filename: 'server.js' });
  console.log('No syntax errors!');
} catch (e) {
  console.log('SyntaxError:', e.message);
  // Try to extract line info from the error
  const match = e.stack.match(/server\.js:(\d+)/);
  if (match) {
    const lineNum = parseInt(match[1]);
    const lines = code.split('\n');
    console.log(`\nProblem line ${lineNum}:`);
    console.log(lines[lineNum - 1]);
    console.log('\nContext (lines ' + Math.max(1, lineNum-3) + ' to ' + Math.min(lines.length, lineNum+3) + '):');
    for (let n = Math.max(0, lineNum-4); n < Math.min(lines.length, lineNum+3); n++) {
      const marker = n === lineNum-1 ? '  >>> ' : '     ';
      console.log(marker + (n+1) + ': ' + lines[n]);
    }
  }
}
