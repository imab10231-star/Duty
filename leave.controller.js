const pool = require('../config/db');
const { validateLeaveRequest } = require('../utils/validate');
const { AppError } = require('../middleware/errorHandler');

const SELECT_REQUEST = `
  SELECT
    r.id, r.company_id, r.employee_id, e.employee_id AS employee_code, e.name AS employee_name,
    r.leave_type_id, lt.name AS leave_type_name,
    r.start_date, r.end_date, r.total_days, r.reason, r.status,
    r.applied_at, r.decided_at, r.decision_note
  FROM leave_requests r
  JOIN employees e ON e.id = r.employee_id
  JOIN leave_types lt ON lt.id = r.leave_type_id
`;

// GET /api/leave-requests?company_id=&employee_id=&status=&page=&limit=
async function list(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    if (!companyId) throw new AppError('company_id is required', 400);

    const employeeId = parseInt(req.query.employee_id, 10);
    const status = (req.query.status || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const where = ['r.company_id = ?'];
    const params = [companyId];

    if (employeeId) { where.push('r.employee_id = ?'); params.push(employeeId); }
    if (['pending', 'approved', 'rejected'].includes(status)) {
      where.push('r.status = ?');
      params.push(status);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [rows] = await pool.query(
      `${SELECT_REQUEST} ${whereSql} ORDER BY r.applied_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM leave_requests r ${whereSql}`,
      params
    );

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        totalPages: Math.ceil(countRows[0].total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/leave-requests — admin enters this on the employee's behalf (no employee login yet)
async function create(req, res, next) {
  try {
    const { valid, errors, data } = validateLeaveRequest(req.body);
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const [result] = await pool.query(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.company_id, data.employee_id, data.leave_type_id, data.start_date, data.end_date, data.total_days, data.reason]
    );

    const [rows] = await pool.query(`${SELECT_REQUEST} WHERE r.id = ?`, [result.insertId]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    next(err);
  }
}

// PUT /api/leave-requests/:id/decision — approve or reject a pending request
async function decide(req, res, next) {
  try {
    const decision = (req.body.status || '').trim();
    const note = (req.body.decision_note || '').trim() || null;
    if (!['approved', 'rejected'].includes(decision)) {
      throw new AppError('status must be "approved" or "rejected"', 400);
    }

    const [existing] = await pool.query('SELECT id, status FROM leave_requests WHERE id = ?', [req.params.id]);
    if (existing.length === 0) throw new AppError('Leave request not found', 404);
    if (existing[0].status !== 'pending') throw new AppError('Only a pending request can be decided', 400);

    await pool.query(
      'UPDATE leave_requests SET status = ?, decided_at = NOW(), decision_note = ? WHERE id = ?',
      [decision, note, req.params.id]
    );

    const [rows] = await pool.query(`${SELECT_REQUEST} WHERE r.id = ?`, [req.params.id]);
    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/leave-requests/:id — cancel/remove a request (any status)
async function remove(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM leave_requests WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw new AppError('Leave request not found', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// GET /api/leave-requests/balance?company_id=&employee_id=&year=
// For each leave type: yearly quota, days already approved this year, and what's left.
async function getBalance(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    const employeeId = parseInt(req.query.employee_id, 10);
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    if (!companyId) throw new AppError('company_id is required', 400);
    if (!employeeId) throw new AppError('employee_id is required', 400);

    const [rows] = await pool.query(
      `SELECT
         lt.id AS leave_type_id, lt.name, lt.days_per_year,
         COALESCE(SUM(CASE WHEN r.status = 'approved' AND YEAR(r.start_date) = ? THEN r.total_days ELSE 0 END), 0) AS used
       FROM leave_types lt
       LEFT JOIN leave_requests r ON r.leave_type_id = lt.id AND r.employee_id = ?
       WHERE lt.company_id = ?
       GROUP BY lt.id, lt.name, lt.days_per_year
       ORDER BY lt.name ASC`,
      [year, employeeId, companyId]
    );

    const data = rows.map((r) => ({
      leave_type_id: r.leave_type_id,
      name: r.name,
      days_per_year: r.days_per_year,
      used: Number(r.used),
      remaining: r.days_per_year - Number(r.used),
    }));

    res.json({ data, year });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, decide, remove, getBalance };
