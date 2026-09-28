require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const companyRoutes = require('./routes/company.routes');
const employeeRoutes = require('./routes/employee.routes');
const lookupRoutes = require('./routes/lookup.routes');
const shiftRoutes = require('./routes/shift.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const leaveTypeRoutes = require('./routes/leaveType.routes');
const leaveRoutes = require('./routes/leave.routes');
const payrollRoutes = require('./routes/payroll.routes');
const deviceRoutes = require('./routes/device.routes');
const reportRoutes = require('./routes/report.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/companies', companyRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave-types', leaveTypeRoutes);
app.use('/api/leave-requests', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', lookupRoutes); // /api/departments, /api/designations

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Duty server running on http://localhost:${PORT}`);
});
