#!/usr/bin/env node

require('dotenv').config();
const AutoImporter = require('./auto-import');

class ManualImporter extends AutoImporter {
  constructor() {
    super();
    this.importType = process.env.IMPORT_TYPE || 'standard';
    this.maxProducts = parseInt(process.env.MAX_PRODUCTS) || 10;
    this.categories = process.env.CATEGORIES?.split(',') || ['Sistemi di sorveglianza', 'Reti'];
  }

  async run() {
    this.log('🎮 Avvio import manuale Senetic → Shopify');
    this.log(`📊 Tipo: ${this.importType}`);
    this.log(`📦 Max prodotti: ${this.maxProducts}`);
    this.log(`📋 Categorie: ${this.categories.join(', ')}`);
    
    try {
      // Personalizza il controller per l'import manuale
      this.customizeController();
      
      await super.run();
      
    } catch (error) {
      this.log(`❌ Errore import manuale: ${error.message}`, 'ERROR');
      process.exit(1);
    }
  }

  customizeController() {
    // Qui puoi personalizzare il comportamento del controller
    // basandoti sui parametri dell'import manuale
    
    if (this.importType === 'force') {
      this.log('🔥 Modalità FORCE: Tutti i prodotti verranno ricreati');
    } else if (this.importType === 'test') {
      this.log('🧪 Modalità TEST: Solo verifica senza modifiche');
    }
  }
}

// Esegui l'importer manuale
const importer = new ManualImporter();
importer.run().catch(error => {
  console.error('💥 Errore fatale:', error);
  process.exit(1);
});