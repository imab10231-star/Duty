const el = (id) => document.getElementById(id);
const alertBox = el('alertBox');
const noCompanyNotice = el('noCompanyNotice');

function showGlobalAlert(message, type = 'success') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.hidden = false;
  setTimeout(() => { alertBox.hidden = true; }, 3500);
}
window.showGlobalAlert = showGlobalAlert;

const departmentManager = createLookupManager({
  apiPath: '/api/departments',
  tableBodyId: 'departmentTableBody',
  label: 'Department',
  varName: 'departmentManager',
});

const designationManager = createLookupManager({
  apiPath: '/api/designations',
  tableBodyId: 'designationTableBody',
  label: 'Designation',
  varName: 'designationManager',
});

let activeManager = null;

function wrapOpenAdd(manager) {
  return () => { activeManager = manager; manager.openAdd(); };
}
function wrapOpenEdit(manager) {
  return (id, name) => { activeManager = manager; manager.openEdit(id, name); };
}
function wrapOpenDelete(manager) {
  return (id, name, count) => { activeManager = manager; manager.openDelete(id, name, count); };
}

// Re-point the manager methods used by inline onclick handlers so we know
// which manager (department or designation) the shared modal is acting for.
departmentManager.openAdd = wrapOpenAdd(departmentManager);
departmentManager.openEdit = wrapOpenEdit(departmentManager);
departmentManager.openDelete = wrapOpenDelete(departmentManager);
designationManager.openAdd = wrapOpenAdd(designationManager);
designationManager.openEdit = wrapOpenEdit(designationManager);
designationManager.openDelete = wrapOpenDelete(designationManager);

function refreshAll() {
  const companyId = getCurrentCompanyId();
  noCompanyNotice.hidden = Boolean(companyId);
  departmentManager.load();
  designationManager.load();
}

document.addEventListener('company-changed', refreshAll);

// --- Shared Add/Edit modal ---
el('lookupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('lookupNameError').textContent = '';
  const name = el('lookupName').value.trim();
  if (!name) { el('lookupNameError').textContent = 'Name is required'; return; }

  try {
    await activeManager.save(name);
    el('lookupModal').hidden = true;
    showGlobalAlert('Saved.');
    activeManager.load();
  } catch (err) {
    el('lookupNameError').textContent = err.message;
  }
});
el('lookupCancelBtn').addEventListener('click', () => { el('lookupModal').hidden = true; });

// --- Shared Delete modal ---
el('lookupCancelDeleteBtn').addEventListener('click', () => { el('lookupDeleteModal').hidden = true; });
el('lookupConfirmDeleteBtn').addEventListener('click', async () => {
  try {
    await activeManager.remove();
    el('lookupDeleteModal').hidden = true;
    showGlobalAlert('Deleted.');
    activeManager.load();
  } catch (err) {
    showGlobalAlert(err.message, 'error');
  }
});

// Init — wait a tick for renderNav() to resolve the current company.
setTimeout(refreshAll, 300);
