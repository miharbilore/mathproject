const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const {
  delay,
  parseCurriculum,
  getTestMeta,
  sanitizeFolderName,
  getJsonDir,
  getTestFilePath,
  ensureDir,
  loadApiKeys,
  ApiKeyPool,
  validateTestPayload,
  validateQuestionUniqueness,
  writeJsonAtomic,
  validateExistingTestFile,
  collectExistingQuestionHashes,
  collectGaps
} = require("./lib/shared");

const apiKeys = loadApiKeys({
  baseNames: ["GROQ_API_KEY", "OPENROUTER_API_KEY"],
  listNames: ["GROQ_API_KEYS", "OPENROUTER_API_KEYS"]
});
const keyPool = new ApiKeyPool(apiKeys, { cooldownMs: 60000, label: "Groq/OpenRouter" });

function getGroqClient(apiKey) {
  if (apiKey.startsWith("sk-or-v1-")) {
    return new Groq({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Math Project Matbaa"
      }
    });
  }
  return new Groq({ apiKey });
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
    You are a Mathematics Curriculum Designer. Generate a high-quality test.
    
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
    6. MATH MODE: Wrap all math in $...$. Use \\\\ for LaTeX commands in JSON (e.g. $x \\\\cdot y$).
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
      "teacher_rules": ["Tip 1", "Tip 2", "Tip 3"]
    }
  `;

  const unitFolder = sanitizeFolderName(unit.name);
  const subtopicFolder = sanitizeFolderName(subtopic.name);
  const jsonDir = getJsonDir(unit.name, subtopic.name);
  ensureDir(jsonDir);

  const filePath = getTestFilePath(unit.name, subtopic.name, testIndex);
  const fileName = path.basename(filePath);

  if (fs.existsSync(filePath)) {
    const existingValidation = validateExistingTestFile(filePath);
    if (existingValidation.ok) {
      console.log(`⏩ Skipping existing: ${fileName}`);
      return false;
    }
    const invalidPath = `${filePath}.invalid-${Date.now()}`;
    fs.renameSync(filePath, invalidPath);
    console.warn(`⚠️ Invalid JSON found. Moved aside: ${path.basename(invalidPath)}`);
  }

  let attempts = Math.max(3, keyPool.size() * 2);
  while (attempts > 0) {
    const keyInfo = await keyPool.acquire();
    if (!keyInfo) {
      console.error("❌ No Groq/OpenRouter API keys configured.");
      return false;
    }
    const { key: apiKey, index } = keyInfo;
    const isOR = apiKey.startsWith("sk-or-v1-");
    try {
      console.log(`🚀 Producing: ${unitFolder} -> ${subtopicFolder} -> ${fileName}`);
      const groq = getGroqClient(apiKey);
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: isOR ? "meta-llama/llama-3.3-70b-instruct" : "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        temperature: 1
      });

      const content = completion.choices[0].message.content;
      const parsed = JSON.parse(content);
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
      console.log(`✅ Success! 10s delay...`);
      await delay(10000);
      return true;
    } catch (error) {
      const status = error.status || error.statusCode;
      const isRateLimit = status === 429 || /quota|rate/i.test(error.message);
      if (isRateLimit) {
        console.warn(`⚠️ Quota hit. Cooling key and rotating...`);
        keyPool.markRateLimited(index, 90000);
        attempts--;
        continue;
      }
      console.error("❌ Error:", error.message);
      attempts--;
      await delay(3000);
    }
  }
  return false;
}

// --- MAIN RUNNER ---
async function run() {
  if (keyPool.size() === 0) {
    console.error("❌ No Groq/OpenRouter API keys found.");
    process.exit(1);
  }

  console.log("🚀 Starting Full Production for All Units...");
  const curriculum = parseCurriculum();

  let pass = 1;
  let progress = true;
  while (progress) {
    progress = false;
    console.log(`\n🔁 Generation pass ${pass}...`);
    for (const unit of curriculum) {
      console.log(`\n📂 Processing UNIT: ${unit.name}`);
      for (const subtopic of unit.subtopics) {
        console.log(`\n🔹 Subtopic: ${subtopic.name}`);
        const existingHashes = collectExistingQuestionHashes(unit.name, subtopic.name);
        for (let i = 1; i <= 12; i++) {
          const generated = await generateTest(unit, subtopic, i, existingHashes);
          if (generated) progress = true;
        }
      }
    }

    const gaps = collectGaps(curriculum);
    if (gaps.length === 0) {
      console.log("\n✅ ALL UNITS PRODUCTION COMPLETE!");
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
