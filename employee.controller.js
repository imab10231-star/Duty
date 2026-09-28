const pool = require('../config/db');
const { validateEmployee } = require('../utils/validate');
const { AppError } = require('../middleware/errorHandler');

const SELECT_EMPLOYEE = `
  SELECT
    e.id, e.company_id, e.employee_id, e.name, e.phone, e.email,
    e.department_id, d.name AS department_name,
    e.designation_id, des.name AS designation_name,
    e.shift_id, s.name AS shift_name,
    e.device_user_id,
    e.joining_date, e.salary, e.status, e.created_at, e.updated_at
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN designations des ON des.id = e.designation_id
  LEFT JOIN shifts s ON s.id = e.shift_id
`;

// GET /api/employees?company_id=&search=&status=&department_id=&page=&limit=
async function listEmployees(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    if (!companyId) throw new AppError('company_id is required', 400);

    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();
    const departmentId = parseInt(req.query.department_id, 10);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const offset = (page - 1) * limit;

    const where = ['e.company_id = ?'];
    const params = [companyId];

    if (search) {
      where.push('(e.name LIKE ? OR e.employee_id LIKE ? OR e.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status === 'active' || status === 'inactive') {
      where.push('e.status = ?');
      params.push(status);
    }
    if (departmentId) {
      where.push('e.department_id = ?');
      params.push(departmentId);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [rows] = await pool.query(
      `${SELECT_EMPLOYEE} ${whereSql} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM employees e ${whereSql}`,
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

// GET /api/employees/:id
async function getEmployee(req, res, next) {
  try {
    const [rows] = await pool.query(`${SELECT_EMPLOYEE} WHERE e.id = ?`, [req.params.id]);
    if (rows.length === 0) throw new AppError('Employee not found', 404);
    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/employees
async function createEmployee(req, res, next) {
  try {
    const { valid, errors, data } = validateEmployee(req.body);
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const [result] = await pool.query(
      `INSERT INTO employees
        (company_id, employee_id, name, phone, email, department_id, designation_id, shift_id, joining_date, salary, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.company_id, data.employee_id, data.name, data.phone, data.email || null,
        data.department_id || null, data.designation_id || null, data.shift_id || null,
        data.joining_date, data.salary, data.status || 'active',
      ]
    );

    const [rows] = await pool.query(`${SELECT_EMPLOYEE} WHERE e.id = ?`, [result.insertId]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This Employee ID already exists for this company' });
    }
    next(err);
  }
}

// PUT /api/employees/:id
async function updateEmployee(req, res, next) {
  try {
    const [existing] = await pool.query('SELECT id FROM employees WHERE id = ?', [req.params.id]);
    if (existing.length === 0) throw new AppError('Employee not found', 404);

    const { valid, errors, data } = validateEmployee(req.body, { partial: true });
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const fields = Object.keys(data);
    if (fields.length === 0) throw new AppError('No fields to update', 400);

    const setSql = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => data[f]);

    await pool.query(`UPDATE employees SET ${setSql} WHERE id = ?`, [...values, req.params.id]);

    const [rows] = await pool.query(`${SELECT_EMPLOYEE} WHERE e.id = ?`, [req.params.id]);
    res.json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    if (err.code === 'ER_DUP_ENTRY') {
      const message = (err.sqlMessage || '').includes('device_user')
        ? 'This device user ID is already mapped to another employee in this company'
        : 'This Employee ID already exists for this company';
      return res.status(409).json({ message });
    }
    next(err);
  }
}

// DELETE /api/employees/:id
async function deleteEmployee(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw new AppError('Employee not found', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee };
