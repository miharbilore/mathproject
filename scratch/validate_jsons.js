const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  const items = fs.readdirSync(dir);
  for (const f of items) {
    if (f.startsWith(".") || ["node_modules", "artifacts", "brain", "eski çalışmalar"].includes(f)) continue;
    let dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) {
      walk(dirPath, callback);
    } else if (f.endsWith('.json')) {
      callback(dirPath);
    }
  }
}

let invalidFiles = [];
walk('.', (filePath) => {
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    invalidFiles.push({ path: filePath, error: e.message });
  }
});

if (invalidFiles.length === 0) {
  console.log('✅ All JSON files are valid!');
} else {
  console.log(`❌ Found ${invalidFiles.length} invalid JSON files:`);
  invalidFiles.forEach(f => console.log(`${f.path}: ${f.error}`));
}
