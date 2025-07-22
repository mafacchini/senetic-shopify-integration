require('dotenv').config();
const axios = require('axios');
const he = require('he');

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

class Controller {
  // 🆕 FUNZIONE: Estrae URL delle immagini dal HTML
  extractImageUrls(htmlContent) {
    if (!htmlContent) {
      return [];
    }
    
    const decodedHtml = he.decode(htmlContent);
    const imageUrls = [];
    const imgRegex = /<img[^>]+src="([^"]+)"/gi;
    let match;
    
    while ((match = imgRegex.exec(decodedHtml)) !== null) {
      let imgUrl = match[1];
      
      if (imgUrl && 
          !imgUrl.startsWith('data:') && 
          (imgUrl.includes('.jpg') || imgUrl.includes('.jpeg') || imgUrl.includes('.png') || imgUrl.includes('.gif'))) {
        
        let fullUrl;
        if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
          fullUrl = imgUrl;
        } else if (imgUrl.startsWith('//')) {
          fullUrl = `https:${imgUrl}`;
        } else if (imgUrl.startsWith('/')) {
          fullUrl = `https://senetic.pl${imgUrl}`;
        } else {
          fullUrl = `https://senetic.pl/${imgUrl}`;
        }
        
        if (!fullUrl.includes('%')) {
          try {
            const urlParts = fullUrl.split('senetic.pl');
            if (urlParts.length === 2) {
              const basePart = urlParts[0] + 'senetic.pl';
              const pathPart = urlParts[1];
              const encodedPath = pathPart.split('/').map(segment => 
                segment ? encodeURIComponent(segment) : ''
              ).join('/');
              fullUrl = basePart + encodedPath;
            }
          } catch (error) {
            console.warn('Errore encoding URL:', error.message);
          }
        }
        
        imageUrls.push(fullUrl);
      }
    }
    
    return [...new Set(imageUrls)];
  }

  // 🆕 FUNZIONE: Rimuove immagini dal HTML
  removeImagesFromHtml(htmlContent) {
    if (!htmlContent) {
      return '';
    }
    
    const decodedHtml = he.decode(htmlContent);
    
    // Rimuove tutti i tag <img> e i loro contenuti
    let cleanedHtml = decodedHtml.replace(/<img[^>]*>/gi, '');
    
    // Rimuove anche eventuali <figure> che contengono solo immagini
    cleanedHtml = cleanedHtml.replace(/<figure[^>]*>[\s]*<\/figure>/gi, '');
    
    // Rimuove <div> vuoti che potrebbero essere rimasti dopo la rimozione delle immagini
    cleanedHtml = cleanedHtml.replace(/<div[^>]*>[\s]*<\/div>/gi, '');
    
    // Rimuove <p> vuoti
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>[\s]*<\/p>/gi, '');
    
    // Rimuove spazi multipli e newline consecutive
    cleanedHtml = cleanedHtml.replace(/\s+/g, ' ').trim();
    
    // Rimuove righe vuote multiple
    cleanedHtml = cleanedHtml.replace(/(<br\s*\/?>){2,}/gi, '<br>');
    
    return cleanedHtml;
  }

  // 🆕 FUNZIONE: Estrae immagini E pulisce HTML
  extractImagesAndCleanHtml(htmlContent) {
    const imageUrls = this.extractImageUrls(htmlContent);
    const cleanedHtml = this.removeImagesFromHtml(htmlContent);
    
    return {
      imageUrls: imageUrls,
      cleanedHtml: cleanedHtml,
      stats: {
        originalLength: htmlContent ? htmlContent.length : 0,
        cleanedLength: cleanedHtml.length,
        imagesFound: imageUrls.length,
        sizeDifference: (htmlContent ? htmlContent.length : 0) - cleanedHtml.length
      }
    };
  }

  // 🆕 FUNZIONE: Controlla se immagine esiste già nel prodotto
  async checkExistingImages(productId) {
    try {
      console.log(`🔍 Checking existing images for product ${productId}...`);
      
      const response = await axios.get(
        `${SHOPIFY_STORE_URL}/admin/api/2024-04/products/${productId}/images.json`,
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      const existingImages = response.data.images || [];
      console.log(`📊 Found ${existingImages.length} existing images in product`);
      
      // Estrai solo gli URL delle immagini esistenti
      const existingUrls = existingImages.map(img => {
        // Normalizza l'URL per il confronto
        let normalizedUrl = img.src;
        if (normalizedUrl) {
          // Rimuovi parametri di query e frammenti per confronto pulito
          normalizedUrl = normalizedUrl.split('?')[0].split('#')[0];
        }
        return normalizedUrl;
      });
      
      return {
        success: true,
        existingImages: existingImages,
        existingUrls: existingUrls,
        count: existingImages.length
      };

    } catch (error) {
      console.error(`❌ Error checking existing images:`, error.message);
      return {
        success: false,
        error: error.message,
        existingImages: [],
        existingUrls: [],
        count: 0
      };
    }
  }

  // 🆕 FUNZIONE: Normalizza URL per confronto
  normalizeUrlForComparison(url) {
    if (!url) return '';
    
    try {
      // Rimuovi protocollo, parametri query e frammenti
      let normalized = url
        .replace(/^https?:\/\//, '')  // Rimuovi protocollo
        .split('?')[0]                // Rimuovi query params
        .split('#')[0]                // Rimuovi frammenti
        .toLowerCase()                // Lowercase per confronto
        .trim();
      
      return normalized;
    } catch (error) {
      console.warn(`⚠️ Error normalizing URL ${url}:`, error.message);
      return url;
    }
  }

  // 🔧 FUNZIONE MIGLIORATA: Upload immagine (CON CONTROLLO DUPLICATI)
  async uploadImageToShopify(imageUrl, productId, existingUrls = []) {
    try {
      console.log(`📤 Processing image: ${imageUrl}`);
      
      // 🆕 CONTROLLO DUPLICATI
      const normalizedNewUrl = this.normalizeUrlForComparison(imageUrl);
      const isDuplicate = existingUrls.some(existingUrl => {
        const normalizedExisting = this.normalizeUrlForComparison(existingUrl);
        return normalizedExisting === normalizedNewUrl;
      });
      
      if (isDuplicate) {
        console.log(`⚠️ Image already exists, skipping: ${imageUrl}`);
        return {
          success: false,
          error: 'Image already exists in product',
          originalUrl: imageUrl,
          skipped: true,
          duplicate: true
        };
      }
      
      console.log(`📤 Uploading new image: ${imageUrl}`);
      
      const imagePayload = {
        image: {
          src: imageUrl
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

      console.log(`✅ New image uploaded successfully: ID ${response.data.image.id}`);
      return {
        success: true,
        imageId: response.data.image.id,
        src: response.data.image.src,
        originalUrl: imageUrl,
        isNew: true
      };

    } catch (error) {
      console.error(`❌ Failed to upload image ${imageUrl}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        originalUrl: imageUrl
      };
    }
  }

  // Metodo per mostrare l'inventario Senetic
  async showSeneticInventory(req, res) {
    try {
      console.log('📦 Fetching Senetic inventory...');
      
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
      console.error('❌ Error fetching Senetic inventory:', error);
      res.status(500).json({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Metodo per mostrare il catalogo Senetic
  async showSeneticCatalogue(req, res) {
    try {
      console.log('📋 Fetching Senetic catalogue...');
      
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
      console.error('❌ Error fetching Senetic catalogue:', error);
      res.status(500).json({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Metodo principale per importare su Shopify (il tuo codice esistente migliorato)
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
      images_failed: 0,
      images_duplicates: 0
    };

    try {
      console.log('🚀 Starting Shopify import process...');

      // 1. Recupera inventario e catalogo
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

      console.log(`📦 Found ${inventoryLines.length} inventory items`);
      console.log(`📋 Found ${catalogueLines.length} catalogue items`);

      // Filtri per categorie e brand
      const categorieDesiderate = [
        'Sistemi di sorveglianza',
        'Reti'
      ].map(c => c.trim().toLowerCase());

      const brandDesiderati = [
        'Hikvision',
        'Ubiquiti'
      ].map(b => b.trim().toLowerCase());

      // 2. Crea una mappa inventario per manufacturerItemCode
      const inventoryMap = {};
      for (const item of inventoryLines) {
        if (item.manufacturerItemCode) {
          inventoryMap[item.manufacturerItemCode] = item;
        }
      }

      console.log(`🗂️ Created inventory map with ${Object.keys(inventoryMap).length} items`);

      // 3. Filtra prodotti per categoria e brand
      const prodottiFiltrati = catalogueLines.filter(
        prodotto =>
          prodotto.productSecondaryCategory &&
          prodotto.productSecondaryCategory.categoryNodeName &&
          categorieDesiderate.includes(prodotto.productSecondaryCategory.categoryNodeName.trim().toLowerCase()) &&
          prodotto.productPrimaryBrand &&
          prodotto.productPrimaryBrand.brandNodeName &&
          brandDesiderati.includes(prodotto.productPrimaryBrand.brandNodeName.trim().toLowerCase())
      );

      console.log(`🔍 Filtered to ${prodottiFiltrati.length} products matching criteria`);

      // Limita a massimo 10 prodotti
      const prodottiDaImportare = prodottiFiltrati.slice(0, 10);
      const totalProducts = prodottiDaImportare.length;
      let processedCount = 0;

      console.log(`📦 Processing ${totalProducts} products...`);

      console.log('\n📋 PRODUCTS MATCHING FILTERS:');
      prodottiFiltrati.forEach((prodotto, index) => {
        console.log(`${index + 1}. ${prodotto.manufacturerItemCode} - ${prodotto.itemDescription}`);
        console.log(`   Brand: ${prodotto.productPrimaryBrand?.brandNodeName}`);
        console.log(`   Category: ${prodotto.productSecondaryCategory?.categoryNodeName}`);
      });
      console.log('─'.repeat(80));

      const risultati = [];

      for (const prodotto of prodottiDaImportare) {
        try {
          // Cerca il prodotto nell'inventario tramite manufacturerItemCode
          const inventoryItem = inventoryMap[prodotto.manufacturerItemCode];
          if (!inventoryItem) {
            console.log(`⚠️ Skipping ${prodotto.manufacturerItemCode} - not found in inventory`);
            importResults.skipped++;
            continue;
          }

          processedCount++;
          console.log(`🔄 Processing ${processedCount}/${totalProducts}: ${prodotto.manufacturerItemCode}`);

          // Calcola la quantità totale disponibile
          const availability = inventoryItem.availability && Array.isArray(inventoryItem.availability.stockSchedules)
            ? inventoryItem.availability.stockSchedules.reduce((sum, s) => sum + (s.targetStock || 0), 0)
            : 0;

          // 🆕 ESTRAZIONE E PULIZIA IMMAGINI DAL HTML
          const htmlProcessing = this.extractImagesAndCleanHtml(prodotto.longItemDescription);
          const imageUrls = htmlProcessing.imageUrls;
          const cleanedHtml = htmlProcessing.cleanedHtml;

          console.log(`🖼️ Found ${imageUrls.length} images in HTML description`);
          console.log(`📝 HTML cleaned: ${htmlProcessing.stats.originalLength} → ${htmlProcessing.stats.cleanedLength} chars`);

          // Costruisci il prodotto per Shopify (USA HTML PULITO)
          const shopifyProduct = {
            product: {
              title: prodotto.itemDescription || '',
              body_html: cleanedHtml, // 🎯 USA HTML SENZA IMMAGINI
              vendor: prodotto.productPrimaryBrand?.brandNodeName || '',
              product_type: prodotto.productSecondaryCategory?.categoryNodeName || '',
              variants: [
                {
                  price: prodotto.unitRetailPrice ? (prodotto.unitRetailPrice * (1 + (prodotto.taxRate ? prodotto.taxRate / 100 : 0))).toFixed(2) : "0.00",
                  cost: prodotto.unitNetPrice ? prodotto.unitNetPrice.toString() : "0.00",
                  sku: prodotto.manufacturerItemCode || '',
                  barcode: prodotto.ean ? String(prodotto.ean) : '',
                  inventory_quantity: availability,
                  inventory_management: "shopify",
                  weight: prodotto.weight ? Number(prodotto.weight) : 0,
                  weight_unit: "kg",
                }
              ]
            }
          };

          // Cerca se esiste già una variante con questa SKU
          console.log(`🔍 Searching for existing product with SKU: ${prodotto.manufacturerItemCode}`);

          const searchRes = await axios.get(
            `${SHOPIFY_STORE_URL}/admin/api/2024-04/variants.json?sku=${encodeURIComponent(prodotto.manufacturerItemCode)}`,
            {
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
              }
            }
          );

          const allVariants = searchRes.data.variants || [];
          console.log(`🔍 Found ${allVariants.length} variants from API search`);

          // ⬅️ FILTRO: Trova solo varianti con SKU ESATTAMENTE UGUALE
          const exactVariants = allVariants.filter(variant => 
            variant.sku === prodotto.manufacturerItemCode
          );

          console.log(`🔍 Found ${exactVariants.length} variants with EXACT SKU match: ${prodotto.manufacturerItemCode}`);

          if (exactVariants.length > 0) {
            exactVariants.forEach((variant, index) => {
              console.log(`   Exact Variant ${index + 1}: ID=${variant.id}, Product_ID=${variant.product_id}, SKU=${variant.sku}`);
            });
          } else {
            console.log(`   No exact SKU matches found`);
          }

          // ⬅️ USA exactVariants INVECE DI variants
          const variants = exactVariants;

          let productId; // 🎯 DICHIARAZIONE CORRETTA DI productId
          let productStatus = 'created';

          if (variants && variants.length > 0) {
            // Esiste già: verifica se il prodotto esiste ancora
            productId = variants[0].product_id; // 🎯 ASSEGNAZIONE CORRETTA
            const variantId = variants[0].id;
            
            console.log(`🔄 UPDATING existing product:`);
            console.log(`   - Product ID: ${productId}`);
            console.log(`   - Variant ID: ${variantId}`);
            console.log(`   - Current title: ${shopifyProduct.product.title}`);
            
            try {
              // ⬅️ PRIMA: Verifica se il prodotto esiste ancora
              console.log(`🔍 Verifying product ${productId} exists...`);
              
              const verifyRes = await axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-04/products/${productId}.json`, {
                headers: { 
                  'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                  'Content-Type': 'application/json'
                }
              });
              
              console.log(`✅ Product ${productId} exists: ${verifyRes.data.product.title}`);
              
              // ⬅️ DOPO: Se esiste, procedi con l'update
              const updateResponse = await axios.put(
                `${SHOPIFY_STORE_URL}/admin/api/2024-04/products/${productId}.json`,
                shopifyProduct,
                {
                  headers: {
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                  }
                }
              );

              console.log(`✅ UPDATE SUCCESS for Product ID: ${productId}`);
              console.log(`   - Updated title: ${updateResponse.data.product.title}`);
              console.log(`   - Updated vendor: ${updateResponse.data.product.vendor}`);
              console.log(`   - Updated at: ${updateResponse.data.product.updated_at}`);
              console.log(`   - Variants count: ${updateResponse.data.product.variants.length}`);

              importResults.updated++;
              productStatus = 'updated';

            } catch (verifyError) {
              if (verifyError.response?.status === 404) {
                // ⬅️ PRODOTTO NON ESISTE: Crea nuovo prodotto
                console.log(`❌ Product ${productId} NOT FOUND! Creating new product instead...`);
                
                try {
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

                  productId = createResponse.data.product.id; // 🎯 AGGIORNA productId
                  console.log(`✅ CREATE SUCCESS (after verify failed):`);
                  console.log(`   - New Product ID: ${productId}`);
                  console.log(`   - Created title: ${createResponse.data.product.title}`);
                  console.log(`   - Created vendor: ${createResponse.data.product.vendor}`);
                  console.log(`   - Created at: ${createResponse.data.product.created_at}`);
                  console.log(`   - Variant ID: ${createResponse.data.product.variants[0].id}`);
                  console.log(`   - Variant SKU: ${createResponse.data.product.variants[0].sku}`);

                  importResults.imported++;
                  productStatus = 'created';

                } catch (createError) {
                  console.error(`❌ CREATE FAILED (after verify failed):`);
                  console.error(`   - Error: ${createError.message}`);
                  console.error(`   - Response: ${JSON.stringify(createError.response?.data)}`);
                  throw createError;
                }
                
              } else {
                // ⬅️ ALTRO ERRORE: Rilancia l'errore
                console.error(`❌ VERIFY FAILED for Product ID: ${productId}`);
                console.error(`   - Error: ${verifyError.message}`);
                console.error(`   - Response: ${JSON.stringify(verifyError.response?.data)}`);
                throw verifyError;
              }
            }
            
          } else {
            // Non esiste: crea nuovo prodotto (codice esistente)
            console.log(`📦 CREATING new product:`);
            console.log(`   - Title: ${shopifyProduct.product.title}`);
            console.log(`   - Vendor: ${shopifyProduct.product.vendor}`);
            console.log(`   - SKU: ${shopifyProduct.product.variants[0].sku}`);
            
            try {
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

              productId = createResponse.data.product.id; // 🎯 ASSEGNAZIONE CORRETTA
              console.log(`✅ CREATE SUCCESS:`);
              console.log(`   - New Product ID: ${productId}`);
              console.log(`   - Created title: ${createResponse.data.product.title}`);
              console.log(`   - Created vendor: ${createResponse.data.product.vendor}`);
              console.log(`   - Created at: ${createResponse.data.product.created_at}`);
              console.log(`   - Variant ID: ${createResponse.data.product.variants[0].id}`);
              console.log(`   - Variant SKU: ${createResponse.data.product.variants[0].sku}`);

              importResults.imported++;
              productStatus = 'created';

            } catch (createError) {
              console.error(`❌ CREATE FAILED:`);
              console.error(`   - Error: ${createError.message}`);
              console.error(`   - Response: ${JSON.stringify(createError.response?.data)}`);
              throw createError;
            }
          }

          // 🆕 UPLOAD DELLE IMMAGINI AL PRODOTTO (CON CONTROLLO DUPLICATI)
          let uploadedImages = [];

          if (imageUrls.length > 0 && productId) {
            console.log(`🖼️ Processing ${imageUrls.length} images for product ${productId}...`);
            
            // 🆕 STEP 1: Controlla immagini esistenti
            const existingImagesCheck = await this.checkExistingImages(productId);
            let existingUrls = [];
            
            if (existingImagesCheck.success) {
              existingUrls = existingImagesCheck.existingUrls;
              console.log(`📊 Product has ${existingImagesCheck.count} existing images`);
              
              if (existingImagesCheck.count > 0) {
                console.log(`🔍 Existing images URLs:`);
                existingUrls.forEach((url, index) => {
                  console.log(`   ${index + 1}. ${url}`);
                });
              }
            } else {
              console.warn(`⚠️ Could not check existing images: ${existingImagesCheck.error}`);
            }
            
            // 🆕 STEP 2: Upload solo immagini nuove
            let newUploads = 0;
            let duplicatesSkipped = 0;
            let uploadErrors = 0;
            
            for (const imageUrl of imageUrls.slice(0, 5)) { // Limita a 5 immagini max
              importResults.images_processed++;
              console.log(`📤 Processing image ${importResults.images_processed}: ${imageUrl}`);
              
              const uploadResult = await this.uploadImageToShopify(imageUrl, productId, existingUrls);
              uploadedImages.push(uploadResult);
              
              if (uploadResult.success) {
                importResults.images_uploaded++;
                newUploads++;
                console.log(`✅ New image uploaded: ${uploadResult.imageId}`);
              } else if (uploadResult.duplicate) {
                importResults.images_duplicates++; // 🆕 CONTA DUPLICATI
                duplicatesSkipped++;
                console.log(`⚠️ Duplicate skipped: ${uploadResult.originalUrl}`);
              } else {
                importResults.images_failed++;
                uploadErrors++;
                console.log(`❌ Upload failed: ${uploadResult.error}`);
              }
              
              // Pausa per evitare rate limiting
              await new Promise(r => setTimeout(r, 500));
            }
            
            console.log(`📊 Images summary for product ${productId}:`);
            console.log(`   ✅ New uploads: ${newUploads}`);
            console.log(`   ⚠️ Duplicates skipped: ${duplicatesSkipped}`);
            console.log(`   ❌ Upload errors: ${uploadErrors}`);
            console.log(`   📊 Total existing: ${existingUrls.length}`);
            
          } else {
            console.log(`⚠️ Skipping image upload: imageUrls=${imageUrls.length}, productId=${productId}`);
          }

          console.log(`📋 Product status: ${productStatus.toUpperCase()}`);
          console.log('─'.repeat(80));

          risultati.push({
            title: shopifyProduct.product.title,
            body_html: shopifyProduct.product.body_html,
            vendor: shopifyProduct.product.vendor,
            product_type: shopifyProduct.product.product_type,
            price: shopifyProduct.product.variants[0].price,
            cost: shopifyProduct.product.variants[0].cost,
            sku: shopifyProduct.product.variants[0].sku,
            barcode: shopifyProduct.product.variants[0].barcode,
            inventory_quantity: shopifyProduct.product.variants[0].inventory_quantity,
            inventory_management: shopifyProduct.product.variants[0].inventory_management,
            weight: shopifyProduct.product.variants[0].weight,
            weight_unit: shopifyProduct.product.variants[0].weight_unit,
            status: productStatus,
            images_found: imageUrls.length,
            images_uploaded: uploadedImages.filter(img => img.success).length,
            images_failed: uploadedImages.filter(img => !img.success && !img.duplicate).length,
            images_duplicates: uploadedImages.filter(img => img.duplicate).length,
            html_processing: htmlProcessing.stats
          });

        } catch (productError) {
          console.error(`❌ Error processing product ${prodotto.manufacturerItemCode}:`, productError.message);
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

        // Delay per evitare rate limit
        await new Promise(r => setTimeout(r, 500));
      }

      const duration = Math.round((Date.now() - startTime) / 1000);

      console.log('✅ Import completed successfully');
      console.log(`📊 Results:`, importResults);

      res.json({ 
        success: true,
        message: 'Importazione completata!', 
        summary: importResults,
        duration,
        risultati,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Import process failed:', error);

      res.status(500).json({ 
        success: false,
        error: error.message,
        summary: importResults,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Health check endpoint
  async healthCheck(req, res) {
    try {
      console.log('🔍 Health check requested');
      
      // Test connessione Shopify
      let shopifyStatus = 'unknown';
      let shopifyError = null;
      try {
        const shopifyTest = await axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-04/shop.json`, {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        });
        shopifyStatus = 'connected';
        console.log('✅ Shopify connection: OK');
      } catch (shopifyErr) {
        shopifyStatus = 'disconnected';
        shopifyError = shopifyErr.message;
        console.log('❌ Shopify connection: FAILED');
      }

      // Test connessione Senetic
      let seneticStatus = 'unknown';
      let seneticError = null;
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
        console.log('✅ Senetic connection: OK');
      } catch (seneticErr) {
        seneticStatus = 'disconnected';
        seneticError = seneticErr.message;
        console.log('❌ Senetic connection: FAILED');
      }

      const overallStatus = shopifyStatus === 'connected' && seneticStatus === 'connected' ? 'healthy' : 'degraded';

      res.json({
        success: true,
        status: overallStatus,
        services: {
          shopify: {
            status: shopifyStatus,
            error: shopifyError
          },
          senetic: {
            status: seneticStatus,
            error: seneticError
          }
        },
        environment: {
          node_version: process.version,
          platform: process.platform,
          memory_usage: process.memoryUsage(),
          uptime: process.uptime()
        },
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });

    } catch (error) {
      console.error('❌ Health check failed:', error);
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Metodo per ottenere statistiche di import (placeholder per future implementazioni)
  async getImportStats(req, res) {
    try {
      // Qui potresti implementare logica per salvare/recuperare statistiche da database
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

  // Metodo per contare i prodotti Shopify per Hikvision e Ubiquiti
  // Sostituisci temporaneamente il metodo countShopifyProducts con questo:
  async countShopifyProducts(req, res) {
    try {
      console.log('🔢 Counting ALL Shopify products...');
      
      // Recupera TUTTI i prodotti (senza filtro vendor)
      const allProductsRes = await axios.get(`${SHOPIFY_STORE_URL}/admin/api/2024-04/products.json?limit=250`, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      const allProducts = allProductsRes.data.products || [];

      // Analizza i vendor
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
      console.error('❌ Error counting products:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = Controller;