const pool = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { calculateDailyStatus } = require('../utils/attendanceCalc');

function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(year, month, day) { return `${year}-${pad(month)}-${pad(day)}`; }
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function round2(n) { return Math.round(n * 100) / 100; }

// POST /api/payroll/generate  { company_id, month, year }
// Builds one draft payroll_records row per active employee for the given month, from
// attendance_logs + approved leave_requests. Already-finalized rows are left untouched.
async function generate(req, res, next) {
  try {
    const companyId = parseInt(req.body.company_id, 10);
    const month = parseInt(req.body.month, 10);
    const year = parseInt(req.body.year, 10);
    if (!companyId) throw new AppError('company_id is required', 400);
    if (!month || month < 1 || month > 12) throw new AppError('month must be 1-12', 400);
    if (!year || year < 2000) throw new AppError('A valid year is required', 400);

    const totalDays = daysInMonth(year, month);
    const monthStart = dateStr(year, month, 1);
    const monthEnd = dateStr(year, month, totalDays);

    const [employees] = await pool.query(
      `SELECT e.id, e.employee_id, e.name, e.salary, e.shift_id,
              s.start_time, s.end_time, s.break_minutes, s.grace_minutes
       FROM employees e
       LEFT JOIN shifts s ON s.id = e.shift_id
       WHERE e.company_id = ? AND e.status = 'active'`,
      [companyId]
    );

    const [punchRows] = await pool.query(
      `SELECT employee_id, punch_time FROM attendance_logs
       WHERE company_id = ? AND punch_time >= ? AND punch_time < DATE_ADD(?, INTERVAL 1 DAY)`,
      [companyId, `${monthStart} 00:00:00`, `${monthEnd} 00:00:00`]
    );

    const [leaveRows] = await pool.query(
      `SELECT employee_id, start_date, end_date FROM leave_requests
       WHERE company_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`,
      [companyId, monthEnd, monthStart]
    );

    // punches grouped by employee -> date -> [Date objects]
    const punchesByEmployeeDate = {};
    for (const p of punchRows) {
      const d = new Date(p.punch_time);
      const dayKey = dateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
      punchesByEmployeeDate[p.employee_id] = punchesByEmployeeDate[p.employee_id] || {};
      punchesByEmployeeDate[p.employee_id][dayKey] = punchesByEmployeeDate[p.employee_id][dayKey] || [];
      punchesByEmployeeDate[p.employee_id][dayKey].push(d);
    }

    // approved leave days within this month, per employee, as a Set of date strings
    const leaveDatesByEmployee = {};
    for (const l of leaveRows) {
      leaveDatesByEmployee[l.employee_id] = leaveDatesByEmployee[l.employee_id] || new Set();
      const start = new Date(Math.max(new Date(l.start_date), new Date(monthStart)));
      const end = new Date(Math.min(new Date(l.end_date), new Date(monthEnd)));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        leaveDatesByEmployee[l.employee_id].add(dateStr(d.getFullYear(), d.getMonth() + 1, d.getDate()));
      }
    }

    let generated = 0;
    let skippedFinalized = 0;

    for (const emp of employees) {
      const [existing] = await pool.query(
        'SELECT id, status FROM payroll_records WHERE company_id = ? AND employee_id = ? AND month = ? AND year = ?',
        [companyId, emp.id, month, year]
      );
      if (existing.length > 0 && existing[0].status === 'finalized') {
        skippedFinalized += 1;
        continue;
      }

      const shift = emp.shift_id
        ? { start_time: emp.start_time, end_time: emp.end_time, break_minutes: emp.break_minutes, grace_minutes: emp.grace_minutes }
        : null;
      const leaveDates = leaveDatesByEmployee[emp.id] || new Set();
      const punchesByDate = punchesByEmployeeDate[emp.id] || {};

      let presentDays = 0;
      let absentDays = 0;
      let halfDays = 0;
      let lateDays = 0;
      let overtimeMinutes = 0;
      const leaveDaysCount = leaveDates.size;

      for (let day = 1; day <= totalDays; day++) {
        const key = dateStr(year, month, day);
        if (leaveDates.has(key)) continue; // counted separately as leave_days

        const result = calculateDailyStatus(punchesByDate[key] || [], shift);
        if (result.status === 'absent') absentDays += 1;
        else if (result.status === 'half_day') halfDays += 1;
        else presentDays += 1;
        if (result.status === 'late') lateDays += 1;
        if (result.status === 'overtime') overtimeMinutes += result.overtimeMinutes || 0;
      }

      const basicSalary = Number(emp.salary);
      const perDayRate = basicSalary / totalDays;
      const absentEquivalent = absentDays + halfDays * 0.5;
      const absentDeduction = round2(absentEquivalent * perDayRate);
      const overtimeHours = overtimeMinutes / 60;
      const suggestedOvertimeAmount = round2(overtimeHours * (perDayRate / 8) * 1.5);

      if (existing.length > 0) {
        // Re-generating a draft: refresh computed columns, keep the admin's manual bonus/deduction/overtime edits.
        const [[current]] = await pool.query(
          'SELECT bonus, other_deduction, overtime_amount FROM payroll_records WHERE id = ?',
          [existing[0].id]
        );
        const netPayable = round2(basicSalary - absentDeduction + Number(current.overtime_amount) + Number(current.bonus) - Number(current.other_deduction));
        await pool.query(
          `UPDATE payroll_records SET
             basic_salary = ?, total_days_in_month = ?, present_days = ?, absent_days = ?,
             half_days = ?, leave_days = ?, late_days = ?, overtime_minutes = ?,
             absent_deduction = ?, net_payable = ?
           WHERE id = ?`,
          [basicSalary, totalDays, presentDays, absentDays, halfDays, leaveDaysCount, lateDays,
            overtimeMinutes, absentDeduction, netPayable, existing[0].id]
        );
      } else {
        const bonus = 0;
        const otherDeduction = 0;
        const netPayable = round2(basicSalary - absentDeduction + suggestedOvertimeAmount + bonus - otherDeduction);
        await pool.query(
          `INSERT INTO payroll_records
            (company_id, employee_id, month, year, basic_salary, total_days_in_month,
             present_days, absent_days, half_days, leave_days, late_days, overtime_minutes,
             absent_deduction, overtime_amount, bonus, other_deduction, net_payable)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [companyId, emp.id, month, year, basicSalary, totalDays,
            presentDays, absentDays, halfDays, leaveDaysCount, lateDays, overtimeMinutes,
            absentDeduction, suggestedOvertimeAmount, bonus, otherDeduction, netPayable]
        );
      }
      generated += 1;
    }

    res.json({ generated, skippedFinalized, month, year });
  } catch (err) {
    next(err);
  }
}

// GET /api/payroll?company_id=&month=&year=
async function list(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    if (!companyId) throw new AppError('company_id is required', 400);
    if (!month || !year) throw new AppError('month and year are required', 400);

    const [rows] = await pool.query(
      `SELECT p.*, e.employee_id AS employee_code, e.name AS employee_name
       FROM payroll_records p
       JOIN employees e ON e.id = p.employee_id
       WHERE p.company_id = ? AND p.month = ? AND p.year = ?
       ORDER BY e.name ASC`,
      [companyId, month, year]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// PUT /api/payroll/:id  { bonus, other_deduction, overtime_amount }  — only while status = 'draft'
async function update(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM payroll_records WHERE id = ?', [req.params.id]);
    if (rows.length === 0) throw new AppError('Payroll record not found', 404);
    const record = rows[0];
    if (record.status === 'finalized') throw new AppError('A finalized payroll record cannot be edited', 400);

    const bonus = req.body.bonus !== undefined ? Number(req.body.bonus) : Number(record.bonus);
    const otherDeduction = req.body.other_deduction !== undefined ? Number(req.body.other_deduction) : Number(record.other_deduction);
    const overtimeAmount = req.body.overtime_amount !== undefined ? Number(req.body.overtime_amount) : Number(record.overtime_amount);

    if ([bonus, otherDeduction, overtimeAmount].some((n) => Number.isNaN(n) || n < 0)) {
      throw new AppError('bonus, other_deduction, and overtime_amount must be 0 or more', 400);
    }

    const netPayable = round2(Number(record.basic_salary) - Number(record.absent_deduction) + overtimeAmount + bonus - otherDeduction);

    await pool.query(
      'UPDATE payroll_records SET bonus = ?, other_deduction = ?, overtime_amount = ?, net_payable = ? WHERE id = ?',
      [bonus, otherDeduction, overtimeAmount, netPayable, req.params.id]
    );

    const [updated] = await pool.query('SELECT * FROM payroll_records WHERE id = ?', [req.params.id]);
    res.json({ data: updated[0] });
  } catch (err) {
    next(err);
  }
}

// PUT /api/payroll/:id/finalize
async function finalize(req, res, next) {
  try {
    const [result] = await pool.query(
      "UPDATE payroll_records SET status = 'finalized' WHERE id = ? AND status = 'draft'",
      [req.params.id]
    );
    if (result.affectedRows === 0) throw new AppError('Record not found or already finalized', 400);
    const [rows] = await pool.query('SELECT * FROM payroll_records WHERE id = ?', [req.params.id]);
    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/payroll/:id — only while draft
async function remove(req, res, next) {
  try {
    const [result] = await pool.query("DELETE FROM payroll_records WHERE id = ? AND status = 'draft'", [req.params.id]);
    if (result.affectedRows === 0) throw new AppError('Record not found or already finalized', 400);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { generate, list, update, finalize, remove };
