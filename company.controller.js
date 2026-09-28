const pool = require('../config/db');
const { validateCompany } = require('../utils/validate');
const { AppError } = require('../middleware/errorHandler');

// GET /api/companies?search=&status=&page=&limit=
async function listCompanies(req, res, next) {
  try {
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (search) {
      where.push('(name LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status === 'active' || status === 'inactive') {
      where.push('status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT id, name, email, phone, address, logo_url, status, created_at, updated_at
       FROM companies ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM companies ${whereSql}`,
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

// GET /api/companies/:id
async function getCompany(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM companies WHERE id = ?', [req.params.id]);
    if (rows.length === 0) throw new AppError('Company not found', 404);
    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/companies
async function createCompany(req, res, next) {
  try {
    const { valid, errors, data } = validateCompany(req.body);
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const [result] = await pool.query(
      `INSERT INTO companies (name, email, phone, address, logo_url, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.email, data.phone, data.address || null, data.logo_url || null, data.status || 'active']
    );

    const [rows] = await pool.query('SELECT * FROM companies WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.fields) {
      return res.status(422).json({ message: err.message, fields: err.fields });
    }
    next(err);
  }
}

// PUT /api/companies/:id
async function updateCompany(req, res, next) {
  try {
    const [existing] = await pool.query('SELECT id FROM companies WHERE id = ?', [req.params.id]);
    if (existing.length === 0) throw new AppError('Company not found', 404);

    const { valid, errors, data } = validateCompany(req.body, { partial: true });
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const fields = Object.keys(data);
    if (fields.length === 0) throw new AppError('No fields to update', 400);

    const setSql = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => data[f]);

    await pool.query(`UPDATE companies SET ${setSql} WHERE id = ?`, [...values, req.params.id]);

    const [rows] = await pool.query('SELECT * FROM companies WHERE id = ?', [req.params.id]);
    res.json({ data: rows[0] });
  } catch (err) {
    if (err.fields) {
      return res.status(422).json({ message: err.message, fields: err.fields });
    }
    next(err);
  }
}

// DELETE /api/companies/:id
async function deleteCompany(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM companies WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw new AppError('Company not found', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listCompanies, getCompany, createCompany, updateCompany, deleteCompany };
