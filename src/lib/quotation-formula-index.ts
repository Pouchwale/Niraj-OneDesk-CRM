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
  { no: 4, label: 'DieCharge', sap: 'U_DieCharge', type: 'Dropdown', doNotSend: 'Die Charge (SQL CASE), colour: Die Charge', salesQuotation: 'Die Charge (SQL CASE)' },
  { no: 5, label: 'Freight', sap: 'U_Freight', type: 'Dropdown', doNotSend: 'Freight (SQL CASE)', salesQuotation: 'Freight (SQL CASE)' },
  { no: 6, label: 'Payment Tems', sap: 'U_PaymentH / U_PaymentTerms', type: 'Dropdown', doNotSend: 'Pmt Days (U_PaymentTerms)', salesQuotation: 'Payment Terms (U_PaymentH)' },
  { no: 7, label: 'Status', sap: '', type: 'Dropdown (Pending / Approved)', doNotSend: 'Not printed', salesQuotation: 'Not printed' },
  { no: 8, label: 'Customer', sap: 'U_Customer', type: 'Text', doNotSend: 'Customer (header)', salesQuotation: 'Title: "Sales Quotation - … For {Customer}"' },
  { no: 9, label: 'Marketing Person', sap: 'U_MarketingP', type: 'Dropdown', doNotSend: 'Marketing Person (MPerson)', salesQuotation: 'Not printed' },
  { no: 10, label: 'Plate Charge', sap: 'U_PlateCharge', type: 'Dropdown', doNotSend: 'Plate Charge (SQL CASE), colour: Plate Charge', salesQuotation: 'Plate Charge (SQL CASE)' },
  { no: 11, label: 'Proofing Charge', sap: 'U_ProofingCharge', type: 'Dropdown', doNotSend: 'Proofing Charge (SQL CASE)', salesQuotation: 'Proofing Charge (SQL CASE)' },
  { no: 12, label: 'GST', sap: 'U_GST', type: 'Dropdown', doNotSend: 'GST Charge (Extra)', salesQuotation: 'GST Charge (Extra)' },
  { no: 13, label: 'Delivery Location', sap: '', type: 'Text', doNotSend: 'Not printed', salesQuotation: 'Not printed (the report prints the fixed text "Gujarat")' },
  { no: 14, label: 'Job Name', sap: 'U_JobName', type: 'Text', doNotSend: 'Job Name', salesQuotation: 'Item Name' },
  { no: 15, label: 'Net Content', sap: 'U_NetC', type: 'Text', doNotSend: 'Net Content', salesQuotation: 'Net Content' },
  { no: 16, label: 'Final Rate', sap: '', type: 'Decimal, 5 places', doNotSend: 'Not read (the report works its own Final Rate out, No. 10)', salesQuotation: 'Not read (Unit Price is worked out, No. 7 Final Rate)' },
  { no: 17, label: 'Length/Cut Length', sap: 'U_CutLength', type: 'Number', doNotSend: 'Length; No. 1 Ar Gap, No. 13 L + Waste', salesQuotation: 'Length (mm)' },
  { no: 18, label: 'Width/Open Size', sap: 'U_Width', type: 'Number', doNotSend: 'Width; No. 27 W + Waste, No. 30 Width', salesQuotation: 'Width (mm); No. 21 Width' },
  { no: 19, label: 'Lay Flat Width', sap: '', type: 'Number', doNotSend: 'Not read', salesQuotation: 'Not read (Lay Flat Width column prints empty)' },
  { no: 20, label: 'Across Ups', sap: 'U_AcrossUP', type: 'Number', doNotSend: 'Ac Ups; No. 30 Width, No. 23 SQM Per Label, No. 21 Running Meters', salesQuotation: 'No. 21 Width, No. 15 Running Meters, No. 16 SQM Per Label' },
  { no: 21, label: 'Around Ups', sap: 'U_AroundUP', type: 'Number', doNotSend: 'No. 1 Ar Gap, No. 23 SQM Per Label, No. 21 Running Meters', salesQuotation: 'No. 15 Running Meters, No. 16 SQM Per Label' },
  { no: 22, label: 'Across Gap', sap: 'U_AcrossGAP', type: 'Number', doNotSend: 'Ac Gap; No. 30 Width, No. 27 W + Waste', salesQuotation: 'No. 21 Width' },
  { no: 23, label: 'MOQ 1', sap: 'U_MOQ', type: 'Number', doNotSend: 'MOQ; No. 21 Running Meters, No. 7 Conversion Cost, No. 28 Wastage Cost, No. 25 Total Value', salesQuotation: 'Minimum Order Qty; No. 15 Running Meters, No. 5 Conversion Cost, No. 19 Wastage Cost' },
  { no: 24, label: 'Teeth', sap: 'U_Teeth', type: 'Number', doNotSend: 'Teeth; No. 4 Circumference', salesQuotation: 'No. 3 Circumference' },
  { no: 25, label: 'Set?', sap: 'U_Set', type: 'Dropdown (Yes / No)', doNotSend: 'Set ?; No. 10 Final Rate, No. 25 Total Value, colour: Set ?', salesQuotation: 'Set ?; No. 7 Final Rate' },
  { no: 26, label: 'Colors', sap: 'U_Colors', type: 'Number', doNotSend: 'Colors', salesQuotation: 'No. of Colors' },
  { no: 27, label: 'Coating Type', sap: 'U_CoatingType', type: 'Dropdown', doNotSend: 'CoatingType; Coating Rate (@RATED)', salesQuotation: 'Coating; Coating Rate (@RATED)' },
  { no: 28, label: 'Material', sap: 'U_Material', type: 'Dropdown', doNotSend: 'Material Type; Materail Rate (@RATED)', salesQuotation: 'Material; Materail Rate (@RATED)' },
  { no: 29, label: 'Value Addition 1', sap: 'U_ValueAddition', type: 'Dropdown', doNotSend: 'Value Addition; Valuadition Rate (@RATED); No. 10 Final Rate, colour: Job Level, Value Add Area', salesQuotation: 'Other Effects (No. 6 Effects); Valuadition Rate (@RATED)' },
  { no: 30, label: 'Ink Coverage Area', sap: 'U_InkCoverageArea', type: 'Number', doNotSend: 'Ink Coverage Area; No. 12 Ink Cost', salesQuotation: 'No. 9 Ink Cost' },
  { no: 31, label: 'Value Add Coverage Area', sap: 'U_ValueAddCoverageArea', type: 'Number', doNotSend: 'Value Add Area; No. 26 Value Add Cost, No. 10 Final Rate, colour: Value Add Area', salesQuotation: 'No. 18 Value Add Cost' },
  { no: 32, label: 'Delivery Zone', sap: 'U_DeliveryZone', type: 'Dropdown', doNotSend: 'Dispatch Location (No. 8); Diapcth Rate (@RATED)', salesQuotation: 'Diapcth Rate (@RATED)' },
  { no: 33, label: 'Job Level', sap: 'U_JobLevel', type: 'Dropdown (Level 1/2/3)', doNotSend: 'Job Level; No. 18 Print Speed, No. 3 Changeover Time, No. 10 Final Rate, colour: Job Level', salesQuotation: 'No. 2 Changeover Time, No. 13 Print Speed' },
  { no: 34, label: 'Item Type', sap: 'U_ItemType', type: 'Dropdown (Label / Sleeve)', doNotSend: 'No. 30 Width, No. 14 L+S, No. 2 Calculated Rate, colour: Ar Gap, Total Value', salesQuotation: 'Title; No. 21 Width, No. 10 L+S, No. 1 Calculated Rate' },
  { no: 35, label: 'Profit + Overhead', sap: 'U_ProfitOverhead', type: 'Number (percent)', doNotSend: 'Profit + Overhead; No. 19 Profit Cost, colour: Profit + Overhead', salesQuotation: 'No. 14 Profit Cost' },
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

