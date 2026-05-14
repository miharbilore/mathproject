const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// --- Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash",
  generationConfig: { responseMimeType: "application/json" }
});

const sanitizeFolderName = (name) => {
  const cleanName = name.replace(/[\u{1F300}-\u{1F6FF}]/gu, '').trim();
  return cleanName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
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
    spice = "Jalapeno";
    type = "Foundation";
  } else if (index <= 6) {
    spice = "Habanero";
    type = "Challenge";
  } else if (index === 7) {
    spice = "Carolina Reaper";
    type = "Advanced";
  } else if (index <= 10) {
    type = "Homework";
    spice = (index === 8) ? "Jalapeno" : (index === 9 ? "Habanero" : "Carolina Reaper");
  } else {
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

  const unitFolder = sanitizeFolderName(unit.name);
  const subtopicFolder = sanitizeFolderName(subtopic.name);
  const baseDir = path.join(unitFolder, subtopicFolder);
  const jsonDir = path.join(baseDir, "json_files");

  if (!fs.existsSync(jsonDir)) fs.mkdirSync(jsonDir, { recursive: true });

  const fileName = `test_${testIndex}_${meta.type}_${meta.spice}.json`;
  const filePath = path.join(jsonDir, fileName);

  if (fs.existsSync(filePath)) return false;

  let attempts = 3;
  while (attempts > 0) {
    try {
      console.log(`🚀 Producing: ${unitFolder} -> ${subtopicFolder} -> ${fileName}`);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();
      
      // Clean markdown code blocks if present
      if (text.startsWith("```json")) {
        text = text.substring(7, text.length - 3).trim();
      } else if (text.startsWith("```")) {
        text = text.substring(3, text.length - 3).trim();
      }

      JSON.parse(text); // Validate JSON
      fs.writeFileSync(filePath, text);
      console.log(`✅ Success!`);
      return true;
    } catch (error) {
      const isRateLimit = error.message.includes("429") || error.message.includes("quota");
      console.error(`❌ Error on ${fileName}:`, error.message);
      attempts--;
      const delay = isRateLimit ? 65000 : 5000;
      console.log(`⏳ Waiting ${delay/1000}s before retry...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return false;
}

// --- MAIN RUNNER ---
async function run() {
  console.log("🚀 Starting GAP Production with Gemini...");
  const curriculum = parseCurriculum();
  
  for (const unit of curriculum) {
    const unitFolder = sanitizeFolderName(unit.name);
    console.log(`\n📂 Unit: ${unitFolder}`);
    for (const subtopic of unit.subtopics) {
      for (let i = 1; i <= 12; i++) {
        const generated = await generateTest(unit, subtopic, i);
        if (generated) {
          // Add a delay to stay within rate limits (approx 4 RPM)
          await new Promise(r => setTimeout(r, 15000)); 
        }
      }
    }
  }
  
  console.log("\n✅ GAP PRODUCTION COMPLETE!");
}

run();
