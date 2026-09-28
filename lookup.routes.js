const express = require('express');
const router = express.Router();
const lookup = require('../controllers/lookup.controller');

router.get('/departments', lookup.departments.list);
router.get('/departments/managed', lookup.departments.listManaged);
router.post('/departments', lookup.departments.create);
router.put('/departments/:id', lookup.departments.update);
router.delete('/departments/:id', lookup.departments.remove);

router.get('/designations', lookup.designations.list);
router.get('/designations/managed', lookup.designations.listManaged);
router.post('/designations', lookup.designations.create);
router.put('/designations/:id', lookup.designations.update);
router.delete('/designations/:id', lookup.designations.remove);

module.exports = router;
