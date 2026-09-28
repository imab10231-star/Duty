const pool = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { sendCsv } = require('../utils/csv');
const { summarizeAttendance } = require('../utils/attendanceRange');

function wantsCsv(req) { return (req.query.format || '').trim() === 'csv'; }

// GET /api/reports/attendance?company_id=&from=&to=&employee_id=&format=
async function attendanceReport(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    const from = (req.query.from || '').trim();
    const to = (req.query.to || '').trim();
    const employeeId = parseInt(req.query.employee_id, 10) || null;
    if (!companyId) throw new AppError('company_id is required', 400);
    if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
      throw new AppError('Valid from and to dates are required', 400);
    }
    if (new Date(to) < new Date(from)) throw new AppError('to date cannot be before from date', 400);

    const rows = await summarizeAttendance({ companyId, employeeId, fromDate: from, toDate: to });

    if (wantsCsv(req)) {
      const csvRows = rows.map((r) => ({
        'Employee ID': r.employee_code,
        Name: r.name,
        Present: r.present_days,
        Absent: r.absent_days,
        'Half Day': r.half_days,
        Leave: r.leave_days,
        Late: r.late_days,
        'Overtime (hrs)': (r.overtime_minutes / 60).toFixed(1),
      }));
      return sendCsv(res, `attendance_${from}_to_${to}.csv`, csvRows);
    }

    res.json({ data: rows, from, to });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/leave?company_id=&from=&to=&status=&employee_id=&format=
async function leaveReport(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    const from = (req.query.from || '').trim();
    const to = (req.query.to || '').trim();
    const status = (req.query.status || '').trim();
    const employeeId = parseInt(req.query.employee_id, 10);
    if (!companyId) throw new AppError('company_id is required', 400);
    if (!from || !to) throw new AppError('from and to dates are required', 400);

    const where = ['r.company_id = ?', 'r.start_date <= ?', 'r.end_date >= ?'];
    const params = [companyId, to, from];
    if (['pending', 'approved', 'rejected'].includes(status)) { where.push('r.status = ?'); params.push(status); }
    if (employeeId) { where.push('r.employee_id = ?'); params.push(employeeId); }

    const [rows] = await pool.query(
      `SELECT e.employee_id AS employee_code, e.name AS employee_name, lt.name AS leave_type,
              r.start_date, r.end_date, r.total_days, r.status, r.reason
       FROM leave_requests r
       JOIN employees e ON e.id = r.employee_id
       JOIN leave_types lt ON lt.id = r.leave_type_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.start_date DESC`,
      params
    );

    if (wantsCsv(req)) {
      const csvRows = rows.map((r) => ({
        'Employee ID': r.employee_code,
        Name: r.employee_name,
        Type: r.leave_type,
        From: r.start_date.toISOString().slice(0, 10),
        To: r.end_date.toISOString().slice(0, 10),
        Days: r.total_days,
        Status: r.status,
        Reason: r.reason || '',
      }));
      return sendCsv(res, `leave_${from}_to_${to}.csv`, csvRows);
    }

    res.json({ data: rows, from, to });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/payroll?company_id=&month=&year=&format=
async function payrollReport(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    if (!companyId) throw new AppError('company_id is required', 400);
    if (!month || !year) throw new AppError('month and year are required', 400);

    const [rows] = await pool.query(
      `SELECT e.employee_id AS employee_code, e.name AS employee_name,
              p.basic_salary, p.present_days, p.absent_days, p.half_days, p.leave_days,
              p.absent_deduction, p.overtime_amount, p.bonus, p.other_deduction, p.net_payable, p.status
       FROM payroll_records p
       JOIN employees e ON e.id = p.employee_id
       WHERE p.company_id = ? AND p.month = ? AND p.year = ?
       ORDER BY e.name ASC`,
      [companyId, month, year]
    );

    const totals = rows.reduce((acc, r) => ({
      basic: acc.basic + Number(r.basic_salary),
      net: acc.net + Number(r.net_payable),
    }), { basic: 0, net: 0 });

    if (wantsCsv(req)) {
      const csvRows = rows.map((r) => ({
        'Employee ID': r.employee_code,
        Name: r.employee_name,
        Basic: r.basic_salary,
        Present: r.present_days,
        Absent: r.absent_days,
        Leave: r.leave_days,
        'Absent Deduction': r.absent_deduction,
        'Overtime Amount': r.overtime_amount,
        Bonus: r.bonus,
        'Other Deduction': r.other_deduction,
        'Net Payable': r.net_payable,
        Status: r.status,
      }));
      return sendCsv(res, `payroll_${year}_${month}.csv`, csvRows);
    }

    res.json({ data: rows, totals, month, year });
  } catch (err) {
    next(err);
  }
}

// GET /api/reports/employees?company_id=&status=&format=
async function employeeReport(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    const status = (req.query.status || '').trim();
    if (!companyId) throw new AppError('company_id is required', 400);

    const where = ['e.company_id = ?'];
    const params = [companyId];
    if (status === 'active' || status === 'inactive') { where.push('e.status = ?'); params.push(status); }

    const [rows] = await pool.query(
      `SELECT e.employee_id AS employee_code, e.name, e.phone, e.email,
              d.name AS department, des.name AS designation, s.name AS shift,
              e.joining_date, e.salary, e.status
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN designations des ON des.id = e.designation_id
       LEFT JOIN shifts s ON s.id = e.shift_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.name ASC`,
      params
    );

    if (wantsCsv(req)) {
      const csvRows = rows.map((r) => ({
        'Employee ID': r.employee_code,
        Name: r.name,
        Phone: r.phone,
        Email: r.email || '',
        Department: r.department || '',
        Designation: r.designation || '',
        Shift: r.shift || '',
        'Joining Date': r.joining_date.toISOString().slice(0, 10),
        Salary: r.salary,
        Status: r.status,
      }));
      return sendCsv(res, `employees.csv`, csvRows);
    }

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { attendanceReport, leaveReport, payrollReport, employeeReport };
