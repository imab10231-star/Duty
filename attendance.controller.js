const pool = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { calculateDailyStatus } = require('../utils/attendanceCalc');

// POST /api/attendance/punches
// Manual punch entry — stands in for device punches until ZKTeco Integration (Module 8) is built.
// Every punch is stored as-is in attendance_logs; nothing here ever overwrites a punch.
async function createPunch(req, res, next) {
  try {
    const companyId = parseInt(req.body.company_id, 10);
    const employeeId = parseInt(req.body.employee_id, 10);
    const punchTime = (req.body.punch_time || '').trim();
    const inOutMode = (req.body.in_out_mode || '').trim();

    if (!companyId) throw new AppError('company_id is required', 400);
    if (!employeeId) throw new AppError('employee_id is required', 400);
    if (!punchTime || Number.isNaN(Date.parse(punchTime))) {
      throw new AppError('A valid punch_time is required', 400);
    }
    if (!['in', 'out'].includes(inOutMode)) {
      throw new AppError('in_out_mode must be "in" or "out"', 400);
    }

    const [result] = await pool.query(
      `INSERT INTO attendance_logs (company_id, employee_id, punch_time, in_out_mode, source, verify_mode)
       VALUES (?, ?, ?, ?, 'manual', 'manual')`,
      [companyId, employeeId, punchTime, inOutMode]
    );

    const [rows] = await pool.query('SELECT * FROM attendance_logs WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/attendance/punches/:id — for correcting a mistaken manual entry
async function deletePunch(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM attendance_logs WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw new AppError('Punch not found', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// GET /api/attendance/logs?company_id=&employee_id=&date=
// Raw punches for one employee on one day — used by the "day detail" view.
async function listLogs(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    const employeeId = parseInt(req.query.employee_id, 10);
    const date = (req.query.date || '').trim();
    if (!companyId) throw new AppError('company_id is required', 400);
    if (!employeeId) throw new AppError('employee_id is required', 400);
    if (!date) throw new AppError('date is required', 400);

    const [rows] = await pool.query(
      `SELECT * FROM attendance_logs
       WHERE company_id = ? AND employee_id = ? AND DATE(punch_time) = ?
       ORDER BY punch_time ASC`,
      [companyId, employeeId, date]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/attendance/summary?company_id=&date=
// One row per active employee for the given day: computed status, check-in/out, worked minutes.
async function getSummary(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    const date = (req.query.date || '').trim();
    if (!companyId) throw new AppError('company_id is required', 400);
    if (!date || Number.isNaN(Date.parse(date))) throw new AppError('A valid date is required', 400);

    const [employees] = await pool.query(
      `SELECT e.id, e.employee_id, e.name, e.shift_id,
              s.start_time, s.end_time, s.break_minutes, s.grace_minutes
       FROM employees e
       LEFT JOIN shifts s ON s.id = e.shift_id
       WHERE e.company_id = ? AND e.status = 'active'
       ORDER BY e.name ASC`,
      [companyId]
    );

    const [punches] = await pool.query(
      `SELECT employee_id, punch_time FROM attendance_logs
       WHERE company_id = ? AND DATE(punch_time) = ?`,
      [companyId, date]
    );

    const punchesByEmployee = {};
    for (const p of punches) {
      if (!punchesByEmployee[p.employee_id]) punchesByEmployee[p.employee_id] = [];
      punchesByEmployee[p.employee_id].push(new Date(p.punch_time));
    }

    const data = employees.map((e) => {
      const shift = e.shift_id
        ? { start_time: e.start_time, end_time: e.end_time, break_minutes: e.break_minutes, grace_minutes: e.grace_minutes }
        : null;
      const result = calculateDailyStatus(punchesByEmployee[e.id] || [], shift);
      return {
        employee_id: e.id,
        employee_code: e.employee_id,
        name: e.name,
        has_shift: Boolean(e.shift_id),
        ...result,
      };
    });

    res.json({ data, date });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPunch, deletePunch, listLogs, getSummary };
