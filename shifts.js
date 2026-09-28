const API_BASE = '/api/shifts';

const el = (id) => document.getElementById(id);
const tableBody = el('shiftTableBody');
const alertBox = el('alertBox');
const noCompanyNotice = el('noCompanyNotice');

let deleteTargetId = null;

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

function formatTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${m} ${period}`;
}

async function fetchShifts() {
  const companyId = getCurrentCompanyId();
  if (!companyId) {
    noCompanyNotice.hidden = false;
    tableBody.innerHTML = '<tr><td colspan="7" class="empty">No company selected.</td></tr>';
    return;
  }
  noCompanyNotice.hidden = true;
  tableBody.innerHTML = '<tr><td colspan="7" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`${API_BASE}/managed?company_id=${companyId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load shifts');
    renderTable(json.data);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable(shifts) {
  if (shifts.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty">No shifts yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = shifts.map((s) => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${formatTime(s.start_time)}</td>
      <td>${formatTime(s.end_time)}</td>
      <td>${s.break_minutes}</td>
      <td>${s.grace_minutes}</td>
      <td>${s.employee_count}</td>
      <td>
        <button class="btn-link" onclick="openEdit(${s.id})">Edit</button>
        <button class="btn-link danger" onclick="openDelete(${s.id}, '${escapeHtml(s.name).replace(/'/g, "\\'")}', ${s.employee_count})">Delete</button>
      </td>
    </tr>
  `).join('');
}

// --- Add / Edit Modal ---
const shiftModal = el('shiftModal');
const shiftForm = el('shiftForm');
const FIELD_ERROR_IDS = ['name', 'start_time', 'end_time', 'break_minutes', 'grace_minutes'];

function clearFieldErrors() {
  FIELD_ERROR_IDS.forEach((f) => { el(`err-${f}`).textContent = ''; });
}

function openAdd() {
  const companyId = getCurrentCompanyId();
  if (!companyId) { showAlert('Select a company first.', 'error'); return; }

  el('modalTitle').textContent = 'Add Shift';
  shiftForm.reset();
  el('shiftId').value = '';
  el('break_minutes').value = 60;
  el('grace_minutes').value = 0;
  clearFieldErrors();
  shiftModal.hidden = false;
}

async function openEdit(id) {
  try {
    const res = await fetch(`${API_BASE}/managed?company_id=${getCurrentCompanyId()}`);
    const json = await res.json();
    const shift = (json.data || []).find((s) => s.id === id);
    if (!shift) throw new Error('Shift not found');

    el('modalTitle').textContent = 'Edit Shift';
    el('shiftId').value = shift.id;
    el('name').value = shift.name;
    el('start_time').value = shift.start_time.slice(0, 5);
    el('end_time').value = shift.end_time.slice(0, 5);
    el('break_minutes').value = shift.break_minutes;
    el('grace_minutes').value = shift.grace_minutes;
    clearFieldErrors();
    shiftModal.hidden = false;
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

el('addBtn').addEventListener('click', openAdd);
el('cancelBtn').addEventListener('click', () => { shiftModal.hidden = true; });

shiftForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors();

  const id = el('shiftId').value;
  const payload = {
    company_id: getCurrentCompanyId(),
    name: el('name').value,
    start_time: el('start_time').value,
    end_time: el('end_time').value,
    break_minutes: el('break_minutes').value,
    grace_minutes: el('grace_minutes').value,
  };

  const isEdit = Boolean(id);
  const url = isEdit ? `${API_BASE}/${id}` : API_BASE;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!res.ok) {
      if (json.fields) {
        Object.entries(json.fields).forEach(([field, msg]) => {
          const target = el(`err-${field}`);
          if (target) target.textContent = msg;
        });
        return;
      }
      throw new Error(json.message || 'Save failed');
    }

    shiftModal.hidden = true;
    showAlert(isEdit ? 'Shift updated.' : 'Shift added.');
    fetchShifts();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// --- Delete Confirmation ---
const deleteModal = el('deleteModal');

function openDelete(id, name, employeeCount) {
  deleteTargetId = id;
  const usageNote = employeeCount > 0
    ? ` ${employeeCount} employee(s) currently use it — they will be set to no shift instead of being deleted.`
    : '';
  el('deleteMessage').textContent = `Delete "${name}"? This cannot be undone.${usageNote}`;
  deleteModal.hidden = false;
}

el('cancelDeleteBtn').addEventListener('click', () => { deleteModal.hidden = true; });

el('confirmDeleteBtn').addEventListener('click', async () => {
  try {
    const res = await fetch(`${API_BASE}/${deleteTargetId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const json = await res.json();
      throw new Error(json.message || 'Delete failed');
    }
    deleteModal.hidden = true;
    showAlert('Shift deleted.');
    fetchShifts();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

document.addEventListener('company-changed', fetchShifts);

// Init — wait a tick for renderNav() to resolve the current company.
setTimeout(fetchShifts, 300);
