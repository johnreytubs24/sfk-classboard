SFK KindTrack Attendance Update

Files included:
- index.html
- script.js
- style.css
- attendance-header.png
- CodeGS_Attendance_Update.txt

Google Sheets setup:
1. Make sure there is a sheet/tab named exactly:
   Attendance

2. Row 1 headers should be:
   AttendanceID | StudentID | Date | Status | Remarks

3. Leave the rows under the headers blank. The app will write attendance records automatically.

Apps Script setup:
1. Replace your Code.gs with CodeGS_Attendance_Update.txt.
2. Deploy a NEW VERSION.
3. Use the new deployment URL in script.js if Apps Script gives you a different web app URL.

Attendance behavior:
- Daily attendance only.
- Page shows a compact attendance summary first.
- Full attendance list opens only inside the Attendance modal.
- Every student defaults to Present.
- Use radio buttons to mark Present, Absent, Excused, or Tardy.
- Student names display as SURNAME, FIRST NAME from the Students sheet.
- Check Today's Attendance shows Absent, Tardy, and Excused by default.
- Turn on Show All Students to include Present students in the board.
- Monthly Attendance Summary counts Present, Absent, Excused, and Tardy per student.
- Print Attendance uses the selected date.
- Apps Script saves attendance by batch per selected date for faster saving.

Admin usability update:
- Admin mode now has shortcut buttons for Add Violation, Attendance, Summary, and Print All.
- Add Violation is now a modal opened only from the top shortcut.
- Optional guidance details are tucked under one expandable section.
- View Only mode keeps attendance as a summary/board instead of showing the encoding checklist.
- Attendance is now tap-mode: choose Absent, Tardy, Excused, or Present/Reset once, then tap student names.
- No more four status buttons per student row.
- Attendance rows change color immediately and show a status badge, so the selected status is obvious on desktop and phone.
- Attendance summary cards are clickable; click Present/Absent/Excused/Tardy/Total to view the student list in a small popup.
- Boys first, then Girls sort is available. For this to work, add a Gender or Sex column in the Students sheet with values like Boy/Girl or Male/Female. If missing, the list falls back to alphabetical.
- On phone, student details open as a popup instead of appearing under the student list.
- View Only mode can show fees again, with a Hide Fees / Show Fees toggle.
- Kindness Guide / Violation Fee List is visible in Viewer mode.
- Monthly Attendance Summary has a Print Monthly button.
- Monthly Attendance Summary also has Download Spreadsheet, which generates an editable .xlsx file.
- Print Monthly now uses the uploaded DAILY ATTENDANCE sheet style: Folio portrait, school header image, boys/girls sections, date grid, legend, important note, and adviser signature line.
- Monthly spreadsheet/print marks: blank = Present, X = Absent, T = Tardy, E = Excused.
- Monthly spreadsheet marks and totals are red and not bold, matching red ballpen markings.
- Monthly spreadsheet now writes styled blank cells so the grid/border lines stay visible even when students are Present.
- Monthly spreadsheet embeds the school header image even when the app is opened as a local file.
- Monthly spreadsheet/print date columns are fixed as 5 school weeks: Monday-Friday, Monday-Friday, Monday-Friday, Monday-Friday, Monday-Friday.
- If a month starts midweek, earlier weekday boxes stay blank so the date still lands on the correct weekday column.
- Monthly print marks: blank = Present, X = Absent, T = Tardy, E = Excused.
- Boys first sorting now accepts more header/value variants, including Gender/Sex with spaces and B/G, Boy/Girl, Male/Female, Lalaki/Babae.
- Desktop view now has independent scrolling for the student list while the details panel stays visible.
- Student cards are thinner/denser so the scrollable list does not feel bulky.
- Mobile attendance is now encode-first: Date, Mark as buttons, and the student list appear first.
- Search, filter, sort, daily summary board, and monthly tools are tucked under More attendance tools on phone.
- The phone attendance list scrolls inside the modal, with thinner rows and no repeated helper text per student.
- The phone Save Attendance button is compact and no longer appears as a large full-width block before the student list.
