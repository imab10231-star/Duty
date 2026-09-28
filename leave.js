const el = (id) => document.getElementById(id);
const alertBox = el('alertBox');
const noCompanyNotice = el('noCompanyNotice');

const state = { status: '', page: 1, limit: 20 };
let editingTypeId = null;
let deleteTypeId = null;
let decisionTargetId = null;
let decisionStatus = null;

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

function refreshAll() {
  const companyId = getCurrentCompanyId();
  noCompanyNotice.hidden = Boolean(companyId);
  loadTypes();
  loadRequests();
}
document.addEventListener('company-changed', refreshAll);

// ============ Leave Types ============
async function loadTypes() {
  const companyId = getCurrentCompanyId();
  const body = el('typeTableBody');
  if (!companyId) { body.innerHTML = '<tr><td colspan="3" class="empty">No company selected.</td></tr>'; return; }
  body.innerHTML = '<tr><td colspan="3" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/leave-types?company_id=${companyId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load leave types');
    const types = json.data || [];
    body.innerHTML = types.length ? types.map((t) => `
      <tr>
        <td>${escapeHtml(t.name)}</td>
        <td>${t.days_per_year}</td>
        <td>
          <button class="btn-link" onclick="openEditType(${t.id}, '${escapeHtml(t.name).replace(/'/g, "\\'")}', ${t.days_per_year})">Edit</button>
          <button class="btn-link danger" onclick="openDeleteType(${t.id}, '${escapeHtml(t.name).replace(/'/g, "\\'")}')">Delete</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="3" class="empty">No leave types yet.</td></tr>';
  } catch (err) {
    body.innerHTML = `<tr><td colspan="3" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function openAddType() {
  const companyId = getCurrentCompanyId();
  if (!companyId) { showAlert('Select a company first.', 'error'); return; }
  editingTypeId = null;
  el('typeModalTitle').textContent = 'Add Leave Type';
  el('typeName').value = '';
  el('typeDays').value = 0;
  el('err-typeName').textContent = '';
  el('err-typeDays').textContent = '';
  el('typeModal').hidden = false;
}

function openEditType(id, name, days) {
  editingTypeId = id;
  el('typeModalTitle').textContent = 'Edit Leave Type';
  el('typeName').value = name;
  el('typeDays').value = days;
  el('err-typeName').textContent = '';
  el('err-typeDays').textContent = '';
  el('typeModal').hidden = false;
}

el('cancelTypeBtn').addEventListener('click', () => { el('typeModal').hidden = true; });

el('typeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('err-typeName').textContent = '';
  el('err-typeDays').textContent = '';

  const payload = { name: el('typeName').value, days_per_year: el('typeDays').value };
  const isEdit = Boolean(editingTypeId);
  const url = isEdit ? `/api/leave-types/${editingTypeId}` : '/api/leave-types';
  const method = isEdit ? 'PUT' : 'POST';
  if (!isEdit) payload.company_id = getCurrentCompanyId();

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      if (json.fields) {
        if (json.fields.name) el('err-typeName').textContent = json.fields.name;
        if (json.fields.days_per_year) el('err-typeDays').textContent = json.fields.days_per_year;
        return;
      }
      throw new Error(json.message || 'Save failed');
    }
    el('typeModal').hidden = true;
    showAlert('Saved.');
    loadTypes();
  } catch (err) {
    el('err-typeName').textContent = err.message;
  }
});

