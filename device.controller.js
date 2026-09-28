const pool = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const zkteco = require('../integrations/zkteco/adapter');

// GET /api/devices?company_id=
async function list(req, res, next) {
  try {
    const companyId = parseInt(req.query.company_id, 10);
    if (!companyId) throw new AppError('company_id is required', 400);

    const [rows] = await pool.query(
      'SELECT * FROM devices WHERE company_id = ? ORDER BY name ASC',
      [companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

function validateDevice(data, { partial = false } = {}) {
  const errors = {};
  const clean = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(data, key);

  if (!partial || has('company_id')) {
    const companyId = parseInt(data.company_id, 10);
    if (!companyId) errors.company_id = 'Company is required';
    else clean.company_id = companyId;
  }
  if (!partial || has('name')) {
    const name = (data.name || '').trim();
    if (!name) errors.name = 'Device name is required';
    else clean.name = name;
  }
  if (!partial || has('ip_address')) {
    const ip = (data.ip_address || '').trim();
    if (!ip) errors.ip_address = 'IP address is required';
    else clean.ip_address = ip;
  }
  if (has('port')) clean.port = parseInt(data.port, 10) || 4370;
  if (has('inport')) clean.inport = parseInt(data.inport, 10) || 4000;
  if (has('timeout_ms')) clean.timeout_ms = parseInt(data.timeout_ms, 10) || 10000;
  if (has('location')) clean.location = (data.location || '').trim() || null;
  if (has('model')) clean.model = (data.model || '').trim() || null;

  return { valid: Object.keys(errors).length === 0, errors, data: clean };
}

// POST /api/devices
async function create(req, res, next) {
  try {
    const { valid, errors, data } = validateDevice(req.body);
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const [result] = await pool.query(
      `INSERT INTO devices (company_id, name, ip_address, port, inport, timeout_ms, location, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.company_id, data.name, data.ip_address, data.port || 4370, data.inport || 4000,
        data.timeout_ms || 10000, data.location || null, data.model || null]
    );
    const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [result.insertId]);
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A device with this IP address already exists for this company' });
    }
    next(err);
  }
}

// PUT /api/devices/:id
async function update(req, res, next) {
  try {
    const [existing] = await pool.query('SELECT id FROM devices WHERE id = ?', [req.params.id]);
    if (existing.length === 0) throw new AppError('Device not found', 404);

    const { valid, errors, data } = validateDevice(req.body, { partial: true });
    if (!valid) throw Object.assign(new AppError('Validation failed', 422), { fields: errors });

    const fields = Object.keys(data).filter((f) => f !== 'company_id');
    if (fields.length === 0) throw new AppError('No fields to update', 400);

    const setSql = fields.map((f) => `${f} = ?`).join(', ');
    await pool.query(`UPDATE devices SET ${setSql} WHERE id = ?`, [...fields.map((f) => data[f]), req.params.id]);

    const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [req.params.id]);
    res.json({ data: rows[0] });
  } catch (err) {
    if (err.fields) return res.status(422).json({ message: err.message, fields: err.fields });
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A device with this IP address already exists for this company' });
    }
    next(err);
  }
}

// DELETE /api/devices/:id
async function remove(req, res, next) {
  try {
    const [result] = await pool.query('DELETE FROM devices WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw new AppError('Device not found', 404);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function getDeviceOrFail(id) {
  const [rows] = await pool.query('SELECT * FROM devices WHERE id = ?', [id]);
  if (rows.length === 0) throw new AppError('Device not found', 404);
  return rows[0];
}

// POST /api/devices/:id/test-connection
async function testConnection(req, res, next) {
  try {
    const device = await getDeviceOrFail(req.params.id);
    const result = await zkteco.testConnection(device);

    await pool.query('UPDATE devices SET status = ? WHERE id = ?', [
      result.reachable ? 'online' : 'offline',
      device.id,
    ]);

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/devices/:id/sync-users
// Pulls the device's enrolled users and shows, for each, whether it's already
// mapped to an employee (via employees.device_user_id). Doesn't write anything
// itself — mapping is a deliberate admin action via PUT /api/employees/:id.
async function syncUsers(req, res, next) {
  try {
    const device = await getDeviceOrFail(req.params.id);
    let deviceUsers;
    try {
      deviceUsers = await zkteco.getUsers(device);
    } catch (err) {
      throw new AppError(`Could not reach device: ${err.message}`, 502);
    }

    const [employees] = await pool.query(
      'SELECT id, employee_id, name, device_user_id FROM employees WHERE company_id = ?',
      [device.company_id]
    );
    const employeeByDeviceUserId = new Map(
      employees.filter((e) => e.device_user_id).map((e) => [e.device_user_id, e])
    );

    const data = deviceUsers.map((u) => {
      const matched = employeeByDeviceUserId.get(u.deviceUserId);
      return {
        device_user_id: u.deviceUserId,
        device_name: u.name,
        mapped_employee_id: matched ? matched.id : null,
        mapped_employee_name: matched ? matched.name : null,
      };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// POST /api/devices/:id/download-logs
// Pulls raw punches from the device and inserts them into attendance_logs
// (source = 'device') for whichever punches belong to a mapped employee.
// Already-inserted punches are skipped via the unique key on
// (employee_id, punch_time, source), so re-running this is always safe.
async function downloadLogs(req, res, next) {
  try {
    const device = await getDeviceOrFail(req.params.id);
    let records;
    try {
      records = await zkteco.getAttendanceLogs(device);
    } catch (err) {
      throw new AppError(`Could not reach device: ${err.message}`, 502);
    }

    const [employees] = await pool.query(
      'SELECT id, device_user_id FROM employees WHERE company_id = ? AND device_user_id IS NOT NULL',
      [device.company_id]
    );
    const employeeByDeviceUserId = new Map(employees.map((e) => [e.device_user_id, e.id]));

    let inserted = 0;
    let unmapped = 0;

    for (const record of records) {
      const employeeId = employeeByDeviceUserId.get(record.deviceUserId);
      if (!employeeId) { unmapped += 1; continue; }

      const [result] = await pool.query(
        `INSERT IGNORE INTO attendance_logs
           (company_id, employee_id, device_id, device_user_id, punch_time, source)
         VALUES (?, ?, ?, ?, ?, 'device')`,
        [device.company_id, employeeId, String(device.id), record.deviceUserId, record.punchTime]
      );
      if (result.affectedRows > 0) inserted += 1;
    }

    await pool.query('UPDATE devices SET last_sync_at = NOW(), status = ? WHERE id = ?', ['online', device.id]);

    res.json({ deviceTotal: records.length, inserted, unmapped });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove, testConnection, syncUsers, downloadLogs };
