const express = require('express');
const router = express.Router();
const {
  list, create, update, remove, testConnection, syncUsers, downloadLogs,
} = require('../controllers/device.controller');

router.get('/', list);
router.post('/', create);
router.put('/:id', update);
router.delete('/:id', remove);
router.post('/:id/test-connection', testConnection);
router.post('/:id/sync-users', syncUsers);
router.post('/:id/download-logs', downloadLogs);

module.exports = router;
