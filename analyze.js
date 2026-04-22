const ExcelJS = require('exceljs');

async function analyzeSpreadsheet() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('/Users/emilfabel/DentistPDF/data/estimate-template.xlsx');

  // ===== 1. LOOKUP ITEMS sheet =====
  console.log('\n========== 1. LOOKUP ITEMS SHEET ==========\n');
  const lookupSheet = workbook.getWorksheet('LOOKUP ITEMS');
  
  if (lookupSheet) {
    // Get headers from row 3
    const headerRow = lookupSheet.getRow(3);
    console.log('COLUMN HEADERS (Row 3):');
    for (let col = 1; col <= headerRow.actualCellCount || 20; col++) {
      const cell = headerRow.getCell(col);
      const value = cell.value;
      console.log(`  Col ${col}: ${value}`);
    }

    // Print rows 4-20
    console.log('\nROWS 4-20 WITH ALL VALUES:');
    for (let rowNum = 4; rowNum <= 20; rowNum++) {
      const row = lookupSheet.getRow(rowNum);
      console.log(`\nRow ${rowNum}:`);
      let hasData = false;
      for (let col = 1; col <= 20; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        if (value !== null && value !== undefined) {
          hasData = true;
        }
        let displayValue = value;
        if (value === null || value === undefined) {
          displayValue = 'null';
        } else if (typeof value === 'object' && value.formula) {
          displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
        }
        console.log(`    Col ${col}: ${displayValue}`);
      }
      if (!hasData) {
        console.log('    (empty row)');
      }
    }

    // Find specific codes
    console.log('\nLOOKING FOR CODES: 8109, 8110, 8145, 8304, 8158');
    const codesToFind = [8109, 8110, 8145, 8304, 8158];
    for (let rowNum = 4; rowNum <= lookupSheet.actualRowCount; rowNum++) {
      const row = lookupSheet.getRow(rowNum);
      const firstCell = row.getCell(1);
      if (codesToFind.includes(firstCell.value)) {
        console.log(`\n*** FOUND CODE ${firstCell.value} at Row ${rowNum} ***`);
        for (let col = 1; col <= 20; col++) {
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

    // Count total rows with data
    let totalDataRows = 0;
    for (let rowNum = 4; rowNum <= lookupSheet.actualRowCount; rowNum++) {
      const row = lookupSheet.getRow(rowNum);
      const firstCell = row.getCell(1);
      if (firstCell.value !== null && firstCell.value !== undefined) {
        totalDataRows++;
      }
    }
    console.log(`\nTOTAL ROWS WITH DATA (excluding header): ${totalDataRows}`);
  } else {
    console.log('LOOKUP ITEMS sheet not found');
  }

  // ===== 2. AESTHETIC PRICING sheet =====
  console.log('\n\n========== 2. AESTHETIC PRICING SHEET ==========\n');
  const aestheticSheet = workbook.getWorksheet('AESTHETIC PRICING');
  
  if (aestheticSheet) {
    // Get headers from row 1
    const headerRow = aestheticSheet.getRow(1);
    console.log('COLUMN HEADERS (Row 1):');
    for (let col = 1; col <= headerRow.actualCellCount || 20; col++) {
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
      
      console.log(`\nRow ${rowNum}:`);
      for (let col = 1; col <= 20; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        let displayValue = value;
        if (value === null || value === undefined) {
          displayValue = 'null';
        } else if (typeof value === 'object' && value.formula) {
          displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
        }
        if (value !== null && value !== undefined) {
          console.log(`    Col ${col}: ${displayValue}`);
        }
      }
    }
  } else {
    console.log('AESTHETIC PRICING sheet not found');
  }

  // ===== 3. PRICING 2019 sheet =====
  console.log('\n\n========== 3. PRICING 2019 SHEET ==========\n');
  const pricing2019Sheet = workbook.getWorksheet('PRICING 2019');
  
  if (pricing2019Sheet) {
    // Get headers
    const headerRow = pricing2019Sheet.getRow(1);
    console.log('COLUMN HEADERS (Row 1):');
    for (let col = 1; col <= headerRow.actualCellCount || 20; col++) {
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
      
      console.log(`\nRow ${rowNum}:`);
      for (let col = 1; col <= 20; col++) {
        const cell = row.getCell(col);
        const value = cell.value;
        let displayValue = value;
        if (value === null || value === undefined) {
          displayValue = 'null';
        } else if (typeof value === 'object' && value.formula) {
          displayValue = `{formula: "${value.formula}", result: ${value.result}}`;
        }
        if (value !== null && value !== undefined) {
          console.log(`    Col ${col}: ${displayValue}`);
        }
      }
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
    console.log(`\nTOTAL ROWS WITH DATA: ${totalRows}`);
  } else {
    console.log('PRICING 2019 sheet not found');
  }

  // ===== 4. FULL ESTIMATE sheet =====
  console.log('\n\n========== 4. FULL ESTIMATE SHEET ==========\n');
  const fullEstimateSheet = workbook.getWorksheet('FULL ESTIMATE');
  
  if (fullEstimateSheet) {
    console.log(`Sheet dimensions: ${fullEstimateSheet.actualRowCount} rows x ${fullEstimateSheet.actualColumnCount} columns`);
    
    // Check for merged cells in rows 1-30
    console.log('\nMERGED CELLS (in rows 1-30):');
    let mergedCount = 0;
    fullEstimateSheet.mergedCells.forEach(merged => {
      console.log(`  ${merged}`);
      mergedCount++;
    });
    if (mergedCount === 0) {
      console.log('  (no merged cells found)');
    }

    console.log('\nROWS 1-30 WITH ALL VALUES:');
    for (let rowNum = 1; rowNum <= 30; rowNum++) {
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
  } else {
    console.log('FULL ESTIMATE sheet not found');
  }

  // ===== 5. RECORDS sheet =====
  console.log('\n\n========== 5. RECORDS SHEET ==========\n');
  const recordsSheet = workbook.getWorksheet('RECORDS');
  
  if (recordsSheet) {
    console.log(`Sheet dimensions: ${recordsSheet.actualRowCount} rows x ${recordsSheet.actualColumnCount} columns`);
    
    // Check for merged cells in rows 1-30
    console.log('\nMERGED CELLS (in rows 1-30):');
    let mergedCount = 0;
    recordsSheet.mergedCells.forEach(merged => {
      console.log(`  ${merged}`);
      mergedCount++;
    });
    if (mergedCount === 0) {
      console.log('  (no merged cells found)');
    }

    console.log('\nROWS 1-30 WITH ALL VALUES:');
    for (let rowNum = 1; rowNum <= 30; rowNum++) {
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
  } else {
    console.log('RECORDS sheet not found');
  }

  console.log('\n========== ANALYSIS COMPLETE ==========\n');
}

analyzeSpreadsheet().catch(console.error);
