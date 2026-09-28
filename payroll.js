const el = (id) => document.getElementById(id);
const alertBox = el('alertBox');
const noCompanyNotice = el('noCompanyNotice');
const tableBody = el('payrollTableBody');

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

function money(n) { return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const now = new Date();
el('monthSelect').value = String(now.getMonth() + 1);
el('yearInput').value = now.getFullYear();

function currentPeriod() {
  return { month: el('monthSelect').value, year: el('yearInput').value };
}

async function loadPayroll() {
  const companyId = getCurrentCompanyId();
  if (!companyId) {
    noCompanyNotice.hidden = false;
    tableBody.innerHTML = '<tr><td colspan="14" class="empty">No company selected.</td></tr>';
    return;
  }
  noCompanyNotice.hidden = true;

  const { month, year } = currentPeriod();
  tableBody.innerHTML = '<tr><td colspan="14" class="empty">Loading...</td></tr>';

  try {
    const res = await fetch(`/api/payroll?company_id=${companyId}&month=${month}&year=${year}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load payroll');
    renderTable(json.data);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="14" class="empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTable(rows) {
  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="14" class="empty">No payroll generated for this month yet.</td></tr>';
    return;
  }

  tableBody.innerHTML = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.employee_name)} <small class="hint">(${escapeHtml(r.employee_code)})</small></td>
      <td>${money(r.basic_salary)}</td>
      <td>${r.present_days}</td>
      <td>${r.absent_days}</td>
      <td>${r.half_days}</td>
      <td>${r.leave_days}</td>
      <td>${(r.overtime_minutes / 60).toFixed(1)}</td>
      <td>${money(r.absent_deduction)}</td>
      <td>${money(r.overtime_amount)}</td>
      <td>${money(r.bonus)}</td>
      <td>${money(r.other_deduction)}</td>
      <td><strong>${money(r.net_payable)}</strong></td>
      <td><span class="badge badge-${r.status === 'finalized' ? 'approved' : 'pending'}">${r.status}</span></td>
      <td>
        ${r.status === 'draft' ? `
          <button class="btn-link" onclick="openEdit(${r.id}, ${r.overtime_amount}, ${r.bonus}, ${r.other_deduction})">Edit</button>
          <button class="btn-link" onclick="finalizeRecord(${r.id})">Finalize</button>
          <button class="btn-link danger" onclick="deleteRecord(${r.id})">Delete</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

el('generateBtn').addEventListener('click', async () => {
  const companyId = getCurrentCompanyId();
  if (!companyId) { showAlert('Select a company first.', 'error'); return; }
  const { month, year } = currentPeriod();

  try {
    const res = await fetch('/api/payroll/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, month, year }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to generate payroll');

    showAlert(`Generated ${json.generated} payslip(s)${json.skippedFinalized ? `, ${json.skippedFinalized} already finalized (skipped)` : ''}.`);
    loadPayroll();
  } catch (err) {
    showAlert(err.message, 'error');
  }
});

el('monthSelect').addEventListener('change', loadPayroll);
el('yearInput').addEventListener('change', loadPayroll);
document.addEventListener('company-changed', loadPayroll);

// --- Edit modal ---
const editModal = el('editModal');
function openEdit(id, overtime, bonus, deduction) {
  el('editId').value = id;
  el('editOvertime').value = overtime;
  el('editBonus').value = bonus;
  el('editDeduction').value = deduction;
  el('err-edit').textContent = '';
  editModal.hidden = false;
}
el('cancelEditBtn').addEventListener('click', () => { editModal.hidden = true; });

el('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  el('err-edit').textContent = '';

  try {
    const res = await fetch(`/api/payroll/${el('editId').value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overtime_amount: el('editOvertime').value,
        bonus: el('editBonus').value,
        other_deduction: el('editDeduction').value,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Save failed');
    editModal.hidden = true;
    showAlert('Payslip updated.');
    loadPayroll();
  } catch (err) {
    el('err-edit').textContent = err.message;
  }
});

async function finalizeRecord(id) {
  if (!confirm('Finalize this payslip? It will be locked and cannot be edited or deleted afterward.')) return;
  try {
    const res = await fetch(`/api/payroll/${id}/finalize`, { method: 'PUT' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to finalize');
    showAlert('Payslip finalized.');
    loadPayroll();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

async function deleteRecord(id) {
  if (!confirm('Delete this draft payslip? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/payroll/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const json = await res.json();
      throw new Error(json.message || 'Delete failed');
    }
    showAlert('Payslip deleted.');
    loadPayroll();
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

// Init — wait a tick for renderNav() to resolve the current company.
setTimeout(loadPayroll, 300);
