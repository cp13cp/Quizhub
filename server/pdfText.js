// Extracts plain text from a PDF buffer using pdfjs-dist (legacy CJS build).
// Reconstructs lines from text-item coordinates so downstream parsing sees
// one question / option per line, the way it appears in the document.
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function extractPdfText(buffer) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const outLines = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Group text items into visual lines by their Y coordinate.
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x, str: item.str, width: item.width || 0 });
    }

    // Top-to-bottom (Y descending), left-to-right (X ascending).
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const items = rows.get(y).sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = null;
      for (const it of items) {
        if (prevEnd !== null && it.x - prevEnd > 1) line += ' ';
        line += it.str;
        prevEnd = it.x + it.width;
      }
      line = line.replace(/\s+/g, ' ').trim();
      if (line) outLines.push(line);
    }
  }

  await doc.destroy();
  return outLines.join('\n');
}

module.exports = { extractPdfText };
