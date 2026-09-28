const express = require('express');
const router = express.Router();
const { summary } = require('../controllers/dashboard.controller');

router.get('/summary', summary);

module.exports = router;
