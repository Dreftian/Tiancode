---
name: docx-document-creation
description: Clean-room production guide for creating, editing, and converting professional Word documents (.docx) using docx-js (TypeScript/JavaScript) and python-docx.
tags: ["docx", "word", "documents", "docx-js", "office"]
---

# Professional DOCX Document Creation

Clean-room reference guide for generating formatted, professional Microsoft Word (.docx) documents using open-source libraries (`docx` for Node/TypeScript, `python-docx` for Python).

## 1. Node.js / TypeScript with `docx` (npm)

Install:
```bash
npm install docx
# or
bun add docx
```

### Complete Implementation Example:

```typescript
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "docx"
import * as fs from "node:fs"

async function generateReport(outputPath: string) {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch = 1440 dxa
          },
        },
        children: [
          new Paragraph({
            text: "System Modernization Report",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Executive Summary: ",
                bold: true,
              }),
              new TextRun(
                "This document outlines the architectural enhancements, performance optimizations, and quality gates deployed."
              ),
            ],
            spacing: { after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Component", bold: true })] })],
                    shading: { fill: "F1F5F9" },
                  }),
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: "Status", bold: true })] })],
                    shading: { fill: "F1F5F9" },
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("TTS Synthesis Offload")] }),
                  new TableCell({ children: [new Paragraph("Completed (Worker Process)")] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Process Tree Clean Kill")] }),
                  new TableCell({ children: [new Paragraph("Completed (taskkill /T /F)")] }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(outputPath, buffer)
}

generateReport("Report.docx")
```

---

## 2. Best Practice Rules for DOCX
- **DXA Units**: Measurements are in twentieths of a point (1 pt = 20 dxa, 1 inch = 1440 dxa).
- **No Raw Newlines**: Avoid `\n` inside `TextRun`. Create distinct `Paragraph` instances or use `break: 1` in `TextRun`.
- **Table Cell Widths**: Explicitly specify width for table cells to guarantee consistent rendering across Microsoft Word, LibreOffice, and Google Docs.
