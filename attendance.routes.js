const express = require('express');
const router = express.Router();
const { createPunch, deletePunch, listLogs, getSummary } = require('../controllers/attendance.controller');

router.get('/summary', getSummary);
router.get('/logs', listLogs);
router.post('/punches', createPunch);
router.delete('/punches/:id', deletePunch);

module.exports = router;
