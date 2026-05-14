const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  delay,
  parseCurriculum,
  getTestMeta,
  getJsonDir,
  getTestFilePath,
  ensureDir,
  loadApiKeys,
  ApiKeyPool,
  validateTestPayload,
  validateQuestionUniqueness,
  writeJsonAtomic,
  getInvalidFilePath,
  validateExistingTestFile,
  collectExistingQuestionHashes,
  collectGaps
} = require("./lib/shared");

const apiKeys = loadApiKeys({
  baseNames: ["GEMINI_API_KEY"],
  listNames: ["GEMINI_API_KEYS"]
});
const keyPool = new ApiKeyPool(apiKeys, { cooldownMs: 65000, label: "Gemini" });

function getGeminiModel(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" }
  });
}

// --- GENERATION LOGIC ---
async function generateTest(unit, subtopic, testIndex, existingHashes = new Set()) {
  const meta = getTestMeta(testIndex);
  const spiceLabel = `${meta.type} (${meta.spice})`;
  
  const contexts = [
    "Business & Finance (stock market, taxes, savings)",
    "Space & Science (planets, lab experiments, physics)",
    "Sports & Fitness (scoring, statistics, distance)",
    "Cooking & Construction (recipes, measurements, architecture)",
    "Travel & Nature (hiking, fuel consumption, animal populations)",
    "Tech & Gaming (data usage, coding logic, scoreboards)",
    "Daily Life (shopping, time management, hobbies)",
    "Historical & Ancient Contexts (timeline, artifacts, legacy)",
    "Healthcare & Biology (medicine dosage, cell growth, statistics)",
    "Arts & Music (frequencies, canvas size, rhythm patterns)",
    "Weather & Environment (temperature changes, rainfall, ecosystems)",
    "Transportation & Logistics (shipping, traffic flow, delivery times)"
  ];
  const selectedContext = contexts[(testIndex - 1) % contexts.length];

  const prompt = `
    You are a Mathematics Curriculum Designer. Generate a high-quality test in JSON format.
    
    UNIT: "${unit.name}"
    TOPIC: "${subtopic.name}"
    DIFFICULTY: "${meta.spice}" (Jalapeno=Foundation/Concept, Habanero=Application/Challenge, Carolina Reaper=Analysis/Advanced)
    TEST TYPE: "${meta.type}" (Main Tests: 1-7, Extra: Homework/Quiz)
    SPECIFIC THEME/CONTEXT: Use "${selectedContext}" for word problems to ensure uniqueness.
    
    LEARNING OBJECTIVES (Kazanımlar):
    ${subtopic.objectives.map(o => `- ${o}`).join("\n")}

    STRICT RULES:
    1. Total exactly 10 questions.
    2. Questions 1-8: Multiple Choice (type: "MQ") with options A, B, C, D, E.
    3. Questions 9-10: Free Response (type: "FRQ").
    4. Language: English.
    5. NO explanations.
    6. MATH MODE: Wrap all math in $...$. Use standard LaTeX (e.g. $x \cdot y$).
    7. Footer title: "Chef's Tips".
    8. CONCISENESS: Keep questions and options short so they fit on one page.
    9. UNIQUENESS: This is Test #${testIndex} of 12. Ensure all questions, numerical values, and scenarios are unique. Avoid generic or repetitive patterns. Change the context (e.g., money, time, construction, science, sports).

    JSON Structure:
    {
      "unit": "${unit.name}",
      "topic": "${subtopic.name}",
      "test_type": "${spiceLabel}",
      "questions": [
        { "id": 1, "type": "MQ", "question": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "..."}, "answer": "A" },
        ...
        { "id": 9, "type": "FRQ", "question": "...", "required_space_lines": 5 }
      ],
      "teacher_rules": ["Tip 1", "Tip 2", "Tip 3"],
      "footer": { "title": "Chef's Tips" }
    }
    
    Return ONLY the raw JSON object. No markdown formatting.
  `;

  const jsonDir = getJsonDir(unit.name, subtopic.name);
  ensureDir(jsonDir);

  const filePath = getTestFilePath(unit.name, subtopic.name, testIndex);
  const fileName = path.basename(filePath);

  if (fs.existsSync(filePath)) {
    const existingValidation = validateExistingTestFile(filePath);
    if (existingValidation.ok) return false;
    const invalidPath = getInvalidFilePath(filePath);
    try {
      fs.renameSync(filePath, invalidPath);
      console.warn(`⚠️ Invalid JSON found. Moved aside: ${path.basename(invalidPath)}`);
    } catch (error) {
      console.error(`❌ Failed to move invalid JSON for ${fileName}: ${error.message}`);
      return false;
    }
  }

  let attempts = Math.max(3, keyPool.size() * 2);
  while (attempts > 0) {
    const keyInfo = await keyPool.acquire();
    if (!keyInfo) {
      console.error("❌ No Gemini API keys configured.");
      return false;
    }
    const { key: apiKey, index } = keyInfo;
    try {
      console.log(`🚀 Producing: ${fileName}`);
      const model = getGeminiModel(apiKey);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      if (text.startsWith("```json")) {
        text = text.substring(7, text.length - 3).trim();
      } else if (text.startsWith("```")) {
        text = text.substring(3, text.length - 3).trim();
      }

      const parsed = JSON.parse(text);
      const validation = validateTestPayload(parsed);
      if (!validation.ok) {
        throw new Error(`Validation failed: ${validation.errors.join("; ")}`);
      }
      const uniqueness = validateQuestionUniqueness(parsed, existingHashes);
      if (!uniqueness.ok) {
        throw new Error(`Uniqueness failed: ${uniqueness.errors.join("; ")}`);
      }

      writeJsonAtomic(filePath, parsed);
      uniqueness.newHashes.forEach(hash => existingHashes.add(hash));
      console.log(`✅ Success!`);
      await delay(15000);
      return true;
    } catch (error) {
      const isRateLimit = /429|quota|rate/i.test(error.message);
      console.error(`❌ Error on ${fileName}:`, error.message);
      attempts--;
      if (isRateLimit) {
        keyPool.markRateLimited(index, 65000);
        continue;
      }
      await delay(5000);
    }
  }
  return false;
}

// --- MAIN RUNNER ---
async function run() {
  if (keyPool.size() === 0) {
    console.error("❌ No Gemini API keys found.");
    process.exit(1);
  }

  console.log("🚀 Starting GAP Production with Gemini...");
  const curriculum = parseCurriculum();

  let pass = 1;
  let progress = true;
  while (progress) {
    progress = false;
    console.log(`\n🔁 Generation pass ${pass}...`);
    for (const unit of curriculum) {
      console.log(`\n📂 Unit: ${unit.name}`);
      for (const subtopic of unit.subtopics) {
        const existingHashes = collectExistingQuestionHashes(unit.name, subtopic.name);
        for (let i = 1; i <= 12; i++) {
          const generated = await generateTest(unit, subtopic, i, existingHashes);
          if (generated) progress = true;
        }
      }
    }

    const gaps = collectGaps(curriculum);
    if (gaps.length === 0) {
      console.log("\n✅ GAP PRODUCTION COMPLETE!");
      return;
    }
    if (!progress) {
      console.warn("\n⚠️ No new tests generated in this pass. Remaining gaps:");
      gaps.forEach(gap => {
        console.warn(`- ${gap.unit} -> ${gap.subtopic} (missing: ${gap.missing.join(", ")})`);
      });
      return;
    }
    pass++;
  }
}

run();
