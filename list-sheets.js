const ExcelJS = require('exceljs');

async function listSheets() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('/Users/emilfabel/DentistPDF/data/estimate-template.xlsx');

  console.log('Available sheets:');
  workbook.worksheets.forEach((sheet, index) => {
    console.log(`  ${index + 1}. "${sheet.name}" (${sheet.actualRowCount} rows x ${sheet.actualColumnCount} cols)`);
  });
}

listSheets().catch(console.error);
