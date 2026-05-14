const fs = require('fs');
const path = require('path');

const wrongPatterns = [
  { index: '4', type: 'Advanced' },
  { index: '5', type: 'Advanced' },
  { index: '6', type: 'Advanced' },
  { index: '8', type: 'Advanced' },
  { index: '9', type: 'Advanced' },
  { index: '10', type: 'Advanced' },
  { index: '11', type: 'Advanced' }
];

function cleanup() {
  const units = fs.readdirSync('.').filter(d => d.startsWith('Unit_'));
  let deletedCount = 0;

  units.forEach(unit => {
    const subtopics = fs.readdirSync(unit).filter(s => fs.statSync(path.join(unit, s)).isDirectory());
    subtopics.forEach(sub => {
      const jsonDir = path.join(unit, sub, 'json_files');
      if (fs.existsSync(jsonDir)) {
        const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));
        files.forEach(f => {
          const parts = f.split('_');
          const index = parts[1];
          const type = parts[2];
          
          const isWrong = wrongPatterns.some(p => p.index === index && p.type === type);
          if (isWrong) {
            fs.unlinkSync(path.join(jsonDir, f));
            deletedCount++;
          }
        });
      }
    });
  });

  console.log(`✅ Cleanup complete. Deleted ${deletedCount} wrongly named files.`);
}

cleanup();
