/**
 * How the CRM works, in words Robi can explain to anyone.
 *
 * The data context tells Robi what is true today - who owes what, who rang
 * whom. This tells it how the system behaves: where things live, what each
 * status means, why an account appears or disappears, how to do each job. With
 * only the data, "why can't I see AyuLabs?" or "how do I add a follow-up?" got
 * "I could not find that in the records". Keep it in step with the app: every
 * rule here is one the code applies.
 */

export const CRM_GUIDE = `HOW THE CRM WORKS (the system guide - use it to explain why and how):

PEOPLE AND ROLES
- Coordinators chase customers for payment. They see only the accounts assigned to them.
- The team leader (Niki Patel) and the administrator see every account, the Overview, the KPI pages and Settings. Only the administrator has the Admin Panel (users and logins).

SCREENS (left-hand menu)
- Dashboard: the day at a glance - cards for what is owed, past due, promises, and for the administrator the system health (data freshness, rows that did not reach the CRM, accounts with no owner).
- Active Payments: one row per open invoice, from the Excel sheet "CRM ACTIVE PAYMENT". Search, Status filter, Due-date filter, coordinator buttons (leader/admin), Excel download. Click a row to open the account panel.
- Overdue Payments: one row per customer from the ageing report, the Excel sheet "CRM OverDue": Total Due and the buckets 0-30, 31-60, 61-90, 91-120 and 121+ days. The Ageing breakdown panel at the top totals each bucket; click a bucket to list its companies. Search, Status filter, Due-date filter, coordinator buttons (leader/admin), Excel download.
- Overview (leader/admin): tabs Summary (per-coordinator breakdown), Follow-up history, Robi task history, Proof checks, Bankrupt register, No follow-up register, Dispute register.
- Weekly KPI and OTIF Analytics (leader/admin): weekly coordinator scores from saved Overdue days, and on-time-in-full delivery analytics. (Daily Entry, My Entries, Team Activity and Collections KPI were removed on 13 Oct 2026.)
- Settings (leader/admin): Thresholds, Team Management, Coordinator Aliases, Import History, Upload History.
- Admin Panel (administrator): add, edit and remove users and their logins.

WHERE THE NUMBERS COME FROM - THE EXCEL FILE IS THE TRUTH
- All amounts, invoices and ageing come from the workbook "crm active payments.xlsm". It is refreshed every morning at 09:30. The CRM reads it when the team leader or administrator presses "Sync now" on Active Payments or Overdue Payments (or automatically on save, if "Auto-sync on save" is switched on).
- After a sync the CRM matches the file: a balance the file shows is shown; status comes from the file.
- A customer or invoice that disappears from the file is marked settled (Overdue) or paid (Active Payments) by the sync and drops out of every list and total. If it comes back in the file, the next sync brings it back.
- If a figure in the CRM differs from the Excel file, the most likely reason is that nobody has pressed Sync now since the file was saved.

COORDINATOR NAMES
- Each row's owner is the name in the Excel "Coordinator" column. A name that matches a CRM user (or one of their aliases) books the row to that person.
- A name with no CRM login (for example "other", or someone who is not a user) is shown as "Unknown" / "Not in CRM": leader and admin see those rows and can filter by the Unknown button; coordinators do not. Fix it by adding the person as a user in the Admin Panel, adding the spelling as an alias in Settings > Coordinator Aliases, or correcting the name in the Excel file - then Sync now.

STATUSES
- Active Payments invoice: current (not due yet), upcoming (due within 7 days), overdue (past its due date), critical (more than 60 days past due), paid (nil, or gone from the file).
- Overdue Payments: overdue, critical (any money in the 91-120 or 121+ buckets), settled (gone from the file or nil), bankrupt (declared).
- A negative amount is a credit note or advance; it reduces the totals.

FOLLOW-UPS
- Open the account (click its row) and press Add Follow-Up: choose how (call, WhatsApp, email, in person, other), write notes and the customer's response, and record a promise (date and amount) or a next reminder date if there is one.
- A coordinator can edit their own follow-ups at any time (the pencil on the timeline); every edit keeps the earlier version in the audit log. The team leader and administrator can edit any.
- Robi cannot log, edit or delete a follow-up, mark a payment received or change a status. The person does that on the account.

SET ASIDE: NO FOLLOW-UP AND BANKRUPT
- A coordinator can ask for No follow-up, Dispute, Export client or Bankrupt on their own account, with a reason of at least 5 characters; it waits in Overview > Approvals and nothing changes until the team leader or administrator approves it (it is then applied in the coordinator's name). The team leader and administrator decide directly, also with a reason, and only they can undo a decision.
- The "No follow-up" button on an account sets the customer aside: it leaves Active Payments, Overdue Payments and every total, and is listed only in Overview > No follow-up, with who did it, when and their note. "Resume follow-up" (team leader/administrator) brings it back - on the account, in the register, or from the notice that appears when you search for it.
- The "Dispute" button does the same for a customer disputing the amount, with the reason; it is listed in Overview > Dispute.
- "Declare bankrupt" on an account does the same for a company that has gone under, for all its invoices and its overdue row; it is listed in Overview > Bankrupt.
- Searching Active or Overdue Payments for a set-aside customer shows "not listed here - set aside" with who, when and why.
- The sync never changes a set-aside customer; a bankruptcy survives every sync.

READY FOR DISPATCH (RFD)
- The Ready for Dispatch page lists finished goods waiting in the warehouse with payment still pending, from the RFD workbook (SAP), highest pending amount first. It shows sales order, production order, item, quantity, RFD value, paid, pending, ready-since date and days waiting, with filters by age and coordinator and an Excel download.
- Every FGPO (FG-Pouch) line belongs to Avani Patel, whoever the customer is. Any other line belongs to the coordinator who has that customer in Active or Overdue Payments, matched by company name; a customer not found there shows as Unknown.
- Follow-ups on an RFD line are logged on the customer's Active or Overdue Payments record, so they count in follow-up history, Robi's tasks and scores. Mention the sales order in the note.
- The team leader or administrator syncs it with "Sync now" on that page; the workbook itself is refreshed from SAP every morning at 09:30.

EXPORT CLIENT AND SET-ASIDE AMOUNTS
- "Export client" is a fourth set-aside next to No follow-up, Dispute and Bankrupt, for export (overseas) customers whose payment is handled outside this follow-up. It works like Dispute: reason required, a coordinator's request needs approval, and the customer leaves the lists, the totals and Robi's tasks. Overview > Export clients lists them.
- The Dashboard shows four "Set aside" amount cards (No follow-up, Dispute, Export client, Bankrupt): the team leader and administrator see the whole team, a coordinator only their own customers. Each customer is counted once: their ageing balance where they have an Overdue row, otherwise their open invoices.
- A coordinator's Dashboard also shows "My weekly progress": the Mon-Sat average score for each of the last 8 weeks, tasks done, extra work and leave days, and whether this week is ahead of or behind last week.

WEEKLY KPI
- "Save today's data" (Overdue Payments and Weekly KPI, team leader/admin) freezes the Overdue book for the weekly score. Every Monday it is also saved automatically: from 10:00, as soon as that morning's Overdue sync is in, or at 13:00 with whatever data there is. Only one save per Monday; a manual save that day counts.
- Weekly KPI compares two saved days. Its KPI score is written as the gap from 100%: 80 out of 100 shows as -20%, a full score as 0% (the same way as the daily scores).

CREDIT / DEBIT NOTES
- Money past 120 days held up by a credit or debit note gets special attention: when the latest follow-up on an overdue customer with a 121+ balance mentions a credit note, debit note, CN or DN, Robi gives a "Credit/debit note pending" task every day, first in the list and on top of the day's 8, even if a later follow-up date was set, until a newer follow-up no longer mentions a note.

QUOTATIONS
- The Quotations page (sidebar) holds every quotation, kept in the CRM since 13 Oct 2026 instead of the Quotation List workbook (its 661 rows were imported). A coordinator adds and edits their own quotations and sees only theirs; the team leader and administrator see everyone's, filter by coordinator and download Excel.
- "New quotation": customer, concern person, contact, quotation number (the next free number is suggested), enquiry and quotation dates, source (Label, Sleeve, Label / Sleeve), sales employee, customer type (New or Existing), amount and status.
- Status: Open (waiting on the customer), Closed (order received, won) or Lost. Closed or Lost fills the closing date with today (it can be changed); Lost needs a reason. The performance remark follows the status: Closed = Excellent, Open = Good, Lost = Poor.
- Follow-ups on a quotation are logged inside it ("Log", with a note); the follow-up count goes up by itself and includes the count from the old sheet.

ROBI'S DAILY PLAN
- Every morning Robi gives each coordinator 8 tasks: 4 from Active Payments and 4 from Overdue Payments. An Active Payments invoice only becomes a task once it is past its due date or due within the next 2 days; nothing earlier is planned, not even a follow-up date or promise set on an invoice that is not yet due. Only balances of Rs 1,000 or more, one per customer, the highest amount first and then the oldest. A customer whose latest follow-up set a next follow-up or promise date in the future is left out until that date; a customer followed up without a next date is left out for 5 days, so the same call is not handed out day after day.
- A task is done when the coordinator logs any follow-up on that customer that day - on any of its invoices or its overdue row (not the follow-up that created the task, such as the customer's own promise).
- "Later" sets a task aside for the day. Anything not done comes back at the top of the next day's plan, on top of that day's 8 new tasks, reworded with that day's facts.
- There is no extra work after the plan: once the day's tasks are done, Robi adds nothing more that day.
- Extra work: a follow-up logged on a customer who was not on that day's Robi list counts as extra work, once per customer per day. It shows as "+N extra" in Overview > Scores, on the coordinator's My score card and in the PDF report. Each extra customer makes up for one missed Robi task that day, so it can lift the day's score up to 0% but never above it.
- Attendance: the team leader or administrator marks a coordinator on leave or on a half day in Overview > Attendance (today or ahead). On leave Robi gives no tasks and the day shows "Leave" in the scores, never 0% or -100% (a past day can be marked too); anything open comes back on the next working day. On a half day Robi gives 4 new tasks instead of 8 (leftovers still on top) and 1 proof check instead of 2; if the half day is marked after the plan was made, the undone new tasks beyond 4 move to the next working day.
- Overview > Robi task history shows every task, who did it and when, what was not done, completion % (done out of all tasks given) and an Excel download.
- Robi's pop-ups for the team leader and administrator, one at a time, each said once: set-aside requests waiting for approval, proof screenshots waiting for review, proof checks missed today, the team's progress on today's plans (Overview), broken promises (Dashboard), and once a day who is on leave or a half day and how much Ready for Dispatch value has been unpaid for 7+ days.

MESSAGES THROUGH ROBI (team leader and administrator only)
- Type "tell <coordinator name> <message>", "tell the team <message>" or "tell the GP3 team <message>". Robi shows a preview - who gets it and the wording, which can be edited - and nothing is sent until Send is pressed. It then appears in each recipient's notification bell.
- "What have I sent?" lists the messages already sent. Coordinators cannot send messages through Robi.

WHEN SOMETHING IS "MISSING" - CHECK IN THIS ORDER
1. Is it in today's Excel file? If not, it was settled/paid by the sync and is correctly not shown.
2. Has anyone pressed Sync now since the file was saved?
3. Is it set aside (No follow-up, Dispute or Bankrupt)? Search for it: the notice says who, when and why.
4. Is it booked to another coordinator? Coordinators see only their own accounts.
5. Is the coordinator name in the file unknown to the CRM? Then it shows under "Unknown" for leader/admin only.

DOWNLOADS
- Excel buttons on Active Payments, Overdue Payments (filters applied) and Robi task history.`
