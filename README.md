# Duty — HRIS SaaS

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your MySQL credentials:
   ```
   cp .env.example .env
   ```

3. Create the database (once):
   ```sql
   CREATE DATABASE duty_db;
   ```

4. Run migrations (creates all tables: companies, departments, designations, shifts, employees,
   attendance_logs, leave_types, leave_requests, payroll_records, devices; also adds
   employees.device_user_id and a uniqueness guard on attendance_logs — no new tables from
   Reports or the Dashboard, they only read existing data):
   ```
   npm run migrate
   ```

5. Start the server:
   ```
   npm start
   ```

6. Open http://localhost:4000 in your browser.

## Modules (all 10 complete)

### 1. Company Management
- `companies` table (root tenant table — no `company_id` on it, since a company *is* the tenant)
- REST API: `GET/POST /api/companies`, `GET/PUT/DELETE /api/companies/:id`
- Search by name/email, filter by status, pagination
- Simple web UI: list, add, edit, delete (with confirmation)

### 2. Employee Management
- `employees` table, scoped by `company_id` (FK to `companies`, cascade delete)
- Also adds minimal `departments`, `designations`, `shifts` lookup tables (id, company_id, name at
  first — `shifts` later gained scheduling columns in Module 4) to power the Employee form's
  dropdowns; `departments`/`designations` grew full management screens in Module 3, `shifts` in
  Module 4
- REST API: `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/:id`
- Lookup API: `GET/POST /api/departments`, `/api/designations`, `/api/shifts` (list + quick-add only)
- Web UI: list (search/filter/pagination), add/edit modal with "+ New" inline add for
  department/designation/shift, delete confirmation
- Since login isn't built yet, a **Company selector** in the top nav bar (saved in the browser via
  localStorage) stands in for the tenant context. Once authentication is added, this will be replaced
  by the company tied to the logged-in user's session.

Server-side validation on both modules: required fields, email format, unique constraints
(duplicate email/employee ID return a clear error).

### 3. Department & Designation
- Full management for `departments` and `designations` (the two lookup tables introduced in
  Module 2 now get their own screen): list with employee-count per row, add, edit (rename), delete
  with a confirmation that also flags how many employees will be affected
- REST API: `GET /api/departments`, `GET /api/departments/managed`, `POST /api/departments`,
  `PUT/DELETE /api/departments/:id` (same shape for `/api/designations`)
- Deleting a department/designation does **not** delete employees — their `department_id`/
  `designation_id` is set to NULL (already enforced at the DB level via `ON DELETE SET NULL`)
- Web UI: `department-designation.html`, two side-by-side panels sharing one Add/Edit modal and
  one Delete-confirmation modal (both panels behave identically, so the UI logic is a single
  reusable manager instead of being duplicated)

### 4. Shift Management
- `shifts` table extended with `start_time`, `end_time`, `break_minutes`, `grace_minutes` (the
  grace period will be used later by Attendance to determine "Late")
- Full CRUD: list (with employee-count per row), add, edit, delete (same usage-count warning as
  Department/Designation; deleting a shift sets affected employees' `shift_id` to NULL)
- REST API: `GET /api/shifts`, `GET /api/shifts/managed`, `POST /api/shifts`,
  `PUT/DELETE /api/shifts/:id`
- Web UI: `shifts.html`
- The Employee form's Shift dropdown still uses the simple `GET /api/shifts` list (unchanged
  contract); since a shift now needs real scheduling info, its old one-field "+ New" quick-add was
  replaced with a "Manage shifts" link to the full page instead

### 5. Attendance Management
- `attendance_logs` table stores **raw punches only** (never a computed status) — company_id,
  employee_id, punch_time, in_out_mode, verify_mode, source ('manual' or 'device'), etc. This is
  exactly the raw-data-first principle from the project brief: Present/Late/Early Leave/Absent/
  Overtime/Half Day are all *derived*, never stored
- Since ZKTeco Integration (Module 8) isn't built yet, punches are entered **manually** for now
  (`source = 'manual'`) — the daily board has a "Record Punch" button. Once device sync exists,
  it will insert into the same `attendance_logs` table with `source = 'device'`, and everything
  downstream (the calculation, the summary screen) keeps working unchanged
