const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sanitizeFolderName = (name) => {
  if (!name) return "";
  const cleanName = name.replace(/[\u{1F300}-\u{1F6FF}]/gu, "").trim();
  return cleanName.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
};

function parseCurriculum(filePath = "topics and subtopics.txt") {
  const content = fs.readFileSync(filePath, "utf-8");
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

function getTestFileName(index) {
  const meta = getTestMeta(index);
  return `test_${index}_${meta.type}_${meta.spice}.json`;
}

function getJsonDir(unitName, subtopicName, baseDir = ".") {
  const unitFolder = sanitizeFolderName(unitName);
  const subtopicFolder = sanitizeFolderName(subtopicName);
  return path.join(baseDir, unitFolder, subtopicFolder, "json_files");
}

function getTestFilePath(unitName, subtopicName, index, baseDir = ".") {
  return path.join(getJsonDir(unitName, subtopicName, baseDir), getTestFileName(index));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeKeyList(listValue) {
  if (!listValue) return [];
  return listValue.split(",").map(v => v.trim()).filter(Boolean);
}

function loadApiKeys({ baseNames = [], listNames = [] }) {
  const keys = [];
  baseNames.forEach(baseName => {
    const first = process.env[baseName];
    if (first) keys.push(first);
    for (let i = 1; ; i++) {
      const key = process.env[`${baseName}_${i}`];
      if (!key) break;
      keys.push(key);
    }
  });
  listNames.forEach(listName => {
    keys.push(...normalizeKeyList(process.env[listName]));
  });
  return [...new Set(keys.filter(Boolean))];
}

class ApiKeyPool {
  constructor(keys, { cooldownMs = 60000, label = "API" } = {}) {
    this.keys = keys.map(key => ({ key, cooldownUntil: 0, failures: 0 }));
    this.cursor = 0;
    this.cooldownMs = cooldownMs;
    this.label = label;
  }

  size() {
    return this.keys.length;
  }

  async acquire() {
    if (this.keys.length === 0) return null;
    while (true) {
      const now = Date.now();
      for (let i = 0; i < this.keys.length; i++) {
        const index = (this.cursor + i) % this.keys.length;
        const entry = this.keys[index];
        if (entry.cooldownUntil <= now) {
          this.cursor = (index + 1) % this.keys.length;
          return { key: entry.key, index };
        }
      }

      const soonest = Math.min(...this.keys.map(k => k.cooldownUntil));
      const waitMs = Math.max(soonest - now, 1000);
      console.warn(`⏳ All ${this.label} keys cooling down. Waiting ${Math.ceil(waitMs / 1000)}s...`);
      await delay(waitMs);
    }
  }

  markRateLimited(index, cooldownMs) {
    const entry = this.keys[index];
    if (!entry) return;
    entry.failures += 1;
    entry.cooldownUntil = Date.now() + (cooldownMs || this.cooldownMs);
  }
}

function validateTestPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["Payload is not an object"] };
  }
  if (typeof payload.unit !== "string") errors.push("Missing unit");
  if (typeof payload.topic !== "string") errors.push("Missing topic");
  if (typeof payload.test_type !== "string") errors.push("Missing test_type");

  if (!Array.isArray(payload.questions) || payload.questions.length !== 10) {
    errors.push("Questions must be an array of length 10");
  } else {
    payload.questions.forEach((question, index) => {
      if (!question || typeof question !== "object") {
        errors.push(`Question ${index + 1} is not an object`);
        return;
      }
      if (typeof question.question !== "string" || question.question.trim().length === 0) {
        errors.push(`Question ${index + 1} has empty text`);
      }
      const type = String(question.type || "").toUpperCase();
      if (index < 8) {
        if (type !== "MQ") errors.push(`Question ${index + 1} must be MQ`);
        const options = question.options || {};
        const optionKeys = ["A", "B", "C", "D", "E"];
        if (!optionKeys.every(k => typeof options[k] === "string")) {
          errors.push(`Question ${index + 1} must include options A-E`);
        }
        if (!optionKeys.includes(question.answer)) {
          errors.push(`Question ${index + 1} answer must be A-E`);
        }
      } else {
        if (type !== "FRQ") errors.push(`Question ${index + 1} must be FRQ`);
      }
    });
  }

  if (!Array.isArray(payload.teacher_rules) || payload.teacher_rules.length === 0) {
    errors.push("Missing teacher_rules");
  }

  return { ok: errors.length === 0, errors };
}