/**
 * DO_NOT_SEND: the user's complete formula list (26 Nov 2026), and nothing
 * else. Their 30 formulas in their order, texts exactly as sent, numbered 1
 * to 30. The calculation (do-not-send.ts) works every one of them out.
 */
export const DO_NOT_SEND_FORMULAS: FormulaEntry[] = [
  { no: '1', name: 'Ar Gap', result: 'Number', formula: String.raw`Tonumber(ToText((({@Circumference}-((tonumber({Command.U_CutLength})/1000)*{Command.U_AroundUP}))/{Command.U_AroundUP})*1000,2))`, plain: 'ToNumber(ToText(((Circumference âˆ’ (Cut / 1000 Ã— ArUP)) / ArUP) Ã— 1000, 2)): rounded to 2 decimals', numbers: [] },
  { no: '2', name: 'Calculated Rate', result: 'Number', formula: 'if {Command.U_ItemType}="Label" then \n({@Total Cost}+{@Profit Cost}+0)\nelse\n({@Total Cost}+{@Profit Cost}+0)+0.025', plain: 'Label â†’ Total Cost + Profit Cost; other â†’ â€¦ + 0.025', numbers: ['sleeveAddOn'] },
  { no: '3', name: 'Changeover Time (Hrs)', result: 'Number', formula: 'if {Command.U_JobLevel}="Level 1" then 1.00\nelse if {Command.U_JobLevel}="Level 2" then 1.50\nelse if {Command.U_JobLevel}="Level 3" then 2.00', plain: '"Level 1" â†’ 1.00, "Level 2" â†’ 1.50, "Level 3" â†’ 2.00, anything else â†’ 0', numbers: ['changeoverL1', 'changeoverL2', 'changeoverL3'] },
  { no: '4', name: 'Circumference', result: 'Number', formula: String.raw`({Command.U_Teeth}*3.175)/1000`, plain: '(Teeth Ã— 3.175) / 1000', numbers: ['teethPitch'] },
  { no: '5', name: 'Coating Cost', result: 'Number', formula: String.raw`({@SQM Per Label})*{Command.Coating Rate}`, plain: 'SQM Per Label Ã— Coating Rate', numbers: [] },
  { no: '6', name: 'Cons Price/SQM', result: 'Number', formula: String.raw`{@Price/SQM}-{@RM Price/SQM}`, plain: 'Price/SQM âˆ’ RM Price/SQM', numbers: [] },
  { no: '7', name: 'Conversion Cost', result: 'Number', formula: String.raw`(((({@Changeover Time (Hrs)}+({@Running Meters}/{@Print Speed})/60))*2000)/{Command.U_MOQ})+(({@SQM Per Label})*{@L+S})`, plain: '((Changeover + (Running Meters / Print Speed) / 60) Ã— 2000) / MOQ + SQM Per Label Ã— L+S', numbers: ['conversionPerHour'] },
  { no: '8', name: 'Dispatch Location', result: 'String', formula: 'if {Command.U_DeliveryZone}="North India" Then \'North India (Delhi, Himachal, Etc.)\'\nelse if {Command.U_DeliveryZone}="Central India" Then \'Central India (M.P, etc.)\'\nelse if {Command.U_DeliveryZone}="East India" Then \'East India (Guwahati, Assam)\'\nelse {Command.U_DeliveryZone}', plain: 'North/Central/East India written out; any other zone as it is', numbers: [] },
  { no: '9', name: 'Factor', result: 'Number', formula: String.raw`{@Final Rate}/({@SQM Per Label}*1550)`, plain: 'Final Rate / (SQM Per Label Ã— 1550)', numbers: ['factorDivisor'] },
  { no: '10', name: 'Final Rate', result: 'Number', formula: 'if {Command.U_ValueAddition}<>\'None\' and {Command.U_ValueAddCoverageArea}=0 then    0\nelse if {@Width}<0.090 then 0 \nelse if {@Width}>0.440 then 0\nelse if {Command.U_ValueAddition}="Rotary Screen" and {Command.U_JobLevel}<>"Level 3" then 0\nelse if {Command.U_ValueAddition}<>"Rotary Screen" and {Command.U_ValueAddition}<>"Gold Foil" and {Command.U_ValueAddition}<>"Silver Foil"\n    and {Command.U_ValueAddition}<>"None" and {Command.U_JobLevel}<>"Level 2" then 0\nelse if {Command.U_ValueAddition}="Gold Foil" and {Command.U_JobLevel}<>"Level 3" and {Command.U_JobLevel}<>"Level 2" then 0\nelse if {Command.U_ValueAddition}="Silver Foil" and {Command.U_JobLevel}<>"Level 3" and {Command.U_JobLevel}<>"Level 2" then 0\nelse if {Command.U_Set}="Yes" then ({@Calculated Rate}*2)\nelse    {@Calculated Rate}', plain: 'First match: value addition with no coverage â†’ 0; paper width outside 0.090â€“0.440 â†’ 0; Rotary Screen not Level 3 â†’ 0; other value addition (not foil/none) not Level 2 â†’ 0; Gold/Silver Foil not Level 2/3 â†’ 0; Set Yes â†’ Calculated Rate Ã— 2; else Calculated Rate', numbers: ['minPaperWidth', 'maxPaperWidth', 'setMultiplier'] },
  { no: '11', name: 'Freight Cost', result: 'Number', formula: String.raw`(({@SQM Per Label}*158)/1000)*{Command.Diapcth Rate}`, plain: '((SQM Per Label Ã— 158) / 1000) Ã— Diapcth Rate', numbers: ['weightFactor'] },
  { no: '12', name: 'Ink Cost', result: 'Number', formula: String.raw`({@SQM Per Label}*3.5*{Command.U_InkCoverageArea})/100`, plain: '(SQM Per Label Ã— 3.5 Ã— Ink Coverage Area) / 100', numbers: ['inkRate'] },
  { no: '13', name: 'L + Waste', result: 'Number', formula: String.raw`(tonumber({Command.U_CutLength})+{@Ar Gap})/1000`, plain: '(Cut Length + Ar Gap) / 1000', numbers: [] },
  { no: '14', name: 'L+S', result: 'Number', formula: 'if {Command.U_ItemType}="Label" then 4\nelse 1', plain: 'Label â†’ 4, otherwise 1', numbers: ['labelLS', 'otherLS'] },
  { no: '15', name: 'Material Cost', result: 'Number', formula: String.raw`({@SQM Per Label})*{Command.Materail Rate}`, plain: 'SQM Per Label Ã— Materail Rate', numbers: [] },
  { no: '16', name: 'Packing Cost', result: 'Number', formula: String.raw`(({@SQM Per Label}*158)/1000)*5`, plain: '((SQM Per Label Ã— 158) / 1000) Ã— 5', numbers: ['weightFactor', 'packingRate'] },
  { no: '17', name: 'Price/SQM', result: 'Number', formula: 'if {@SQM Per Label}<>0 then\n{@Final Rate}/{@SQM Per Label}', plain: 'SQM Per Label not 0 â†’ Final Rate / SQM Per Label; else 0', numbers: [] },
  { no: '18', name: 'Print Speed', result: 'Number', formula: 'if {Command.U_JobLevel}="Level 1" then 80\nelse if {Command.U_JobLevel}="Level 2" then 60\nelse if {Command.U_JobLevel}="Level 3" then 40', plain: '"Level 1" â†’ 80, "Level 2" â†’ 60, "Level 3" â†’ 40, anything else â†’ 0', numbers: ['printSpeedL1', 'printSpeedL2', 'printSpeedL3'] },
  { no: '19', name: 'Profit Cost', result: 'Number', formula: String.raw`(({Command.U_ProfitOverhead}/100)*{@Total Cost})`, plain: '(Profit + Overhead / 100) Ã— Total Cost', numbers: [] },
  { no: '20', name: 'RM Price/SQM', result: 'Number', formula: String.raw`{Command.Materail Rate}`, plain: 'Materail Rate', numbers: [] },
  { no: '21', name: 'Running Meters', result: 'Number', formula: String.raw`((tonumber({Command.U_MOQ})*{@Circumference})/tonumber({Command.U_AroundUP}))/tonumber({Command.U_AcrossUP})`, plain: '((MOQ Ã— Circumference) / ArUP) / AcUP', numbers: [] },
  { no: '22', name: 'SQM Conversion', result: 'Number', formula: String.raw`({@Conversion Cost})/({@L + Waste}*{@W + Waste})`, plain: 'Conversion Cost / (L + Waste Ã— W + Waste)', numbers: [] },
  { no: '23', name: 'SQM Per Label', result: 'Number', formula: String.raw`(({@Width})*({@Circumference}))/(tonumber({Command.U_AcrossUP})*tonumber({Command.U_AroundUP}))`, plain: '(Width Ã— Circumference) / (AcUP Ã— ArUP)', numbers: [] },
  { no: '24', name: 'Total Cost', result: 'Number', formula: '{@Conversion Cost}+{@Coating Cost}+{@Material Cost}+{@Value Add Cost}+\n{@Wastage Cost}+{@Ink Cost}+{@Freight Cost}+{@Packing Cost}', plain: 'All eight costs added up', numbers: [] },
  { no: '25', name: 'Total Value', result: 'Number', formula: 'if {Command.U_Set}="Yes" then \n({@Calculated Rate}*{Command.U_MOQ})*2\nelse\n({@Calculated Rate}*{Command.U_MOQ})', plain: 'Set Yes â†’ Calculated Rate Ã— MOQ Ã— 2; else Calculated Rate Ã— MOQ (Calculated Rate, not Final Rate)', numbers: ['setMultiplier'] },
  { no: '26', name: 'Value Add Cost', result: 'Number', formula: String.raw`(({@SQM Per Label})*{Command.Valuadition Rate})*({Command.U_ValueAddCoverageArea}/100)`, plain: 'SQM Per Label Ã— Valuadition Rate Ã— (Value Add Coverage Area / 100)', numbers: [] },
  { no: '27', name: 'W + Waste', result: 'Number', formula: String.raw`(tonumber({Command.U_Width})+tonumber({Command.U_AcrossGAP}))/1000`, plain: '(Width + Across Gap) / 1000', numbers: [] },
  { no: '28', name: 'Wastage Cost', result: 'Number', formula: String.raw`((((({@Wastage Meters}+(({@Running Meters}/2000)*50))*{@Width})*{Command.Materail Rate})*2)/{Command.U_MOQ})*1.05`, plain: '(((Wastage Meters + (Running Meters / 2000) Ã— 50) Ã— Width Ã— Materail Rate Ã— 2) / MOQ) Ã— 1.05', numbers: ['wastageRunPer', 'wastageRunAdd', 'wastageFactor', 'wastageUplift'] },
  { no: '29', name: 'Wastage Meters', result: 'Number', formula: 'if {@Changeover Time (Hrs)}=1.00 then 250\nelse if {@Changeover Time (Hrs)}=1.50 then 350\nelse if {@Changeover Time (Hrs)}=2.00 then 450', plain: 'Changeover 1.00 â†’ 250, 1.50 â†’ 350, 2.00 â†’ 450, anything else â†’ 0', numbers: ['wastageMetersL1', 'wastageMetersL2', 'wastageMetersL3'] },
  { no: '30', name: 'Width', result: 'Number', formula: 'if {Command.U_ItemType}="Sleeve" then \n(20+(tonumber({Command.U_Width})*Tonumber({Command.U_AcrossUP}))+((Tonumber({Command.U_AcrossUP})-1)*{@AcGape}))/1000\nelse (14+(tonumber({Command.U_Width})*Tonumber({Command.U_AcrossUP}))+((Tonumber({Command.U_AcrossUP})-1)*{@AcGape}))/1000', plain: 'Sleeve: (20 + W Ã— AcUP + (AcUP âˆ’ 1) Ã— AcGape) / 1000; otherwise (14 + â€¦) / 1000. AcGape is the sheetâ€™s Across Gap.', numbers: ['sleeveMargin', 'labelMargin'] },
]

