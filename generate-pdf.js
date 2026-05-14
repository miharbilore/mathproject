const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const util = require("util");
const execPromise = util.promisify(exec);
require("dotenv").config();

const PDFLATEX_PATH = process.env.PDFLATEX_PATH || "pdflatex";

function generateLatex(data) {
  const mqQuestions = data.questions.filter(q => q.type.toUpperCase() === "MQ");
  const frqQuestions = data.questions.filter(q => q.type.toUpperCase() === "FRQ");

  return `
\\documentclass[10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath, amssymb, xcolor, geometry, enumitem, multicol, tcolorbox}

\\definecolor{mainblue}{RGB}{0, 102, 204}
\\geometry{a4paper, margin=1.2cm, top=1cm, bottom=3cm, footskip=1.2cm}

\\begin{document}
\\enlargethispage{2.5cm}

% Modern Header
\\begin{tcolorbox}[colback=mainblue!5, colframe=mainblue, sharp corners, boxrule=0.5pt]
    \\small \\textbf{Unit:} ${data.unit} \\hfill \\textbf{Name:} \\rule{3cm}{0.4pt} \\\\
    \\small \\textbf{Topic:} ${data.topic} \\hfill \\textbf{Date:} \\rule{2cm}{0.4pt} \\\\
    \\centering \\textbf{\\large ${data.test_type}}
\\end{tcolorbox}

\\vspace{0.2cm}

% MCQ Section
\\begin{multicols}{2}
\\begin{enumerate}[label=\\textbf{Q\\arabic*.}, leftmargin=*, itemsep=6pt, parsep=0pt]
${mqQuestions.map(q => `
  \\item \\small ${q.question}
  \\begin{enumerate}[label=(\\Alph*), leftmargin=0.6cm, nosep, itemsep=2pt]
    \\item ${q.options.A}
    \\item ${q.options.B}
    \\item ${q.options.C}
    \\item ${q.options.D}
    \\item ${q.options.E}
  \\end{enumerate}
`).join('')}
\\end{enumerate}
\\end{multicols}

\\vspace{-0.2cm}
\\hrule
\\vspace{0.2cm}
\\textbf{\\small Open Ended Questions (FRQ)}
\\begin{enumerate}[label=\\textbf{Q\\arabic*.}, start=9, itemsep=5pt, topsep=0pt]
${frqQuestions.map(q => `
  \\item \\small ${q.question} \\vspace{${(q.required_space_lines || 3) * 0.4}cm}
`).join('')}
\\end{enumerate}

\\vfill

% Chef's Tips Footer
\\begin{tcolorbox}[colback=blue!5, colframe=mainblue!50, title=\\small \\textbf{Chef's Tips}, fonttitle=\\bfseries, bottom=1mm]
\\begin{itemize}[noitemsep, topsep=2pt, leftmargin=0.5cm]
  ${data.teacher_rules.map(rule => `\\item \\scriptsize ${rule}`).join('')}
\\end{itemize}
\\end{tcolorbox}

\\end{document}
  `;
}

// COLLECT ALL JSON FILES
function collectJsonFiles(dir, fileList = []) {
  const items = fs.readdirSync(dir);
  for (const f of items) {
    // Exclude hidden files and specific folders
    if (f.startsWith(".") || ["node_modules", "artifacts", "brain", "eski çalışmalar", "2.deneme", "pdf_files"].includes(f)) continue;
    
    let dirPath = path.join(dir, f);
    try {
      let stat = fs.statSync(dirPath);
      if (stat.isDirectory()) {
        collectJsonFiles(dirPath, fileList);
      } else if (f.endsWith(".json")) {
        fileList.push(dirPath);
      }
    } catch (e) {}
  }
  return fileList;
}

async function run() {
  console.log("🔍 Scanning for JSON files to generate PDFs...");
  const jsonFiles = collectJsonFiles(".");
  console.log(`📂 Found ${jsonFiles.length} JSON files to process.`);

  for (const jsonPath of jsonFiles) {
    const jsonDir = path.dirname(jsonPath);
    const pdfDir = path.join(path.dirname(jsonDir), "pdf_files");
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    const file = path.basename(jsonPath);
    const baseName = path.basename(file, ".json");
    const pdfPath = path.join(pdfDir, `${baseName}.pdf`);

    // Skip if PDF already exists
    if (fs.existsSync(pdfPath)) {
      // console.log(`⏩ Skipping: ${baseName}.pdf (already exists)`);
      continue;
    }

    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      const tex = generateLatex(data);
      const texPath = path.join(pdfDir, `${baseName}.tex`);
      
      fs.writeFileSync(texPath, tex);

      console.log(`⏳ Generating PDF: ${baseName}.pdf ...`);
      try {
        await execPromise(`"${PDFLATEX_PATH}" -interaction=nonstopmode "${baseName}.tex"`, { cwd: pdfDir });
      } catch (execErr) {
        // LaTeX often returns non-zero even if PDF is generated (warnings)
        if (!fs.existsSync(pdfPath)) {
          throw new Error(`LaTeX failed and no PDF was created: ${execErr.message}`);
        }
      }
      
      if (fs.existsSync(pdfPath)) {
        console.log(`✅ Success!`);
      } else {
        console.error(`❌ Failed to create PDF for ${baseName}`);
      }

      // Cleanup auxiliary files
      [".tex", ".aux", ".log"].forEach(ext => {
        try {
          const auxFile = path.join(pdfDir, baseName + ext);
          if (fs.existsSync(auxFile)) fs.unlinkSync(auxFile);
        } catch (cleanupErr) {}
      });
    } catch (err) {
      console.error(`❌ Error for ${baseName}:`, err.message);
    }
  }
  console.log("\n✅ ALL PDF GENERATION COMPLETE!");
}

run();
