#!/usr/bin/env node

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Controller = require('../controllers/controller');

class AutoImporter {
  constructor() {
    this.controller = new Controller();
    this.logDir = path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, `import-${new Date().toISOString().split('T')[0]}.log`);
    this.ensureLogDirectory();
    this.startTime = Date.now();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    console.log(logEntry.trim());
    fs.appendFileSync(this.logFile, logEntry);
  }

  async run() {
    this.log('🚀 Avvio import automatico Senetic → Shopify');
    this.log(`📊 Configurazione: Force=${process.env.FORCE_IMPORT}`);
    
    try {
      // Verifica configurazione
      await this.verifyConfiguration();
      
      // Esegui health check
      await this.healthCheck();
      
      // Esegui import
      const results = await this.executeImport();
      
      // Genera report
      await this.generateReport(results);
      
      this.log('✅ Import completato con successo');
      process.exit(0);
      
    } catch (error) {
      this.log(`❌ Errore critico: ${error.message}`, 'ERROR');
      this.log(`📍 Stack trace: ${error.stack}`, 'ERROR');
      
      // Genera report di errore
      await this.generateErrorReport(error);
      
      process.exit(1);
    }
  }

  async verifyConfiguration() {
    this.log('🔍 Verifica configurazione...');
    
    const requiredEnvVars = [
      'SENETIC_AUTH',
      'SHOPIFY_STORE_URL', 
      'SHOPIFY_ACCESS_TOKEN'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Variabile di ambiente mancante: ${envVar}`);
      }
    }
    
    this.log('✅ Configurazione verificata');
  }

  async healthCheck() {
    this.log('🏥 Esecuzione health check...');
    
    // Simula una request per il health check
    const mockRes = {
      json: (data) => {
        if (data.success && data.status === 'healthy') {
          this.log('✅ Health check: Sistema operativo');
          this.log(`📦 Shopify: ${data.services.shopify.status}`);
          this.log(`🔗 Senetic: ${data.services.senetic.status}`);
          return data;
        } else {
          throw new Error(`Health check fallito: ${data.status}`);
        }
      },
      status: (code) => ({
        json: (data) => {
          throw new Error(`Health check fallito: ${JSON.stringify(data)}`);
        }
      })
    };

    await this.controller.healthCheck({}, mockRes);
  }

  async executeImport() {
    this.log('🔄 Esecuzione import prodotti...');
    
    return new Promise((resolve, reject) => {
      const mockRes = {
        json: (data) => {
          if (data.success) {
            this.log(`📊 Import completato: ${JSON.stringify(data.summary)}`);
            this.log(`⏱️ Durata: ${data.duration}s`);
            this.log(`📦 Importati: ${data.summary.imported}`);
            this.log(`🔄 Aggiornati: ${data.summary.updated}`);
            this.log(`❌ Falliti: ${data.summary.failed}`);
            
            if (data.summary.errors && data.summary.errors.length > 0) {
              this.log('⚠️ Errori riscontrati:', 'WARN');
              data.summary.errors.forEach(error => {
                this.log(`  - ${error.sku}: ${error.error}`, 'WARN');
              });
            }
            
            resolve(data);
          } else {
            reject(new Error(`Import fallito: ${data.error}`));
          }
        },
        status: (code) => ({
          json: (data) => {
            reject(new Error(`Import fallito con status ${code}: ${JSON.stringify(data)}`));
          }
        })
      };

      this.controller.importToShopify({}, mockRes);
    });
  }

  async generateReport(results) {
    this.log('📋 Generazione report...');
    
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    const report = {
      timestamp: new Date().toISOString(),
      duration: duration,
      status: 'success',
      summary: results.summary,
      environment: {
        node_version: process.version,
        platform: process.platform,
        github_run_id: process.env.GITHUB_RUN_ID,
        github_run_number: process.env.GITHUB_RUN_NUMBER
      },
      products: results.risultati || []
    };

    const reportFile = path.join(this.logDir, `report-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    this.log(`📄 Report salvato: ${reportFile}`);
  }

  async generateErrorReport(error) {
    this.log('📋 Generazione report errore...');
    
    const duration = Math.round((Date.now() - this.startTime) / 1000);
    const report = {
      timestamp: new Date().toISOString(),
      duration: duration,
      status: 'error',
      error: {
        message: error.message,
        stack: error.stack
      },
      environment: {
        node_version: process.version,
        platform: process.platform,
        github_run_id: process.env.GITHUB_RUN_ID,
        github_run_number: process.env.GITHUB_RUN_NUMBER
      }
    };

    const reportFile = path.join(this.logDir, `error-report-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    this.log(`📄 Report errore salvato: ${reportFile}`);
  }
}

// Gestione segnali per graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Ricevuto SIGTERM, terminazione in corso...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Ricevuto SIGINT, terminazione in corso...');
  process.exit(0);
});

// Esegui l'importer
const importer = new AutoImporter();
importer.run().catch(error => {
  console.error('💥 Errore fatale:', error);
  process.exit(1);
});