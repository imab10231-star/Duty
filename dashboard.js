const el = (id) => document.getElementById(id);
const alertBox = el('alertBox');
const noCompanyNotice = el('noCompanyNotice');

function showAlert(message, type = 'success') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.hidden = false;
  setTimeout(() => { alertBox.hidden = true; }, 3500);
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function loadDashboard() {
  const companyId = getCurrentCompanyId();
  if (!companyId) {
    noCompanyNotice.hidden = false;
    return;
  }
  noCompanyNotice.hidden = true;

  try {
    const res = await fetch(`/api/dashboard/summary?company_id=${companyId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to load dashboard');
    render(json);
  } catch (err) {
    showAlert(err.message, 'error');
  }
}

function render(d) {
  el('cardEmployees').textContent = d.employees.total;
  el('cardEmployeesSub').textContent = `${d.employees.active} active, ${d.employees.inactive} inactive`;

  const a = d.attendance_today;
  el('cardAttendance').textContent = `${a.present} / ${d.employees.active || 0}`;
  el('cardAttendanceSub').textContent = `Present today — ${a.absent} absent, ${a.late} late, ${a.leave} on leave, ${a.half_day} half-day`;

  el('cardLeave').textContent = d.leave.pending;

  const p = d.payroll;
  el('cardPayroll').textContent = p.total ? Number(p.total_net_payable).toLocaleString() : '—';
  el('cardPayrollSub').textContent = p.total
    ? `${MONTH_NAMES[d.month]} ${d.year} — ${p.finalized} finalized, ${p.draft} draft`
    : `Not generated for ${MONTH_NAMES[d.month]} ${d.year} yet`;

  const dev = d.devices;
  el('cardDevices').textContent = dev.total;
  el('cardDevicesSub').textContent = dev.total
    ? `${dev.online} online, ${dev.offline} offline, ${dev.unknown} unknown`
    : 'No devices added yet';
}

document.addEventListener('company-changed', loadDashboard);

// Init — wait a tick for renderNav() to resolve the current company.
setTimeout(loadDashboard, 300);
