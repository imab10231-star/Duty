const pool = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { summarizeAttendance } = require('../utils/attendanceRange');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /api/dashboard/summary?company_id=
async function summary(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    if (!companyId) throw new AppError('company_id is required', 400);

    const today = todayStr();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Employees
    const [[employeeCounts]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'active') AS active,
         SUM(status = 'inactive') AS inactive
       FROM employees WHERE company_id = ?`,
      [companyId]
    );

    // Today's attendance — reuse the same per-day calculation Reports/Attendance/Payroll all use.
    const todaysRows = await summarizeAttendance({ companyId, fromDate: today, toDate: today });
    const attendanceToday = todaysRows.reduce((acc, r) => ({
      present: acc.present + (r.present_days > 0 ? 1 : 0),
      absent: acc.absent + (r.absent_days > 0 ? 1 : 0),
      half_day: acc.half_day + (r.half_days > 0 ? 1 : 0),
      leave: acc.leave + (r.leave_days > 0 ? 1 : 0),
      late: acc.late + (r.late_days > 0 ? 1 : 0),
    }), { present: 0, absent: 0, half_day: 0, leave: 0, late: 0 });

    // Leave
    const [[leaveCounts]] = await pool.query(
      `SELECT SUM(status = 'pending') AS pending FROM leave_requests WHERE company_id = ?`,
      [companyId]
    );

    // Payroll — current month
    const [[payrollCounts]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'draft') AS draft,
         SUM(status = 'finalized') AS finalized,
         COALESCE(SUM(net_payable), 0) AS total_net_payable
       FROM payroll_records WHERE company_id = ? AND month = ? AND year = ?`,
      [companyId, month, year]
    );

    // Devices
    const [[deviceCounts]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'online') AS online,
         SUM(status = 'offline') AS offline,
         SUM(status = 'unknown') AS unknown
       FROM devices WHERE company_id = ?`,
      [companyId]
    );

    res.json({
      today,
      month,
      year,
      employees: {
        total: employeeCounts.total,
        active: Number(employeeCounts.active) || 0,
        inactive: Number(employeeCounts.inactive) || 0,
      },
      attendance_today: attendanceToday,
      leave: { pending: Number(leaveCounts.pending) || 0 },
      payroll: {
        total: payrollCounts.total,
        draft: Number(payrollCounts.draft) || 0,
        finalized: Number(payrollCounts.finalized) || 0,
        total_net_payable: Number(payrollCounts.total_net_payable) || 0,
      },
      devices: {
        total: deviceCounts.total,
        online: Number(deviceCounts.online) || 0,
        offline: Number(deviceCounts.offline) || 0,
        unknown: Number(deviceCounts.unknown) || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { summary };
