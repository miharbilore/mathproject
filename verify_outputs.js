const fs = require("fs");
const path = require("path");

const {
  parseCurriculum,
  getTestFilePath,
  getJsonDir,
  validateExistingTestFile,
  TESTS_PER_SUBTOPIC
} = require("./lib/shared");

function getPdfPath(unitName, subtopicName, index, baseDir = ".") {
  const jsonDir = getJsonDir(unitName, subtopicName, baseDir);
  const jsonPath = getTestFilePath(unitName, subtopicName, index, baseDir);
  const baseName = path.basename(jsonPath, ".json");
  return path.join(path.dirname(jsonDir), "pdf_files", `${baseName}.pdf`);
}

function run() {
  const curriculum = parseCurriculum();
  const missingJson = [];
  const invalidJson = [];
  const missingPdf = [];

  let expectedJson = 0;
  curriculum.forEach(unit => {
    unit.subtopics.forEach(subtopic => {
      for (let i = 1; i <= TESTS_PER_SUBTOPIC; i++) {
        expectedJson += 1;
        const jsonPath = getTestFilePath(unit.name, subtopic.name, i);
        const validation = validateExistingTestFile(jsonPath);
        if (!validation.ok) {
          if (validation.error === "missing") {
            missingJson.push({ unit: unit.name, subtopic: subtopic.name, index: i });
          } else {
            invalidJson.push({ unit: unit.name, subtopic: subtopic.name, index: i, error: validation.error });
          }
          continue;
        }

        const pdfPath = getPdfPath(unit.name, subtopic.name, i);
        if (!fs.existsSync(pdfPath)) {
          missingPdf.push({ unit: unit.name, subtopic: subtopic.name, index: i });
        }
      }
    });
  });

  console.log("📋 OUTPUT VERIFICATION REPORT");
  console.log(`✅ Valid JSON files: ${expectedJson - missingJson.length - invalidJson.length}`);
  console.log(`❌ Missing JSON: ${missingJson.length}`);
  console.log(`❌ Invalid JSON: ${invalidJson.length}`);
  console.log(`❌ Missing PDFs: ${missingPdf.length}`);

  if (missingJson.length) {
    console.log("\n--- Missing JSON ---");
    missingJson.forEach(item => {
      console.log(`${item.unit} -> ${item.subtopic} (Test ${item.index})`);
    });
  }

  if (invalidJson.length) {
    console.log("\n--- Invalid JSON ---");
    invalidJson.forEach(item => {
      console.log(`${item.unit} -> ${item.subtopic} (Test ${item.index}): ${item.error}`);
    });
  }

  if (missingPdf.length) {
    console.log("\n--- Missing PDFs ---");
    missingPdf.forEach(item => {
      console.log(`${item.unit} -> ${item.subtopic} (Test ${item.index})`);
    });
  }

  if (missingJson.length || invalidJson.length || missingPdf.length) {
    process.exitCode = 1;
  }
}

run();
