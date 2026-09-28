const express = require('express');
const router = express.Router();
const { attendanceReport, leaveReport, payrollReport, employeeReport } = require('../controllers/report.controller');

router.get('/attendance', attendanceReport);
router.get('/leave', leaveReport);
router.get('/payroll', payrollReport);
router.get('/employees', employeeReport);

module.exports = router;
