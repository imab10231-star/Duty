const express = require('express');
const router = express.Router();
const { generate, list, update, finalize, remove } = require('../controllers/payroll.controller');

router.post('/generate', generate);
router.get('/', list);
router.put('/:id/finalize', finalize);
router.put('/:id', update);
router.delete('/:id', remove);

module.exports = router;
