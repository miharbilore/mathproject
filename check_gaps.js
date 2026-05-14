const fs = require('fs');
const path = require('path');

function checkGaps() {
  // Unit klasörlerini hem 'Unit_' hem de '_unit_' (büyük/küçük harf duyarsız) olarak tara
  const dirs = fs.readdirSync('.').filter(d => 
    d.toLowerCase().startsWith('unit_') || 
    d.toLowerCase().startsWith('_unit_')
  );
  
  const gaps = [];
  const completed = [];

  dirs.forEach(unitDir => {
    const subtopics = fs.readdirSync(unitDir).filter(s => fs.statSync(path.join(unitDir, s)).isDirectory());
    subtopics.forEach(sub => {
      const jsonDir = path.join(unitDir, sub, 'json_files');
      let count = 0;
      if (fs.existsSync(jsonDir)) {
        const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));
        count = files.length;
      }
      
      if (count < 12) {
        gaps.push({ unit: unitDir, subtopic: sub, count: count });
      } else {
        completed.push({ unit: unitDir, subtopic: sub, count: count });
      }
    });
  });

  console.log('--- 🚀 PRODUCTION STATUS REPORT ---');
  console.log(`✅ Completed Subtopics: ${completed.length}`);
  console.log(`❌ Pending Subtopics: ${gaps.length}`);
  
  if (completed.length > 0) {
    console.log('\n--- ✅ COMPLETED ---');
    completed.forEach(c => {
      console.log(`[FULL] ${c.unit} -> ${c.subtopic}`);
    });
  }

  if (gaps.length > 0) {
    console.log('\n--- ❌ GAPS (Pending 12 tests) ---');
    gaps.forEach(g => {
      console.log(`[${g.count}/12] ${g.unit} -> ${g.subtopic}`);
    });
  }
}

checkGaps();

