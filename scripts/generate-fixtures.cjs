/**
 * Regenerates the spreadsheet fixtures used by the upload tests.
 *
 *   node scripts/generate-fixtures.cjs
 *
 * The files are deliberately messy - title rows above the header, mixed date
 * formats, Indian-format currency, coordinator name variants - so the tests
 * exercise the parser and mapper the way real exports do.
 *
 * The coordinator names here must match the roster in src/lib/users/store.ts:
 * the fixtures are the tests' input, so run 'npx vitest run src/lib' after
 * regenerating. This script once fell behind the roster, and running it put
 * the old names back into every fixture.
 */
const XLSX = require('xlsx');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'src', 'lib', '__fixtures__');

function write(aoa, sheetName, filename) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = path.join(OUT_DIR, filename);
  XLSX.writeFile(wb, out);
  console.log('wrote', out);
}

function companySample() {
  const aoa = [
    ['GP3 Industries Pvt Ltd'],
    ['Accounts Receivable - Outstanding Report'],
    [],
    ['Cust. Code', 'Customer Name', 'Contact Person', 'Mobile No', 'Email ID',
     'Payment Terms', 'Invoice Date', 'Payment Term Total Amount', 'Co-ordinator Name', 'Division', 'Remark', 'Internal Ref'],
    ['BP-1001', 'Balaji Print Pack', 'Rajiv Mehra', '9876543210', 'rajiv@balajiprint.com',
     '60 Days', new Date('2025-05-10'), '5,50,000.00', 'Pragati', 'Labels', 'Repeat client', 'REF-01'],
    ['BP-2001', 'Vardhman Foils', 'Suresh Nair', '9812345678', 'suresh@vardhman.com',
     'Net 30', '15/06/2025', 275000, 'P. Patel', 'Laminates', '', 'REF-02'],
    ['BP-2002', 'Anand Flexi Pack', 'Meena Gupta', '9900112233', 'meena@anandflexi.com',
     '45 days from invoice', '2025-08-01', '₹ 1,20,500', 'Diya', 'Sleeves', 'Disputed 5k', 'REF-03'],
    ['BP-2003', 'Shakti Polymers', 'Ravi Desai', '9765432100', '',
     'Immediate', '20/08/2026', '89,000', 'Mr. Vishva Vyas', 'Labels', ''],
    ['BP-2004', 'Nova Packaging', 'Kiran Rao', '9123456780', 'kiran@nova.com',
     '90 Days', '01/01/2025', '4,10,000', 'Unknown Person', 'Labels', 'New account'],
    ['BP-2005', '', 'No Name', '9000000000', '', '30 Days', '05/07/2025', '10,000', 'Krupa', '', ''],
    [],
  ];
  
  return aoa;
}

function overdueSample() {
  const aoa = [
    ['GP3 Industries Pvt Ltd'],
    ['Customer Ageing Analysis'],
    [],
    ['BP Code', 'Customer Name', 'Balance Due', '0 - 30', '31 - 60', '61 - 90', '91 - 120', '121+',
     'Payment Terms', 'Coordinator Name', 'Sales Person Name', 'Department', 'Account Type', 'Region'],
    ['BP-4001', 'Meridian Foods', '4,20,000', 0, '1,20,000', '1,50,000', '1,50,000', 0,
     '45 days', 'Diya', 'R. Khanna', 'Flexibles', 'Key Account', 'West'],
    ['BP-4002', 'Gokul Beverages', '9,85,000', 0, 0, '2,00,000', '2,85,000', '5,00,000',
     '30 days', 'Pragati Patel', 'S. Mehta', 'Labels', 'Standard', 'South'],
    ['BP-4003', 'Nandi Dairy', '1,10,000', '60,000', '50,000', 0, 0, 0,
     '30 days', 'KRUPA', 'K. Bose', 'Sleeves', 'Standard', 'South'],
    ['BP-4004', 'Orbit Retail', '75,000', '75,000', 0, 0, 0, 0,
     'Net 30', 'Nobody Known', 'T. Iyer', 'Labels', 'Standard', 'North'],
    ['', 'Missing Code Co', '50,000', '50,000', 0, 0, 0, 0,
     '30 days', 'Diya', 'X. Y', 'Labels', 'Standard', 'East'],
    [],
  ];
  
  return aoa;
}


// A dropdown-backed workbook: Excel keeps the data-validation source on its own
// sheet and frequently orders it first, so the importer must not simply take
// sheet 0. The coordinator column here is a plain value fed by that list.
function dropdownSample() {
  const lists = XLSX.utils.aoa_to_sheet([
    ['Coordinators'],
    ['Pragati'],
    ['Diya'],
    ['Devyani'],
  ]);

  const data = XLSX.utils.aoa_to_sheet([
    ['BP Code', 'Customer Name', 'Balance Due', '0 - 30', '31 - 60', '61 - 90', '91 - 120', '121+',
     'Payment Terms', 'Coordinator Name', 'Department'],
    ['BP-9001', 'Sunrise Foods', 250000, 0, 100000, 150000, 0, 0, '30 days', 'Pragati', 'Labels'],
    ['BP-9002', 'Delta Packaging', 400000, 0, 0, 0, 200000, 200000, '45 days', 'DIYA', 'Flexibles'],
    ['BP-9003', 'Nova Mills', 90000, 90000, 0, 0, 0, 0, '30 days', 'Devyani Vaghela', 'Sleeves'],
    ['BP-9004', 'Orion Agro', 60000, 60000, 0, 0, 0, 0, '30 days', 'foram@gp3.com', 'Labels'],
  ]);
  data['!dataValidation'] = [{ sqref: 'J2:J100', type: 'list', formula1: 'Coordinators' }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, lists, 'Lists');
  XLSX.utils.book_append_sheet(wb, data, 'Ageing Data');
  const out = path.join(OUT_DIR, 'dropdown_sample.xlsx');
  XLSX.writeFile(wb, out);
  console.log('wrote', out);
}

/**
 * One workbook holding both books, the way a team that keeps a single file
 * does it: one tab per module, named as they name theirs.
 */
function twoSheetWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(companySample()), 'CRM ACTIVE PAYMENT');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overdueSample()), 'CRM OverDue');
  const out = path.join(OUT_DIR, 'two_sheet_sample.xlsx');
  XLSX.writeFile(wb, out);
  console.log('wrote', out);
}

write(companySample(), 'Outstanding', 'company_sample.xlsx');
write(overdueSample(), 'Ageing', 'overdue_sample.xlsx');
dropdownSample();
twoSheetWorkbook();
