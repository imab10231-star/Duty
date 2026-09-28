const pool = require('../config/db');
const { calculateDailyStatus } = require('./attendanceCalc');

function pad(n) { return String(n).padStart(2, '0'); }
function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// Returns one summary row per employee (optionally filtered to one employee_id):
// { employee_id, employee_code, name, present_days, absent_days, half_days,
//   leave_days, late_days, overtime_minutes }
// fromDate/toDate are 'YYYY-MM-DD' strings, inclusive.
async function summarizeAttendance({ companyId, employeeId, fromDate, toDate }) {
  const employeeFilter = employeeId ? 'AND e.id = ?' : '';
  const employeeParams = employeeId ? [employeeId] : [];

  const [employees] = await pool.query(
    `SELECT e.id, e.employee_id, e.name, e.shift_id,
            s.start_time, s.end_time, s.break_minutes, s.grace_minutes
     FROM employees e
     LEFT JOIN shifts s ON s.id = e.shift_id
     WHERE e.company_id = ? ${employeeFilter}
     ORDER BY e.name ASC`,
    [companyId, ...employeeParams]
  );

  const [punchRows] = await pool.query(
    `SELECT employee_id, punch_time FROM attendance_logs
     WHERE company_id = ? AND punch_time >= ? AND punch_time < DATE_ADD(?, INTERVAL 1 DAY)
     ${employeeId ? 'AND employee_id = ?' : ''}`,
    [companyId, `${fromDate} 00:00:00`, `${toDate} 00:00:00`, ...employeeParams]
  );

  const [leaveRows] = await pool.query(
    `SELECT employee_id, start_date, end_date FROM leave_requests
     WHERE company_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?
     ${employeeId ? 'AND employee_id = ?' : ''}`,
    [companyId, toDate, fromDate, ...employeeParams]
  );

  const punchesByEmployeeDate = {};
  for (const p of punchRows) {
    const d = new Date(p.punch_time);
    const key = toKey(d);
    punchesByEmployeeDate[p.employee_id] = punchesByEmployeeDate[p.employee_id] || {};
    punchesByEmployeeDate[p.employee_id][key] = punchesByEmployeeDate[p.employee_id][key] || [];
    punchesByEmployeeDate[p.employee_id][key].push(d);
  }

  const leaveDatesByEmployee = {};
  const rangeStart = new Date(fromDate);
  const rangeEnd = new Date(toDate);
  for (const l of leaveRows) {
    leaveDatesByEmployee[l.employee_id] = leaveDatesByEmployee[l.employee_id] || new Set();
    const start = new Date(Math.max(new Date(l.start_date), rangeStart));
    const end = new Date(Math.min(new Date(l.end_date), rangeEnd));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      leaveDatesByEmployee[l.employee_id].add(toKey(d));
    }
  }

  const results = [];
  for (const emp of employees) {
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

    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      const key = toKey(d);
      if (leaveDates.has(key)) continue;

      const result = calculateDailyStatus(punchesByDate[key] || [], shift);
      if (result.status === 'absent') absentDays += 1;
      else if (result.status === 'half_day') halfDays += 1;
      else presentDays += 1;
      if (result.status === 'late') lateDays += 1;
      if (result.status === 'overtime') overtimeMinutes += result.overtimeMinutes || 0;
    }

    results.push({
      employee_id: emp.id,
      employee_code: emp.employee_id,
      name: emp.name,
      present_days: presentDays,
      absent_days: absentDays,
      half_days: halfDays,
      leave_days: leaveDates.size,
      late_days: lateDays,
      overtime_minutes: overtimeMinutes,
    });
  }

  return results;
}

module.exports = { summarizeAttendance };
