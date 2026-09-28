const express = require('express');
const router = express.Router();
const { list, listManaged, create, update, remove } = require('../controllers/shift.controller');

router.get('/', list);
router.get('/managed', listManaged);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);

module.exports = router;
