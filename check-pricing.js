const ExcelJS = require('exceljs');

async function checkPricing() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('/Users/emilfabel/DentistPDF/data/estimate-template.xlsx');
  
  const sheet = workbook.getWorksheet('Pricing 2019');
  console.log('PRICING 2019 SHEET ANALYSIS\n');
  console.log(`Total rows: ${sheet.actualRowCount}`);
  console.log(`Total columns: ${sheet.actualColumnCount}\n`);

  // Show rows with actual content
  console.log('First 15 non-empty rows:\n');
  let count = 0;
  for (let rowNum = 1; rowNum <= sheet.actualRowCount && count < 15; rowNum++) {
    const row = sheet.getRow(rowNum);
    let hasData = false;
    let rowStr = '';
    for (let col = 1; col <= 4; col++) {
      const val = row.getCell(col).value;
      if (val !== null && val !== undefined) {
        hasData = true;
        rowStr += `Col${col}: ${val} | `;
      }
    }
    if (hasData) {
      count++;
      console.log(`Row ${rowNum}: ${rowStr}`);
    }
  }
}

checkPricing().catch(console.error);
