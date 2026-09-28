const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCompany(data, { partial = false } = {}) {
  const errors = {};
  const clean = {};

  const has = (key) => Object.prototype.hasOwnProperty.call(data, key);

  // name
  if (!partial || has('name')) {
    const name = (data.name || '').trim();
    if (!name) errors.name = 'Company name is required';
    else if (name.length > 150) errors.name = 'Company name is too long';
    else clean.name = name;
  }

  // email
  if (!partial || has('email')) {
    const email = (data.email || '').trim();
    if (!email) errors.email = 'Email is required';
    else if (!EMAIL_RE.test(email)) errors.email = 'Email is not valid';
    else clean.email = email;
  }

  // phone
  if (!partial || has('phone')) {
    const phone = (data.phone || '').trim();
    if (!phone) errors.phone = 'Phone is required';
    else clean.phone = phone;
  }

  // address (optional)
  if (has('address')) {
    clean.address = (data.address || '').trim() || null;
  }

  // logo_url (optional)
  if (has('logo_url')) {
    clean.logo_url = (data.logo_url || '').trim() || null;
  }

  // status (optional, defaults handled at DB level on create)
  if (has('status')) {
    const status = (data.status || '').trim();
    if (!['active', 'inactive'].includes(status)) {
      errors.status = 'Status must be active or inactive';
    } else {
      clean.status = status;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, data: clean };
}

function validateEmployee(data, { partial = false } = {}) {
  const errors = {};
  const clean = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(data, key);

  if (!partial || has('company_id')) {
    const companyId = parseInt(data.company_id, 10);
    if (!companyId) errors.company_id = 'Company is required';
    else clean.company_id = companyId;
  }

  if (!partial || has('employee_id')) {
    const employeeId = (data.employee_id || '').trim();
    if (!employeeId) errors.employee_id = 'Employee ID is required';
    else if (employeeId.length > 30) errors.employee_id = 'Employee ID is too long';
    else clean.employee_id = employeeId;
  }

  if (!partial || has('name')) {
    const name = (data.name || '').trim();
    if (!name) errors.name = 'Name is required';
    else if (name.length > 150) errors.name = 'Name is too long';
    else clean.name = name;
  }

  if (!partial || has('phone')) {
    const phone = (data.phone || '').trim();
    if (!phone) errors.phone = 'Phone is required';
    else clean.phone = phone;
  }

  if (has('email')) {
    const email = (data.email || '').trim();
    if (email && !EMAIL_RE.test(email)) errors.email = 'Email is not valid';
    else clean.email = email || null;
  }

  if (!partial || has('joining_date')) {
    const date = (data.joining_date || '').trim();
    if (!date || Number.isNaN(Date.parse(date))) errors.joining_date = 'A valid joining date is required';
    else clean.joining_date = date;
  }

  if (!partial || has('salary')) {
    const salary = Number(data.salary);
    if (data.salary === undefined || data.salary === '' || Number.isNaN(salary) || salary < 0) {
      errors.salary = 'Salary must be a positive number';
    } else {
      clean.salary = salary;
    }
  }

  if (has('status')) {
    const status = (data.status || '').trim();
    if (!['active', 'inactive'].includes(status)) errors.status = 'Status must be active or inactive';
    else clean.status = status;
  }

  // Optional foreign keys — nullable
  ['department_id', 'designation_id', 'shift_id'].forEach((field) => {
    if (has(field)) {
      const value = data[field];
      clean[field] = value === '' || value === null || value === undefined ? null : parseInt(value, 10);
    }
  });

  if (has('device_user_id')) {
    const deviceUserId = (data.device_user_id || '').trim();
    clean.device_user_id = deviceUserId || null;
  }

  return { valid: Object.keys(errors).length === 0, errors, data: clean };
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function validateShift(data, { partial = false } = {}) {
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
    if (!name) errors.name = 'Shift name is required';
    else if (name.length > 100) errors.name = 'Shift name is too long';
    else clean.name = name;
  }

  if (!partial || has('start_time')) {
    const startTime = (data.start_time || '').trim();
    if (!TIME_RE.test(startTime)) errors.start_time = 'Start time must be in HH:MM format';
    else clean.start_time = startTime;
  }

  if (!partial || has('end_time')) {
    const endTime = (data.end_time || '').trim();
    if (!TIME_RE.test(endTime)) errors.end_time = 'End time must be in HH:MM format';
    else clean.end_time = endTime;
  }

  if (has('break_minutes')) {
    const breakMinutes = parseInt(data.break_minutes, 10);
    if (Number.isNaN(breakMinutes) || breakMinutes < 0) errors.break_minutes = 'Break minutes must be 0 or more';
    else clean.break_minutes = breakMinutes;
  }

  if (has('grace_minutes')) {
    const graceMinutes = parseInt(data.grace_minutes, 10);
    if (Number.isNaN(graceMinutes) || graceMinutes < 0) errors.grace_minutes = 'Grace minutes must be 0 or more';
    else clean.grace_minutes = graceMinutes;
  }

  return { valid: Object.keys(errors).length === 0, errors, data: clean };
}

function validateLeaveType(data, { partial = false } = {}) {
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
    if (!name) errors.name = 'Leave type name is required';
    else if (name.length > 100) errors.name = 'Name is too long';
    else clean.name = name;
  }

  if (has('days_per_year')) {
    const days = parseInt(data.days_per_year, 10);
    if (Number.isNaN(days) || days < 0) errors.days_per_year = 'Days per year must be 0 or more';
    else clean.days_per_year = days;
  }

  return { valid: Object.keys(errors).length === 0, errors, data: clean };
}

function validateLeaveRequest(data) {
  const errors = {};
  const clean = {};

  const companyId = parseInt(data.company_id, 10);
  if (!companyId) errors.company_id = 'Company is required';
  else clean.company_id = companyId;

  const employeeId = parseInt(data.employee_id, 10);
  if (!employeeId) errors.employee_id = 'Employee is required';
  else clean.employee_id = employeeId;

  const leaveTypeId = parseInt(data.leave_type_id, 10);
  if (!leaveTypeId) errors.leave_type_id = 'Leave type is required';
  else clean.leave_type_id = leaveTypeId;

  const startDate = (data.start_date || '').trim();
  const endDate = (data.end_date || '').trim();
  if (!startDate || Number.isNaN(Date.parse(startDate))) errors.start_date = 'A valid start date is required';
  if (!endDate || Number.isNaN(Date.parse(endDate))) errors.end_date = 'A valid end date is required';

  if (!errors.start_date && !errors.end_date) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      errors.end_date = 'End date cannot be before start date';
    } else {
      clean.start_date = startDate;
      clean.end_date = endDate;
      clean.total_days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  const reason = (data.reason || '').trim();
  clean.reason = reason || null;

  return { valid: Object.keys(errors).length === 0, errors, data: clean };
}

module.exports = { validateCompany, validateEmployee, validateShift, validateLeaveType, validateLeaveRequest };
