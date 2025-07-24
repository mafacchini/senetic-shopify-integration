require('dotenv').config();
const axios = require('axios');
const he = require('he');
const cloudinary = require('cloudinary').v2;

// Configura Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

class Controller {
  
  // Estrae URL delle immagini dal HTML (esclude immagini dopo "Confronto")
  extractImageUrls(htmlContent) {
    if (!htmlContent) return [];
    
    const decodedHtml = he.decode(htmlContent);
    
    // Trova la sezione "Confronto" e taglia l'HTML
    let htmlBeforeConfronto = decodedHtml;
    const confrontoPatterns = [
      /<h2[^>]*><strong[^>]*>Confronto<\/strong><\/h2>/gis,
      /<h2[^>]*>Confronto<\/h2>/gis,
      /<h3[^>]*><strong[^>]*>Confronto<\/strong><\/h3>/gis,
      /<h3[^>]*>Confronto<\/h3>/gis,
      /<strong[^>]*>Confronto<\/strong>/gis,
      /<b[^>]*>Confronto<\/b>/gis
    ];
    
    let confrontoFound = false;
    for (const pattern of confrontoPatterns) {
      const match = pattern.exec(decodedHtml);
      if (match) {
        htmlBeforeConfronto = decodedHtml.substring(0, match.index);
        confrontoFound = true;
        break;
      }
    }
    
    // Estrai immagini solo dall'HTML prima di "Confronto"
    const imageUrls = [];
    const imgRegex = /<img[^>]+src="([^"]+)"/gi;
    let match;

    const cloudProcessDomains = ['gfx3.senetic.com'];
    const allowedDomains = ['senetic.pl', 'www.senetic.pl', 'gfx.senetic.pl', 'gfx2.senetic.pl', ...cloudProcessDomains];

    while ((match = imgRegex.exec(htmlBeforeConfronto)) !== null) {
      let imgUrl = match[1];
      
      if (imgUrl && !imgUrl.startsWith('data:') && 
          (imgUrl.includes('.jpg') || imgUrl.includes('.jpeg') || imgUrl.includes('.png') || imgUrl.includes('.gif'))) {
        
        let fullUrl;
        if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
          fullUrl = imgUrl;
        } else if (imgUrl.startsWith('//')) {
          fullUrl = `https:${imgUrl}`;
        } else if (imgUrl.startsWith('/')) {
          fullUrl = `https://www.senetic.pl${imgUrl}`;
        } else {
          fullUrl = `https://www.senetic.pl/${imgUrl}`;
        }

        try {
          const urlObj = new URL(fullUrl);
          const hostname = urlObj.hostname;
          
          if (allowedDomains.includes(hostname)) {
            imageUrls.push(fullUrl);
          }
        } catch (urlError) {
          continue;
        }
      }
    }
    
    return [...new Set(imageUrls)]; // Rimuovi duplicati
  }

  // Rimuove immagini, video MP4 e sezione "Confronto" dal HTML
  removeImagesFromHtml(htmlContent) {
    if (!htmlContent) return '';
    
    const decodedHtml = he.decode(htmlContent);
    let cleanedHtml = decodedHtml;
    
    // Rimuove la sezione "Confronto" e tutto il contenuto successivo
    const confrontoPatterns = [
      /<h2[^>]*><strong[^>]*>Confronto<\/strong><\/h2>.*$/gis,
      /<h2[^>]*>Confronto<\/h2>.*$/gis,
      /<h3[^>]*><strong[^>]*>Confronto<\/strong><\/h3>/gis,
      /<h3[^>]*>Confronto<\/h3>/gis,
      /<strong[^>]*>Confronto<\/strong>/gis,
      /<b[^>]*>Confronto<\/b>/gis
    ];
    
    for (const pattern of confrontoPatterns) {
      if (pattern.test(cleanedHtml)) {
        cleanedHtml = cleanedHtml.replace(pattern, '');
        break;
      }
    }
    
    // Rimuove tutti i tag <img>
    cleanedHtml = cleanedHtml.replace(/<img[^>]*>/gi, '');
    
    // Rimuove tutti i VIDEO MP4 e relativi tag
    cleanedHtml = cleanedHtml.replace(/<source[^>]*\.mp4[^>]*>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<video[^>]*>.*?<\/video>/gis, '');
    cleanedHtml = cleanedHtml.replace(/<video[^>]*\/>/gi, '');
    cleanedHtml = cleanedHtml.replace(/https?:\/\/[^"'\s]*\.mp4[^"'\s]*/gi, '');
    
    // Pulizia generale
    cleanedHtml = cleanedHtml.replace(/<figure[^>]*>[\s]*<\/figure>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<div[^>]*>[\s]*<\/div>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>[\s]*<\/p>/gi, '');
    cleanedHtml = cleanedHtml.replace(/\s+/g, ' ').trim();
    cleanedHtml = cleanedHtml.replace(/(<br\s*\/?>){2,}/gi, '<br>');
    cleanedHtml = cleanedHtml.replace(/<\/[^>]+>[\s]*$/gi, '');
    
    return cleanedHtml;
  }

  // Estrae immagini E pulisce HTML
  extractImagesAndCleanHtml(htmlContent) {
    const imageUrls = this.extractImageUrls(htmlContent);
    const cleanedHtml = this.removeImagesFromHtml(htmlContent);
    
    return {
      imageUrls: imageUrls,
      cleanedHtml: cleanedHtml,
      stats: {
        originalLength: htmlContent ? htmlContent.length : 0,
        cleanedLength: cleanedHtml.length,
        imagesFound: imageUrls.length
      }
    };
  }

  // Normalizza URL per confronto (rimuove UUID Shopify)
  normalizeUrlForComparison(url) {
    if (!url) return '';
    
    try {
      const urlObj = new URL(url);
      let filename = urlObj.pathname.split('/').pop();
      filename = filename.split('?')[0];
      
      // Rimuove UUID Shopify
      filename = filename.replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '');
      filename = filename.replace(/_[a-f0-9]{32}/gi, '');
      filename = filename.replace(/_\d{13}/gi, '');
      
      filename = filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase()
        .trim();
      
      return filename;
    } catch (error) {
      return url.toLowerCase();
    }
  }

  // Genera nome file unico per evitare UUID Shopify
  generateUniqueFilename(originalUrl, productId) {
    try {
      const urlObj = new URL(originalUrl);
      let filename = urlObj.pathname.split('/').pop();
      
      const parts = filename.split('.');
      const extension = parts.pop();
      const baseName = parts.join('.');
      
      const cleanBaseName = baseName
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      
      return `${cleanBaseName}_p${productId}.${extension}`;
    } catch (error) {
      return `image_p${productId}_${Date.now()}.jpg`;
    }
  }

  // Upload diretto immagine su Shopify con nome file unico
  async uploadImageToShopify(imageUrl, productId, existingUrls = []) {
    try {
      const originalFilename = this.generateUniqueFilename(imageUrl, productId);
      
      const imagePayload = {
        image: {
          src: imageUrl,
          filename: originalFilename
        }
      };

      const response = await axios.post(
        `${SHOPIFY_STORE_URL}/admin/api/2024-04/products/${productId}/images.json`,
        imagePayload,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        imageId: response.data.image.id,
        src: response.data.image.src,
        originalUrl: imageUrl,
        originalFilename: originalFilename,
        isNew: true,
        uniqueFilename: true
      };

    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message,
        originalUrl: imageUrl
      };
    }
  }

  // Scarica immagine da gfx3.senetic.com
  async downloadImageFromGfx3(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://senetic.com/',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        },
        timeout: 15000,
        maxRedirects: 5
      });
      
      if (response.status === 200 && response.data) {
        return {
          success: true,
          data: response.data,
          contentType: response.headers['content-type'] || 'image/jpeg',
          size: response.data.length
        };
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Upload temporaneo su Cloudinary
  async uploadToCloudinaryTemp(imageBuffer, originalUrl) {
    try {
      const urlObj = new URL(originalUrl);
      const filename = urlObj.pathname.split('/').pop().split('.')[0];
      const timestamp = Date.now();
      const publicId = `senetic_temp/${filename}_${timestamp}`;
      
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            folder: 'senetic_temp',
            resource_type: 'image',
            invalidate: true,
            transformation: [{ quality: 'auto:good', fetch_format: 'auto' }]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(imageBuffer);
      });
      
      return {
        success: true,
        cloudinaryUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        originalUrl: originalUrl
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        originalUrl: originalUrl
      };
    }
  }

  // Elimina immagine da Cloudinary
  async deleteFromCloudinary(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return { success: result.result === 'ok', error: result.result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Processa immagine gfx3 tramite cloud con nome file unico
  async processGfx3ImageViaCloud(imageUrl, productId, existingUrls = []) {
    const tempUploads = [];
    
    try {
      // Scarica da gfx3
      const downloadResult = await this.downloadImageFromGfx3(imageUrl);
      if (!downloadResult.success) {
        return {
          success: false,
          error: `Download failed: ${downloadResult.error}`,
          originalUrl: imageUrl
        };
      }
      
      // Upload temporaneo su Cloudinary
      const cloudUploadResult = await this.uploadToCloudinaryTemp(downloadResult.data, imageUrl);
      if (!cloudUploadResult.success) {
        return {
          success: false,
          error: `Cloud upload failed: ${cloudUploadResult.error}`,
          originalUrl: imageUrl
        };
      }
      
      tempUploads.push(cloudUploadResult.publicId);
      
      // Upload su Shopify dal cloud con nome file unico
      const originalFilename = this.generateUniqueFilename(imageUrl, productId);
      const imagePayload = {
        image: {
          src: cloudUploadResult.cloudinaryUrl,
          filename: originalFilename
        }
      };

      const shopifyResponse = await axios.post(
        `${SHOPIFY_STORE_URL}/admin/api/2024-04/products/${productId}/images.json`,
        imagePayload,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      const shopifyUploadResult = {
        success: true,
        imageId: shopifyResponse.data.image.id,
        src: shopifyResponse.data.image.src,
        originalFilename: originalFilename
      };
      
      // Cleanup Cloudinary
      await this.deleteFromCloudinary(cloudUploadResult.publicId);
      
      return {
        success: true,
        imageId: shopifyUploadResult.imageId,
        src: shopifyUploadResult.src,
        originalUrl: imageUrl,
        cloudUrl: cloudUploadResult.cloudinaryUrl,
        originalFilename: originalFilename,
        isNew: true,
        processedViaCloud: true,
        uniqueFilename: true
      };
      
    } catch (error) {
      // Cleanup in caso di errore
      for (const publicId of tempUploads) {
        await this.deleteFromCloudinary(publicId);
      }
      
      return {
        success: false,
        error: error.message,
        originalUrl: imageUrl
      };
    }
  }

  // Mostra inventario Senetic
  async showSeneticInventory(req, res) {
    try {
      const response = await axios.get(
        'https://b2b.senetic.com/Gateway/ClientApi/InventoryReportGet?UseItemCategoryFilter=true&LangId=IT',
        {
          headers: {
            'accept': 'application/json',
            'Authorization': process.env.SENETIC_AUTH,
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );

      res.json({
        success: true,
        data: response.data,
        count: response.data?.lines?.length || 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Mostra catalogo Senetic
  async showSeneticCatalogue(req, res) {
    try {
      const response = await axios.get(
        'https://b2b.senetic.com/Gateway/ClientApi/ProductCatalogueGet?UseItemCategoryFilter=true&LangId=IT',
        {
          headers: {
            'accept': 'application/json',
            'Authorization': process.env.SENETIC_AUTH,
            'User-Agent': 'Mozilla/5.0'
          }
        }
      );

      res.json({
        success: true,
        data: response.data,
        count: response.data?.lines?.length || 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Import principale su Shopify
  async importToShopify(req, res) {
    const startTime = Date.now();
    let importResults = {
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      images_processed: 0,
      images_uploaded: 0,
      images_failed: 0
    };

    try {
      // Recupera inventario e catalogo
      const [inventoryResponse, catalogueResponse] = await Promise.all([
        axios.get(
          'https://b2b.senetic.com/Gateway/ClientApi/InventoryReportGet?UseItemCategoryFilter=true&LangId=IT',
          {
            headers: {
              'accept': 'application/json',
              'Authorization': process.env.SENETIC_AUTH,
              'User-Agent': 'Mozilla/5.0'
            }
          }
        ),
        axios.get(
          'https://b2b.senetic.com/Gateway/ClientApi/ProductCatalogueGet?UseItemCategoryFilter=true&LangId=IT',
          {
            headers: {
              'accept': 'application/json',
              'Authorization': process.env.SENETIC_AUTH,
              'User-Agent': 'Mozilla/5.0'
            }
          }
        )
      ]);

      const inventoryLines = inventoryResponse.data.lines || [];
      const catalogueLines = catalogueResponse.data.lines || [];

      // Filtri per categorie e brand
      const categorieDesiderate = ['Sistemi di sorveglianza', 'Reti'].map(c => c.trim().toLowerCase());
      const brandDesiderati = ['Hikvision', 'Ubiquiti'].map(b => b.trim().toLowerCase());

      // Crea mappa inventario
      const inventoryMap = {};
      for (const item of inventoryLines) {
        if (item.manufacturerItemCode) {
          inventoryMap[item.manufacturerItemCode] = item;
        }
      }

      // Filtra prodotti
      const prodottiFiltrati = catalogueLines.filter(
        prodotto =>
          prodotto.productSecondaryCategory?.categoryNodeName &&
          categorieDesiderate.includes(prodotto.productSecondaryCategory.categoryNodeName.trim().toLowerCase()) &&
          prodotto.productPrimaryBrand?.brandNodeName &&
          brandDesiderati.includes(prodotto.productPrimaryBrand.brandNodeName.trim().toLowerCase())
      );

      const prodottiDaImportare = prodottiFiltrati.slice(0, 10);
      const risultati = [];

      for (const prodotto of prodottiDaImportare) {
        try {
          const inventoryItem = inventoryMap[prodotto.manufacturerItemCode];
          if (!inventoryItem) {
            importResults.skipped++;
            continue;
          }

          // Calcola disponibilità
          const availability = inventoryItem.availability?.stockSchedules
            ? inventoryItem.availability.stockSchedules.reduce((sum, s) => sum + (s.targetStock || 0), 0)
            : 0;

          // Estrai e pulisci HTML
          const htmlProcessing = this.extractImagesAndCleanHtml(prodotto.longItemDescription);
          const imageUrls = htmlProcessing.imageUrls;
          const cleanedHtml = htmlProcessing.cleanedHtml;

          // Costruisci prodotto Shopify
          const shopifyProduct = {
            product: {
              title: prodotto.itemDescription || '',
              body_html: cleanedHtml,
              vendor: prodotto.productPrimaryBrand?.brandNodeName || '',
              product_type: prodotto.productSecondaryCategory?.categoryNodeName || '',
              variants: [{
                price: prodotto.unitRetailPrice ? (prodotto.unitRetailPrice * (1 + (prodotto.taxRate ? prodotto.taxRate / 100 : 0))).toFixed(2) : "0.00",
                cost: prodotto.unitNetPrice ? prodotto.unitNetPrice.toString() : "0.00",
                sku: prodotto.manufacturerItemCode || '',
                barcode: prodotto.ean ? String(prodotto.ean) : '',
                inventory_quantity: availability,
                inventory_management: "shopify",
                weight: prodotto.weight ? Number(prodotto.weight) : 0,
                weight_unit: "kg"
              }]
            }
          };

          // Cerca prodotto esistente
          const searchRes = await axios.get(
            `${SHOPIFY_STORE_URL}/admin/api/2024-04/variants.json?sku=${encodeURIComponent(prodotto.manufacturerItemCode)}`,
            {
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
              }
            }
          );

          const exactVariants = (searchRes.data.variants || []).filter(variant => 
            variant.sku === prodotto.manufacturerItemCode
          );

          let productId;
          let productStatus = 'created';

          if (exactVariants.length > 0) {
            // Aggiorna prodotto esistente
            productId = exactVariants[0].product_id;
            
            try {
              // Verifica se il prodotto esiste ancora
              await axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-04/products/${productId}.json`, {
                headers: { 
                  'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                  'Content-Type': 'application/json'
                }
              });
              
              // Update prodotto
              await axios.put(
                `${SHOPIFY_STORE_URL}/admin/api/2024-04/products/${productId}.json`,
                shopifyProduct,
                {
                  headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                  }
                }
              );

              importResults.updated++;
              productStatus = 'updated';

            } catch (verifyError) {
              if (verifyError.response?.status === 404) {
                // Prodotto non esiste più, crea nuovo
                const createResponse = await axios.post(
                  `${SHOPIFY_STORE_URL}/admin/api/2024-04/products.json`,
                  shopifyProduct,
                  {
                    headers: {
                      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                      'Content-Type': 'application/json'
                    }
                  }
                );

                productId = createResponse.data.product.id;
                importResults.imported++;
                productStatus = 'created';
              } else {
                throw verifyError;
              }
            }
          } else {
            // Crea nuovo prodotto
            const createResponse = await axios.post(
              `${SHOPIFY_STORE_URL}/admin/api/2024-04/products.json`,
              shopifyProduct,
              {
                headers: {
                  'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                  'Content-Type': 'application/json'
                }
              }
            );

            productId = createResponse.data.product.id;
            importResults.imported++;
            productStatus = 'created';
          }

          // Upload immagini con nomi file unici
          let uploadedImages = [];

          if (imageUrls.length > 0 && productId) {
            let newUploads = 0;
            let uploadErrors = 0;

            for (const imageUrl of imageUrls.slice(0, 5)) {
              importResults.images_processed++;
              
              let uploadResult;
              try {
                const urlObj = new URL(imageUrl);
                if (urlObj.hostname === 'gfx3.senetic.com') {
                  uploadResult = await this.processGfx3ImageViaCloud(imageUrl, productId, []);
                } else {
                  uploadResult = await this.uploadImageToShopify(imageUrl, productId, []);
                }
              } catch (urlError) {
                uploadResult = {
                  success: false,
                  error: `URL parsing failed: ${urlError.message}`,
                  originalUrl: imageUrl
                };
              }
              
              uploadedImages.push(uploadResult);
              
              if (uploadResult.success) {
                importResults.images_uploaded++;
                newUploads++;
              } else {
                importResults.images_failed++;
                uploadErrors++;
              }
              
              const delay = uploadResult.processedViaCloud ? 1500 : 500;
              await new Promise(r => setTimeout(r, delay));
            }
          }

          risultati.push({
            title: shopifyProduct.product.title,
            vendor: shopifyProduct.product.vendor,
            sku: shopifyProduct.product.variants[0].sku,
            status: productStatus,
            images_found: imageUrls.length,
            images_uploaded: uploadedImages.filter(img => img.success).length,
            images_failed: uploadedImages.filter(img => !img.success).length
          });

        } catch (productError) {
          importResults.failed++;
          importResults.errors.push({
            sku: prodotto.manufacturerItemCode,
            error: productError.response?.data || productError.message
          });

          risultati.push({
            title: prodotto.itemDescription,
            sku: prodotto.manufacturerItemCode,
            status: 'errore',
            error: productError.response?.data || productError.message
          });
        }

        await new Promise(r => setTimeout(r, 500));
      }

      const duration = Math.round((Date.now() - startTime) / 1000);

      res.json({ 
        success: true,
        message: 'Importazione completata!', 
        summary: importResults,
        duration,
        risultati,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message,
        summary: importResults,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Health check
  async healthCheck(req, res) {
    try {
      let shopifyStatus = 'unknown';
      let seneticStatus = 'unknown';
      
      try {
        await axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-04/shop.json`, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
        shopifyStatus = 'connected';
      } catch (shopifyErr) {
        shopifyStatus = 'disconnected';
      }

      try {
        await axios.get(
          'https://b2b.senetic.com/Gateway/ClientApi/InventoryReportGet?UseItemCategoryFilter=true&LangId=IT',
          {
            headers: {
              'accept': 'application/json',
              'Authorization': process.env.SENETIC_AUTH,
              'User-Agent': 'Mozilla/5.0'
            },
            timeout: 5000
          }
        );
        seneticStatus = 'connected';
      } catch (seneticErr) {
        seneticStatus = 'disconnected';
      }

      const overallStatus = shopifyStatus === 'connected' && seneticStatus === 'connected' ? 'healthy' : 'degraded';

      res.json({
        success: true,
        status: overallStatus,
        services: {
          shopify: { status: shopifyStatus },
          senetic: { status: seneticStatus }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Statistiche import
  async getImportStats(req, res) {
    try {
      const stats = {
        total_imports: 0,
        successful_imports: 0,
        failed_imports: 0,
        last_import: null,
        average_duration: 0
      };

      res.json({
        success: true,
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Conta prodotti Shopify
  async countShopifyProducts(req, res) {
    try {
      const allProductsRes = await axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-04/products.json?limit=250`, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      const allProducts = allProductsRes.data.products || [];
      const vendorCounts = {};
      const productsByVendor = {};

      allProducts.forEach(product => {
        const vendor = product.vendor || 'Unknown';
        vendorCounts[vendor] = (vendorCounts[vendor] || 0) + 1;
        
        if (!productsByVendor[vendor]) {
          productsByVendor[vendor] = [];
        }
        
        productsByVendor[vendor].push({
          id: product.id,
          title: product.title,
          sku: product.variants[0]?.sku,
          created_at: product.created_at,
          updated_at: product.updated_at
        });
      });

      res.json({
        success: true,
        total_products: allProducts.length,
        vendor_counts: vendorCounts,
        products_by_vendor: productsByVendor,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = Controller;