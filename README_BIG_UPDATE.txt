SFK ClassBoard Big Update

Upload these files to your GitHub Pages repository:

- index.html
- style.css
- script.js
- admin.html
- admin.css
- admin.js
- officer.html
- officer.css
- officer.js

Copy the contents of Code.gs into your Google Apps Script project, then deploy a new version.

New DailyInfo sheet headers:

Day | EntryGate | ExitGate | Uniform | Publish

Example rows:

Monday | Gate 2 | SHS Gate | Complete School Uniform | YES
Tuesday | Gate 2 | SHS Gate | Activity Shirt | YES
Wednesday | Gate 2 | SHS Gate | PE Shirt | YES

Text formatting for Subject Announcements, Things to Bring, and Adviser Reminders:

Admin and Officer forms now have a Text Format dropdown. Admin edit modal also has a format dropdown for long text fields.

The app still saves format tags in the sheet automatically:

[left]
Text here

[center]
Text here

[right]
Text here

[bullets]
Item 1
Item 2
Item 3

[numbers]
Step 1
Step 2
Step 3

Other notes:

- Subject fields in Admin and Officer panels are now typeable with subject suggestions.
- Admin Manage Existing Data supports checkbox selection, long press on phone, Hide Selected, and Delete Selected.
- Officer Manage Existing Data supports checkbox selection, long press on phone, and Hide Selected only.
- Weekly Class Schedule now shows Pasok, Uwian, Entry Gate, Exit Gate, and Uniform.
- Current Subject / Next Subject was renamed to Current Period / Next Period.
- On phone/tablet, Current Period and Next Period hide on weekends, before the 1-hour pre-first-period window, and 1 hour after the last period ends.
- Prayer popup uses manual audio player mode with a soft moving prayer background.
- Prayer test trigger is OFF by default in script.js.
