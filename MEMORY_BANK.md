# Peyala v8 — Comprehensive Memory Bank

## 1) Mission and project intent
Peyala v8 is a business operations system for a retail/food business. It combines staff attendance, accounting, supplier and purchase workflows, sales tracking, and basic reporting into a single app.

The project is intentionally built to support daily operational work, not just a generic CRUD app. The important business flows are:
- staff management and attendance
- leave tracking with monthly caps
- inventory item management and purchase reporting
- sales, payments, receipts, and supplier dues
- accounting reports and balance sheet views
- owner notes and admin audit visibility

This project is a practical management dashboard for daily operations and reporting, with both backend persistence and frontend views.

## 2) Executive summary of current state
The project is in an operationally working state with some specific bugs already identified and fixed during this session.

Current important implemented fixes and rules:
- attendance supports `present`, `absent`, `leave`, and `halfday`
- legacy attendance values such as `holiday` are normalized to `halfday` for compatibility
- monthly leave cap logic is enforced in backend attendance routes
- the reports page default start date is set to the first day of the current month, rather than the last day of the previous month
- date generation on the frontend avoids UTC-shift issues by formatting dates in local time instead of using `toISOString()` for `YYYY-MM-DD` values
- attendance notes summary exists on the attendance page and is month-scoped

These facts matter because the project has had date-shift bugs caused by timezone conversion and status normalization mismatches.

## 3) Repository layout
Top-level structure:
- `backend/` — Express server application and Mongo models
- `frontend/` — Next.js app with App Router pages and reusable UI
- `docker-compose.yml` — Docker orchestration
- `install.sh` / `start.sh` — local setup and start helpers
- `README.md` — general project documentation
- `MEMORY_BANK.md` — this handoff document

### Backend structure
`backend/`
- `package.json` — backend dependencies and scripts
- `Dockerfile` — backend container build
- `src/`
  - `server.js` — Express server bootstrapping and route registration
  - `models/` — Mongoose schemas
  - `routes/` — API endpoints by domain
  - `controllers/` — not heavily used in this repo; mostly route-level logic
  - `middleware/` — auth and authorization middleware
  - `utils/` — audit helpers, seed utilities, small helper functions
  - `config/` — database config

### Frontend structure
`frontend/`
- `package.json` — frontend dependencies and scripts
- `Dockerfile` — frontend container build
- `next.config.js` — Next config
- `src/`
  - `app/` — page routes and root app shell
  - `components/` — layout, UI widgets, dashboard pieces, tables, charts
  - `lib/` — API wrappers, auth context, shared helpers
  - `types/` — TS definitions if present
  - `hooks/` — hooks if present

## 4) Tech stack
- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS
- Backend: Node.js, Express
- Database: MongoDB with Mongoose
- Authentication: JWT bearer token with middleware checks
- State/data flow: frontend page components call backend API helper wrappers from `frontend/src/lib/api.ts`

## 5) Core conventions used in the codebase
These conventions should be preserved by the next agent:

### 5.1 Date handling
This project is sensitive to timezone issues.

Important rule:
- Do not use `toISOString()` when generating browser-friendly date strings such as `YYYY-MM-DD` for `<input type="date">` values.
- Use local date construction and formatting instead.

Correct pattern:
- create a `Date` with `new Date(year, monthIndex, day)` for local dates
- format using local fields (`getFullYear()`, `getMonth()`, `getDate()`) rather than UTC conversion

This matters especially in time zones such as IST/UTC+5:30, where a UTC date can shift to the previous date.

### 5.2 Attendance status normalization
Attendance statuses should be treated carefully. The app has historically used values like `holiday`, but UI and logic are now centered around `halfday`.

Normalization rule:
- `holiday` should be treated as `halfday` when reading or updating data
- `halfday` is the canonical status for display and logic
- some older records may still contain `holiday` in the database, so the frontend and backend should guard against this

### 5.3 Role access
Permission logic is enforced in routes.
- admin and manager roles are allowed to edit attendance and protected operational records
- some routes require `adminOnly` or a custom manager/admin check

### 5.4 Shared API helper layer
Most frontend pages do not call axios directly. They use wrappers in `frontend/src/lib/api.ts`.

This is important because:
- new endpoints should be added there for consistency
- page logic expects wrapper functions to return Axios responses (`res.data`)

