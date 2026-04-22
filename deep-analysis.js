const ExcelJS = require('exceljs');

async function analyzeSpreadsheet() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('/Users/emilfabel/DentistPDF/data/estimate-template.xlsx');

  // ===== 1. LOOKUP ITEMS sheet =====
  console.log('\n========== 1. LOOKUP ITEMS SHEET ==========\n');
  const lookupSheet = workbook.getWorksheet('Lookup Items');
  
  if (lookupSheet) {
    // Get headers from row 3
    const headerRow = lookupSheet.getRow(3);
    console.log('COLUMN HEADERS (Row 3):');
    for (let col = 1; col <= 13; col++) {
      const cell = headerRow.getCell(col);
      const value = cell.value;
      console.log(`  Col ${col}: ${value !== null && value !== undefined ? value : 'null'}`);
    }

    // Print rows 4-20
    console.log('\nROWS 4-20 (first 17 data rows):');
    for (let rowNum = 4; rowNum <= 20; rowNum++) {
      const row = lookupSheet.getRow(rowNum);
      console.log(`\nRow ${rowNum}:`);
      for (let col = 1; col <= 13; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        let displayValue = value;
        if (value === null || value === undefined) {
          displayValue = 'null';
        } else if (typeof value === 'object' && value.formula) {
          displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
        }
        console.log(`  Col ${col}: ${displayValue}`);
      }
    }

    // Find specific codes with detailed info
    console.log('\n\nSPECIFIC CODE LOOKUP:');
    const codesToFind = ['8109', '8110', '8145', '8304', '8158'];
    for (const code of codesToFind) {
      let found = false;
      for (let rowNum = 1; rowNum <= lookupSheet.actualRowCount; rowNum++) {
        const row = lookupSheet.getRow(rowNum);
        const codeCell = row.getCell(2);
        if (String(codeCell.value).includes(code)) {
          if (!found) {
            console.log(`\n>>> CODE ${code}:`);
            found = true;
          }
          console.log(`\n  Row ${rowNum} - ${codeCell.value}:`);
          console.log(`    Description (Col 3): ${row.getCell(3).value}`);
          console.log(`    ICD-10 (Col 4): ${row.getCell(4).value}`);
          console.log(`    Unit Cost (Col 5): ${row.getCell(5).value}`);
          const col9 = row.getCell(9);
          const col10 = row.getCell(10);
          const col11 = row.getCell(11);
          console.log(`    Col 9: ${col9.value}`);
          if (typeof col10.value === 'object' && col10.value.formula) {
            console.log(`    Col 10: {formula: "${col10.value.formula}", result: ${col10.value.result}}`);
          } else {
            console.log(`    Col 10: ${col10.value}`);
          }
          console.log(`    Col 11: ${col11.value}`);
        }
      }
      if (!found) {
        console.log(`\n>>> CODE ${code}: NOT FOUND`);
      }
    }

    // Count total rows with data
    let totalDataRows = 0;
    for (let rowNum = 1; rowNum <= lookupSheet.actualRowCount; rowNum++) {
      const row = lookupSheet.getRow(rowNum);
      const secondCell = row.getCell(2);
      if (secondCell.value !== null && secondCell.value !== undefined) {
        totalDataRows++;
      }
    }
    console.log(`\nTOTAL ROWS WITH DATA (excluding headers): ${totalDataRows}`);
  }

  // ===== 2. AESTHETIC PRICING sheet =====
  console.log('\n\n========== 2. AESTHETIC PRICING SHEET ==========\n');
  const aestheticSheet = workbook.getWorksheet('Aesthetic pricing');
  
  if (aestheticSheet) {
    const headerRow = aestheticSheet.getRow(1);
    console.log('COLUMN HEADERS:');
    for (let col = 1; col <= 4; col++) {
      const value = headerRow.getCell(col).value;
      if (value !== null && value !== undefined) {
        console.log(`  Col ${col}: ${value}`);
      }
    }

    console.log('\nALL ROWS WITH DATA:');
    let rowCount = 0;
    for (let rowNum = 2; rowNum <= aestheticSheet.actualRowCount; rowNum++) {
      const row = aestheticSheet.getRow(rowNum);
      const col1 = row.getCell(1).value;
      if (col1 === null || col1 === undefined) continue;
      rowCount++;
      console.log(`Row ${rowNum}: ${row.getCell(1).value} | ${row.getCell(2).value || 'null'} | ${row.getCell(3).value || 'null'} | ${row.getCell(4).value || 'null'}`);
    }
    console.log(`\nTotal data rows: ${rowCount}`);
  }

  // ===== 3. PRICING 2019 sheet =====
  console.log('\n\n========== 3. PRICING 2019 SHEET ==========\n');
  const pricing2019Sheet = workbook.getWorksheet('Pricing 2019');
  
  if (pricing2019Sheet) {
    const headerRow = pricing2019Sheet.getRow(1);
    console.log('COLUMN HEADERS (Row 1):');
    for (let col = 1; col <= 4; col++) {
      const value = headerRow.getCell(col).value;
      if (value !== null && value !== undefined) {
        console.log(`  Col ${col}: ${value}`);
      }
    }

    console.log('\nFIRST 10 ROWS:');
    for (let rowNum = 2; rowNum <= 11; rowNum++) {
      const row = pricing2019Sheet.getRow(rowNum);
      const col1 = row.getCell(1).value;
      if (col1 === null || col1 === undefined) continue;
      console.log(`Row ${rowNum}: ${col1} | ${row.getCell(2).value || 'null'} | ${row.getCell(3).value || 'null'} | ${row.getCell(4).value || 'null'}`);
    }

    let totalRows = 0;
    for (let rowNum = 2; rowNum <= pricing2019Sheet.actualRowCount; rowNum++) {
      const firstCell = pricing2019Sheet.getRow(rowNum).getCell(1);
      if (firstCell.value !== null && firstCell.value !== undefined) {
        totalRows++;
      }
    }
    console.log(`\nTOTAL ROWS WITH DATA: ${totalRows}`);
  }

  // ===== 4. FULL ESTIMATE sheet =====
  console.log('\n\n========== 4. FULL ESTIMATE SHEET ==========\n');
  const fullEstimateSheet = workbook.getWorksheet('Full Estimate');
  
  if (fullEstimateSheet) {
    console.log(`Dimensions: ${fullEstimateSheet.actualRowCount} rows x ${fullEstimateSheet.actualColumnCount} columns`);
    
    console.log('\nMERGED CELLS (ALL):');
    let mergedCount = 0;
    try {
      const merged = fullEstimateSheet._mergedCells;
      if (merged) {
        if (Array.isArray(merged)) {
          merged.forEach(m => {
            console.log(`  ${m}`);
            mergedCount++;
          });
        } else if (typeof merged === 'object') {
          for (const key in merged) {
            console.log(`  ${key}`);
            mergedCount++;
          }
        }
      }
    } catch (e) {
      console.log(`  (error reading merged cells: ${e.message})`);
    }
    if (mergedCount === 0) console.log('  (none found)');

    console.log('\nROWS 1-30 STRUCTURE:');
    for (let rowNum = 1; rowNum <= Math.min(30, fullEstimateSheet.actualRowCount); rowNum++) {
      const row = fullEstimateSheet.getRow(rowNum);
      let rowData = [];
      for (let col = 1; col <= fullEstimateSheet.actualColumnCount; col++) {
        const value = row.getCell(col).value;
        if (value === null || value === undefined) {
          rowData.push('null');
        } else if (typeof value === 'object' && value.formula) {
          rowData.push(`FORMULA: ${value.formula}`);
        } else {
          rowData.push(String(value).substring(0, 40));
        }
      }
      console.log(`Row ${rowNum}: ${rowData.join(' | ')}`);
    }
  }

  // ===== 5. RECORDS sheet =====
  console.log('\n\n========== 5. RECORDS SHEET ==========\n');
  const recordsSheet = workbook.getWorksheet('Records');
  
  if (recordsSheet) {
    console.log(`Dimensions: ${recordsSheet.actualRowCount} rows x ${recordsSheet.actualColumnCount} columns`);
    
    console.log('\nMERGED CELLS (ALL):');
    let mergedCount = 0;
    try {
      const merged = recordsSheet._mergedCells;
      if (merged) {
        if (Array.isArray(merged)) {
          merged.forEach(m => {
            console.log(`  ${m}`);
            mergedCount++;
          });
        } else if (typeof merged === 'object') {
          for (const key in merged) {
            console.log(`  ${key}`);
            mergedCount++;
          }
        }
      }
    } catch (e) {
      console.log(`  (error reading merged cells: ${e.message})`);
    }
    if (mergedCount === 0) console.log('  (none found)');

    console.log('\nROWS 1-30 STRUCTURE:');
    for (let rowNum = 1; rowNum <= Math.min(30, recordsSheet.actualRowCount); rowNum++) {
      const row = recordsSheet.getRow(rowNum);
      let rowData = [];
      for (let col = 1; col <= recordsSheet.actualColumnCount; col++) {
        const value = row.getCell(col).value;
        if (value === null || value === undefined) {
          rowData.push('null');
        } else if (typeof value === 'object' && value.formula) {
          rowData.push(`FORMULA: ${value.formula}`);
        } else {
          rowData.push(String(value).substring(0, 40));
        }
      }
      console.log(`Row ${rowNum}: ${rowData.join(' | ')}`);
    }
  }

  console.log('\n========== ANALYSIS COMPLETE ==========\n');
}

analyzeSpreadsheet().catch(console.error);
