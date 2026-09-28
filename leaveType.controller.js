const pool = require('../config/db');
const { validateLeaveType } = require('../utils/validate');
const { AppError } = require('../middleware/errorHandler');

// GET /api/leave-types?company_id=  — minimal shape for the Leave Request form's dropdown
async function list(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    if (!companyId) throw new AppError('company_id is required', 400);

    const [rows] = await pool.query(
      'SELECT id, name, days_per_year FROM leave_types WHERE company_id = ? ORDER BY name ASC',
      [companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/leave-types
async function create(req, res, next) {
  try {
    const { valid, errors, data } = validateLeaveType(req.body);
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const [result] = await pool.query(
      'INSERT INTO leave_types (company_id, name, days_per_year) VALUES (?, ?, ?)',
      [data.company_id, data.name, data.days_per_year ?? 0]
    );
    const [rows] = await pool.query('SELECT * FROM leave_types WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A leave type with this name already exists for this company' });
    }
    next(err);
  }
}

// PUT /api/leave-types/:id
async function update(req, res, next) {
  try {
    const [existing] = await pool.query('SELECT id FROM leave_types WHERE id = ?', [req.params.id]);
    if (existing.length === 0) throw new AppError('Leave type not found', 404);

    const { valid, errors, data } = validateLeaveType(req.body, { partial: true });
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const fields = Object.keys(data).filter((f) => f !== 'company_id');
    if (fields.length === 0) throw new AppError('No fields to update', 400);

    const setSql = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => data[f]);
    await pool.query(`UPDATE leave_types SET ${setSql} WHERE id = ?`, [...values, req.params.id]);

    const [rows] = await pool.query('SELECT * FROM leave_types WHERE id = ?', [req.params.id]);
    res.json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A leave type with this name already exists for this company' });
    }
    next(err);
  }
}

// DELETE /api/leave-types/:id
async function remove(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM leave_types WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw new AppError('Leave type not found', 404);
    res.status(204).send();
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ message: 'This leave type has leave requests recorded against it and cannot be deleted' });
    }
    next(err);
  }
}

module.exports = { list, create, update, remove };
