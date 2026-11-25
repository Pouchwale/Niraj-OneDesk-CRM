/**
 * The index of the Quotation Sheet's fields and of every formula in SAP's two
 * reports, DO_NOT_SEND.rpt and Sales_Quotation.rpt, numbered as the reports
 * number them (24 Nov 2026). Formula texts are the reports' own, byte for
 * byte (spelling included). Shown in the Admin Panel for future use; the
 * numbers inside them that can be changed are named in `numbers`
 * (quotation-config.ts).
 */

import type { NumberKey } from './quotation-config'

export interface SheetFieldEntry {
  no: number
  label: string
  /** The SAP field the reports read; empty when neither report reads it. */
  sap: string
  type: string
  doNotSend: string
  salesQuotation: string
}

/** The Quotation Sheet's fields, in the form's order, and what each report does with them. */
export const SHEET_FIELDS: SheetFieldEntry[] = [
  { no: 1, label: 'DocEntry', sap: 'DocEntry', type: 'Number, given by the CRM', doNotSend: 'Document No.', salesQuotation: 'Quotation No. (with the year)' },
  { no: 2, label: 'Date', sap: 'U_Date', type: 'Date', doNotSend: 'Document Date', salesQuotation: 'Quotation Date; @Year' },
  { no: 3, label: 'Remark', sap: 'Remark', type: 'Text', doNotSend: 'Remarks (Report Footer a)', salesQuotation: 'Not printed' },
  { no: 4, label: 'DieCharge', sap: 'U_DieCharge', type: 'Dropdown', doNotSend: 'Die Charge (SQL CASE), colour #30', salesQuotation: 'Die Charge (SQL CASE)' },
  { no: 5, label: 'Freight', sap: 'U_Freight', type: 'Dropdown', doNotSend: 'Freight (SQL CASE)', salesQuotation: 'Freight (SQL CASE)' },
  { no: 6, label: 'Payment Tems', sap: 'U_PaymentH / U_PaymentTerms', type: 'Dropdown', doNotSend: 'Pmt Days (U_PaymentTerms)', salesQuotation: 'Payment Terms (U_PaymentH)' },
  { no: 7, label: 'Status', sap: '', type: 'Dropdown (Pending / Approved)', doNotSend: 'Not printed', salesQuotation: 'Not printed' },
  { no: 8, label: 'Customer', sap: 'U_Customer', type: 'Text', doNotSend: 'Customer (header)', salesQuotation: 'Title: "Sales Quotation - … For {Customer}"' },
  { no: 9, label: 'Marketing Person', sap: 'U_MarketingP', type: 'Dropdown', doNotSend: 'Marketing Person (MPerson)', salesQuotation: 'Not printed' },
  { no: 10, label: 'Plate Charge', sap: 'U_PlateCharge', type: 'Dropdown', doNotSend: 'Plate Charge (SQL CASE), colour #29', salesQuotation: 'Plate Charge (SQL CASE)' },
  { no: 11, label: 'Proofing Charge', sap: 'U_ProofingCharge', type: 'Dropdown', doNotSend: 'Proofing Charge (SQL CASE)', salesQuotation: 'Proofing Charge (SQL CASE)' },
  { no: 12, label: 'GST', sap: 'U_GST', type: 'Dropdown', doNotSend: 'GST Charge (Extra)', salesQuotation: 'GST Charge (Extra)' },
  { no: 13, label: 'Delivery Location', sap: '', type: 'Text', doNotSend: 'Not printed', salesQuotation: 'Not printed (the report prints the fixed text "Gujarat")' },
  { no: 14, label: 'Job Name', sap: 'U_JobName', type: 'Text', doNotSend: 'Job Name', salesQuotation: 'Item Name' },
  { no: 15, label: 'Net Content', sap: 'U_NetC', type: 'Text', doNotSend: 'Net Content', salesQuotation: 'Net Content' },
  { no: 16, label: 'Final Rate', sap: '', type: 'Decimal, 5 places', doNotSend: 'Not read (the report works its own Final Rate out, #26)', salesQuotation: 'Not read (Unit Price is worked out, #26)' },
  { no: 17, label: 'Length/Cut Length', sap: 'U_CutLength', type: 'Number', doNotSend: 'Length; Ar Gap #1, L + Waste #5', salesQuotation: 'Length (mm)' },
  { no: 18, label: 'Width/Open Size', sap: 'U_Width', type: 'Number', doNotSend: 'Width; W + Waste #6, Width #2', salesQuotation: 'Width (mm); Width #21' },
  { no: 19, label: 'Lay Flat Width', sap: '', type: 'Number', doNotSend: 'Not read', salesQuotation: 'Not read (Lay Flat Width column prints empty)' },
  { no: 20, label: 'Across Ups', sap: 'U_AcrossUP', type: 'Number', doNotSend: 'Ac Ups; #2, #4, #7', salesQuotation: '#21, #28, #31' },
  { no: 21, label: 'Around Ups', sap: 'U_AroundUP', type: 'Number', doNotSend: '#1, #4, #7', salesQuotation: '#28, #31' },
  { no: 22, label: 'Across Gap', sap: 'U_AcrossGAP', type: 'Number', doNotSend: 'Ac Gap; #3, #6', salesQuotation: '#29' },
  { no: 23, label: 'MOQ 1', sap: 'U_MOQ', type: 'Number', doNotSend: 'MOQ; #7, #11, #18, #27', salesQuotation: 'Minimum Order Qty; #28, #42, #48' },
  { no: 24, label: 'Teeth', sap: 'U_Teeth', type: 'Number', doNotSend: 'Teeth; #0', salesQuotation: '#27' },
  { no: 25, label: 'Set?', sap: 'U_Set', type: 'Dropdown (Yes / No)', doNotSend: 'Set ?; #26, #27, colour #33', salesQuotation: 'Set ?; #26' },
  { no: 26, label: 'Colors', sap: 'U_Colors', type: 'Number', doNotSend: 'Colors', salesQuotation: 'No. of Colors' },
  { no: 27, label: 'Coating Type', sap: 'U_CoatingType', type: 'Dropdown', doNotSend: 'CoatingType; Coating Rate (@RATED)', salesQuotation: 'Coating; Coating Rate (@RATED)' },
  { no: 28, label: 'Material', sap: 'U_Material', type: 'Dropdown', doNotSend: 'Material Type; Materail Rate (@RATED)', salesQuotation: 'Material; Materail Rate (@RATED)' },
  { no: 29, label: 'Value Addition 1', sap: 'U_ValueAddition', type: 'Dropdown', doNotSend: 'Value Addition; Valuadition Rate (@RATED); #26, #31, #38', salesQuotation: 'Other Effects (@Effects); Valuadition Rate (@RATED)' },
  { no: 30, label: 'Ink Coverage Area', sap: 'U_InkCoverageArea', type: 'Number', doNotSend: 'Ink Coverage Area; #17', salesQuotation: '#38' },
  { no: 31, label: 'Value Add Coverage Area', sap: 'U_ValueAddCoverageArea', type: 'Number', doNotSend: 'Value Add Area; #15, #26, colour #38', salesQuotation: '#45' },
  { no: 32, label: 'Delivery Zone', sap: 'U_DeliveryZone', type: 'Dropdown', doNotSend: 'Dispatch Location #19; Diapcth Rate (@RATED)', salesQuotation: 'Diapcth Rate (@RATED)' },
  { no: 33, label: 'Job Level', sap: 'U_JobLevel', type: 'Dropdown (Level 1/2/3)', doNotSend: 'Job Level; #8, #9, #26, colour #31', salesQuotation: '#36, #41' },
  { no: 34, label: 'Item Type', sap: 'U_ItemType', type: 'Dropdown (Label / Sleeve)', doNotSend: '#2, #10, #25, colours #34, #41', salesQuotation: 'Title; #21, #35, #50' },
  { no: 35, label: 'Profit + Overhead', sap: 'U_ProfitOverhead', type: 'Number (percent)', doNotSend: 'Profit + Overhead; #22, colour #32', salesQuotation: '#49' },
]