/** The SQL behind DO_NOT_SEND, as the user sent it: the four rates from @RATED and the footer texts. */
export const DO_NOT_SEND_SQL = `select *,T2.U_Rate as 'Coating Rate',
T3.U_Rate as 'Materail Rate',
T4.U_Rate as 'Valuadition Rate',
T5.U_Rate as 'Diapcth Rate',
T0.DocEntry as 'Document No.',T0.Remark as 'Remarks For',
T0.U_MarketingP as 'MPerson',
Case
When T0.U_PlateCharge='Extra@2000' then 'Extra @2000 per colour'
When T0.U_PlateCharge='Extra@1800' then 'Extra @1800 per colour'
When T0.U_PlateCharge='Extra@1500' then 'Extra @1500 per colour'
When T0.U_PlateCharge='Extra@1200' then 'Extra @1200 per colour'
When T0.U_PlateCharge='Extra@1000' then 'Extra @1000 per colour'
When T0.U_PlateCharge='Extra@800' then 'Extra @800 per colour'
When T0.U_PlateCharge='Extra@600' then 'Extra @600 per colour'
When T0.U_PlateCharge='Included' then 'Included in Rate' end as 'PlateCharge',
Case
when T0.U_DieCharge='Extra@15000' then 'Extra @15000 per size'
when T0.U_DieCharge='Extra@10000' then 'Extra @10000 per size'
when T0.U_DieCharge='Extra@2500' then 'Extra @2500 per size'
when T0.U_DieCharge='Extra@2000' then 'Extra @2000 per size'
when T0.U_DieCharge='Extra@1500' then 'Extra @1500 per size'
when T0.U_DieCharge='Included' then 'Included in rate'
when T0.U_DieCharge='None' then 'None' end as 'DieCharge',
Case
when T0.U_ProofingCharge='Extra@15000' then 'Extra @15,000 per artwork'
when T0.U_ProofingCharge='Extra@12000' then 'Extra @12,000 per artwork'
when T0.U_ProofingCharge='Extra@10000' then 'Extra @10,000 per artwork'
when T0.U_ProofingCharge='Extra@8000' then 'Extra @8000 per artwork' end as 'ProofingCharge',
Case
When T0.U_Freight='Inclu RoadT' then 'Included in Rate (Road Transport)'
When T0.U_Freight='Inclu RTrain' then 'Included in Rate (Train)'
When T0.U_Freight='To-PayB' then 'To-Pay Basis' end as 'Freight',
T0.U_GST as 'GST',T1.U_AcrossUP AS 'AcrossUP'
from [@RATECALM] T0
inner join [@RATECALD] T1 on T0.DocEntry=T1.DocEntry
left join [@RATED] T2 on T1.U_CoatingType=T2.U_Type
left join [@RATED] T3 on T1.U_Material=T3.U_Type
left join [@RATED] T4 on T1.U_ValueAddition=T4.U_Type
left join [@RATED] T5 on T1.U_DeliveryZone=T5.U_Type

WHERE T0.DocEntry={?DocKey@}`

