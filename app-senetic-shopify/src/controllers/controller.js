require('dotenv').config();
const axios = require('axios');
const he = require('he');
const cloudinary = require('cloudinary').v2;
const FormData = require('form-data');

// Configura Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

class Controller {
  // 🔧 FUNZIONE CORRETTA: Estrae URL delle immagini dal HTML (CON FILTRI FUNZIONANTI)
  extractImageUrls(htmlContent) {
    if (!htmlContent) {
      return [];
    }
    
    const decodedHtml = he.decode(htmlContent);
    
    // 🆕 STEP 1: Trova la posizione della sezione "Confronto" e taglia l'HTML
    let htmlBeforeConfronto = decodedHtml;
    
    // Pattern per trovare la sezione Confronto
    const confrontoPatterns = [
      /<h2[^>]*><strong[^>]*>Confronto<\/strong><\/h2>/gis,
      /<h2[^>]*>Confronto<\/h2>/gis,
      /<h3[^>]*><strong[^>]*>Confronto<\/strong><\/h3>/gis,
      /<h3[^>]*>Confronto<\/h3>/gis,
      /<strong[^>]*>Confronto<\/strong>/gis,
      /<b[^>]*>Confronto<\/b>/gis
    ];
    
    let confrontoFound = false;
    let confrontoPosition = -1;
    
    for (const pattern of confrontoPatterns) {
      const match = pattern.exec(decodedHtml);
      if (match) {
        confrontoPosition = match.index;
        confrontoFound = true;
        console.log(`🚫 Found "Confronto" section at position ${confrontoPosition} - will exclude images after this point`);
        break;
      }
    }
    
    // Se trovato "Confronto", usa solo l'HTML prima di quella sezione per l'estrazione immagini
    if (confrontoFound && confrontoPosition > -1) {
      htmlBeforeConfronto = decodedHtml.substring(0, confrontoPosition);
      console.log(`📝 Image extraction limited to HTML before "Confronto": ${decodedHtml.length} → ${htmlBeforeConfronto.length} chars`);
    }
    
    // 🆕 STEP 2: Estrai immagini SOLO dall'HTML prima di "Confronto"
    const imageUrls = [];
    const imgRegex = /<img[^>]+src="([^"]+)"/gi;
    let match;

    // 🆕 DOMINI SPECIALI (processati via cloud)
    const cloudProcessDomains = [
      'gfx3.senetic.com'     // ✅ Ora può essere processato via Cloudinary!
    ];

    // ✅ DOMINI SICURI (accessibili direttamente)
    const allowedDomains = [
      'senetic.pl',
      'www.senetic.pl',
      'gfx.senetic.pl',
      'gfx2.senetic.pl',
      ...cloudProcessDomains  // Include domini cloud
    ];

    let cloudCount = 0;
    let directCount = 0;
    let blockedCount = 0;
    let totalFound = 0;
    let excludedCount = 0;
    
    // 🔧 IMPORTANTE: Usa htmlBeforeConfronto invece di decodedHtml
    while ((match = imgRegex.exec(htmlBeforeConfronto)) !== null) {
      let imgUrl = match[1];
      totalFound++;
      
      if (imgUrl && 
          !imgUrl.startsWith('data:') && 
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
          
          if (cloudProcessDomains.includes(hostname)) {
            cloudCount++;
            console.log(`☁️ CLOUD PROCESS: ${hostname} - ${fullUrl}`);
            imageUrls.push(fullUrl);
          } else if (allowedDomains.includes(hostname)) {
            directCount++;
            console.log(`✅ DIRECT: ${hostname} - ${fullUrl}`);
            imageUrls.push(fullUrl);
          } else {
            blockedCount++;
            console.warn(`🚫 BLOCKED: ${hostname} - ${fullUrl}`);
            continue;
          }
          
        } catch (urlError) {
          console.warn(`⚠️ Invalid URL: ${fullUrl} - Error: ${urlError.message}`);
          continue;
        }
      }
    }
    
    // 🆕 STEP 3: Conta anche le immagini che sono state escluse dalla sezione Confronto
    if (confrontoFound) {
      const htmlAfterConfronto = decodedHtml.substring(confrontoPosition);
      const imgRegexCount = /<img[^>]+src="([^"]+)"/gi;
      let excludedMatch;
      while ((excludedMatch = imgRegexCount.exec(htmlAfterConfronto)) !== null) {
        excludedCount++;
      }
    }
    
    console.log(`\n🖼️ IMAGE EXTRACTION SUMMARY:`);
    console.log(`   📊 Total images found (before Confronto): ${totalFound}`);
    console.log(`   ✅ Direct URLs: ${directCount}`);
    console.log(`   ☁️ Cloud process URLs: ${cloudCount}`);
    console.log(`   🚫 Blocked URLs: ${blockedCount}`);
    if (confrontoFound) {
      console.log(`   🚫 Excluded URLs (after Confronto): ${excludedCount}`);
      console.log(`   📝 Confronto section found: Images after this point were ignored`);
    }
    console.log(`   📝 Final processable: ${imageUrls.length}`);
    
    return [...new Set(imageUrls)]; // Rimuovi duplicati
  }

  // 🆕 FUNZIONE: Rimuove immagini dal HTML
  removeImagesFromHtml(htmlContent) {
    if (!htmlContent) {
      return '';
    }
    
    const decodedHtml = he.decode(htmlContent);
    
    // 🆕 STEP 1: Rimuove la sezione "Confronto" e tutto il contenuto successivo
    let cleanedHtml = decodedHtml;
    
    // Cerca il titolo "Confronto" con varie possibili formattazioni
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
        console.log(`🗑️ Found "Confronto" section - removing it and all content after`);
        cleanedHtml = cleanedHtml.replace(pattern, '');
        break; // Esci al primo match
      }
    }
    
    // 🆕 STEP 2: Rimuove tutti i tag <img> e i loro contenuti
    cleanedHtml = cleanedHtml.replace(/<img[^>]*>/gi, '');
    
    // 🆕 STEP 3: Rimuove tutti i VIDEO MP4 e relativi tag
    console.log(`🎬 Removing MP4 videos from HTML...`);
    
    // Rimuove tag <source> con MP4
    const sourceTagsRemoved = (cleanedHtml.match(/<source[^>]*\.mp4[^>]*>/gi) || []).length;
    cleanedHtml = cleanedHtml.replace(/<source[^>]*\.mp4[^>]*>/gi, '');
    
    // Rimuove tag <video> completi (con tutti i loro contenuti)
    const videoTagsRemoved = (cleanedHtml.match(/<video[^>]*>.*?<\/video>/gis) || []).length;
    cleanedHtml = cleanedHtml.replace(/<video[^>]*>.*?<\/video>/gis, '');
    
    // Rimuove anche tag <video> auto-chiudenti
    const selfClosingVideoTagsRemoved = (cleanedHtml.match(/<video[^>]*\/>/gi) || []).length;
    cleanedHtml = cleanedHtml.replace(/<video[^>]*\/>/gi, '');
    
    // Rimuove riferimenti diretti a file MP4 (link o embed)
    const mp4LinksRemoved = (cleanedHtml.match(/https?:\/\/[^"'\s]*\.mp4[^"'\s]*/gi) || []).length;
    cleanedHtml = cleanedHtml.replace(/https?:\/\/[^"'\s]*\.mp4[^"'\s]*/gi, '');
    
    // Log dei video rimossi
    const totalVideoElementsRemoved = sourceTagsRemoved + videoTagsRemoved + selfClosingVideoTagsRemoved + mp4LinksRemoved;
    if (totalVideoElementsRemoved > 0) {
      console.log(`🎬 VIDEO REMOVAL SUMMARY:`);
      console.log(`   📊 <source> tags with MP4: ${sourceTagsRemoved}`);
      console.log(`   📊 <video> tags: ${videoTagsRemoved}`);
      console.log(`   📊 Self-closing <video/> tags: ${selfClosingVideoTagsRemoved}`);
      console.log(`   📊 Direct MP4 links: ${mp4LinksRemoved}`);
      console.log(`   📊 Total video elements removed: ${totalVideoElementsRemoved}`);
    }
    
    // 🆕 STEP 4: Rimuove anche eventuali <figure> che contengono solo immagini o video
    cleanedHtml = cleanedHtml.replace(/<figure[^>]*>[\s]*<\/figure>/gi, '');
    
    // 🆕 STEP 5: Rimuove <div> vuoti che potrebbero essere rimasti
    cleanedHtml = cleanedHtml.replace(/<div[^>]*>[\s]*<\/div>/gi, '');
    
    // 🆕 STEP 6: Rimuove <p> vuoti
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>[\s]*<\/p>/gi, '');
    
    // 🆕 STEP 7: Rimuove spazi multipli e newline consecutive
    cleanedHtml = cleanedHtml.replace(/\s+/g, ' ').trim();
    
    // 🆕 STEP 8: Rimuove righe vuote multiple
    cleanedHtml = cleanedHtml.replace(/(<br\s*\/?>){2,}/gi, '<br>');
    
    // 🆕 STEP 9: Rimuove eventuali tag di chiusura orfani rimasti
    cleanedHtml = cleanedHtml.replace(/<\/[^>]+>[\s]*$/gi, '');
    
    return cleanedHtml;
  }

  // 🆕 FUNZIONE: Estrae immagini E pulisce HTML
  extractImagesAndCleanHtml(htmlContent) {
    // 🧪 DEBUG: Conta video PRIMA della pulizia
    let videosBeforeCleaning = 0;
    if (htmlContent) {
      const decodedHtml = he.decode(htmlContent);
      const videoPatterns = [
        /<source[^>]*\.mp4[^>]*>/gi,
        /<video[^>]*>.*?<\/video>/gis,
        /<video[^>]*\/>/gi,
        /https?:\/\/[^"'\s]*\.mp4[^"'\s]*/gi
      ];
      
      videoPatterns.forEach(pattern => {
        const matches = decodedHtml.match(pattern) || [];
        videosBeforeCleaning += matches.length;
      });
    }
    
    const imageUrls = this.extractImageUrls(htmlContent);
    const cleanedHtml = this.removeImagesFromHtml(htmlContent);
    
    // 🧪 DEBUG: Conta video DOPO la pulizia
    let videosAfterCleaning = 0;
    if (cleanedHtml) {
      const videoPatterns = [
        /<source[^>]*\.mp4[^>]*>/gi,
        /<video[^>]*>.*?<\/video>/gis,
        /<video[^>]*\/>/gi,
        /https?:\/\/[^"'\s]*\.mp4[^"'\s]*/gi
      ];
      
      videoPatterns.forEach(pattern => {
        const matches = cleanedHtml.match(pattern) || [];
        videosAfterCleaning += matches.length;
      });
    }
    
    // 🧪 DEBUG: Verifica se la sezione Confronto è stata trovata
    const originalHasConfronto = htmlContent ? htmlContent.toLowerCase().includes('confronto') : false;
    const cleanedHasConfronto = cleanedHtml.toLowerCase().includes('confronto');
    
    // 🆕 Conta immagini prima e dopo "Confronto"
    let imagesBeforeConfronto = 0;
    let imagesAfterConfronto = 0;
    
    if (originalHasConfronto && htmlContent) {
      const decodedHtml = he.decode(htmlContent);
      const confrontoPatterns = [
        /<h2[^>]*><strong[^>]*>Confronto<\/strong><\/h2>/gis,
        /<h2[^>]*>Confronto<\/h2>/gis,
        /<h3[^>]*><strong[^>]*>Confronto<\/strong><\/h3>/gis,
        /<h3[^>]*>Confronto<\/h3>/gis
      ];
      
      let confrontoPosition = -1;
      for (const pattern of confrontoPatterns) {
        const match = pattern.exec(decodedHtml);
        if (match) {
          confrontoPosition = match.index;
          break;
        }
      }
      
      if (confrontoPosition > -1) {
        const htmlBefore = decodedHtml.substring(0, confrontoPosition);
        const htmlAfter = decodedHtml.substring(confrontoPosition);
        
        const imgRegex = /<img[^>]+src="([^"]+)"/gi;
        imagesBeforeConfronto = (htmlBefore.match(imgRegex) || []).length;
        imagesAfterConfronto = (htmlAfter.match(imgRegex) || []).length;
      }
    }
    
    if (originalHasConfronto || videosBeforeCleaning > 0) {
      console.log(`🧪 DEBUG - Content cleaning analysis:`);
      if (originalHasConfronto) {
        console.log(`   📊 "Confronto" section:`);
        console.log(`     Original HTML contains "Confronto": ${originalHasConfronto ? 'YES' : 'NO'}`);
        console.log(`     Cleaned HTML contains "Confronto": ${cleanedHasConfronto ? 'YES' : 'NO'}`);
        console.log(`     Section removed: ${originalHasConfronto && !cleanedHasConfronto ? 'SUCCESS ✅' : 'FAILED ❌'}`);
        console.log(`     Images before "Confronto": ${imagesBeforeConfronto}`);
        console.log(`     Images after "Confronto" (excluded): ${imagesAfterConfronto}`);
      }
      if (videosBeforeCleaning > 0) {
        console.log(`   🎬 Video removal:`);
        console.log(`     Videos before cleaning: ${videosBeforeCleaning}`);
        console.log(`     Videos after cleaning: ${videosAfterCleaning}`);
        console.log(`     Videos removed: ${videosBeforeCleaning - videosAfterCleaning}`);
        console.log(`     All videos removed: ${videosAfterCleaning === 0 ? 'SUCCESS ✅' : 'PARTIAL ⚠️'}`);
      }
      console.log(`   📊 Images actually extracted: ${imageUrls.length}`);
    }
    
    return {
      imageUrls: imageUrls,
      cleanedHtml: cleanedHtml,
      stats: {
        originalLength: htmlContent ? htmlContent.length : 0,
        cleanedLength: cleanedHtml.length,
        imagesFound: imageUrls.length,
        imagesBeforeConfronto: imagesBeforeConfronto,
        imagesAfterConfronto: imagesAfterConfronto,
        videosFound: videosBeforeCleaning,
        videosRemoved: videosBeforeCleaning - videosAfterCleaning,
        sizeDifference: (htmlContent ? htmlContent.length : 0) - cleanedHtml.length,
        confrontoRemoved: originalHasConfronto && !cleanedHasConfronto
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
      
      // Estrai gli URL delle immagini esistenti per il confronto nomi file
      const existingUrls = existingImages.map(img => img.src);
      
      // 🆕 DEBUG: Mostra i nomi file esistenti
      if (existingImages.length > 0) {
        console.log(`📁 Existing image filenames:`);
        existingImages.forEach((img, index) => {
          try {
            const urlObj = new URL(img.src);
            const filename = urlObj.pathname.split('/').pop();
            const normalized = this.normalizeUrlForComparison(img.src);
            console.log(`   ${index + 1}. "${filename}" (normalized: "${normalized}")`);
          } catch (e) {
            console.log(`   ${index + 1}. Invalid URL: ${img.src}`);
          }
        });
      }
      
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

  // 🔧 FUNZIONE MIGLIORATA: Normalizza URL per confronto (VERSIONE AVANZATA)
  normalizeUrlForComparison(url) {
    if (!url) return '';
    
    try {
      // Estrai il nome del file dall'URL
      const urlObj = new URL(url);
      let filename = urlObj.pathname.split('/').pop(); // Ultimo segmento del path
      
      // Rimuovi parametri di query (come ?v=123456)
      filename = filename.split('?')[0];
      
      // 🆕 RIMUOVE UUID SHOPIFY: Pattern come "_91684341-9315-458c-b900-36c74dad60da"
      filename = filename.replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '');
      
      // 🆕 RIMUOVE ANCHE ALTRI PATTERN SHOPIFY COMUNI
      filename = filename.replace(/_[a-f0-9]{32}/gi, ''); // Hash MD5
      filename = filename.replace(/_\d{13}/gi, ''); // Timestamp
      
      // 🆕 NORMALIZZA CARATTERI SPECIALI (come Shopify fa durante l'upload)
      filename = filename
        .replace(/[^a-zA-Z0-9._-]/g, '_') // Sostituisci caratteri speciali con underscore
        .replace(/_+/g, '_') // Rimuovi underscore multipli
        .replace(/^_|_$/g, '') // Rimuovi underscore all'inizio/fine
        .toLowerCase()
        .trim();
      
      console.log(`🔍 Normalized "${url}" → "${filename}"`);
      return filename;
      
    } catch (error) {
      console.warn(`⚠️ Error normalizing URL ${url}:`, error.message);
      return url.toLowerCase();
    }
  }

  generateUniqueFilename(originalUrl, productId) {
    try {
      const urlObj = new URL(originalUrl);
      let filename = urlObj.pathname.split('/').pop();
      
      // Rimuovi estensione
      const parts = filename.split('.');
      const extension = parts.pop();
      const baseName = parts.join('.');
      
      // Pulisci il nome base
      const cleanBaseName = baseName
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      
      // 🆕 AGGIUNGI PREFISSO UNIVOCO basato su productId
      const uniqueFilename = `${cleanBaseName}_p${productId}.${extension}`;
      
      console.log(`📁 Generated unique filename: "${filename}" → "${uniqueFilename}"`);
      return uniqueFilename;
      
    } catch (error) {
      return `image_p${productId}_${Date.now()}.jpg`;
    }
  }

  // 🔧 FUNZIONE MIGLIORATA: Controlla duplicati con confronto file names
  async uploadImageToShopify(imageUrl, productId, existingUrls = []) {
    try {
      console.log(`📤 Processing image: ${imageUrl}`);
      
      // 🆕 GENERA NOME FILE UNICO per evitare UUID Shopify
      const originalFilename = this.generateUniqueFilename(imageUrl, productId);
      console.log(`📁 Using unique filename: "${originalFilename}"`);
      
      // 🆕 CONTROLLO DUPLICATI RIMOSSO - Ogni prodotto ha nomi unici
      console.log(`🔍 Skipping duplicate check - using unique filename approach`);
      console.log(`   Unique filename ensures no collisions: "${originalFilename}"`);
      
      console.log(`✅ Uploading with unique filename: ${originalFilename}`);
      
      // 🆕 PAYLOAD CON NOME FILE UNICO
      const imagePayload = {
        image: {
          src: imageUrl,
          filename: originalFilename  // 🎯 USA NOME FILE UNICO
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

      console.log(`✅ New image uploaded successfully:`);
      console.log(`   - ID: ${response.data.image.id}`);
      console.log(`   - Unique filename: "${originalFilename}"`);
      console.log(`   - Shopify URL: ${response.data.image.src}`);
      console.log(`   - No UUID added by Shopify! ✅`);
      
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
      console.error(`❌ Failed to upload image ${imageUrl}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        originalUrl: imageUrl
      };
    }
  }

  // 🆕 FUNZIONE: Scarica immagine da gfx3.senetic.com
  async downloadImageFromGfx3(imageUrl) {
    try {
      console.log(`📥 Downloading image from gfx3: ${imageUrl}`);
      
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://senetic.com/',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        timeout: 15000,
        maxRedirects: 5
      });
      
      if (response.status === 200 && response.data) {
        console.log(`✅ Downloaded ${response.data.length} bytes from gfx3`);
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
      console.error(`❌ Failed to download from gfx3: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 🆕 FUNZIONE: Carica immagine temporaneamente su Cloudinary
  async uploadToCloudinaryTemp(imageBuffer, originalUrl) {
    try {
      console.log(`☁️ Uploading to Cloudinary temp storage...`);
      
      // Estrai nome file dall'URL originale
      const urlObj = new URL(originalUrl);
      const filename = urlObj.pathname.split('/').pop().split('.')[0];
      const timestamp = Date.now();
      const publicId = `senetic_temp/${filename}_${timestamp}`;
      
      // Upload buffer a Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            public_id: publicId,
            folder: 'senetic_temp',
            resource_type: 'image',
            invalidate: true,
            transformation: [
              { quality: 'auto:good', fetch_format: 'auto' }
            ]
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(error);
            } else {
              resolve(result);
            }
          }
        ).end(imageBuffer);
      });
      
      console.log(`✅ Uploaded to Cloudinary: ${uploadResult.secure_url}`);
      console.log(`   Public ID: ${uploadResult.public_id}`);
      console.log(`   Size: ${uploadResult.bytes} bytes`);
      
      return {
        success: true,
        cloudinaryUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        originalUrl: originalUrl
      };
      
    } catch (error) {
      console.error(`❌ Cloudinary upload failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        originalUrl: originalUrl
      };
    }
  }

  // 🆕 FUNZIONE: Elimina immagine da Cloudinary
  async deleteFromCloudinary(publicId) {
    try {
      console.log(`🗑️ Deleting from Cloudinary: ${publicId}`);
      
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        console.log(`✅ Deleted from Cloudinary: ${publicId}`);
        return { success: true };
      } else {
        console.warn(`⚠️ Cloudinary delete result: ${result.result}`);
        return { success: false, error: result.result };
      }
      
    } catch (error) {
      console.error(`❌ Failed to delete from Cloudinary: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 🔧 FUNZIONE PRINCIPALE: Processa immagine gfx3 tramite cloud
  async processGfx3ImageViaCloud(imageUrl, productId, existingUrls = []) {
    const tempUploads = []; // Per tenere traccia degli upload temporanei
    
    try {
      console.log(`🔄 Processing gfx3 image via cloud: ${imageUrl}`);
      
      // STEP 1: Controlla duplicati (con URL originale)
      const normalizedNewFilename = this.normalizeUrlForComparison(imageUrl);
      console.log(`🔍 Cloud processing - checking duplicates for: "${normalizedNewFilename}"`);

      const isDuplicate = existingUrls.some(existingUrl => {
        const normalizedExistingFilename = this.normalizeUrlForComparison(existingUrl);
        console.log(`   Cloud comparing "${normalizedNewFilename}" with "${normalizedExistingFilename}"`);
        
        const isMatch = normalizedExistingFilename === normalizedNewFilename;
        
        if (isMatch) {
          console.log(`   🚫 CLOUD FILENAME MATCH! "${normalizedNewFilename}" already exists`);
        }
        
        return isMatch;
      });

      if (isDuplicate) {
        // Estrai il nome file per il messaggio
        let originalFilename = '';
        try {
          const urlObj = new URL(imageUrl);
          originalFilename = urlObj.pathname.split('/').pop();
        } catch (e) {
          originalFilename = 'unknown';
        }
        
        console.log(`⚠️ DUPLICATE FILENAME FOUND - Image with same name already exists, skipping: ${imageUrl}`);
        console.log(`   Filename: "${originalFilename}" (normalized: "${normalizedNewFilename}")`);
        return {
          success: false,
          error: `Image with same filename already exists: ${originalFilename}`,
          originalUrl: imageUrl,
          originalFilename: originalFilename,
          skipped: true,
          duplicate: true,
          duplicateReason: 'same_filename'
        };
      }
      
      // STEP 2: Scarica da gfx3
      console.log(`📥 Step 1/4: Downloading from gfx3...`);
      const downloadResult = await this.downloadImageFromGfx3(imageUrl);
      if (!downloadResult.success) {
        return {
          success: false,
          error: `Download failed: ${downloadResult.error}`,
          originalUrl: imageUrl
        };
      }
      
      // STEP 3: Upload temporaneo su Cloudinary
      console.log(`☁️ Step 2/4: Uploading to Cloudinary temp...`);
      const cloudUploadResult = await this.uploadToCloudinaryTemp(downloadResult.data, imageUrl);
      if (!cloudUploadResult.success) {
        return {
          success: false,
          error: `Cloud upload failed: ${cloudUploadResult.error}`,
          originalUrl: imageUrl
        };
      }
      
      tempUploads.push(cloudUploadResult.publicId); // Traccia per cleanup
      
      // STEP 4: Upload su Shopify dal cloud
      console.log(`📤 Step 3/4: Uploading to Shopify from cloud...`);

      // 🆕 GENERA NOME FILE UNICO per evitare UUID Shopify
      const originalFilename = this.generateUniqueFilename(imageUrl, productId);
      console.log(`📁 Using unique gfx3 filename: "${originalFilename}"`);

      // 🆕 UPLOAD CON NOME FILE UNICO
      const imagePayload = {
        image: {
          src: cloudUploadResult.cloudinaryUrl,
          filename: originalFilename  // 🎯 USA IL NOME FILE ORIGINALE DA GFX3
        }
      };

      try {
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

        console.log(`✅ Shopify upload successful:`);
        console.log(`   - ID: ${shopifyResponse.data.image.id}`);
        console.log(`   - Original filename: "${originalFilename}"`);
        console.log(`   - Final URL: ${shopifyResponse.data.image.src}`);

        const shopifyUploadResult = {
          success: true,
          imageId: shopifyResponse.data.image.id,
          src: shopifyResponse.data.image.src,
          originalFilename: originalFilename
        };
        
        // STEP 5: Cleanup - Elimina da Cloudinary
        console.log(`🗑️ Step 4/4: Cleaning up Cloudinary...`);
        const deleteResult = await this.deleteFromCloudinary(cloudUploadResult.publicId);
        if (!deleteResult.success) {
          console.warn(`⚠️ Failed to cleanup Cloudinary: ${deleteResult.error}`);
        }
        
        if (shopifyUploadResult.success) {
          console.log(`✅ gfx3 image processed successfully via cloud`);
          console.log(`   Original: ${imageUrl}`);
          console.log(`   Shopify ID: ${shopifyUploadResult.imageId}`);
          return {
            success: true,
            imageId: shopifyUploadResult.imageId,
            src: shopifyUploadResult.src,
            originalUrl: imageUrl,
            cloudUrl: cloudUploadResult.cloudinaryUrl,
            isNew: true,
            processedViaCloud: true
          };
        } else {
          return {
            success: false,
            error: `Shopify upload failed: ${shopifyUploadResult.error}`,
            originalUrl: imageUrl
          };
        }
      } catch (shopifyError) {
        console.error(`❌ Shopify upload failed:`, shopifyError.response?.data || shopifyError.message);
        const shopifyUploadResult = {
          success: false,
          error: shopifyError.response?.data || shopifyError.message
        };
      }
      
    } catch (error) {
      // Cleanup in caso di errore
      for (const publicId of tempUploads) {
        await this.deleteFromCloudinary(publicId);
      }
      
      console.error(`❌ gfx3 cloud processing failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
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

    console.log(`\n🧪 === NORMALIZATION TEST ===`);
    const testUrls = [
      'https://gfx3.senetic.com/product-description-images/AMO_2G13_2.jpg',
      'https://proomnibus.shop/cdn/shop/files/AMO_2G13_2_91684341-9315-458c-b900-36c74dad60da.jpg',
      'https://cdn.shopify.com/s/files/1/xxxx/xxxx/files/AMO_2G13_2_abc123def456.jpg'
    ];

    testUrls.forEach(url => {
      const normalized = this.normalizeUrlForComparison(url);
      console.log(`URL: ${url}`);
      console.log(`Normalized: "${normalized}"`);
      console.log('---');
    });
    console.log(`=== END NORMALIZATION TEST ===\n`);

    const startTime = Date.now();
    let importResults = {
      imported: 0,
      updated: 0,
      skipped: 0,
      skipped_no_inventory: 0,      // 🆕 Prodotti senza inventario
      skipped_zero_stock: 0,        // 🆕 Prodotti con stock = 0
      skipped_no_images: 0,         // 🆕 Prodotti senza immagini
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

      // Filtri per categorie (BRAND RIMOSSO - IMPORTA TUTTI I BRAND)
      const categorieDesiderate = [
        'Sistemi di sorveglianza',
        'Reti',
        'Dispositivi smart per la casa',
        'Allarmi e sensori domestici'
      ].map(c => c.trim().toLowerCase());

      // 🆕 FILTRO BRAND RIMOSSO - Ora importiamo TUTTI i brand nelle categorie selezionate
      console.log(`🔓 Brand filter REMOVED - importing ALL brands in selected categories`);

      // 2. Crea una mappa inventario per manufacturerItemCode
      const inventoryMap = {};
      for (const item of inventoryLines) {
        if (item.manufacturerItemCode) {
          inventoryMap[item.manufacturerItemCode] = item;
        }
      }

      console.log(`🗂️ Created inventory map with ${Object.keys(inventoryMap).length} items`);

      // 3. Filtra prodotti SOLO per categoria (brand filter rimosso)
      const prodottiFiltrati = catalogueLines.filter(
        prodotto =>
          prodotto.productSecondaryCategory &&
          prodotto.productSecondaryCategory.categoryNodeName &&
          categorieDesiderate.includes(prodotto.productSecondaryCategory.categoryNodeName.trim().toLowerCase())
      );

      console.log(`🔍 Filtered to ${prodottiFiltrati.length} products matching criteria`);

      // 🆕 LIMITE RIMOSSO - Importa TUTTI i prodotti filtrati
      const prodottiDaImportare = prodottiFiltrati; // Nessun limite
      const totalProducts = prodottiDaImportare.length;
      let processedCount = 0;

      console.log(`📦 Processing ALL ${totalProducts} products (no limit applied)...`);
      
      // 🆕 INFORMAZIONI SUI FILTRI APPLICATI
      console.log(`\n🔧 ACTIVE FILTERS:`);
      console.log(`   🏷️ Categories: ${categorieDesiderate.join(', ')}`);
      console.log(`   🏢 Brands: ALL BRANDS (no brand filter applied)`);
      console.log(`   📦 Stock: > 0 (zero stock products excluded)`);
      console.log(`   🖼️ Images: NOT REQUIRED (products without images will be imported)`);
      console.log(`   📈 Limit: NO LIMIT (all matching products will be imported)`);
      console.log(`════════════════════════════════════════════════════════════════════════`);

      console.log('\n📋 PRODUCTS MATCHING FILTERS:');
      prodottiFiltrati.forEach((prodotto, index) => {
        console.log(`${index + 1}. ${prodotto.manufacturerItemCode} - ${prodotto.itemDescription}`);
        console.log(`   Brand: ${prodotto.productPrimaryBrand?.brandNodeName || 'N/A'}`);
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
            importResults.skipped_no_inventory++;    // 🆕 Contatore specifico
            continue;
          }

          processedCount++;
          console.log(`🔄 Processing ${processedCount}/${totalProducts}: ${prodotto.manufacturerItemCode}`);

          // Calcola la quantità totale disponibile
          const availability = inventoryItem.availability && Array.isArray(inventoryItem.availability.stockSchedules)
            ? inventoryItem.availability.stockSchedules.reduce((sum, s) => sum + (s.targetStock || 0), 0)
            : 0;

          // 🆕 FILTRO 1: Escludi prodotti con quantità = 0
          if (availability <= 0) {
            console.log(`⚠️ Skipping ${prodotto.manufacturerItemCode} - zero stock (availability: ${availability})`);
            importResults.skipped++;
            importResults.skipped_zero_stock++;      // 🆕 Contatore specifico
            continue;
          }

          // 🆕 ESTRAZIONE E PULIZIA IMMAGINI DAL HTML
          const htmlProcessing = this.extractImagesAndCleanHtml(prodotto.longItemDescription);
          const imageUrls = htmlProcessing.imageUrls;
          const cleanedHtml = htmlProcessing.cleanedHtml;

          console.log(`🖼️ Found ${imageUrls.length} images in HTML description`);
          console.log(`📝 HTML cleaned: ${htmlProcessing.stats.originalLength} → ${htmlProcessing.stats.cleanedLength} chars`);

          // 🆕 FILTRO IMMAGINI RIMOSSO - Ora importiamo anche prodotti senza immagini
          if (imageUrls.length === 0) {
            console.log(`ℹ️ Product ${prodotto.manufacturerItemCode} has no images - importing anyway`);
          } else {
            console.log(`✅ Product ${prodotto.manufacturerItemCode} has ${imageUrls.length} images - will upload them`);
          }

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

          // 🆕 UPLOAD DELLE IMMAGINI AL PRODOTTO (CON NOMI FILE UNICI)
          let uploadedImages = [];

          if (imageUrls.length > 0 && productId) {
            console.log(`🖼️ Processing ${imageUrls.length} images for product ${productId}...`);
            
            // 🆕 NOMI FILE UNICI: Non serve più controllare immagini esistenti
            console.log(`📁 Using unique filename approach - each product gets unique image names`);
            console.log(`   Product ID ${productId} will have suffixed filenames: "_p${productId}"`);

            // 🆕 STEP: Upload tutte le immagini con nomi unici
            let newUploads = 0;
            let uploadErrors = 0;

            for (const imageUrl of imageUrls.slice(0, 5)) {
              importResults.images_processed++;
              console.log(`📤 Processing image ${importResults.images_processed}: ${imageUrl}`);
              
              let uploadResult;
              
              // 🆕 CONTROLLO: Se è gfx3, usa cloud processing
              try {
                const urlObj = new URL(imageUrl);
                if (urlObj.hostname === 'gfx3.senetic.com') {
                  console.log(`☁️ Using cloud processing for gfx3 image...`);
                  uploadResult = await this.processGfx3ImageViaCloud(imageUrl, productId, []); // Array vuoto - non serve più
                } else {
                  console.log(`🔗 Using direct upload for safe domain...`);
                  uploadResult = await this.uploadImageToShopify(imageUrl, productId, []); // Array vuoto - non serve più
                }
              } catch (urlError) {
                console.error(`❌ URL parsing error: ${urlError.message}`);
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
                const method = uploadResult.processedViaCloud ? '(via cloud)' : '(direct)';
                const filenameInfo = uploadResult.uniqueFilename ? '(unique filename)' : '(shopify named)';
                console.log(`✅ Image uploaded: ${uploadResult.imageId} ${method} ${filenameInfo}`);
              } else {
                importResults.images_failed++;
                uploadErrors++;
                console.log(`❌ Upload failed: ${uploadResult.error}`);
              }
              
              // Pausa più lunga per cloud processing
              const delay = uploadResult.processedViaCloud ? 1500 : 500;
              await new Promise(r => setTimeout(r, delay));
            }
            
            console.log(`📊 Images summary for product ${productId}:`);
            console.log(`   ✅ New uploads: ${newUploads}`);
            console.log(`   ❌ Upload errors: ${uploadErrors}`);
            console.log(`   📁 All images use unique filenames (no duplicates possible)`);
            
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
      
      // 🆕 LOG DETTAGLIATO DEI FILTRI APPLICATI
      console.log(`\n📋 DETAILED FILTERING REPORT:`);
      console.log(`   📦 Total products found: ${prodottiFiltrati.length}`);
      console.log(`   🔄 Products processed: ${prodottiDaImportare.length}`);
      console.log(`   ✅ Successfully imported/updated: ${importResults.imported + importResults.updated}`);
      console.log(`   ⚠️ Total skipped: ${importResults.skipped}`);
      console.log(`      ├─ 📦 No inventory data: ${importResults.skipped_no_inventory}`);
      console.log(`      └─ 🔢 Zero stock: ${importResults.skipped_zero_stock}`);
      console.log(`   🖼️ Image filter: DISABLED (products without images are imported)`);
      console.log(`   ❌ Failed: ${importResults.failed}`);
      console.log(`   🖼️ Images: ${importResults.images_uploaded}/${importResults.images_processed} uploaded`);
      console.log(`════════════════════════════════════════════════════════════════════════\n`);

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