- Calculation (`src/utils/attendanceCalc.js`, a small pure function): earliest punch of the day =
  check-in, latest = check-out; compared against the employee's shift (start/end time, grace
  period, break) to derive one status per day — Present, Late, Early Leave, Half Day, Overtime, or
  Absent (no punches). This is an MVP simplification (multiple in/out pairs and true overnight-shift
  edge cases aren't fully modeled yet — worth revisiting once real usage/device data shows patterns)
- REST API: `GET /api/attendance/summary?company_id=&date=` (one row per active employee, computed),
  `GET /api/attendance/logs?...` (raw punches for one employee/day), `POST /api/attendance/punches`,
  `DELETE /api/attendance/punches/:id` (to correct a mistaken manual entry)
- Web UI: `attendance.html` — a daily board (date picker, defaults to today) with status badges,
  a punch-entry modal, and a "Punches" detail view showing the raw log per employee/day

### 6. Leave Management
- `leave_types` table (company_id, name, days_per_year) — e.g. Casual/Sick/Earned, each with a
  yearly quota; full CRUD, same list/add/edit/delete pattern as Department/Designation
- `leave_requests` table (company_id, employee_id, leave_type_id, start_date, end_date, total_days,
  reason, status: pending/approved/rejected, decided_at, decision_note)
- Since employee login doesn't exist yet, an admin enters leave requests on the employee's behalf
  (same reasoning as manual attendance punches) — a real self-service "apply for my own leave"
  screen is a natural addition once Authentication exists
- `total_days` is simply calendar days from start to end (inclusive) — weekends/holidays aren't
  excluded yet; worth revisiting once Reports/Payroll need exact working-day counts
- REST API: `GET/POST /api/leave-types`, `PUT/DELETE /api/leave-types/:id`;
  `GET/POST /api/leave-requests`, `PUT /api/leave-requests/:id/decision` (approve/reject a pending
  request), `DELETE /api/leave-requests/:id`, `GET /api/leave-requests/balance?employee_id=&year=`
  (quota − approved days used = remaining, per leave type)
- Web UI: `leave.html` — Leave Types panel + Leave Requests board (status filter, pagination,
  Apply/Approve/Reject/Delete); the Apply form shows a live remaining-balance hint once an
  employee + leave type are picked

### 7. Payroll & Salary
- `payroll_records` table — one row per employee per month/year: a `basic_salary` snapshot,
  present/absent/half-day/leave/late day counts, overtime minutes, absent deduction, overtime
  amount, bonus, other deduction, net payable, and a draft/finalized status
- **Generate Payroll** walks every day of the selected month, reusing the same
  `calculateDailyStatus` function from Attendance (day has approved leave → leave day; otherwise
  present/absent/half-day/late/overtime from that day's punches + the employee's shift) and totals
  everything up
- Absent deduction = (absent days + half-days ÷ 2) × per-day rate (basic salary ÷ days in month).
  Overtime amount is auto-suggested (overtime hours × per-day-rate/8 × 1.5) but editable — an admin
  can also add a manual bonus or other deduction (e.g. a loan repayment) before finalizing
- **Draft vs. Finalized:** re-generating a month only refreshes draft records (and keeps whatever
  bonus/deduction/overtime the admin already entered) — a **finalized** payslip is left completely
  untouched, and can no longer be edited or deleted, so past payroll runs stay a reliable record
- REST API: `POST /api/payroll/generate`, `GET /api/payroll?company_id=&month=&year=`,
  `PUT /api/payroll/:id` (edit bonus/deduction/overtime while draft), `PUT /api/payroll/:id/finalize`,
  `DELETE /api/payroll/:id` (draft only)
- Web UI: `payroll.html` — month/year picker, "Generate Payroll", a table of all payslips for the
  period with an Edit modal, Finalize, and Delete
- Same simplification as Leave: "days in month" is calendar days, not working days

### 8. ZKTeco Integration
- **Isolated by design**, per the brief: all ZKTeco-protocol code lives in one file,
  `src/integrations/zkteco/adapter.js`, wrapping the documented open-source `node-zklib` SDK
  (public npm package, published wire-protocol client — no vendor code copied). Controllers only
  call plain methods (`testConnection`, `getUsers`, `getAttendanceLogs`) — swapping in a different
  device brand later means writing a new adapter file, not touching any controller/route/DB code
- `devices` table (company_id, name, ip_address, port, inport, timeout_ms, location, model, status,
  last_sync_at) — full CRUD
- `employees.device_user_id` (new nullable column) maps a device's internal user ID to a Duty
  employee — this is what lets synced punches land on the right person
- **Test Connection**: connects and reads the device's info; updates the device's `status`
  (online/offline) either way, and always disconnects even on failure
- **Sync Users**: reads the device's enrolled users and shows, for each, whether it's already
  mapped to an employee — mapping itself is a deliberate action (`PUT /api/employees/:id` with
  `device_user_id`), never automatic, since device IDs and employee identities aren't guaranteed
  to line up on their own
- **Download Logs**: reads raw punches from the device and inserts the ones with a mapped employee
  into `attendance_logs` with `source = 'device'` — the exact same table manual punches use, so
  Attendance/Payroll need no changes at all to pick up device data. A new unique key on
  `(employee_id, punch_time, source)` makes re-downloading always safe (duplicates are silently
  skipped via `INSERT IGNORE`); unmapped punches are counted and skipped, not discarded silently
- REST API: `GET/POST /api/devices`, `PUT/DELETE /api/devices/:id`,
  `POST /api/devices/:id/test-connection`, `POST /api/devices/:id/sync-users`,
  `POST /api/devices/:id/download-logs`
- Web UI: `devices.html` — device list with status/last-sync, Add/Edit/Delete, Test/Sync/Download
  buttons, and a mapping table in the Sync Users dialog
- **Could not be tested against real hardware** in this environment (no physical ZKTeco device
  reachable here) — connection/timeout handling was verified against an unreachable IP (confirms
  errors are caught and reported cleanly, sockets always close), but the actual user/attendance
  parsing over the wire protocol should get a real first run against real hardware before relying
  on it

### 9. Reports
- No new tables — every report reads from tables the earlier modules already built
- Four reports, each available as JSON (for the on-screen table) or CSV (`&format=csv`, triggers a
  browser download):
  - **Attendance** — date range, one row per employee: present/absent/half-day/leave/late days and
    overtime hours. Reuses the same day-by-day `calculateDailyStatus` approach as Attendance/Payroll
    (factored out into `src/utils/attendanceRange.js` so the three don't drift apart)
  - **Leave** — date range + optional status filter, one row per leave request
  - **Payroll** — one month/year, one row per payslip, plus a total basic/net payable line
  - **Employees** — full directory with department/designation/shift, optional status filter
- REST API: `GET /api/reports/attendance`, `/leave`, `/payroll`, `/employees` (all accept
  `company_id` plus the filters above, and `format=csv`)
- Web UI: `reports.html` — a tabbed page (Attendance/Leave/Payroll/Employees), each tab with its
  own filters, a "Run" button, and a "Download CSV" button

### 10. Admin Dashboard
- No new tables — one summary endpoint aggregating counts from every table the earlier modules
  built (employees, today's attendance, leave, this month's payroll, devices)
- Today's attendance card reuses `summarizeAttendance` from Reports with `from = to = today`, so
  the "present/absent/late" math is the same single source of truth used everywhere else
- REST API: `GET /api/dashboard/summary?company_id=` → employee counts, today's attendance
  snapshot, pending leave count, this month's payroll status + total net payable, device status
  counts. Handles a brand-new company with no data at all — everything reports as zero rather
  than erroring
- Web UI: `dashboard.html` — a card grid (Employees, Today's Attendance, Pending Leave, This
  Month's Payroll, Devices, Reports) each linking to its own module page. Added as the first item
  in the nav

This completes all 10 modules from the original project brief.

## Not included

- **Authentication / login** — the one cross-cutting piece intentionally deferred throughout. Every
  module currently uses a temporary Company selector (saved in the browser's localStorage) as a
  stand-in for real tenant context. Adding auth means: a `users` table (with password hashing),
  login/session handling, and swapping every place that currently reads `getCurrentCompanyId()`
  from localStorage for the logged-in user's actual company — a well-contained follow-up since
  every controller already scopes its queries by `company_id`
