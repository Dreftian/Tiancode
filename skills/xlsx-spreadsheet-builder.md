---
name: xlsx-spreadsheet-builder
description: Clean-room guide for generating and manipulating Excel spreadsheets (.xlsx) using exceljs (TypeScript) and openpyxl (Python) with styling, formulas, number formats, and charts.
tags: ["xlsx", "excel", "spreadsheets", "exceljs", "data-export"]
---

# Professional Excel (.xlsx) Spreadsheet Generation

Clean-room reference guide for generating robust, styled, and formula-rich Excel workbooks using open-source libraries (`exceljs` for Node/TypeScript, `openpyxl` for Python).

## 1. Node.js / TypeScript with `exceljs`

Install:
```bash
npm install exceljs
# or
bun add exceljs
```

### Complete Implementation Example:

```typescript
import ExcelJS from "exceljs"

async function buildFinancialWorkbook(filePath: string) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Tiancode Data Engine"
  workbook.created = new Date()

  const sheet = workbook.addWorksheet("Q1 Performance", {
    views: [{ showGridLines: true }],
  })

  // Define Columns
  sheet.columns = [
    { header: "Month", key: "month", width: 15 },
    { header: "Gross Revenue", key: "revenue", width: 18 },
    { header: "Operating Cost", key: "cost", width: 18 },
    { header: "Net Profit", key: "profit", width: 18 },
  ]

  // Header Styling
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" }, // Slate-800
  }
  headerRow.alignment = { vertical: "middle", horizontal: "center" }
  headerRow.height = 24

  // Add Data Rows
  sheet.addRow({ month: "January", revenue: 45000, cost: 28000, profit: { formula: "B2-C2" } })
  sheet.addRow({ month: "February", revenue: 52000, cost: 31000, profit: { formula: "B3-C3" } })
  sheet.addRow({ month: "March", revenue: 61000, cost: 34000, profit: { formula: "B4-C4" } })

  // Summary Row
  const totalRow = sheet.addRow({
    month: "Total",
    revenue: { formula: "SUM(B2:B4)" },
    cost: { formula: "SUM(C2:C4)" },
    profit: { formula: "SUM(D2:D4)" },
  })
  totalRow.font = { bold: true }
  totalRow.border = {
    top: { style: "thin" },
    bottom: { style: "double" },
  }

  // Number Formatting: Currency
  sheet.getColumn("revenue").numFmt = "$#,##0.00"
  sheet.getColumn("cost").numFmt = "$#,##0.00"
  sheet.getColumn("profit").numFmt = "$#,##0.00"

  await workbook.xlsx.writeFile(filePath)
}

buildFinancialWorkbook("Q1_Performance.xlsx")
```

---

## 2. Best Practices Checklist
- **Formulas vs Values**: Always use standard uppercase Excel formula names (`SUM`, `AVERAGE`, `VLOOKUP`, `XLOOKUP`).
- **Number Formats**: Format numbers at the column or cell level with standard format strings (`$#,##0.00`, `0.0%`, `YYYY-MM-DD`).
- **Freeze Panes**: For sheets with many rows, pin the header row: `sheet.views = [{ state: 'frozen', ySplit: 1 }]`.
