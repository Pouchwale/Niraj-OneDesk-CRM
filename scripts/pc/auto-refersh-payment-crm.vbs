Option Explicit

' Opens each CRM workbook, refreshes its SAP queries and saves it, one after
' the other. Run by the scheduled task "auto-refersh-payment-crm".
'
'  - Workbook already open in Excel on this PC: refreshed and saved right
'    there (your window stays open).
'  - Workbook open on another PC (read-only here): retried every minute,
'    up to RETRY_TIMES, and the log names who has it open.
'  - A query that errors, or a table that comes back empty, means the
'    workbook is NOT saved - the CRM keeps yesterday's data instead of
'    reading a broken or empty sheet.
'
' Double-click to run it by hand. Files given on the command line are
' refreshed instead of the list below.

Const SHOW_EXCEL   = False   ' True = watch Excel do the refresh
Const RETRY_TIMES  = 5       ' tries when the workbook is open elsewhere (fits a 10-min schedule)
Const RETRY_WAIT   = 60      ' seconds between those tries

Dim sDir, sLog, fso, books, b, failures, i

Set fso = CreateObject("Scripting.FileSystemObject")
sDir = fso.GetParentFolderName(WScript.ScriptFullName)
sLog = sDir & "\Refresh log.txt"

If WScript.Arguments.Count > 0 Then
    ReDim books(WScript.Arguments.Count - 1)
    For i = 0 To WScript.Arguments.Count - 1
        books(i) = fso.GetAbsolutePathName(WScript.Arguments(i))
    Next
Else
    books = Array( _
        sDir & "\crm active payments.xlsm", _
        sDir & "\RFD_CRM.xlsm")
End If

failures = 0
For Each b In books
    If Not RefreshBook(b) Then failures = failures + 1
Next

If failures > 0 Then WScript.Quit 1
WScript.Quit 0

' ================= one workbook =================

Function RefreshBook(sFile)
    Dim sName, xlApp, xlBook, ownApp, myPID, attempt
    RefreshBook = False
    sName = fso.GetFileName(sFile)

    If Not fso.FileExists(sFile) Then
        WriteLog "FAILED: " & sName & " not found at " & sFile
        Exit Function
    End If

    ' 1. already open in Excel on this PC? use that copy
    Set xlBook = OpenHere(sFile)
    If Not xlBook Is Nothing Then
        If xlBook.ReadOnly Then
            WriteLog "FAILED: " & sName & " is open read-only in Excel on this PC - close it and run again"
            Exit Function
        End If
        WriteLog "INFO: " & sName & " is open in Excel on this PC - refreshing it there"
        RefreshBook = RefreshAndSave(xlBook, sName)
        Exit Function
    End If

    ' 2. otherwise open it in an Excel of our own, retrying while someone
    '    else has it open
    For attempt = 1 To RETRY_TIMES
        myPID = StartExcel(xlApp)
        If myPID = -1 Then
            WriteLog "FAILED: Excel could not be started on this PC"
            Exit Function
        End If

        Set xlBook = Nothing
        On Error Resume Next
        Set xlBook = xlApp.Workbooks.Open(sFile, 0, False)
        If Err.Number <> 0 Then
            WriteLog "FAILED: " & sName & " could not be opened - " & Err.Description
            Err.Clear
            On Error GoTo 0
            CloseExcel xlApp, xlBook, myPID
            Exit Function
        End If
        On Error GoTo 0

        If Not xlBook.ReadOnly Then
            RefreshBook = RefreshAndSave(xlBook, sName)
            CloseExcel xlApp, xlBook, myPID
            Exit Function
        End If

        CloseExcel xlApp, xlBook, myPID
        If attempt = RETRY_TIMES Then
            WriteLog "FAILED: " & sName & " still open elsewhere" & HeldBy(sFile) & _
                     " after " & RETRY_TIMES & " tries - not refreshed"
            Exit Function
        End If
        If attempt = 1 Then
            WriteLog "WAIT: " & sName & " is open elsewhere" & HeldBy(sFile) & _
                     " - retrying every " & RETRY_WAIT & "s"
        End If
        WScript.Sleep RETRY_WAIT * 1000
    Next
End Function