function openDeleteType(id, name) {
  deleteTypeId = id;
  el('typeDeleteMessage').textContent = `Delete "${name}"? This cannot be undone.`;
  el('typeDeleteModal').hidden = false;
}
el('cancelTypeDeleteBtn').addEventListener('click', () => { el('typeDeleteModal').hidden = true; });
el('confirmTypeDeleteBtn').addEventListener('click', async () => {
  try {
    const res = await fetch(`/api/leave-types/${deleteTypeId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const json = await res.json();
      throw new Error(json.message || 'Delete failed');
    }
    el('typeDeleteModal').hidden = true;
    showAlert('Leave type deleted.');
    loadTypes();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// ============ Leave Requests ============
el('statusFilter').addEventListener('change', (e) => {
  state.status = e.target.value;
  state.page = 1;
  loadRequests();
});

async function loadRequests() {
  const companyId = getCurrentCompanyId();
  const body = el('requestTableBody');
  if (!companyId) { body.innerHTML = '<tr><td colspan="7" class="empty">No company selected.</td></tr>'; el('pagination').innerHTML = ''; return; }
  body.innerHTML = '<tr><td colspan="7" class="empty">Loading...</td></tr>';

  const params = new URLSearchParams({ company_id: companyId, status: state.status, page: state.page, limit: state.limit });
  try {
    const res = await fetch(`/api/leave-requests?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load leave requests');
    renderRequests(json.data);
    renderPagination(json.pagination);
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderRequests(rows) {
  const body = el('requestTableBody');
  if (rows.length === 0) { body.innerHTML = '<tr><td colspan="7" class="empty">No leave requests found.</td></tr>'; return; }

  body.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.employee_name)} <small class="hint">(${escapeHtml(r.employee_code)})</small></td>
      <td>${escapeHtml(r.leave_type_name)}</td>
      <td>${r.start_date.slice(0, 10)}</td>
      <td>${r.end_date.slice(0, 10)}</td>
      <td>${r.total_days}</td>
      <td><span class="badge badge-${r.status}">${r.status}</span></td>
      <td>
        ${r.status === 'pending' ? `
          <button class="btn-link" onclick="openDecision(${r.id}, 'approved')">Approve</button>
          <button class="btn-link danger" onclick="openDecision(${r.id}, 'rejected')">Reject</button>
        ` : ''}
        <button class="btn-link danger" onclick="deleteRequest(${r.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

function renderPagination(pagination) {
  const { page, totalPages } = pagination;
  const box = el('pagination');
  if (totalPages <= 1) { box.innerHTML = ''; return; }
  let html = `<button ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">Prev</button>`;
  for (let i = 1; i <= totalPages; i++) html += `<button class="${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  html += `<button ${page >= totalPages ? 'disabled' : ''} onclick="goToPage(${page + 1})">Next</button>`;
  box.innerHTML = html;
}
function goToPage(page) { state.page = page; loadRequests(); }

// --- Apply for Leave ---
const requestModal = el('requestModal');

async function openAddRequest() {
  const companyId = getCurrentCompanyId();
  if (!companyId) { showAlert('Select a company first.', 'error'); return; }

  el('reqEmployee').innerHTML = '<option value="">Loading...</option>';
  el('reqLeaveType').innerHTML = '<option value="">Loading...</option>';
  el('balanceHint').textContent = '';
  ['employee_id', 'leave_type_id', 'start_date', 'end_date'].forEach((f) => { el(`err-${f}`).textContent = ''; });
  el('reqStart').value = '';
  el('reqEnd').value = '';
  el('reqReason').value = '';

  const [empRes, typeRes] = await Promise.all([
    fetch(`/api/employees?company_id=${companyId}&status=active&limit=100`),
    fetch(`/api/leave-types?company_id=${companyId}`),
  ]);
  const empJson = await empRes.json();
  const typeJson = await typeRes.json();

  const employees = empJson.data || [];
  const types = typeJson.data || [];

  el('reqEmployee').innerHTML = employees.length
    ? employees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.employee_id)})</option>`).join('')
    : '<option value="">No active employees</option>';

  el('reqLeaveType').innerHTML = types.length
    ? types.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')
    : '<option value="">No leave types — add one first</option>';

  requestModal.hidden = false;
  updateBalanceHint();
}

async function updateBalanceHint() {
  const companyId = getCurrentCompanyId();
  const employeeId = el('reqEmployee').value;
  const leaveTypeId = el('reqLeaveType').value;
  if (!employeeId || !leaveTypeId) { el('balanceHint').textContent = ''; return; }

  try {
    const res = await fetch(`/api/leave-requests/balance?company_id=${companyId}&employee_id=${employeeId}`);
    const json = await res.json();
    const match = (json.data || []).find((b) => String(b.leave_type_id) === String(leaveTypeId));
    if (match) {
      el('balanceHint').textContent = `${match.remaining} of ${match.days_per_year} day(s) remaining this year.`;
    }
  } catch (err) {
    // silent — the hint is a convenience, not required to submit
  }
}
el('reqEmployee').addEventListener('change', updateBalanceHint);
el('reqLeaveType').addEventListener('change', updateBalanceHint);

el('cancelRequestBtn').addEventListener('click', () => { requestModal.hidden = true; });

el('requestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  ['employee_id', 'leave_type_id', 'start_date', 'end_date'].forEach((f) => { el(`err-${f}`).textContent = ''; });

  const payload = {
    company_id: getCurrentCompanyId(),
    employee_id: el('reqEmployee').value,
    leave_type_id: el('reqLeaveType').value,
    start_date: el('reqStart').value,
    end_date: el('reqEnd').value,
    reason: el('reqReason').value,
  };

  try {
    const res = await fetch('/api/leave-requests', {
      method: 'POST',
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
      throw new Error(json.message || 'Failed to submit leave request');
    }
    requestModal.hidden = true;
    showAlert('Leave request submitted.');
    loadRequests();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// --- Approve / Reject ---
const decisionModal = el('decisionModal');
function openDecision(id, status) {
  decisionTargetId = id;
  decisionStatus = status;
  el('decisionTitle').textContent = status === 'approved' ? 'Approve Leave' : 'Reject Leave';
  el('confirmDecisionBtn').textContent = status === 'approved' ? 'Approve' : 'Reject';
  el('decisionNote').value = '';
  decisionModal.hidden = false;
}
el('cancelDecisionBtn').addEventListener('click', () => { decisionModal.hidden = true; });

el('decisionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const res = await fetch(`/api/leave-requests/${decisionTargetId}/decision`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: decisionStatus, decision_note: el('decisionNote').value }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to save decision');
    decisionModal.hidden = true;
    showAlert(decisionStatus === 'approved' ? 'Leave approved.' : 'Leave rejected.');
    loadRequests();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

async function deleteRequest(id) {
  if (!confirm('Delete this leave request? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/leave-requests/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const json = await res.json();
      throw new Error(json.message || 'Delete failed');
    }
    showAlert('Leave request deleted.');
    loadRequests();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

// Init — wait a tick for renderNav() to resolve the current company.
setTimeout(refreshAll, 300);
