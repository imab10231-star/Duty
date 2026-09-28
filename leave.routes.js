const express = require('express');
const router = express.Router();
const { list, create, decide, remove, getBalance } = require('../controllers/leave.controller');

router.get('/balance', getBalance);
router.get('/', list);
router.post('/', create);
router.put('/:id/decision', decide);
router.delete('/:id', remove);

module.exports = router;
