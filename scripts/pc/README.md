# Office PC scripts

Copies of the scripts that run the live CRM on the office PC. The live copies
sit one folder above this repo (`one desk CRM\`), next to the Excel workbooks;
edit them there and copy them back here.

- `Start_CRM.bat` - starts the CRM server on port 8080 (Startup-folder shortcut).
  Expects to sit next to the `coordinator` folder.
- `auto-refersh-payment-crm.vbs` - opens `crm active payments.xlsm` and
  `RFD_CRM.xlsm` in a hidden Excel, refreshes their SAP queries, saves them and
  logs to `Refresh log.txt`. Does not save when a query fails or a table comes
  back empty. Run every 10 minutes by the scheduled task
  "OneDesk CRM Excel refresh" (needs the user signed in; a locked screen is fine).
