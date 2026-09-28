const pool = require('../config/db');
const { validateShift } = require('../utils/validate');
const { AppError } = require('../middleware/errorHandler');

// GET /api/shifts?company_id=  — minimal shape, used by the Employee form's dropdown
async function list(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    if (!companyId) throw new AppError('company_id is required', 400);

    const [rows] = await pool.query(
      'SELECT id, name FROM shifts WHERE company_id = ? ORDER BY name ASC',
      [companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/shifts/managed?company_id=  — full shape + employee count, for the Shift Management screen
async function listManaged(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    if (!companyId) throw new AppError('company_id is required', 400);

    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.start_time, s.end_time, s.break_minutes, s.grace_minutes,
              COUNT(e.id) AS employee_count
       FROM shifts s
       LEFT JOIN employees e ON e.shift_id = s.id
       WHERE s.company_id = ?
       GROUP BY s.id, s.name, s.start_time, s.end_time, s.break_minutes, s.grace_minutes
       ORDER BY s.name ASC`,
      [companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/shifts
async function create(req, res, next) {
  try {
    const { valid, errors, data } = validateShift(req.body);
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const [result] = await pool.query(
      `INSERT INTO shifts (company_id, name, start_time, end_time, break_minutes, grace_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.company_id, data.name, data.start_time, data.end_time,
        data.break_minutes ?? 60, data.grace_minutes ?? 0,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM shifts WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A shift with this name already exists for this company' });
    }
    next(err);
  }
}

// PUT /api/shifts/:id
async function update(req, res, next) {
  try {
    const [existing] = await pool.query('SELECT id FROM shifts WHERE id = ?', [req.params.id]);
    if (existing.length === 0) throw new AppError('Shift not found', 404);

    const { valid, errors, data } = validateShift(req.body, { partial: true });
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const fields = Object.keys(data).filter((f) => f !== 'company_id');
    if (fields.length === 0) throw new AppError('No fields to update', 400);

    const setSql = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => data[f]);

    await pool.query(`UPDATE shifts SET ${setSql} WHERE id = ?`, [...values, req.params.id]);

    const [rows] = await pool.query('SELECT * FROM shifts WHERE id = ?', [req.params.id]);
    res.json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A shift with this name already exists for this company' });
    }
    next(err);
  }
}

// DELETE /api/shifts/:id
async function remove(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM shifts WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw new AppError('Shift not found', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, listManaged, create, update, remove };