function normalizeQuestionText(text) {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function createUniqueSuffix() {
  const randomPart = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
  return `${Date.now()}-${process.pid}-${randomPart}`;
}

function buildQuestionSignature(question) {
  const type = String(question.type || "").toUpperCase();
  const base = normalizeQuestionText(question.question || "");
  if (type === "MQ") {
    const options = question.options || {};
    const optionKeys = ["A", "B", "C", "D", "E"];
    const optionText = optionKeys.map(key => normalizeQuestionText(options[key] || "")).join("|");
    return `${type}|${base}|${optionText}`;
  }
  return `${type}|${base}`;
}

function hashQuestionSignature(signature) {
  return crypto.createHash("sha256").update(signature).digest("hex");
}

function collectQuestionHashes(payload) {
  if (!payload || !Array.isArray(payload.questions)) return [];
  return payload.questions.map((question, index) => {
    const signature = buildQuestionSignature(question);
    return {
      id: question.id || index + 1,
      hash: hashQuestionSignature(signature)
    };
  });
}

function validateQuestionUniqueness(payload, existingHashes = new Set()) {
  const errors = [];
  const seen = new Set();
  const newHashes = [];
  collectQuestionHashes(payload).forEach(entry => {
    if (seen.has(entry.hash)) {
      errors.push(`Duplicate question inside payload (id: ${entry.id})`);
    } else if (existingHashes.has(entry.hash)) {
      errors.push(`Duplicate question against existing pool (id: ${entry.id})`);
    }
    seen.add(entry.hash);
    newHashes.push(entry.hash);
  });
  return { ok: errors.length === 0, errors, newHashes };
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp-${createUniqueSuffix()}`);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (cleanupError) {}
    throw error;
  }
}

function getInvalidFilePath(filePath) {
  return `${filePath}.invalid-${createUniqueSuffix()}`;
}

function validateExistingTestFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "missing" };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const validation = validateTestPayload(parsed);
    if (!validation.ok) {
      return { ok: false, error: validation.errors.join("; ") };
    }
    return { ok: true, payload: parsed };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function collectExistingQuestionHashes(unitName, subtopicName, baseDir = ".") {
  const hashes = new Set();
  const jsonDir = getJsonDir(unitName, subtopicName, baseDir);
  if (!fs.existsSync(jsonDir)) return hashes;
  const files = fs.readdirSync(jsonDir).filter(file => file.endsWith(".json") && !file.includes(".invalid-"));
  files.forEach(file => {
    const filePath = path.join(jsonDir, file);
    const validation = validateExistingTestFile(filePath);
    if (!validation.ok) return;
    collectQuestionHashes(validation.payload).forEach(entry => hashes.add(entry.hash));
  });
  return hashes;
}

function collectGaps(curriculum, baseDir = ".") {
  const gaps = [];
  curriculum.forEach(unit => {
    unit.subtopics.forEach(subtopic => {
      const missing = [];
      for (let i = 1; i <= 12; i++) {
        const filePath = getTestFilePath(unit.name, subtopic.name, i, baseDir);
        const validation = validateExistingTestFile(filePath);
        if (!validation.ok) missing.push(i);
      }
      if (missing.length > 0) {
        gaps.push({ unit: unit.name, subtopic: subtopic.name, missing });
      }
    });
  });
  return gaps;
}

module.exports = {
  delay,
  sanitizeFolderName,
  parseCurriculum,
  getTestMeta,
  getTestFileName,
  getJsonDir,
  getTestFilePath,
  ensureDir,
  loadApiKeys,
  ApiKeyPool,
  validateTestPayload,
  normalizeQuestionText,
  createUniqueSuffix,
  buildQuestionSignature,
  hashQuestionSignature,
  collectQuestionHashes,
  validateQuestionUniqueness,
  writeJsonAtomic,
  getInvalidFilePath,
  validateExistingTestFile,
  collectExistingQuestionHashes,
  collectGaps
};