export interface FormulaEntry {
  no: string
  name: string
  result: 'Number' | 'String' | 'Boolean' | 'Colour'
  formula: string
  plain: string
  /** Numbers in it the administrator can change. */
  numbers: NumberKey[]
}

/** DO_NOT_SEND.rpt, in calculation order (section 2 of the user's notes), then the colour formulas. */
export const DO_NOT_SEND_FORMULAS: FormulaEntry[] = [
  { no: '#0', name: '@Circumference', result: 'Number', formula: String.raw`({Command.U_Teeth}*3.175)/1000`, plain: '(Teeth × 3.175) / 1000', numbers: ['teethPitch'] },
  { no: '#1', name: '@Ar Gap', result: 'Number', formula: String.raw`Tonumber(ToText((({@Circumference}-((tonumber({Command.U_CutLength})/1000)*{Command.U_AroundUP}))/{Command.U_AroundUP})*1000,2))`, plain: 'ToNumber(ToText(((Circumference − (Cut / 1000 × ArUP)) / ArUP) × 1000, 2))', numbers: [] },
  { no: '#3', name: '@AcGape', result: 'Number', formula: String.raw`ToNumber({Command.U_AcrossGAP})`, plain: 'AcGAP', numbers: [] },
  { no: '#5', name: '@L + Waste', result: 'Number', formula: String.raw`(tonumber({Command.U_CutLength})+{@Ar Gap})/1000`, plain: '(Cut + Ar Gap) / 1000', numbers: [] },
  { no: '#6', name: '@W + Waste', result: 'Number', formula: String.raw`(tonumber({Command.U_Width})+tonumber({Command.U_AcrossGAP}))/1000`, plain: '(W + AcGAP) / 1000', numbers: [] },
  { no: '#7', name: '@Running Meters', result: 'Number', formula: String.raw`((tonumber({Command.U_MOQ})*{@Circumference})/tonumber({Command.U_AroundUP}))/tonumber({Command.U_AcrossUP})`, plain: '((MOQ × Circumference) / ArUP) / AcUP', numbers: [] },
  { no: '#8', name: '@Print Speed', result: 'Number', formula: 'if {Command.U_JobLevel}="Level 1" then 80\nelse if {Command.U_JobLevel}="Level 2" then 60\nelse if {Command.U_JobLevel}="Level 3" then 40', plain: '"Level 1" → 80, "Level 2" → 60, "Level 3" → 40, anything else → 0', numbers: ['printSpeedL1', 'printSpeedL2', 'printSpeedL3'] },
  { no: '#9', name: '@Changeover Time (Hrs)', result: 'Number', formula: 'if {Command.U_JobLevel}="Level 1" then 1.00\nelse if {Command.U_JobLevel}="Level 2" then 1.50\nelse if {Command.U_JobLevel}="Level 3" then 2.00', plain: '"Level 1" → 1.00, "Level 2" → 1.50, "Level 3" → 2.00, anything else → 0', numbers: ['changeoverL1', 'changeoverL2', 'changeoverL3'] },
  { no: '#10', name: '@L+S', result: 'Number', formula: 'if {Command.U_ItemType}="Label" then 4\nelse 1', plain: 'Label → 4, otherwise 1', numbers: ['labelLS', 'otherLS'] },
  { no: '#16', name: '@Wastage Meters', result: 'Number', formula: 'if {@Changeover Time (Hrs)}=1.00 then 250\nelse if {@Changeover Time (Hrs)}=1.50 then 350\nelse if {@Changeover Time (Hrs)}=2.00 then 450', plain: 'Changeover 1.00 → 250, 1.50 → 350, 2.00 → 450, anything else → 0', numbers: ['wastageMetersL1', 'wastageMetersL2', 'wastageMetersL3'] },
  { no: '#19', name: '@Dispatch Location', result: 'String', formula: 'if {Command.U_DeliveryZone}="North India" Then \'North India (Delhi, Himachal, Etc.)\'\nelse if {Command.U_DeliveryZone}="Central India" Then \'Central India (M.P, etc.)\'\nelse if {Command.U_DeliveryZone}="East India" Then \'East India (Guwahati, Assam)\'\nelse {Command.U_DeliveryZone}', plain: 'North/Central/East India written out; any other zone as it is', numbers: [] },
  { no: '#24', name: '@Payment PenBen', result: 'Number', formula: '//if {Command.U_PaymentTerms}<65 then\n//({@Total Cost}+{@Profit Cost})*(-0.01)\n//else \n//({@Total Cost}+{@Profit Cost})*0.00033333\n0.00', plain: 'Always 0.00 (the rest is commented out)', numbers: [] },
  { no: '#36', name: '@RM Price/SQM', result: 'Number', formula: String.raw`{Command.Materail Rate}`, plain: 'Materail Rate', numbers: [] },
  { no: '#39', name: '@Color', result: 'Number', formula: "if {Command.U_ValueAddition}<>'None' and {Command.U_ValueAddCoverageArea}=0 then\ncrRed\nelse\ncrNoColor", plain: 'Defined, but not used anywhere', numbers: [] },
  { no: '#2', name: '@Width', result: 'Number', formula: 'if {Command.U_ItemType}="Sleeve" then \n(20+(tonumber({Command.U_Width})*Tonumber({Command.U_AcrossUP}))+((Tonumber({Command.U_AcrossUP})-1)*{@AcGape}))/1000\nelse (14+(tonumber({Command.U_Width})*Tonumber({Command.U_AcrossUP}))+((Tonumber({Command.U_AcrossUP})-1)*{@AcGape}))/1000\n//(((tonumber({Command.U_Width})+({@AcGape}))*Tonumber({Command.U_AcrossUP}))+15)/1000', plain: 'Sleeve: (20 + W × AcUP + (AcUP − 1) × AcGape) / 1000; otherwise (14 + …) / 1000', numbers: ['sleeveMargin', 'labelMargin'] },
  { no: '#4', name: '@SQM Per Label', result: 'Number', formula: String.raw`(({@Width})*({@Circumference}))/(tonumber({Command.U_AcrossUP})*tonumber({Command.U_AroundUP}))`, plain: '(Width × Circumference) / (AcUP × ArUP)', numbers: [] },
  { no: '#11', name: '@Conversion Cost', result: 'Number', formula: String.raw`(((({@Changeover Time (Hrs)}+({@Running Meters}/{@Print Speed})/60))*2000)/{Command.U_MOQ})+(({@SQM Per Label})*{@L+S})`, plain: '((Changeover + (Running Meters / Print Speed) / 60) × 2000) / MOQ + SQM Per Label × L+S', numbers: ['conversionPerHour'] },
  { no: '#12', name: '@SQM Conversion', result: 'Number', formula: String.raw`({@Conversion Cost})/({@L + Waste}*{@W + Waste})`, plain: 'Conversion Cost / (L + Waste × W + Waste)', numbers: [] },
  { no: '#13', name: '@Coating Cost', result: 'Number', formula: String.raw`({@SQM Per Label})*{Command.Coating Rate}`, plain: 'SQM Per Label × Coating Rate', numbers: [] },
  { no: '#14', name: '@Material Cost', result: 'Number', formula: String.raw`({@SQM Per Label})*{Command.Materail Rate}`, plain: 'SQM Per Label × Materail Rate', numbers: [] },
  { no: '#15', name: '@Value Add Cost', result: 'Number', formula: String.raw`(({@SQM Per Label})*{Command.Valuadition Rate})*({Command.U_ValueAddCoverageArea}/100)`, plain: 'SQM Per Label × Valuadition Rate × (Value Add Coverage Area / 100)', numbers: [] },
  { no: '#17', name: '@Ink Cost', result: 'Number', formula: String.raw`({@SQM Per Label}*3.5*{Command.U_InkCoverageArea})/100`, plain: '(SQM Per Label × 3.5 × Ink Coverage Area) / 100', numbers: ['inkRate'] },
  { no: '#18', name: '@Wastage Cost', result: 'Number', formula: String.raw`((((({@Wastage Meters}+(({@Running Meters}/2000)*50))*{@Width})*{Command.Materail Rate})*2)/{Command.U_MOQ})*1.05`, plain: '(((Wastage Meters + (Running Meters / 2000) × 50) × Width × Materail Rate × 2) / MOQ) × 1.05', numbers: ['wastageRunPer', 'wastageRunAdd', 'wastageFactor', 'wastageUplift'] },
  { no: '#20', name: '@Freight Cost', result: 'Number', formula: String.raw`(({@SQM Per Label}*158)/1000)*{Command.Diapcth Rate}`, plain: '((SQM Per Label × 158) / 1000) × Diapcth Rate', numbers: ['weightFactor'] },
  { no: '#23', name: '@Packing Cost', result: 'Number', formula: String.raw`(({@SQM Per Label}*158)/1000)*5`, plain: '((SQM Per Label × 158) / 1000) × 5', numbers: ['weightFactor', 'packingRate'] },
  { no: '#21', name: '@Total Cost', result: 'Number', formula: '{@Conversion Cost}+{@Coating Cost}+{@Material Cost}+{@Value Add Cost}+\n{@Wastage Cost}+{@Ink Cost}+{@Freight Cost}+{@Packing Cost}', plain: 'All eight costs added up', numbers: [] },
  { no: '#22', name: '@Profit Cost', result: 'Number', formula: String.raw`(({Command.U_ProfitOverhead}/100)*{@Total Cost})`, plain: '(Profit + Overhead / 100) × Total Cost', numbers: [] },
  { no: '#25', name: '@Calculated Rate', result: 'Number', formula: 'if {Command.U_ItemType}="Label" then \n({@Total Cost}+{@Profit Cost}+0)\nelse\n({@Total Cost}+{@Profit Cost}+0)+0.025', plain: 'Label → Total Cost + Profit Cost; other → … + 0.025', numbers: ['sleeveAddOn'] },
  { no: '#26', name: '@Final Rate', result: 'Number', formula: 'if {Command.U_ValueAddition}<>\'None\' and {Command.U_ValueAddCoverageArea}=0 then    0\nelse if {@Width}<0.090 then 0 \nelse if {@Width}>0.440 then 0\nelse if {Command.U_ValueAddition}="Rotary Screen" and {Command.U_JobLevel}<>"Level 3" then 0\nelse if {Command.U_ValueAddition}<>"Rotary Screen" and {Command.U_ValueAddition}<>"Gold Foil" and {Command.U_ValueAddition}<>"Silver Foil"\n    and {Command.U_ValueAddition}<>"None" and {Command.U_JobLevel}<>"Level 2" then 0\nelse if {Command.U_ValueAddition}="Gold Foil" and {Command.U_JobLevel}<>"Level 3" and {Command.U_JobLevel}<>"Level 2" then 0\nelse if {Command.U_ValueAddition}="Silver Foil" and {Command.U_JobLevel}<>"Level 3" and {Command.U_JobLevel}<>"Level 2" then 0\nelse if {Command.U_Set}="Yes" then ({@Calculated Rate}*2)\nelse    {@Calculated Rate}', plain: 'First match: value addition with no coverage → 0; paper width outside 0.090–0.440 → 0; Rotary Screen not Level 3 → 0; other value addition (not foil/none) not Level 2 → 0; Gold/Silver Foil not Level 2/3 → 0; Set Yes → Calculated Rate × 2; else Calculated Rate', numbers: ['minPaperWidth', 'maxPaperWidth', 'setMultiplier'] },
  { no: '#27', name: '@Total Value', result: 'Number', formula: 'if {Command.U_Set}="Yes" then \n({@Calculated Rate}*{Command.U_MOQ})*2\nelse\n({@Calculated Rate}*{Command.U_MOQ})', plain: 'Set Yes → Calculated Rate × MOQ × 2; else Calculated Rate × MOQ (Calculated Rate, not Final Rate)', numbers: ['setMultiplier'] },
  { no: '#28', name: '@Factor', result: 'Number', formula: '{@Final Rate}/({@SQM Per Label}*1550)\n\n//({@Calculated Rate})/((({@L + Waste}*{@W + Waste})*1000000)/645)', plain: 'Final Rate / (SQM Per Label × 1550)', numbers: ['factorDivisor'] },
  { no: '#35', name: '@Price/SQM', result: 'Number', formula: 'if {@SQM Per Label}<>0 then\n{@Final Rate}/{@SQM Per Label}', plain: 'SQM Per Label not 0 → Final Rate / SQM Per Label; else 0', numbers: [] },
  { no: '#37', name: '@Cons Price/SQM', result: 'Number', formula: '\n{@Price/SQM}-{@RM Price/SQM}', plain: 'Price/SQM − RM Price/SQM', numbers: [] },
  { no: '#29', name: 'Back_Color: Plate Charge', result: 'Colour', formula: "if {Command.U_PlateCharge}='Included' then crRed\nelse\ncrNoColor", plain: 'Plate Charge "Included" → red', numbers: [] },
  { no: '#30', name: 'Back_Color: Die Charge', result: 'Colour', formula: 'if {Command.DieCharge}="Included in rate" then crRed\nelse \ncrNoColor', plain: 'Die Charge "Included in rate" → red', numbers: [] },
  { no: '#31', name: 'Back_Color: Job Level', result: 'Colour', formula: 'if {Command.U_ValueAddition}="Rotary Screen" and {Command.U_JobLevel}<>"Level 3" then crRed\nelse if {Command.U_ValueAddition}<>"Rotary Screen" and {Command.U_ValueAddition}<>"None" and {Command.U_JobLevel}<>"Level 2" then crRed \nelse crNoColor', plain: 'Rotary Screen not Level 3 → red; other value addition (not None) not Level 2 → red', numbers: [] },
  { no: '#32', name: 'Back_Color: Profit + Overhead', result: 'Colour', formula: 'if {Command.U_ProfitOverhead}<20 then crYellow\nelse\ncrNoColor', plain: 'Below 20 → yellow', numbers: ['profitWarning'] },
  { no: '#33', name: 'Back_Color: Set ?', result: 'Colour', formula: "if {Command.U_Set}='Yes' then crred\nelse \ncrNoColor", plain: 'Yes → red', numbers: [] },
  { no: '#34', name: 'Back_Color: Ar Gap', result: 'Colour', formula: 'if {@Ar Gap}<2.5 and {Command.U_ItemType}<>"Sleeve" then crRed \nelse if {@Ar Gap}>5 and {Command.U_ItemType}<>"Sleeve" then crRed\nelse if {@Ar Gap}>1 and  {Command.U_ItemType}="Sleeve" then crRed\nelse if {@Ar Gap}<0 and  {Command.U_ItemType}="Sleeve" then crRed\nelse \ncrNoColor', plain: 'Not Sleeve: below 2.5 or above 5 → red; Sleeve: above 1 or below 0 → red', numbers: ['labelArGapMin', 'labelArGapMax', 'sleeveArGapMax', 'sleeveArGapMin'] },
  { no: '#38', name: 'Back_Color: Value Add Area', result: 'Colour', formula: "if {Command.U_ValueAddition}<>'None' and {Command.U_ValueAddCoverageArea}=0 then\ncrRed\nelse\ncrNoColor", plain: 'Value addition with no coverage → red', numbers: [] },
  { no: '#40', name: 'Back_Color: Paper Width', result: 'Colour', formula: 'if {@Width}<0.090 then crRed \nelse if {@Width}>0.440 then crRed\nelse if {@Running Meters}>5000 then crYellow\nelse if {@Running Meters}<2000 then crYellow\nelse \ncrNoColor', plain: 'Width outside 0.090–0.440 → red; Running Meters above 5000 or below 2000 → yellow', numbers: ['minPaperWidth', 'maxPaperWidth', 'runningMetersHigh', 'runningMetersLow'] },
  { no: '#41', name: 'Back_Color: Total Value', result: 'Colour', formula: 'if {Command.U_ItemType} = "Sleeve" and {@Total Value} < 15000 then\n    crRed\nelse if {@Total Value} < 7500 then\n    crYellow\nelse\n    crNoColor', plain: 'Sleeve below 15000 → red; below 7500 → yellow', numbers: ['sleeveTotalValueRed', 'totalValueYellow'] },
]

