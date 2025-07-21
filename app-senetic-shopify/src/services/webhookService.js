const axios = require('axios');

class WebhookService {
  constructor() {
    this.webhookUrl = process.env.SHOPIFY_WEBHOOK_URL;
  }

  async notifyImportStart(data) {
    return this.sendWebhook('import.started', data);
  }

  async notifyImportProgress(data) {
    return this.sendWebhook('import.progress', data);
  }

  async notifyImportComplete(data) {
    return this.sendWebhook('import.completed', data);
  }

  async notifyImportError(data) {
    return this.sendWebhook('import.error', data);
  }

  async sendWebhook(event, data) {
    if (!this.webhookUrl) return;

    try {
      await axios.post(this.webhookUrl, {
        event,
        data,
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event
        }
      });
    } catch (error) {
      console.error('Webhook failed:', error);
    }
  }
}

module.exports = new WebhookService();