/**
 * The cell colours the Do not Send screen still uses (SAP's report design,
 * not part of the formula list above). Kept apart so the list above is only
 * the user's formulas.
 */
export const DO_NOT_SEND_COLOURS: FormulaEntry[] = [
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

/**
 * Sales Quotation: the user's complete formula list (26 Nov 2026), and nothing
 * else. Their 21 formulas in their order, texts exactly as sent, numbered 1
 * to 21. The calculation (sales-quotation.ts) works every one of them out.
 */
export const SALES_QUOTATION_FORMULAS: FormulaEntry[] = [
  { no: '1', name: 'Calculated Rate', result: 'Number', formula: 'if {Command.U_ItemType}="Label" then \n({@Total Cost}+{@Profit Cost}+0)\nelse\n({@Total Cost}+{@Profit Cost}+0)+0.025', plain: 'Label â†’ Total Cost + Profit Cost; other â†’ â€¦ + 0.025', numbers: ['sleeveAddOn'] },
  { no: '2', name: 'Changeover Time (Hrs)', result: 'Number', formula: 'if {Command.U_JobLevel}="Level 1" then 1.00\nelse if {Command.U_JobLevel}="Level 2" then 1.50\nelse if {Command.U_JobLevel}="Level 3" then 2.00', plain: '"Level 1" â†’ 1.00, "Level 2" â†’ 1.50, "Level 3" â†’ 2.00, anything else â†’ 0', numbers: ['changeoverL1', 'changeoverL2', 'changeoverL3'] },
  { no: '3', name: 'Circumference', result: 'Number', formula: String.raw`({Command.U_Teeth}*3.175)/1000`, plain: '(Teeth Ã— 3.175) / 1000', numbers: ['teethPitch'] },
  { no: '4', name: 'Coating Cost', result: 'Number', formula: String.raw`({@SQM Per Label})*{Command.Coating Rate}`, plain: 'SQM Per Label Ã— Coating Rate', numbers: [] },
  { no: '5', name: 'Conversion Cost', result: 'Number', formula: String.raw`(((({@Changeover Time (Hrs)}+({@Running Meters}/{@Print Speed})/60))*2000)/{Command.U_MOQ})+(({@SQM Per Label})*{@L+S})`, plain: '((Changeover + (Running Meters / Print Speed) / 60) Ã— 2000) / MOQ + SQM Per Label Ã— L+S', numbers: ['conversionPerHour'] },
  { no: '6', name: 'Effects', result: 'String', formula: String.raw`{Command.U_ValueAddition}`, plain: 'Value Addition as it is (printed in Other Effects)', numbers: [] },
  { no: '7', name: 'Final Rate', result: 'Number', formula: 'if {Command.U_Set}="Yes" then \n({@Calculated Rate}*2)\nelse\n{@Calculated Rate}', plain: 'Set Yes â†’ Calculated Rate Ã— 2; else Calculated Rate. Printed as the Unit Price (no zero checks; an empty value or missing rate leaves it blank)', numbers: ['setMultiplier'] },
  { no: '8', name: 'Freight Cost', result: 'Number', formula: String.raw`(({@SQM Per Label}*158)/1000)*{Command.Diapcth Rate}`, plain: '((SQM Per Label Ã— 158) / 1000) Ã— Diapcth Rate', numbers: ['weightFactor'] },
  { no: '9', name: 'Ink Cost', result: 'Number', formula: String.raw`({@SQM Per Label}*3.5*{Command.U_InkCoverageArea})/100`, plain: '(SQM Per Label Ã— 3.5 Ã— Ink Coverage Area) / 100', numbers: ['inkRate'] },
  { no: '10', name: 'L+S', result: 'Number', formula: 'if {Command.U_ItemType}="Label" then 4\nelse 1', plain: 'Label â†’ 4, otherwise 1', numbers: ['labelLS', 'otherLS'] },
  { no: '11', name: 'Material Cost', result: 'Number', formula: String.raw`({@SQM Per Label})*{Command.Materail Rate}`, plain: 'SQM Per Label Ã— Materail Rate', numbers: [] },
  { no: '12', name: 'Packing Cost', result: 'Number', formula: '(({@SQM Per Label}*158)/1000)*5 ', plain: '((SQM Per Label Ã— 158) / 1000) Ã— 5', numbers: ['weightFactor', 'packingRate'] },
  { no: '13', name: 'Print Speed', result: 'Number', formula: 'if {Command.U_JobLevel}="Level 1" then 80\nelse if {Command.U_JobLevel}="Level 2" then 60\nelse if {Command.U_JobLevel}="Level 3" then 40', plain: '"Level 1" â†’ 80, "Level 2" â†’ 60, "Level 3" â†’ 40, anything else â†’ 0', numbers: ['printSpeedL1', 'printSpeedL2', 'printSpeedL3'] },
  { no: '14', name: 'Profit Cost', result: 'Number', formula: String.raw`(({Command.U_ProfitOverhead}/100)*{@Total Cost})`, plain: '(Profit + Overhead / 100) Ã— Total Cost', numbers: [] },
  { no: '15', name: 'Running Meters', result: 'Number', formula: String.raw`((tonumber({Command.U_MOQ})*{@Circumference})/tonumber({Command.U_AroundUP}))/tonumber({Command.U_AcrossUP})`, plain: '((MOQ Ã— Circumference) / ArUP) / AcUP', numbers: [] },
  { no: '16', name: 'SQM Per Label', result: 'Number', formula: String.raw`(({@Width})*({@Circumference}))/(tonumber({Command.U_AcrossUP})*tonumber({Command.U_AroundUP}))`, plain: '(Width Ã— Circumference) / (AcUP Ã— ArUP)', numbers: [] },
  { no: '17', name: 'Total Cost', result: 'Number', formula: '{@Conversion Cost}+{@Coating Cost}+{@Material Cost}+{@Value Add Cost}+\n{@Wastage Cost}+{@Ink Cost}+{@Freight Cost}+{@Packing Cost}', plain: 'All eight costs added up', numbers: [] },
  { no: '18', name: 'Value Add Cost', result: 'Number', formula: String.raw`(({@SQM Per Label})*{Command.Valuadition Rate})*({Command.U_ValueAddCoverageArea}/100)`, plain: 'SQM Per Label Ã— Valuadition Rate Ã— (Value Add Coverage Area / 100)', numbers: [] },
  { no: '19', name: 'Wastage Cost', result: 'Number', formula: String.raw`((((({@Wastage Meters}+(({@Running Meters}/2000)*50))*{@Width})*{Command.Materail Rate})*2)/{Command.U_MOQ})*1.05`, plain: '(((Wastage Meters + (Running Meters / 2000) Ã— 50) Ã— Width Ã— Materail Rate Ã— 2) / MOQ) Ã— 1.05', numbers: ['wastageRunPer', 'wastageRunAdd', 'wastageFactor', 'wastageUplift'] },
  { no: '20', name: 'Wastage Meters', result: 'Number', formula: 'if {@Changeover Time (Hrs)}=1.00 then 250\nelse if {@Changeover Time (Hrs)}=1.50 then 350\nelse if {@Changeover Time (Hrs)}=2.00 then 450', plain: 'Changeover 1.00 â†’ 250, 1.50 â†’ 350, 2.00 â†’ 450, anything else â†’ 0', numbers: ['wastageMetersL1', 'wastageMetersL2', 'wastageMetersL3'] },
  { no: '21', name: 'Width', result: 'Number', formula: 'if {Command.U_ItemType}="Sleeve" then \n(20+(tonumber({Command.U_Width})*Tonumber({Command.U_AcrossUP}))+((Tonumber({Command.U_AcrossUP})-1)*{@AcGape}))/1000\nelse (14+(tonumber({Command.U_Width})*Tonumber({Command.U_AcrossUP}))+((Tonumber({Command.U_AcrossUP})-1)*{@AcGape}))/1000', plain: 'Sleeve: (20 + W Ã— AcUP + (AcUP âˆ’ 1) Ã— AcGape) / 1000; otherwise (14 + â€¦) / 1000. AcGape is the sheetâ€™s Across Gap.', numbers: ['sleeveMargin', 'labelMargin'] },
]

/** The SQL behind the Sales Quotation, as the user sent it: the four rates, the footer texts and the company logo. */
export const SALES_QUOTATION_SQL = `select *,T2.U_Rate as 'Coating Rate',
T3.U_Rate as 'Materail Rate',
T4.U_Rate as 'Valuadition Rate',
T5.U_Rate as 'Diapcth Rate',
T0.DocEntry as 'Document No.',T0.Remark as 'Remarks For',
T0.U_MarketingP as 'MPerson',
Case
When T0.U_PlateCharge='Extra@2000' then 'Extra @2000 per colour'
When T0.U_PlateCharge='Extra@1800' then 'Extra @1800 per colour'
When T0.U_PlateCharge='Extra@1500' then 'Extra @1500 per colour'
When T0.U_PlateCharge='Extra@1200' then 'Extra @1200 per colour'
When T0.U_PlateCharge='Extra@1000' then 'Extra @1000 per colour'
When T0.U_PlateCharge='Extra@800' then 'Extra @800 per colour'
When T0.U_PlateCharge='Extra@600' then 'Extra @600 per colour'
When T0.U_PlateCharge='Included' then 'Included in Rate' end as 'PlateCharge',
Case
when T0.U_DieCharge='Extra@15000' then 'Extra @15000 per size'
when T0.U_DieCharge='Extra@10000' then 'Extra @10000 per size'
when T0.U_DieCharge='Extra@2500' then 'Extra @2500 per size'
when T0.U_DieCharge='Extra@2000' then 'Extra @2000 per size'
when T0.U_DieCharge='Extra@1500' then 'Extra @1500 per size'
when T0.U_DieCharge='Included' then 'Included in rate'
when T0.U_DieCharge='None' then 'None' end as 'DieCharge',
Case
when T0.U_ProofingCharge='Extra@15000' then 'Extra @15,000 per artwork'
when T0.U_ProofingCharge='Extra@12000' then 'Extra @12,000 per artwork'
when T0.U_ProofingCharge='Extra@10000' then 'Extra @10,000 per artwork'
when T0.U_ProofingCharge='Extra@8000' then 'Extra @8000 per artwork' end as 'ProofingCharge',
Case
When T0.U_Freight='Inclu RoadT' then 'Included in Rate (Road Transport)'
When T0.U_Freight='Inclu RTrain' then 'Included in Rate (Train)'
When T0.U_Freight='To-PayB' then 'To-Pay Basis' end as 'Freight',
T0.U_GST as 'GST',T1.U_AcrossUP AS 'AcrossUP',
TT1.LogoImage as 'Company Logo'
from [@RATECALM] T0
inner join [@RATECALD] T1 on T0.DocEntry=T1.DocEntry
left join [@RATED] T2 on T1.U_CoatingType=T2.U_Type
left join [@RATED] T3 on T1.U_Material=T3.U_Type
left join [@RATED] T4 on T1.U_ValueAddition=T4.U_Type
left join [@RATED] T5 on T1.U_DeliveryZone=T5.U_Type
cross join OADP TT1
cross join ADM1 TT2
WHERE T0.DocEntry={?DocKey@}`

/**
 * What the Sales Quotation page still uses from SAP's report design (the
 * quotation year, page headers, "Cont..") - not part of the formula list
 * above. Kept apart so the list above is only the user's formulas.
 */
export const SALES_QUOTATION_LAYOUT: FormulaEntry[] = [
  { no: '#25', name: '@Year', result: 'Number', formula: String.raw`year({Command.U_Date})`, plain: 'The year of the date', numbers: [] },
  { no: '#29', name: '@AcGape', result: 'Number', formula: String.raw`ToNumber({Command.U_AcrossGAP})`, plain: 'AcGAP', numbers: [] },
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
