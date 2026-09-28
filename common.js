// Shared across pages: top navigation + "current company" selector.
// Stored in localStorage for now — once auth/login is built, the company
// context will come from the logged-in session instead of this selector.

const CURRENT_COMPANY_KEY = 'duty_company_id';

function getCurrentCompanyId() {
  return localStorage.getItem(CURRENT_COMPANY_KEY) || '';
}

function setCurrentCompanyId(id) {
  localStorage.setItem(CURRENT_COMPANY_KEY, id);
  document.dispatchEvent(new CustomEvent('company-changed', { detail: { id } }));
}

async function renderNav(activePage) {
  const nav = document.getElementById('navBar');
  if (!nav) return;

  nav.innerHTML = `
    <div class="nav-links">
      <a href="dashboard.html" class="${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a>
      <a href="index.html" class="${activePage === 'companies' ? 'active' : ''}">Companies</a>
      <a href="employees.html" class="${activePage === 'employees' ? 'active' : ''}">Employees</a>
      <a href="department-designation.html" class="${activePage === 'department-designation' ? 'active' : ''}">Departments & Designations</a>
      <a href="shifts.html" class="${activePage === 'shifts' ? 'active' : ''}">Shifts</a>
      <a href="attendance.html" class="${activePage === 'attendance' ? 'active' : ''}">Attendance</a>
      <a href="leave.html" class="${activePage === 'leave' ? 'active' : ''}">Leave</a>
      <a href="payroll.html" class="${activePage === 'payroll' ? 'active' : ''}">Payroll</a>
      <a href="devices.html" class="${activePage === 'devices' ? 'active' : ''}">Devices</a>
      <a href="reports.html" class="${activePage === 'reports' ? 'active' : ''}">Reports</a>
    </div>
    <div class="nav-company">
      <label for="companySelect">Company:</label>
      <select id="companySelect"><option value="">Loading...</option></select>
    </div>
  `;

  const select = document.getElementById('companySelect');

  try {
    const res = await fetch('/api/companies?limit=100&status=active');
    const json = await res.json();
    const companies = json.data || [];

    if (companies.length === 0) {
      select.innerHTML = '<option value="">No companies yet</option>';
      return;
    }

    select.innerHTML = companies.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');

    const saved = getCurrentCompanyId();
    if (saved && companies.some((c) => String(c.id) === saved)) {
      select.value = saved;
    } else {
      setCurrentCompanyId(select.value);
    }
  } catch (err) {
    select.innerHTML = '<option value="">Failed to load companies</option>';
  }

  select.addEventListener('change', () => setCurrentCompanyId(select.value));
}
