// Generic list/add/edit/delete manager for a lookup table
// (departments, designations). Both pages behave identically —
// this factory avoids writing the same CRUD wiring twice.
function createLookupManager({ apiPath, tableBodyId, label, varName }) {
  const el = (id) => document.getElementById(id);
  const tableBody = el(tableBodyId);

  let editingId = null;
  let deleteTargetId = null;

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  async function load() {
    const companyId = getCurrentCompanyId();
    if (!companyId) {
      tableBody.innerHTML = `<tr><td colspan="3" class="empty">No company selected.</td></tr>`;
      return;
    }
    tableBody.innerHTML = `<tr><td colspan="3" class="empty">Loading...</td></tr>`;

    try {
      const res = await fetch(`${apiPath}/managed?company_id=${companyId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `Failed to load ${label.toLowerCase()}s`);
      render(json.data);
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="3" class="empty">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function render(items) {
    if (items.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="3" class="empty">No ${label.toLowerCase()}s yet.</td></tr>`;
      return;
    }
    tableBody.innerHTML = items.map((item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.employee_count}</td>
        <td>
          <button class="btn-link" onclick="${varName}.openEdit(${item.id}, '${escapeHtml(item.name).replace(/'/g, "\\'")}')">Edit</button>
          <button class="btn-link danger" onclick="${varName}.openDelete(${item.id}, '${escapeHtml(item.name).replace(/'/g, "\\'")}', ${item.employee_count})">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  function openAdd() {
    const companyId = getCurrentCompanyId();
    if (!companyId) { window.showGlobalAlert('Select a company first.', 'error'); return; }
    editingId = null;
    el('lookupModalTitle').textContent = `Add ${label}`;
    el('lookupNameLabel').textContent = `${label} Name *`;
    el('lookupName').value = '';
    el('lookupNameError').textContent = '';
    el('lookupModal').hidden = false;
    el('lookupName').focus();
  }

  function openEdit(id, name) {
    editingId = id;
    el('lookupModalTitle').textContent = `Edit ${label}`;
    el('lookupNameLabel').textContent = `${label} Name *`;
    el('lookupName').value = name;
    el('lookupNameError').textContent = '';
    el('lookupModal').hidden = false;
    el('lookupName').focus();
  }

  function openDelete(id, name, employeeCount) {
    deleteTargetId = id;
    const usageNote = employeeCount > 0
      ? ` ${employeeCount} employee(s) currently use it — they will be set to no ${label.toLowerCase()} instead of being deleted.`
      : '';
    el('lookupDeleteMessage').textContent = `Delete "${name}"? This cannot be undone.${usageNote}`;
    el('lookupDeleteModal').hidden = false;
  }

  async function save(name) {
    const companyId = getCurrentCompanyId();
    const isEdit = Boolean(editingId);
    const url = isEdit ? `${apiPath}/${editingId}` : apiPath;
    const method = isEdit ? 'PUT' : 'POST';
    const body = isEdit ? { name } : { company_id: companyId, name };

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Save failed');
    return json.data;
  }

  async function remove() {
    const res = await fetch(`${apiPath}/${deleteTargetId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const json = await res.json();
      throw new Error(json.message || 'Delete failed');
    }
  }

  return { load, openAdd, openEdit, openDelete, save, remove, get editingId() { return editingId; } };
}
