require("dotenv").config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    console.log("🔍 Fetching available models...");
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    
    console.log("--------------------------------------------------");
    console.log("Available Models:");
    data.models.forEach(model => {
      console.log(`- ${model.name}`);
    });
    console.log("--------------------------------------------------");
    
  } catch (error) {
    console.error("❌ Failed to list models:", error.message);
  }
}

listModels();
