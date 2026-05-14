const Groq = require("groq-sdk");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// --- Configuration ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const apiKeys = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.OPENROUTER_API_KEY
].filter(key => !!key);

let currentKeyIndex = 0;

function getGroqClient() {
  const apiKey = apiKeys[currentKeyIndex];
  
  // Eğer anahtar OpenRouter ise farklı bir kapıdan (baseURL) bağlan
  if (apiKey.startsWith("sk-or-v1-")) {
    return new Groq({
      apiKey: apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000", // OpenRouter için gerekli
        "X-Title": "Math Project Matbaa"
      }
    });
  }
  
  // Standart Groq anahtarı ise normal devam et
  return new Groq({ apiKey: apiKey });
}

const sanitizeFolderName = (name) => {
  return name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
};

// --- CURRICULUM PARSER ---
function parseCurriculum() {
  const content = fs.readFileSync("topics and subtopics.txt", "utf-8");
  const lines = content.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  const curriculum = [];
  let currentUnit = null;
  let currentSubtopic = null;

  for (const line of lines) {
    if (line.toLowerCase().includes("unit") && line.includes(":")) {
      currentUnit = { name: line, subtopics: [] };
      curriculum.push(currentUnit);
    } else if (line.startsWith("Students will be able to")) {
      if (currentSubtopic) currentSubtopic.objectives.push(line);
    } else {
      currentSubtopic = { name: line, objectives: [] };
      if (currentUnit) currentUnit.subtopics.push(currentSubtopic);
    }
  }
  return curriculum;
}

// --- LEVEL MAPPING ---
function getTestMeta(index) {
  let spice, type;
  if (index <= 3) {
    spice = "Jalapeno"; // Yellow Pepper
    type = "Foundation";
  } else if (index <= 6) {
    spice = "Habanero"; // Orange Pepper
    type = "Challenge";
  } else if (index === 7) {
    spice = "Carolina Reaper"; // Red Pepper
    type = "Advanced";
  } else if (index <= 10) {
    // Homework: 8(F), 9(C), 10(A)
    type = "Homework";
    spice = (index === 8) ? "Jalapeno" : (index === 9 ? "Habanero" : "Carolina Reaper");
  } else {
    // Quiz: 11(C), 12(A)
    type = "Quiz";
    spice = (index === 11) ? "Habanero" : "Carolina Reaper";
  }
  return { spice, type };
}

// --- GENERATION LOGIC ---
async function generateTest(unit, subtopic, testIndex) {
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
  const baseDir = path.join(unitFolder, subtopicFolder);
  const jsonDir = path.join(baseDir, "json_files");

  if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir, { recursive: true });

  const fileName = `test_${testIndex}_${meta.type}_${meta.spice}.json`;
  const filePath = path.join(jsonDir, fileName);

  // Skip if already exists
  if (fs.existsSync(filePath)) {
    console.log(`⏩ Skipping existing: ${fileName}`);
    return;
  }

  let attempts = apiKeys.length * 3;
  while (attempts > 0) {
    try {
      console.log(`🚀 [Key ${currentKeyIndex + 1}] Producing: ${unitFolder} -> ${subtopicFolder} -> ${fileName}`);
      const apiKey = apiKeys[currentKeyIndex];
      const isOR = apiKey.startsWith("sk-or-v1-");
      const groq = getGroqClient();
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: isOR ? "meta-llama/llama-3.3-70b-instruct" : "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        temperature: 1
      });

      fs.writeFileSync(filePath, completion.choices[0].message.content);
      console.log(`✅ Success! 10s delay...`);
      await delay(10000);
      return;
    } catch (error) {
      if (error.status === 429) {
        console.warn(`⚠️ Quota hit on Key ${currentKeyIndex + 1}. Rotating...`);
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        attempts--;
        await delay(5000);
      } else {
        console.error("❌ Fatal Error:", error.message);
        break;
      }
    }
  }
}

// --- MAIN RUNNER ---
async function run() {
  console.log("🚀 Starting Full Production for All Units...");
  const curriculum = parseCurriculum();
  
  for (const unit of curriculum) {
    console.log(`\n📂 Processing UNIT: ${unit.name}`);
    for (const subtopic of unit.subtopics) {
      console.log(`\n🔹 Subtopic: ${subtopic.name}`);
      for (let i = 1; i <= 12; i++) {
        await generateTest(unit, subtopic, i);
      }
    }
  }
  
  console.log("\n✅ ALL UNITS PRODUCTION COMPLETE!");
}

run();