' Refreshes every loaded query one by one, checks the tables, then saves.
Function RefreshAndSave(xlBook, sName)
    Dim conn, ws, lo, rows, summary, bad, before, done
    RefreshAndSave = False
    bad = False
    done = 0
    before = fso.GetFile(xlBook.FullName).DateLastModified

    For Each conn In xlBook.Connections
        If LoadedSomewhere(conn) Then
            On Error Resume Next
            conn.OLEDBConnection.BackgroundQuery = False
            conn.ODBCConnection.BackgroundQuery = False
            Err.Clear
            conn.Refresh
            done = done + 1
            If Err.Number <> 0 Then
                WriteLog "FAILED: " & sName & " query '" & conn.Name & "' - " & Err.Description
                bad = True
                Err.Clear
            End If
            On Error GoTo 0
        End If
    Next
    xlBook.Application.CalculateUntilAsyncQueriesDone
    If done = 0 Then
        WriteLog "FAILED: " & sName & " has no query loaded to a sheet - nothing to refresh"
        bad = True
    End If

    summary = ""
    For Each ws In xlBook.Worksheets
        For Each lo In ws.ListObjects
            If lo.DataBodyRange Is Nothing Then rows = 0 Else rows = lo.ListRows.Count
            summary = summary & ", " & ws.Name & " = " & rows & " rows"
            If rows = 0 Then
                WriteLog "FAILED: " & sName & " sheet '" & ws.Name & "' came back empty"
                bad = True
            End If
        Next
    Next

    If bad Then
        WriteLog "FAILED: " & sName & " NOT saved - the file keeps its last good data"
        Exit Function
    End If

    On Error Resume Next
    xlBook.Saved = False
    xlBook.Save
    If Err.Number <> 0 Then
        WriteLog "FAILED: " & sName & " save error - " & Err.Description
        Err.Clear
        On Error GoTo 0
        Exit Function
    End If
    On Error GoTo 0

    If fso.GetFile(xlBook.FullName).DateLastModified = before Then
        WriteLog "FAILED: " & sName & " save did not reach the disk"
        Exit Function
    End If

    WriteLog "OK: " & sName & " refreshed and saved" & summary
    RefreshAndSave = True
End Function

' ================= helpers =================

' Connection-only queries (not loaded to a sheet) are skipped.
Function LoadedSomewhere(conn)
    LoadedSomewhere = False
    On Error Resume Next
    If conn.Ranges.Count > 0 Then LoadedSomewhere = True
    If conn.InModel Then LoadedSomewhere = True
    Err.Clear
    On Error GoTo 0
End Function

' The workbook if it is open in the running Excel on this PC, else Nothing.
Function OpenHere(sFile)
    Dim xl, wb
    Set OpenHere = Nothing
    On Error Resume Next
    Set xl = GetObject(, "Excel.Application")
    If Err.Number <> 0 Then
        Err.Clear
        Exit Function
    End If
    On Error GoTo 0
    For Each wb In xl.Workbooks
        If LCase(wb.FullName) = LCase(sFile) Then
            Set OpenHere = wb
            Exit Function
        End If
    Next
End Function

' Starts a hidden Excel; returns its process id (0 if unknown, -1 on failure).
Function StartExcel(xlApp)
    Dim pidsBefore, p
    Set pidsBefore = ExcelPIDs()
    On Error Resume Next
    Set xlApp = CreateObject("Excel.Application")
    If Err.Number <> 0 Then
        StartExcel = -1
        Exit Function
    End If
    On Error GoTo 0
    xlApp.Visible = SHOW_EXCEL
    xlApp.DisplayAlerts = False
    xlApp.AskToUpdateLinks = False
    xlApp.AutomationSecurity = 3   ' macros off while we work

    StartExcel = 0
    For Each p In ExcelPIDs().Keys
        If Not pidsBefore.Exists(p) Then StartExcel = p
    Next
End Function

Sub CloseExcel(xlApp, xlBook, myPID)
    Dim proc
    On Error Resume Next
    If Not xlBook Is Nothing Then xlBook.Close False
    xlApp.Quit
    Set xlBook = Nothing
    Set xlApp = Nothing

    ' backstop: kill ONLY the Excel this script started, if it is still hanging
    WScript.Sleep 3000
    If myPID > 0 Then
        For Each proc In GetObject("winmgmts:").ExecQuery( _
                "SELECT * FROM Win32_Process WHERE ProcessId=" & myPID)
            proc.Terminate
        Next
    End If
    Err.Clear
End Sub

Function ExcelPIDs()
    Dim d, pr
    Set d = CreateObject("Scripting.Dictionary")
    For Each pr In GetObject("winmgmts:").ExecQuery( _
            "SELECT ProcessId FROM Win32_Process WHERE Name='EXCEL.EXE'")
        d(pr.ProcessId) = True
    Next
    Set ExcelPIDs = d
End Function

' " (by <name>)" from Excel's ~$ owner file, when there is one.
Function HeldBy(sFile)
    Dim sLock, f, s, n
    HeldBy = ""
    sLock = fso.GetParentFolderName(sFile) & "\~$" & fso.GetFileName(sFile)
    If Not fso.FileExists(sLock) Then Exit Function
    On Error Resume Next
    Set f = fso.OpenTextFile(sLock, 1)
    s = f.Read(55)
    f.Close
    If Err.Number = 0 And Len(s) > 1 Then
        n = Asc(Left(s, 1))
        If n > 0 And n < Len(s) Then HeldBy = " (by " & Trim(Mid(s, 2, n)) & ")"
    End If
    Err.Clear
End Function

Sub WriteLog(msg)
    Dim f
    ' Every 10 minutes adds up: past 2 MB the log starts over, the old one kept as .old
    If fso.FileExists(sLog) Then
        If fso.GetFile(sLog).Size > 2000000 Then
            If fso.FileExists(sLog & ".old") Then fso.DeleteFile sLog & ".old", True
            fso.MoveFile sLog, sLog & ".old"
        End If
    End If
    Set f = fso.OpenTextFile(sLog, 8, True)
    f.WriteLine Now & " - " & msg
    f.Close
End Sub
