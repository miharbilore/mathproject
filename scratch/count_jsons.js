const fs = require('fs');
const path = require('path');

function countJsons(dir) {
  let count = 0;
  const items = fs.readdirSync(dir);
  for (const f of items) {
    if (f.startsWith('.') || ['node_modules', 'eski çalışmalar'].includes(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      count += countJsons(p);
    } else if (f.endsWith('.json')) {
      count++;
    }
  }
  return count;
}

console.log('Total JSONs found by Node:', countJsons('.'));
