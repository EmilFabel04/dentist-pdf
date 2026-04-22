const ExcelJS = require('exceljs');

async function analyzeSpreadsheet() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('/Users/emilfabel/DentistPDF/data/estimate-template.xlsx');

  // ===== 1. LOOKUP ITEMS sheet =====
  console.log('\n========== 1. LOOKUP ITEMS SHEET ==========\n');
  const lookupSheet = workbook.getWorksheet('Lookup Items');
  
  if (lookupSheet) {
    // Looking for numeric codes - let's search all rows
    console.log('SEARCHING FOR CODES: 8109, 8110, 8145, 8304, 8158\n');
    const codesToFind = ['8109', '8110', '8145', '8304', '8158'];
    let found = 0;

    for (let rowNum = 1; rowNum <= lookupSheet.actualRowCount; rowNum++) {
      const row = lookupSheet.getRow(rowNum);
      let rowStr = '';
      for (let col = 1; col <= 13; col++) {
        const cell = row.getCell(col);
        rowStr += String(cell.value) + ' | ';
      }
      
      for (const code of codesToFind) {
        if (rowStr.includes(code)) {
          found++;
          console.log(`*** FOUND CODE ${code} at Row ${rowNum} ***`);
          for (let col = 1; col <= 13; col++) {
            const cell = row.getCell(col);
            const value = cell.value;
            let displayValue = value;
            if (value === null || value === undefined) {
              displayValue = 'null';
            } else if (typeof value === 'object' && value.formula) {
              displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
            }
            console.log(`    Col ${col}: ${displayValue}`);
          }
          console.log('');
        }
      }
    }
    
    if (found === 0) {
      console.log('No matching codes found in the sheet.\n');
    }

    // Count total rows with data
    let totalDataRows = 0;
    for (let rowNum = 1; rowNum <= lookupSheet.actualRowCount; rowNum++) {
      const row = lookupSheet.getRow(rowNum);
      const firstCell = row.getCell(1);
      const secondCell = row.getCell(2);
      if ((secondCell.value !== null && secondCell.value !== undefined) || 
          (firstCell.value !== null && firstCell.value !== undefined)) {
        totalDataRows++;
      }
    }
    console.log(`TOTAL ROWS WITH DATA: ${totalDataRows}`);
  }

  // ===== 2. AESTHETIC PRICING sheet =====
  console.log('\n\n========== 2. AESTHETIC PRICING SHEET ==========\n');
  const aestheticSheet = workbook.getWorksheet('Aesthetic pricing');
  
  if (aestheticSheet) {
    // Get headers from row 1
    const headerRow = aestheticSheet.getRow(1);
    console.log('COLUMN HEADERS (Row 1):');
    for (let col = 1; col <= 5; col++) {
      const cell = headerRow.getCell(col);
      const value = cell.value;
      if (value !== null && value !== undefined) {
        console.log(`  Col ${col}: ${value}`);
      }
    }

    console.log('\nALL ROWS:');
    for (let rowNum = 2; rowNum <= aestheticSheet.actualRowCount; rowNum++) {
      const row = aestheticSheet.getRow(rowNum);
      const firstCell = row.getCell(1);
      if (firstCell.value === null || firstCell.value === undefined) continue;
      
      console.log(`Row ${rowNum}:`);
      for (let col = 1; col <= 4; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        let displayValue = value;
        if (value === null || value === undefined) {
          displayValue = 'null';
        } else if (typeof value === 'object' && value.formula) {
          displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
        }
        if (value !== null && value !== undefined) {
          console.log(`  Col ${col}: ${displayValue}`);
        }
      }
      console.log('');
    }
  }

  // ===== 3. PRICING 2019 sheet =====
  console.log('\n\n========== 3. PRICING 2019 SHEET ==========\n');
  const pricing2019Sheet = workbook.getWorksheet('Pricing 2019');
  
  if (pricing2019Sheet) {
    // Get headers
    const headerRow = pricing2019Sheet.getRow(1);
    console.log('COLUMN HEADERS (Row 1):');
    for (let col = 1; col <= 5; col++) {
      const cell = headerRow.getCell(col);
      const value = cell.value;
      if (value !== null && value !== undefined) {
        console.log(`  Col ${col}: ${value}`);
      }
    }

    console.log('\nFIRST 10 ROWS:');
    for (let rowNum = 2; rowNum <= 11; rowNum++) {
      const row = pricing2019Sheet.getRow(rowNum);
      const firstCell = row.getCell(1);
      if (firstCell.value === null || firstCell.value === undefined) continue;
      
      console.log(`Row ${rowNum}:`);
      for (let col = 1; col <= 4; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        let displayValue = value;
        if (value === null || value === undefined) {
          displayValue = 'null';
        } else if (typeof value === 'object' && value.formula) {
          displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
        }
        if (value !== null && value !== undefined) {
          console.log(`  Col ${col}: ${displayValue}`);
        }
      }
      console.log('');
    }

    // Count total rows
    let totalRows = 0;
    for (let rowNum = 2; rowNum <= pricing2019Sheet.actualRowCount; rowNum++) {
      const row = pricing2019Sheet.getRow(rowNum);
      const firstCell = row.getCell(1);
      if (firstCell.value !== null && firstCell.value !== undefined) {
        totalRows++;
      }
    }
    console.log(`TOTAL ROWS WITH DATA: ${totalRows}`);
  }

  // ===== 4. FULL ESTIMATE sheet =====
  console.log('\n\n========== 4. FULL ESTIMATE SHEET ==========\n');
  const fullEstimateSheet = workbook.getWorksheet('Full Estimate');
  
  if (fullEstimateSheet) {
    console.log(`Sheet dimensions: ${fullEstimateSheet.actualRowCount} rows x ${fullEstimateSheet.actualColumnCount} columns`);
    
    // Check for merged cells
    console.log('\nMERGED CELLS:');
    if (fullEstimateSheet._mergedCells && Array.isArray(fullEstimateSheet._mergedCells)) {
      fullEstimateSheet._mergedCells.forEach(merged => {
        console.log(`  ${merged}`);
      });
    } else {
      console.log('  (checking via dictionary)');
      const mergedDict = fullEstimateSheet._mergedCells;
      if (mergedDict) {
        for (const key in mergedDict) {
          console.log(`  ${key}`);
        }
      }
    }

    console.log('\nROWS 1-30 WITH ALL VALUES:');
    for (let rowNum = 1; rowNum <= Math.min(30, fullEstimateSheet.actualRowCount); rowNum++) {
      const row = fullEstimateSheet.getRow(rowNum);
      console.log(`\nRow ${rowNum}:`);
      for (let col = 1; col <= fullEstimateSheet.actualColumnCount; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        let displayValue = value;
        if (value === null || value === undefined) {
          displayValue = 'null';
        } else if (typeof value === 'object' && value.formula) {
          displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
        }
        console.log(`    Col ${col}: ${displayValue}`);
      }
    }
  }

  // ===== 5. RECORDS sheet =====
  console.log('\n\n========== 5. RECORDS SHEET ==========\n');
  const recordsSheet = workbook.getWorksheet('Records');
  
  if (recordsSheet) {
    console.log(`Sheet dimensions: ${recordsSheet.actualRowCount} rows x ${recordsSheet.actualColumnCount} columns`);
    
    // Check for merged cells
    console.log('\nMERGED CELLS:');
    if (recordsSheet._mergedCells && Array.isArray(recordsSheet._mergedCells)) {
      recordsSheet._mergedCells.forEach(merged => {
        console.log(`  ${merged}`);
      });
    } else if (recordsSheet._mergedCells) {
      for (const key in recordsSheet._mergedCells) {
        console.log(`  ${key}`);
      }
    } else {
      console.log('  (none)');
    }

    console.log('\nROWS 1-30 WITH ALL VALUES:');
    for (let rowNum = 1; rowNum <= Math.min(30, recordsSheet.actualRowCount); rowNum++) {
      const row = recordsSheet.getRow(rowNum);
      console.log(`\nRow ${rowNum}:`);
      for (let col = 1; col <= recordsSheet.actualColumnCount; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        let displayValue = value;
        if (value === null || value === undefined) {
          displayValue = 'null';
        } else if (typeof value === 'object' && value.formula) {
          displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
        }
        console.log(`    Col ${col}: ${displayValue}`);
      }
    }
  }

  console.log('\n========== ANALYSIS COMPLETE ==========\n');
}

analyzeSpreadsheet().catch(console.error);