/** Sales_Quotation.rpt: what the printed report depends on, in calculation order, then the suppress formulas. */
export const SALES_QUOTATION_FORMULAS: FormulaEntry[] = [
  { no: '#18', name: '@Effects', result: 'String', formula: String.raw`{Command.U_ValueAddition}`, plain: 'Value Addition as it is (empty text when empty)', numbers: [] },
  { no: '#25', name: '@Year', result: 'Number', formula: String.raw`year({Command.U_Date})`, plain: 'The year of the date', numbers: [] },
  { no: '#27', name: '@Circumference', result: 'Number', formula: String.raw`({Command.U_Teeth}*3.175)/1000`, plain: '(Teeth × 3.175) / 1000', numbers: ['teethPitch'] },
  { no: '#28', name: '@Running Meters', result: 'Number', formula: String.raw`((tonumber({Command.U_MOQ})*{@Circumference})/tonumber({Command.U_AroundUP}))/tonumber({Command.U_AcrossUP})`, plain: '((MOQ × Circumference) / ArUP) / AcUP', numbers: [] },
  { no: '#29', name: '@AcGape', result: 'Number', formula: String.raw`ToNumber({Command.U_AcrossGAP})`, plain: 'AcGAP', numbers: [] },
  { no: '#35', name: '@L+S', result: 'Number', formula: 'if {Command.U_ItemType}="Label" then 4\nelse 1', plain: 'Label → 4, otherwise 1', numbers: ['labelLS', 'otherLS'] },
  { no: '#36', name: '@Changeover Time (Hrs)', result: 'Number', formula: 'if {Command.U_JobLevel}="Level 1" then 1.00\nelse if {Command.U_JobLevel}="Level 2" then 1.50\nelse if {Command.U_JobLevel}="Level 3" then 2.00', plain: 'Level 1/2/3 → 1.00/1.50/2.00, else 0', numbers: ['changeoverL1', 'changeoverL2', 'changeoverL3'] },
  { no: '#41', name: '@Print Speed', result: 'Number', formula: 'if {Command.U_JobLevel}="Level 1" then 80\nelse if {Command.U_JobLevel}="Level 2" then 60\nelse if {Command.U_JobLevel}="Level 3" then 40', plain: 'Level 1/2/3 → 80/60/40, else 0', numbers: ['printSpeedL1', 'printSpeedL2', 'printSpeedL3'] },
  { no: '#46', name: '@Wastage Meters', result: 'Number', formula: 'if {@Changeover Time (Hrs)}=1.00 then 250\nelse if {@Changeover Time (Hrs)}=1.50 then 350\nelse if {@Changeover Time (Hrs)}=2.00 then 450', plain: 'Changeover 1.00/1.50/2.00 → 250/350/450, else 0', numbers: ['wastageMetersL1', 'wastageMetersL2', 'wastageMetersL3'] },
  { no: '#21', name: '@Width', result: 'Number', formula: 'if {Command.U_ItemType}="Sleeve" then \n(20+(tonumber({Command.U_Width})*Tonumber({Command.U_AcrossUP}))+((Tonumber({Command.U_AcrossUP})-1)*{@AcGape}))/1000\nelse (14+(tonumber({Command.U_Width})*Tonumber({Command.U_AcrossUP}))+((Tonumber({Command.U_AcrossUP})-1)*{@AcGape}))/1000\n//(((tonumber({Command.U_Width})+({@AcGape}))*Tonumber({Command.U_AcrossUP}))+15)/1000', plain: 'Sleeve: (20 + W × AcUP + (AcUP − 1) × AcGape) / 1000; otherwise (14 + …) / 1000', numbers: ['sleeveMargin', 'labelMargin'] },
  { no: '#31', name: '@SQM Per Label', result: 'Number', formula: String.raw`(({@Width})*({@Circumference}))/(tonumber({Command.U_AcrossUP})*tonumber({Command.U_AroundUP}))`, plain: '(Width × Circumference) / (AcUP × ArUP)', numbers: [] },
  { no: '#33', name: '@Coating Cost', result: 'Number', formula: String.raw`({@SQM Per Label})*{Command.Coating Rate}`, plain: 'SQM Per Label × Coating Rate', numbers: [] },
  { no: '#37', name: '@Freight Cost', result: 'Number', formula: String.raw`(({@SQM Per Label}*158)/1000)*{Command.Diapcth Rate}`, plain: '((SQM Per Label × 158) / 1000) × Diapcth Rate', numbers: ['weightFactor'] },
  { no: '#38', name: '@Ink Cost', result: 'Number', formula: String.raw`({@SQM Per Label}*3.5*{Command.U_InkCoverageArea})/100`, plain: '(SQM Per Label × 3.5 × Ink Coverage Area) / 100', numbers: ['inkRate'] },
  { no: '#39', name: '@Material Cost', result: 'Number', formula: String.raw`({@SQM Per Label})*{Command.Materail Rate}`, plain: 'SQM Per Label × Materail Rate', numbers: [] },
  { no: '#40', name: '@Packing Cost', result: 'Number', formula: '(({@SQM Per Label}*158)/1000)*5 ', plain: '((SQM Per Label × 158) / 1000) × 5', numbers: ['weightFactor', 'packingRate'] },
  { no: '#42', name: '@Conversion Cost', result: 'Number', formula: String.raw`(((({@Changeover Time (Hrs)}+({@Running Meters}/{@Print Speed})/60))*2000)/{Command.U_MOQ})+(({@SQM Per Label})*{@L+S})`, plain: '((Changeover + (Running Meters / Print Speed) / 60) × 2000) / MOQ + SQM Per Label × L+S', numbers: ['conversionPerHour'] },
  { no: '#45', name: '@Value Add Cost', result: 'Number', formula: String.raw`(({@SQM Per Label})*{Command.Valuadition Rate})*({Command.U_ValueAddCoverageArea}/100)`, plain: 'SQM Per Label × Valuadition Rate × (Value Add Coverage Area / 100)', numbers: [] },
  { no: '#48', name: '@Wastage Cost', result: 'Number', formula: String.raw`((((({@Wastage Meters}+(({@Running Meters}/2000)*50))*{@Width})*{Command.Materail Rate})*2)/{Command.U_MOQ})*1.05`, plain: '(((Wastage Meters + (Running Meters / 2000) × 50) × Width × Materail Rate × 2) / MOQ) × 1.05', numbers: ['wastageRunPer', 'wastageRunAdd', 'wastageFactor', 'wastageUplift'] },
  { no: '#47', name: '@Total Cost', result: 'Number', formula: '{@Conversion Cost}+{@Coating Cost}+{@Material Cost}+{@Value Add Cost}+\n{@Wastage Cost}+{@Ink Cost}+{@Freight Cost}+{@Packing Cost}', plain: 'All eight costs added up', numbers: [] },
  { no: '#49', name: '@Profit Cost', result: 'Number', formula: String.raw`(({Command.U_ProfitOverhead}/100)*{@Total Cost})`, plain: '(Profit + Overhead / 100) × Total Cost', numbers: [] },
  { no: '#50', name: '@Calculated Rate', result: 'Number', formula: 'if {Command.U_ItemType}="Label" then \n({@Total Cost}+{@Profit Cost}+0)\nelse\n({@Total Cost}+{@Profit Cost}+0)+0.025', plain: 'Label → Total Cost + Profit Cost; other → … + 0.025', numbers: ['sleeveAddOn'] },
  { no: '#26', name: '@Final Rate (Unit Price)', result: 'Number', formula: 'if {Command.U_Set}="Yes" then \n({@Calculated Rate}*2)\nelse\n{@Calculated Rate}', plain: 'Set Yes → Calculated Rate × 2; else Calculated Rate (no zero checks; an empty value leaves it blank)', numbers: ['setMultiplier'] },
  { no: '#8', name: '@Section_Visibility (Page Header d)', result: 'Boolean', formula: 'pagenumber>1', plain: 'Hidden after page 1 (empty section)', numbers: [] },
  { no: '#9', name: '@Object_Visibility ("Cont..")', result: 'Boolean', formula: 'onlastrecord', plain: '"Cont.." on every page but the last', numbers: [] },
  { no: '#15', name: '@Section_Visibility (Page Header c)', result: 'Boolean', formula: 'pagenumber>1', plain: 'Quotation details on page 1 only', numbers: [] },
  { no: '#19', name: '@Section_Visibility (Report Footer a)', result: 'Boolean', formula: '//{Command.Exp TaxableAmt} = 0', plain: 'A comment only; the section is always hidden', numbers: [] },
  { no: '#22', name: '@Section_Visibility (Page Header f)', result: 'Boolean', formula: 'onlastrecord and Pagenumber > 1', plain: 'Column headings hidden on the last page when it is not page 1', numbers: [] },
]

/** How the two reports treat an empty value: the one difference that changes results everywhere. */
export const NULL_RULES = {
  doNotSend: '"Convert Database NULL Values to Default" ON: an empty number is 0, a missing rate is 0.',
  salesQuotation: '"Convert Database NULL Values to Default" OFF (Exceptions for Nulls): an empty value or missing rate leaves the Unit Price blank; only @Effects prints empty text.',
}
