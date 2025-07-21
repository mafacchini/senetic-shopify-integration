const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Routes
const routes = require('./routes/routes');
app.use('/', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Senetic-Shopify Import App',
    version: '1.0.0',
    endpoints: {
      inventory: '/senetic-inventory',
      catalogue: '/senetic-catalogue',
      import: '/import-shopify',
      health: '/api/health'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Senetic-Shopify Import App running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📦 Senetic Inventory: http://localhost:${PORT}/senetic-inventory`);
  console.log(`📋 Senetic Catalogue: http://localhost:${PORT}/senetic-catalogue`);
  console.log(`🔄 Import Shopify: http://localhost:${PORT}/import-shopify`);
  console.log(`🔧 API Health: http://localhost:${PORT}/api/health`);
});

module.exports = app;