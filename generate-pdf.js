const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
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

// RECURSIVE FOLDER SCANNER (Filtered)
function walk(dir, callback) {
  const items = fs.readdirSync(dir);
  for (const f of items) {
    if (f.startsWith(".") || ["node_modules", "artifacts", "brain", "eski çalışmalar", "2.deneme"].includes(f)) continue;
    
    let dirPath = path.join(dir, f);
    try {
      let isDirectory = fs.statSync(dirPath).isDirectory();
      if (isDirectory) {
        if (f === "json_files") {
          callback(dirPath);
        } else {
          walk(dirPath, callback);
        }
      }
    } catch (e) {
      // Skip dead links or permission errors
    }
  }
}

console.log("🔍 Scanning for JSON files to generate PDFs...");
walk(".", (jsonDir) => {
  const pdfDir = path.join(path.dirname(jsonDir), "pdf_files");
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  const files = fs.readdirSync(jsonDir).filter(file => file.endsWith(".json"));
  
  if (files.length > 0) {
    console.log(`📂 Found ${files.length} files in ${jsonDir}`);
  }

  files.forEach(file => {
    const data = JSON.parse(fs.readFileSync(path.join(jsonDir, file), "utf-8"));
    const tex = generateLatex(data);
    const baseName = path.basename(file, ".json");
    const texPath = path.join(pdfDir, `${baseName}.tex`);
    
    fs.writeFileSync(texPath, tex);

    exec(`"${PDFLATEX_PATH}" -interaction=nonstopmode "${baseName}.tex"`, { cwd: pdfDir }, (err) => {
      if (err) {
        console.error(`❌ Error generating PDF for ${baseName}`);
      } else {
        console.log(`✅ PDF Generated: ${baseName}.pdf`);
      }
      
      // ALWAYS Cleanup auxiliary files to keep only the PDF
      [".tex", ".aux", ".log"].forEach(ext => {
        try {
          const auxFile = path.join(pdfDir, baseName + ext);
          if (fs.existsSync(auxFile)) fs.unlinkSync(auxFile);
        } catch (cleanupErr) {}
      });
    });
  });
});
