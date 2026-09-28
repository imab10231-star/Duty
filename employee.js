const API_BASE = '/api/employees';

const state = {
  search: '',
  status: '',
  departmentId: '',
  page: 1,
  limit: 10,
  deleteTargetId: null,
};

const el = (id) => document.getElementById(id);
const tableBody = el('employeeTableBody');
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

function currentCompanyId() {
  return getCurrentCompanyId();
}

// --- Load employees ---
async function fetchEmployees() {
  const companyId = currentCompanyId();
  if (!companyId) {
    noCompanyNotice.hidden = false;
    tableBody.innerHTML = '<tr><td colspan="8" class="empty">No company selected.</td></tr>';
    el('pagination').innerHTML = '';
    return;
  }
  noCompanyNotice.hidden = true;

  tableBody.innerHTML = '<tr><td colspan="8" class="empty">Loading...</td></tr>';
  const params = new URLSearchParams({
    company_id: companyId,
    search: state.search,
    status: state.status,
    department_id: state.departmentId,
    page: state.page,
    limit: state.limit,
  });

  try {
    const res = await fetch(`${API_BASE}?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load employees');
    renderTable(json.data);
    renderPagination(json.pagination);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="8" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable(employees) {
  if (employees.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" class="empty">No employees found.</td></tr>';
    return;
  }

  tableBody.innerHTML = employees.map((e) => `
    <tr>
      <td>${escapeHtml(e.employee_id)}</td>
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.phone)}</td>
      <td>${escapeHtml(e.department_name || '—')}</td>
      <td>${escapeHtml(e.designation_name || '—')}</td>
      <td>${escapeHtml(e.shift_name || '—')}</td>
      <td><span class="badge badge-${e.status}">${escapeHtml(e.status)}</span></td>
      <td>
        <button class="btn-link" onclick="openEdit(${e.id})">Edit</button>
        <button class="btn-link danger" onclick="openDelete(${e.id}, '${escapeHtml(e.name).replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function renderPagination(pagination) {
  const { page, totalPages } = pagination;
  const box = el('pagination');
  if (totalPages <= 1) { box.innerHTML = ''; return; }

  let html = '';
  html += `<button ${page <= 1 ? 'disabled' : ''} onclick="goToPage(${page - 1})">Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  html += `<button ${page >= totalPages ? 'disabled' : ''} onclick="goToPage(${page + 1})">Next</button>`;
  box.innerHTML = html;
}

function goToPage(page) {
  state.page = page;
  fetchEmployees();
}

// --- Lookup dropdowns (departments / designations / shifts) ---
async function loadLookup(type, selectEl, includeEmptyLabel) {
  const companyId = currentCompanyId();
  selectEl.innerHTML = includeEmptyLabel ? `<option value="">${includeEmptyLabel}</option>` : '';
  if (!companyId) return;

  try {
    const res = await fetch(`/api/${type}s?company_id=${companyId}`);
    const json = await res.json();
    const items = json.data || [];
    selectEl.innerHTML += items.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
  } catch (err) {
    // silent — dropdown just stays with default option
  }
}

function refreshAllLookups() {
  loadLookup('department', el('departmentFilter'), 'All departments');
  loadLookup('department', el('department_id'), '— None —');
  loadLookup('designation', el('designation_id'), '— None —');
  loadLookup('shift', el('shift_id'), '— None —');
}

async function quickAdd(type) {
  const name = prompt(`New ${type} name:`);
  if (!name || !name.trim()) return;
  const companyId = currentCompanyId();
  if (!companyId) return;

  try {
    const res = await fetch(`/api/${type}s`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, name: name.trim() }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || `Failed to add ${type}`);

    const selectId = type === 'department' ? 'department_id' : type === 'designation' ? 'designation_id' : 'shift_id';
    await loadLookup(type, el(selectId), '— None —');
    el(selectId).value = json.data.id;
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

// --- Search / Filter ---
let searchDebounce;
el('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.search = e.target.value;
    state.page = 1;
    fetchEmployees();
  }, 300);
});

el('departmentFilter').addEventListener('change', (e) => {
  state.departmentId = e.target.value;
  state.page = 1;
  fetchEmployees();
});

el('statusFilter').addEventListener('change', (e) => {
  state.status = e.target.value;
  state.page = 1;
  fetchEmployees();
});

document.addEventListener('company-changed', () => {
  state.page = 1;
  refreshAllLookups();
  fetchEmployees();
});

// --- Add / Edit Modal ---
const employeeModal = el('employeeModal');
const employeeForm = el('employeeForm');
const FIELD_ERROR_IDS = ['employee_id', 'name', 'phone', 'email', 'joining_date', 'salary'];

function clearFieldErrors() {
  FIELD_ERROR_IDS.forEach((f) => { el(`err-${f}`).textContent = ''; });
}

function openAdd() {
  const companyId = currentCompanyId();
  if (!companyId) { showAlert('Select a company first.', 'error'); return; }

  el('modalTitle').textContent = 'Add Employee';
  employeeForm.reset();
  el('employeeRowId').value = '';
  el('status').value = 'active';
  clearFieldErrors();
  refreshAllLookups();
  employeeModal.hidden = false;
}

async function openEdit(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load employee');
    const e = json.data;

    el('modalTitle').textContent = 'Edit Employee';
    el('employeeRowId').value = e.id;
    el('employee_id').value = e.employee_id;
    el('name').value = e.name;
    el('phone').value = e.phone;
    el('email').value = e.email || '';
    el('joining_date').value = e.joining_date ? e.joining_date.slice(0, 10) : '';
    el('salary').value = e.salary;
    el('status').value = e.status;
    clearFieldErrors();

    await refreshAllLookups();
    el('department_id').value = e.department_id || '';
    el('designation_id').value = e.designation_id || '';
    el('shift_id').value = e.shift_id || '';

    employeeModal.hidden = false;
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

el('addBtn').addEventListener('click', openAdd);
el('cancelBtn').addEventListener('click', () => { employeeModal.hidden = true; });

employeeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors();

  const id = el('employeeRowId').value;
  const payload = {
    company_id: currentCompanyId(),
    employee_id: el('employee_id').value,
    name: el('name').value,
    phone: el('phone').value,
    email: el('email').value,
    department_id: el('department_id').value,
    designation_id: el('designation_id').value,
    shift_id: el('shift_id').value,
    joining_date: el('joining_date').value,
    salary: el('salary').value,
    status: el('status').value,
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

    employeeModal.hidden = true;
    showAlert(isEdit ? 'Employee updated.' : 'Employee added.');
    fetchEmployees();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// --- Delete Confirmation ---
const deleteModal = el('deleteModal');

function openDelete(id, name) {
  state.deleteTargetId = id;
  el('deleteEmployeeName').textContent = name;
  deleteModal.hidden = false;
}

el('cancelDeleteBtn').addEventListener('click', () => { deleteModal.hidden = true; });

el('confirmDeleteBtn').addEventListener('click', async () => {
  try {
    const res = await fetch(`${API_BASE}/${state.deleteTargetId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const json = await res.json();
      throw new Error(json.message || 'Delete failed');
    }
    deleteModal.hidden = true;
    showAlert('Employee deleted.');
    fetchEmployees();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// Init — wait for the shared nav to pick/load the current company first.
(async function init() {
  // renderNav() (called inline in the page) sets the company + dispatches
  // 'company-changed' asynchronously, so give it a tick before first load.
  setTimeout(() => {
    refreshAllLookups();
    fetchEmployees();
  }, 300);
})();
