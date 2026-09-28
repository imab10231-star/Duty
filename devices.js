const API_BASE = '/api/devices';

const el = (id) => document.getElementById(id);
const tableBody = el('deviceTableBody');
const alertBox = el('alertBox');
const noCompanyNotice = el('noCompanyNotice');

let deleteTargetId = null;

function showAlert(message, type = 'success') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.hidden = false;
  setTimeout(() => { alertBox.hidden = true; }, 4000);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function fetchDevices() {
  const companyId = getCurrentCompanyId();
  if (!companyId) {
    noCompanyNotice.hidden = false;
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No company selected.</td></tr>';
    return;
  }
  noCompanyNotice.hidden = true;
  tableBody.innerHTML = '<tr><td colspan="6" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`${API_BASE}?company_id=${companyId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load devices');
    renderTable(json.data);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable(devices) {
  if (devices.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty">No devices yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = devices.map((d) => `
    <tr>
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.ip_address)}:${d.port}</td>
      <td>${escapeHtml(d.location || '—')}</td>
      <td><span class="badge badge-${d.status}">${d.status}</span></td>
      <td>${d.last_sync_at ? new Date(d.last_sync_at).toLocaleString() : 'Never'}</td>
      <td>
        <button class="btn-link" onclick="testConnection(${d.id})">Test</button>
        <button class="btn-link" onclick="syncUsers(${d.id})">Sync Users</button>
        <button class="btn-link" onclick="downloadLogs(${d.id})">Download Logs</button>
        <button class="btn-link" onclick="openEdit(${d.id})">Edit</button>
        <button class="btn-link danger" onclick="openDelete(${d.id}, '${escapeHtml(d.name).replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

// --- Add / Edit ---
const deviceModal = el('deviceModal');
const deviceForm = el('deviceForm');
const FIELD_ERROR_IDS = ['name', 'ip_address'];
function clearFieldErrors() { FIELD_ERROR_IDS.forEach((f) => { el(`err-${f}`).textContent = ''; }); }

function openAdd() {
  const companyId = getCurrentCompanyId();
  if (!companyId) { showAlert('Select a company first.', 'error'); return; }
  el('modalTitle').textContent = 'Add Device';
  deviceForm.reset();
  el('deviceId').value = '';
  el('port').value = 4370;
  clearFieldErrors();
  deviceModal.hidden = false;
}

async function openEdit(id) {
  try {
    const res = await fetch(`${API_BASE}?company_id=${getCurrentCompanyId()}`);
    const json = await res.json();
    const device = (json.data || []).find((d) => d.id === id);
    if (!device) throw new Error('Device not found');

    el('modalTitle').textContent = 'Edit Device';
    el('deviceId').value = device.id;
    el('name').value = device.name;
    el('ip_address').value = device.ip_address;
    el('port').value = device.port;
    el('location').value = device.location || '';
    el('model').value = device.model || '';
    clearFieldErrors();
    deviceModal.hidden = false;
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

el('addBtn').addEventListener('click', openAdd);
el('cancelBtn').addEventListener('click', () => { deviceModal.hidden = true; });

deviceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors();

  const id = el('deviceId').value;
  const payload = {
    company_id: getCurrentCompanyId(),
    name: el('name').value,
    ip_address: el('ip_address').value,
    port: el('port').value,
    location: el('location').value,
    model: el('model').value,
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
    deviceModal.hidden = true;
    showAlert(isEdit ? 'Device updated.' : 'Device added.');
    fetchDevices();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// --- Delete ---
const deleteModal = el('deleteModal');
function openDelete(id, name) {
  deleteTargetId = id;
  el('deleteMessage').textContent = `Delete "${name}"? This cannot be undone.`;
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
    showAlert('Device deleted.');
    fetchDevices();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

// --- Test Connection ---
async function testConnection(id) {
  showAlert('Testing connection...');
  try {
    const res = await fetch(`${API_BASE}/${id}/test-connection`, { method: 'POST' });
    const json = await res.json();
    if (json.reachable) {
      showAlert('Device is reachable.');
    } else {
      showAlert(`Could not reach device: ${json.error}`, 'error');
    }
    fetchDevices();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

// --- Sync Users / Mapping ---
const usersModal = el('usersModal');

async function syncUsers(id) {
  showAlert('Fetching users from device...');
  try {
    const res = await fetch(`${API_BASE}/${id}/sync-users`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to sync users');

    const empRes = await fetch(`/api/employees?company_id=${getCurrentCompanyId()}&status=active&limit=100`);
    const empJson = await empRes.json();
    const employees = empJson.data || [];

    renderUsers(json.data, employees);
    usersModal.hidden = false;
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

function renderUsers(deviceUsers, employees) {
  const body = el('usersTableBody');
  if (deviceUsers.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="empty">No users found on this device.</td></tr>';
    return;
  }

  body.innerHTML = deviceUsers.map((u) => `
    <tr>
      <td>${escapeHtml(u.device_user_id)}</td>
      <td>${escapeHtml(u.device_name || '—')}</td>
      <td>
        <select onchange="mapEmployee('${u.device_user_id}', this.value)">
          <option value="">— Not mapped —</option>
          ${employees.map((e) => `
            <option value="${e.id}" ${e.id === u.mapped_employee_id ? 'selected' : ''}>
              ${escapeHtml(e.name)} (${escapeHtml(e.employee_id)})
            </option>
          `).join('')}
        </select>
      </td>
    </tr>
  `).join('');
}

async function mapEmployee(deviceUserId, employeeId) {
  if (!employeeId) return; // unmapping via the dropdown isn't offered here — pick "Not mapped" has no effect once set; edit the employee directly to clear it
  try {
    const res = await fetch(`/api/employees/${employeeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_user_id: deviceUserId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to map employee');
    showAlert('Employee mapped to device user.');
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

el('closeUsersBtn').addEventListener('click', () => { usersModal.hidden = true; });

// --- Download Logs ---
async function downloadLogs(id) {
  showAlert('Downloading attendance logs from device...');
  try {
    const res = await fetch(`${API_BASE}/${id}/download-logs`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to download logs');

    showAlert(`Downloaded ${json.deviceTotal} punch(es): ${json.inserted} added, ${json.unmapped} skipped (no mapped employee).`);
    fetchDevices();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

document.addEventListener('company-changed', fetchDevices);

// Init — wait a tick for renderNav() to resolve the current company.
setTimeout(fetchDevices, 300);
