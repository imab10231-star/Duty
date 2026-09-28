const el = (id) => document.getElementById(id);
const alertBox = el('alertBox');
const noCompanyNotice = el('noCompanyNotice');

function showAlert(message, type = 'success') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.hidden = false;
  setTimeout(() => { alertBox.hidden = true; }, 3500);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.report-panel').forEach((p) => { p.hidden = true; });
    btn.classList.add('active');
    el(`panel-${btn.dataset.tab}`).hidden = false;
  });
});

// --- Defaults ---
function todayStr() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
el('attFrom').value = firstOfMonthStr();
el('attTo').value = todayStr();
el('leaveFrom').value = firstOfMonthStr();
el('leaveTo').value = todayStr();
const now = new Date();
el('payrollMonth').value = String(now.getMonth() + 1);
el('payrollYear').value = now.getFullYear();

function checkCompany() {
  const companyId = getCurrentCompanyId();
  noCompanyNotice.hidden = Boolean(companyId);
  return companyId;
}
document.addEventListener('company-changed', checkCompany);
setTimeout(checkCompany, 300);

// --- Attendance ---
async function loadAttendanceReport() {
  const companyId = checkCompany();
  const body = el('attendanceTableBody');
  if (!companyId) { body.innerHTML = '<tr><td colspan="8" class="empty">No company selected.</td></tr>'; return; }

  const from = el('attFrom').value;
  const to = el('attTo').value;
  body.innerHTML = '<tr><td colspan="8" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/reports/attendance?company_id=${companyId}&from=${from}&to=${to}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load report');
    const rows = json.data;
    body.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.employee_code)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.present_days}</td>
        <td>${r.absent_days}</td>
        <td>${r.half_days}</td>
        <td>${r.leave_days}</td>
        <td>${r.late_days}</td>
        <td>${(r.overtime_minutes / 60).toFixed(1)}</td>
      </tr>
    `).join('') : '<tr><td colspan="8" class="empty">No employees found.</td></tr>';
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

// --- Leave ---
async function loadLeaveReport() {
  const companyId = checkCompany();
  const body = el('leaveTableBody');
  if (!companyId) { body.innerHTML = '<tr><td colspan="6" class="empty">No company selected.</td></tr>'; return; }

  const from = el('leaveFrom').value;
  const to = el('leaveTo').value;
  const status = el('leaveStatus').value;
  body.innerHTML = '<tr><td colspan="6" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/reports/leave?company_id=${companyId}&from=${from}&to=${to}&status=${status}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load report');
    const rows = json.data;
    body.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.employee_name)} <small class="hint">(${escapeHtml(r.employee_code)})</small></td>
        <td>${escapeHtml(r.leave_type)}</td>
        <td>${r.start_date.slice(0, 10)}</td>
        <td>${r.end_date.slice(0, 10)}</td>
        <td>${r.total_days}</td>
        <td><span class="badge badge-${r.status}">${r.status}</span></td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="empty">No leave requests found.</td></tr>';
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

// --- Payroll ---
async function loadPayrollReport() {
  const companyId = checkCompany();
  const body = el('payrollTableBody');
  if (!companyId) { body.innerHTML = '<tr><td colspan="7" class="empty">No company selected.</td></tr>'; return; }

  const month = el('payrollMonth').value;
  const year = el('payrollYear').value;
  body.innerHTML = '<tr><td colspan="7" class="empty">Loading...</td></tr>';
  el('payrollTotals').textContent = '';

  try {
    const res = await fetch(`/api/reports/payroll?company_id=${companyId}&month=${month}&year=${year}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load report');
    const rows = json.data;
    body.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.employee_name)} <small class="hint">(${escapeHtml(r.employee_code)})</small></td>
        <td>${Number(r.basic_salary).toLocaleString()}</td>
        <td>${r.present_days}</td>
        <td>${r.absent_days}</td>
        <td>${r.leave_days}</td>
        <td><strong>${Number(r.net_payable).toLocaleString()}</strong></td>
        <td><span class="badge badge-${r.status === 'finalized' ? 'approved' : 'pending'}">${r.status}</span></td>
      </tr>
    `).join('') : '<tr><td colspan="7" class="empty">No payroll generated for this month.</td></tr>';

    if (rows.length) {
      el('payrollTotals').textContent = `Total basic: ${json.totals.basic.toLocaleString()} — Total net payable: ${json.totals.net.toLocaleString()}`;
    }
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

// --- Employees ---
async function loadEmployeeReport() {
  const companyId = checkCompany();
  const body = el('employeesTableBody');
  if (!companyId) { body.innerHTML = '<tr><td colspan="7" class="empty">No company selected.</td></tr>'; return; }

  const status = el('empStatus').value;
  body.innerHTML = '<tr><td colspan="7" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/reports/employees?company_id=${companyId}&status=${status}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load report');
    const rows = json.data;
    body.innerHTML = rows.length ? rows.map((r) => `
      <tr>
        <td>${escapeHtml(r.employee_code)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.department || '—')}</td>
        <td>${escapeHtml(r.designation || '—')}</td>
        <td>${escapeHtml(r.shift || '—')}</td>
        <td>${r.joining_date.slice(0, 10)}</td>
        <td><span class="badge badge-${r.status}">${r.status}</span></td>
      </tr>
    `).join('') : '<tr><td colspan="7" class="empty">No employees found.</td></tr>';
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

// --- CSV download ---
function downloadCsv(type) {
  const companyId = getCurrentCompanyId();
  if (!companyId) { showAlert('Select a company first.', 'error'); return; }

  let url;
  if (type === 'attendance') {
    url = `/api/reports/attendance?company_id=${companyId}&from=${el('attFrom').value}&to=${el('attTo').value}&format=csv`;
  } else if (type === 'leave') {
    url = `/api/reports/leave?company_id=${companyId}&from=${el('leaveFrom').value}&to=${el('leaveTo').value}&status=${el('leaveStatus').value}&format=csv`;
  } else if (type === 'payroll') {
    url = `/api/reports/payroll?company_id=${companyId}&month=${el('payrollMonth').value}&year=${el('payrollYear').value}&format=csv`;
  } else if (type === 'employees') {
    url = `/api/reports/employees?company_id=${companyId}&status=${el('empStatus').value}&format=csv`;
  }
  window.location.href = url;
}

// Init — load the default (Attendance) tab once the company resolves.
setTimeout(loadAttendanceReport, 400);
