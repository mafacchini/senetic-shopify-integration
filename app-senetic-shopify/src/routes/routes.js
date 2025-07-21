const express = require('express');
const router = express.Router();
const Controller = require('../controllers/controller');
const controller = new Controller();

router.get('/senetic-inventory', controller.showSeneticInventory.bind(controller));
router.get('/senetic-catalogue', controller.showSeneticCatalogue.bind(controller));
router.get('/import-shopify', controller.importToShopify.bind(controller));
router.post('/api/import/trigger', controller.importToShopify.bind(controller));
router.get('/api/health', controller.healthCheck.bind(controller));
router.get('/api/status', controller.healthCheck.bind(controller));
router.get('/api/products/count', controller.countShopifyProducts.bind(controller));

module.exports = router;