class AdminImportManager {
  constructor() {
    this.apiBaseUrl = 'http://localhost:3000'; // ⬅️ Cambia con la tua URL di produzione
    this.isImporting = false;
    this.init();
  }

  init() {
    this.bindEvents();
    this.checkSystemStatus();
    this.loadProductStats();
    this.addLog('Sistema inizializzato', 'info');
  }

  bindEvents() {
    const importBtn = document.getElementById('import-btn');
    const checkStatusBtn = document.getElementById('check-status-btn');

    importBtn?.addEventListener('click', () => this.startImport());
    checkStatusBtn?.addEventListener('click', () => this.checkSystemStatus());
  }

  async checkSystemStatus() {
    try {
      this.addLog('Verifica stato sistema...', 'info');
      
      const response = await fetch(`${this.apiBaseUrl}/api/health`);
      const data = await response.json();

      if (data.success) {
        this.updateStatusIcon('shopify-status', data.services.shopify.status);
        this.updateStatusIcon('senetic-status', data.services.senetic.status);
        this.updateStatusIcon('system-status', data.status);
        
        this.addLog(`✅ Sistema: ${data.status}`, 'success');
        this.addLog(`📦 Shopify: ${data.services.shopify.status}`, 
                   data.services.shopify.status === 'connected' ? 'success' : 'error');
        this.addLog(`🔗 Senetic: ${data.services.senetic.status}`, 
                   data.services.senetic.status === 'connected' ? 'success' : 'error');
      } else {
        this.addLog('❌ Errore verifica stato', 'error');
      }
    } catch (error) {
      this.addLog(`❌ Errore connessione: ${error.message}`, 'error');
      this.updateStatusIcon('system-status', 'disconnected');
    }
  }

  async loadProductStats() {
    try {
      this.addLog('Caricamento statistiche prodotti...', 'info');
      
      const response = await fetch(`${this.apiBaseUrl}/api/products/count`);
      const data = await response.json();

      if (data.success) {
        document.getElementById('total-products').textContent = data.total_products;
        document.getElementById('hikvision-products').textContent = data.vendor_counts.Hikvision || 0;
        document.getElementById('ubiquiti-products').textContent = data.vendor_counts.Ubiquiti || 0;
        
        this.addLog(`📊 Trovati ${data.total_products} prodotti`, 'success');
      }
    } catch (error) {
      this.addLog(`❌ Errore caricamento stats: ${error.message}`, 'error');
    }
  }

  async startImport() {
    if (this.isImporting) return;

    this.isImporting = true;
    this.toggleImportButton(true);
    this.showProgress();
    this.addLog('🚀 Avvio importazione...', 'info');

    try {
      const response = await fetch(`${this.apiBaseUrl}/import-shopify`);
      const data = await response.json();

      if (data.success) {
        this.handleImportSuccess(data);
      } else {
        this.handleImportError(data.error);
      }
    } catch (error) {
      this.handleImportError(error.message);
    } finally {
      this.isImporting = false;
      this.toggleImportButton(false);
      this.hideProgress();
    }
  }

  handleImportSuccess(data) {
    this.addLog('✅ Importazione completata!', 'success');
    
    // Aggiorna risultati
    this.showResults(data.summary);
    
    // Aggiorna statistiche
    this.loadProductStats();
    
    // Log dettagliato
    this.addLog(`📦 Importati: ${data.summary.imported}`, 'success');
    this.addLog(`🔄 Aggiornati: ${data.summary.updated}`, 'info');
    this.addLog(`⚠️ Falliti: ${data.summary.failed}`, data.summary.failed > 0 ? 'warning' : 'info');
    
    if (data.summary.errors?.length > 0) {
      data.summary.errors.forEach(error => {
        this.addLog(`❌ Errore ${error.sku}: ${error.error}`, 'error');
      });
    }
  }

  handleImportError(error) {
    this.addLog(`❌ Importazione fallita: ${error}`, 'error');
    this.hideResults();
  }

  showProgress() {
    const container = document.getElementById('progress-container');
    container.style.display = 'block';
    
    // Simula progresso
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }
      
      document.getElementById('progress-fill').style.width = `${progress}%`;
      document.getElementById('progress-text').textContent = 
        progress < 100 ? `Importazione in corso... ${Math.round(progress)}%` : 'Completamento...';
    }, 500);

    // Salva l'interval per poterlo fermare
    this.progressInterval = interval;
  }

  hideProgress() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    
    setTimeout(() => {
      document.getElementById('progress-container').style.display = 'none';
      document.getElementById('progress-fill').style.width = '0%';
    }, 1000);
  }

  showResults(summary) {
    const container = document.getElementById('results-container');
    container.style.display = 'block';
    
    document.getElementById('imported-count').textContent = summary.imported;
    document.getElementById('updated-count').textContent = summary.updated;
    document.getElementById('failed-count').textContent = summary.failed;
  }

  hideResults() {
    document.getElementById('results-container').style.display = 'none';
  }

  toggleImportButton(disabled) {
    const btn = document.getElementById('import-btn');
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    
    btn.disabled = disabled;
    
    if (disabled) {
      text.style.display = 'none';
      loader.style.display = 'inline';
    } else {
      text.style.display = 'inline';
      loader.style.display = 'none';
    }
  }

  updateStatusIcon(elementId, status) {
    const icon = document.getElementById(elementId);
    icon.className = `status-icon ${status}`;
    
    switch(status) {
      case 'connected':
      case 'healthy':
        icon.textContent = '🟢';
        break;
      case 'disconnected':
      case 'unhealthy':
        icon.textContent = '🔴';
        break;
      case 'degraded':
        icon.textContent = '🟡';
        break;
      default:
        icon.textContent = '⚪';
    }
  }

  addLog(message, type = 'info') {
    const logsBox = document.getElementById('logs-box');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    logsBox.appendChild(logEntry);
    logsBox.scrollTop = logsBox.scrollHeight;
    
    // Mantieni solo gli ultimi 100 log
    const logs = logsBox.querySelectorAll('.log-entry');
    if (logs.length > 100) {
      logs[0].remove();
    }
  }
}

// Inizializza quando la pagina è caricata
document.addEventListener('DOMContentLoaded', () => {
  new AdminImportManager();
});