## 6) Important files and what they do

### Backend
#### `backend/src/server.js`
The Express app bootstrap. This file is where routes are mounted and the app is initialized.

#### `backend/src/middleware/auth.js`
JWT auth and role checks. This is central for login and permission enforcement.

#### `backend/src/models/Attendance.js`
Attendance schema. Critical details:
- `staff` references a `Staff`
- `date` is required and unique per staff/date
- `status` enum includes `present`, `absent`, `leave`, `holiday`, `halfday`
- `note` stores optional notes/remarks
- `markedBy` tracks who modified the record

This model is important because the app expects staff/day records to be unique.

#### `backend/src/routes/attendance.js`
This is the main attendance API. It includes:
- list monthly attendance records
- create attendance record per staff/date
- update record by ID
- enforce leave cap logic for monthly leaves
- provide monthly summary data per staff
- normalize status values for compatibility

This route is critical. It contains the business logic that other agents must be careful not to break.

#### `backend/src/models/Staff.js`
Staff definition, likely includes role, status, position, etc.

#### `backend/src/routes/reports.js`
P&L reporting and date-ranged reports. Important because the reports page depends on it.

#### `backend/src/routes/...`
Other route files are domain-specific:
- `sales.js`
- `purchases.js`
- `payments.js`
- `receipts.js`
- `suppliers.js`
- `inventory.js`
- `staff.js`
- `accounts.js`
- `balancesheet.js`
- `ownerNote.js`
- `auditlog.js`

These modules are part of the larger business workflow.

### Frontend
#### `frontend/src/app/attendance/page.tsx`
This is the attendance calendar UI.
It includes:
- month/year selectors
- staff list with day cells
- summary values per staff for the current month
- note summary in the right sidebar
- button-based bulk present marking per day
- modal for marking attendance with statuses and note

This is the UI heavily modified in the latest work.

#### `frontend/src/app/reports/page.tsx`
This page loads P&L and daily reports.
It uses the `range` state for start/end dates and defaults to month start values.

Key rule: it needs to load with `start = first day of current month` and `end = today` by default.

#### `frontend/src/lib/api.ts`
Central API wrappers for all backend endpoints.

#### `frontend/src/lib/utils.ts`
Shared utility functions, especially:
- `formatCurrency`
- `formatDate`
- `formatDateInput`
- `today()`
- `monthStart()`

This file contains the date bug fix logic and should be treated as the canonical place for local-date formatting.

## 7) Business rules that must be preserved

### Attendance
- Each staff can only have one attendance record per date.
- A staff's monthly leave count is capped at 4.
- When a fifth leave is attempted, it is converted to `absent` and the note is updated to explain the reason.
- The attendance page uses a calendar grid and supports editing of statuses with notes.
- Half-day should display as `H` and be labeled as `Half Day`.

### Reports
- Default report range should be current month start to current date.
- The reports page must not shift dates due to timezone conversion.
- P&L and inventory reports depend on the chosen date range.

### Notes and audit trail
- attendance records can carry notes
- audit logs are written for changes in major modules including attendance
- the app has owner note and audit log features for transparency

## 8) Data flows and architectural patterns

### Frontend to backend
Frontend pages use React state and call helper functions such as:
- `attendanceApi.mark(...)`
- `attendanceApi.update(...)`
- `reportsApi.pnl(...)`
- `staffApi.list()`

These wrappers call the backend through Axios with the configured base URL.

### Backend response pattern
Most backend routes respond with JSON objects and/or arrays.
Example patterns:
- `res.json(records);`
- `res.status(201).json(records);`
- `res.status(400).json({ message: err.message });`

### Supporting data model patterns
Most models use Mongoose schemas with `timestamps: true` and references to related docs.
This is consistent across the project.

## 9) Setup and local run instructions

### Prerequisites
- Node.js installed
- MongoDB running locally or accessible via Docker
- npm or yarn

### Backend setup
From `backend/`:
- install dependencies
- ensure MongoDB is available
- start server using project scripts or Docker

Example (if scripts exist in package.json):
- `npm install`
- `npm run dev` or relevant startup command

### Frontend setup
From `frontend/`:
- install dependencies
- ensure `NEXT_PUBLIC_API_URL` is set appropriately or use default `http://localhost:5000/api`
- run dev server

Typical commands:
- `cd frontend && npm install`
- `cd frontend && npm run dev`

