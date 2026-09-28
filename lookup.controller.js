const pool = require('../config/db');
const { AppError } = require('../middleware/errorHandler');

// Generates handlers for a simple company-scoped lookup table
// (departments, designations, shifts — all share the same shape:
// id, company_id, name, timestamps).
//
// `list`/`create` are the original minimal versions used by the
// Employee form's dropdowns. `listManaged`/`update`/`remove` add full
// CRUD for tables that have grown into their own management screen
// (currently: departments, designations).
function makeLookupController(table, employeeColumn) {
  async function list(req, res, next) {
    try {
      const companyId = parseInt(req.query.company_id, 10);
      if (!companyId) throw new AppError('company_id is required', 400);

      const [rows] = await pool.query(
        `SELECT id, name FROM ${table} WHERE company_id = ? ORDER BY name ASC`,
        [companyId]
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  }

  // Same as `list`, but also returns how many employees currently use each row —
  // useful context before someone deletes one.
  async function listManaged(req, res, next) {
    try {
      const companyId = parseInt(req.query.company_id, 10);
      if (!companyId) throw new AppError('company_id is required', 400);

      const [rows] = await pool.query(
        `SELECT t.id, t.name, t.created_at,
                COUNT(e.id) AS employee_count
         FROM ${table} t
         LEFT JOIN employees e ON e.${employeeColumn} = t.id
         WHERE t.company_id = ?
         GROUP BY t.id, t.name, t.created_at
         ORDER BY t.name ASC`,
        [companyId]
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  }

  async function create(req, res, next) {
    try {
      const companyId = parseInt(req.body.company_id, 10);
      const name = (req.body.name || '').trim();
      if (!companyId) throw new AppError('company_id is required', 400);
      if (!name) throw new AppError('Name is required', 400);

      const [result] = await pool.query(
        `INSERT INTO ${table} (company_id, name) VALUES (?, ?)`,
        [companyId, name]
      );
      const [rows] = await pool.query(`SELECT id, name FROM ${table} WHERE id = ?`, [result.insertId]);
      res.status(201).json({ data: rows[0] });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'This name already exists for this company' });
      }
      next(err);
    }
  }

  async function update(req, res, next) {
    try {
      const name = (req.body.name || '').trim();
      if (!name) throw new AppError('Name is required', 400);

      const [result] = await pool.query(
        `UPDATE ${table} SET name = ? WHERE id = ?`,
        [name, req.params.id]
      );
      if (result.affectedRows === 0) throw new AppError('Not found', 404);

      const [rows] = await pool.query(`SELECT id, name FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ data: rows[0] });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'This name already exists for this company' });
      }
      next(err);
    }
  }

  async function remove(req, res, next) {
    try {
      const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      if (result.affectedRows === 0) throw new AppError('Not found', 404);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  return { list, listManaged, create, update, remove };
}

module.exports = {
  departments: makeLookupController('departments', 'department_id'),
  designations: makeLookupController('designations', 'designation_id'),
};
