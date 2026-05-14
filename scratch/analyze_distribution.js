const fs = require('fs');
const path = require('path');

function analyzeTests() {
  const units = fs.readdirSync('.').filter(d => d.startsWith('Unit_'));
  const report = {};

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
          const spice = parts.slice(3).join('_').replace('.json', '');
          
          if (!report[type]) report[type] = 0;
          report[type]++;
        });
      }
    });
  });

  console.log('--- TEST TYPE DISTRIBUTION ---');
  console.log(report);
  
  if (report['Advanced'] > report['Foundation']) {
    console.log('\n⚠️ Observation: There are more "Advanced" tests than "Foundation".');
    console.log('Based on 3+3+1, Advanced should be the least frequent.');
  }
}

analyzeTests();