### Docker path
If Docker is preferred, use:
- `docker-compose.yml`
- project helper scripts `install.sh` and `start.sh`

## 10) Known bug patterns and anti-patterns
These are high-value lessons learned from this project and should be preserved in future work.

### 10.1 `toISOString()` on local dates
The biggest recurring bug in this project is using `toISOString()` for date inputs. This converts to UTC and may produce the previous calendar day in local time.

Use this instead:
- local `Date` object with `getFullYear()`, `getMonth()`, `getDate()`
- custom `formatDateInput` helper that constructs the YYYY-MM-DD string locally

### 10.2 Reading status strings inconsistently
The app initially had a mix of `holiday` and `halfday` semantics.
The fix is to normalize legacy and current values before rendering or logic.

### 10.3 Summary logic not being month-specific enough
The attendance page originally returned a generic summary but did not provide month-specific values in a way the UI could display. The fix was to compute `presentMonth`, `absentMonth`, `halfDayMonth`, and `notes` in the summary API call.

### 10.4 Default report ranges being off by one period
The reports page specifically needed to default to the current month, not the previous month, which was caused by an incorrect date generation workflow.

## 11) Current project tasks and known status
This document should be read as the current state of the project as of September 2026.

Completed / fixed items:
- attendance status normalization for `halfday`
- `holiday` compatibility handling
- month-specific attendance summaries on the frontend
- notes summary in attendance sidebar
- date formatting fix for reports and browser input values
- default reports range fixed to first day of current month

Still worth monitoring:
- any date values generated elsewhere using `toISOString()`
- any UI still rendering `holiday` instead of `Half Day`
- any backend route that expects an older attendance status enum and needs normalization

## 12) Suggested handoff instructions for another agent
When continuing this task, use the following quick workflow:

1. Read this memory bank first.
2. Check attendance logic in `backend/src/routes/attendance.js`.
3. Check `backend/src/models/Attendance.js` for allowed enum values.
4. Check `frontend/src/app/attendance/page.tsx` for UI behavior and labels.
5. Check `frontend/src/lib/utils.ts` before editing dates.
6. Keep local-date formatting in mind whenever building `YYYY-MM-DD` strings.
7. When touching attendance logic, preserve monthly leave caps and status normalization.
8. When touching reports, ensure the default range is current month start to today.
9. Validate using:
   - `cd frontend && npx tsc --noEmit`
   - backend `node --check` on modified route files if relevant

## 13) Implementation details from recent fixes
These notes are important for continuity and help another agent reason about what was changed.

### Attendance half-day fix
Relevant files:
- `backend/src/models/Attendance.js`
- `backend/src/routes/attendance.js`
- `frontend/src/app/attendance/page.tsx`

Summary:
- `halfday` was added to the status enum in the Mongoose schema
- API normalization converts `holiday` values to `halfday`
- UI label for the status is now `H` and text is `Half Day`
- summary counts were updated to reflect `halfDayMonth`

### Date fix for report start date
Relevant files:
- `frontend/src/lib/utils.ts`
- `frontend/src/app/reports/page.tsx`

Summary:
- `formatDateInput()` was updated to compose the date using local values rather than `toISOString()`
- `monthStart()` continues to return the first day of the current month in local time
- default report range is now correct for timezone-sensitive users

### Notes summary for attendance
Relevant files:
- `backend/src/routes/attendance.js`
- `frontend/src/app/attendance/page.tsx`

Summary:
- summary API now exposes `notes` for the selected month
- notes include date, staff, status, and note text
- the right-side panel displays a compact notes summary

## 14) Recommended future improvements
These are not required to continue the current task, but they are sensible next steps:
- unify all date helper usage around a single canonical local-date formatter
- add explicit status labels mapping in shared frontend constants to avoid string drift
- add tests for attendance leave caps and date formatting edge cases
- add admin-only audit log display for attendance edits
- consider a dedicated `AttendanceStatus` enum in frontend TypeScript for stronger typing

## 15) Final handoff note
This project is small enough to be understood by reading a few important files, but the business logic is nuanced enough that future agents must be careful with:
- date generation
- attendance status normalization
- leave caps
- report default ranges
- role-based access

If another agent is resuming work, this memory bank is the authoritative baseline for understanding what was implemented and what patterns should remain consistent.
