const el = (id) => document.getElementById(id);
const tableBody = el('summaryTableBody');
const alertBox = el('alertBox');
const noCompanyNotice = el('noCompanyNotice');

const STATUS_LABELS = {
  present: 'Present',
  late: 'Late',
  early_leave: 'Early Leave',
  half_day: 'Half Day',
  overtime: 'Overtime',
  absent: 'Absent',
};

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

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

el('dateInput').value = todayStr();
el('todayBtn').addEventListener('click', () => {
  el('dateInput').value = todayStr();
  fetchSummary();
});
el('dateInput').addEventListener('change', fetchSummary);

async function fetchSummary() {
  const companyId = getCurrentCompanyId();
  const date = el('dateInput').value;
  if (!companyId) {
    noCompanyNotice.hidden = false;
    tableBody.innerHTML = '<tr><td colspan="7" class="empty">No company selected.</td></tr>';
    return;
  }
  noCompanyNotice.hidden = true;
  tableBody.innerHTML = '<tr><td colspan="7" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/attendance/summary?company_id=${companyId}&date=${date}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load attendance');
    renderTable(json.data);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable(rows) {
  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty">No active employees for this company.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.employee_code)}</td>
      <td>${escapeHtml(r.name)}${r.has_shift ? '' : ' <small class="hint">(no shift assigned)</small>'}</td>
      <td>${fmtTime(r.checkIn)}</td>
      <td>${fmtTime(r.checkOut)}</td>
      <td>${fmtDuration(r.workedMinutes)}</td>
      <td><span class="badge badge-${r.status}">${STATUS_LABELS[r.status] || r.status}</span></td>
      <td><button class="btn-link" onclick="openDetail(${r.employee_id}, '${escapeHtml(r.name).replace(/'/g, "\\'")}')">Punches</button></td>
    </tr>
  `).join('');
}

// --- Record Punch ---
const punchModal = el('punchModal');
const punchForm = el('punchForm');

async function loadEmployeeOptions() {
  const companyId = getCurrentCompanyId();
  const select = el('punchEmployee');
  select.innerHTML = '<option value="">Loading...</option>';
  if (!companyId) { select.innerHTML = '<option value="">No company selected</option>'; return; }

  try {
    const res = await fetch(`/api/employees?company_id=${companyId}&status=active&limit=100`);
    const json = await res.json();
    const employees = json.data || [];
    select.innerHTML = employees.length
      ? employees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.employee_id)})</option>`).join('')
      : '<option value="">No active employees</option>';
  } catch (err) {
    select.innerHTML = '<option value="">Failed to load employees</option>';
  }
}

el('addPunchBtn').addEventListener('click', async () => {
  const companyId = getCurrentCompanyId();
  if (!companyId) { showAlert('Select a company first.', 'error'); return; }

  await loadEmployeeOptions();
  el('err-employee').textContent = '';
  el('err-time').textContent = '';

  // Default to now, in the <input type="datetime-local"> format
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  el('punchTime').value = now.toISOString().slice(0, 16);
  el('punchType').value = 'in';

  punchModal.hidden = false;
});

el('cancelPunchBtn').addEventListener('click', () => { punchModal.hidden = true; });

punchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  el('err-employee').textContent = '';
  el('err-time').textContent = '';

  const employeeId = el('punchEmployee').value;
  const punchTime = el('punchTime').value;
  const inOutMode = el('punchType').value;

  if (!employeeId) { el('err-employee').textContent = 'Select an employee'; return; }
  if (!punchTime) { el('err-time').textContent = 'Select a date and time'; return; }

  try {
    const res = await fetch('/api/attendance/punches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: getCurrentCompanyId(),
        employee_id: employeeId,
        punch_time: punchTime,
        in_out_mode: inOutMode,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to save punch');

    punchModal.hidden = true;
    showAlert('Punch recorded.');
    fetchSummary();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// --- Day detail (raw punches) ---
const detailModal = el('detailModal');
let detailEmployeeId = null;

async function openDetail(employeeId, name) {
  detailEmployeeId = employeeId;
  el('detailModalTitle').textContent = `Punches — ${name}`;
  const companyId = getCurrentCompanyId();
  const date = el('dateInput').value;

  const body = el('detailTableBody');
  body.innerHTML = '<tr><td colspan="4" class="empty">Loading...</td></tr>';
  detailModal.hidden = false;

  try {
    const res = await fetch(`/api/attendance/logs?company_id=${companyId}&employee_id=${employeeId}&date=${date}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load punches');
    renderDetail(json.data);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderDetail(logs) {
  const body = el('detailTableBody');
  if (logs.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty">No punches for this day.</td></tr>';
    return;
  }
  body.innerHTML = logs.map((l) => `
    <tr>
      <td>${new Date(l.punch_time).toLocaleString()}</td>
      <td>${escapeHtml(l.in_out_mode || '—')}</td>
      <td>${escapeHtml(l.source)}</td>
      <td><button class="btn-link danger" onclick="deletePunch(${l.id})">Delete</button></td>
    </tr>
  `).join('');
}

async function deletePunch(id) {
  if (!confirm('Delete this punch? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/attendance/punches/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const json = await res.json();
      throw new Error(json.message || 'Delete failed');
    }
    showAlert('Punch deleted.');
    openDetail(detailEmployeeId, el('detailModalTitle').textContent.replace('Punches — ', ''));
    fetchSummary();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

el('closeDetailBtn').addEventListener('click', () => { detailModal.hidden = true; });

document.addEventListener('company-changed', fetchSummary);

// Init — wait a tick for renderNav() to resolve the current company.
setTimeout(fetchSummary, 300);
