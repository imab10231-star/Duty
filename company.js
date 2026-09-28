const API_BASE = '/api/companies';

const state = {
  search: '',
  status: '',
  page: 1,
  limit: 10,
  deleteTargetId: null,
};

const el = (id) => document.getElementById(id);
const tableBody = el('companyTableBody');
const alertBox = el('alertBox');

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

async function fetchCompanies() {
  tableBody.innerHTML = '<tr><td colspan="6" class="empty">Loading...</td></tr>';
  const params = new URLSearchParams({
    search: state.search,
    status: state.status,
    page: state.page,
    limit: state.limit,
  });

  try {
    const res = await fetch(`${API_BASE}?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load companies');
    renderTable(json.data);
    renderPagination(json.pagination);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable(companies) {
  if (companies.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No companies found.</td></tr>';
    return;
  }

  tableBody.innerHTML = companies.map((c) => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.email)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td><span class="badge badge-${c.status}">${escapeHtml(c.status)}</span></td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
      <td>
        <button class="btn-link" onclick="openEdit(${c.id})">Edit</button>
        <button class="btn-link danger" onclick="openDelete(${c.id}, '${escapeHtml(c.name).replace(/'/g, "\\'")}')">Delete</button>
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
  fetchCompanies();
}

// --- Search / Filter ---
let searchDebounce;
el('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.search = e.target.value;
    state.page = 1;
    fetchCompanies();
  }, 300);
});

el('statusFilter').addEventListener('change', (e) => {
  state.status = e.target.value;
  state.page = 1;
  fetchCompanies();
});

// --- Add / Edit Modal ---
const companyModal = el('companyModal');
const companyForm = el('companyForm');

function clearFieldErrors() {
  ['name', 'email', 'phone'].forEach((f) => { el(`err-${f}`).textContent = ''; });
}

function openAdd() {
  el('modalTitle').textContent = 'Add Company';
  companyForm.reset();
  el('companyId').value = '';
  el('status').value = 'active';
  clearFieldErrors();
  companyModal.hidden = false;
}

async function openEdit(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load company');
    const c = json.data;
    el('modalTitle').textContent = 'Edit Company';
    el('companyId').value = c.id;
    el('name').value = c.name;
    el('email').value = c.email;
    el('phone').value = c.phone;
    el('address').value = c.address || '';
    el('status').value = c.status;
    clearFieldErrors();
    companyModal.hidden = false;
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

el('addBtn').addEventListener('click', openAdd);
el('cancelBtn').addEventListener('click', () => { companyModal.hidden = true; });

companyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors();

  const id = el('companyId').value;
  const payload = {
    name: el('name').value,
    email: el('email').value,
    phone: el('phone').value,
    address: el('address').value,
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

    companyModal.hidden = true;
    showAlert(isEdit ? 'Company updated.' : 'Company added.');
    fetchCompanies();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// --- Delete Confirmation ---
const deleteModal = el('deleteModal');

function openDelete(id, name) {
  state.deleteTargetId = id;
  el('deleteCompanyName').textContent = name;
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
    showAlert('Company deleted.');
    fetchCompanies();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// Init
fetchCompanies();
