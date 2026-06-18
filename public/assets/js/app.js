/**
 * QRGenPlus — app.js
 * Core application logic: tab switching, QR generation, download, toasts.
 * Zero dependencies beyond qrcode-styling loaded via CDN in index.html.
 * All processing is 100% client-side — no network calls, no data storage.
 */

'use strict';

/* ============================================================
   CONSTANTS
   ============================================================ */
const QR_SIZE    = 200;
const QR_MARGIN  = 15;

const QR_STYLE_OPTIONS = {
  width:  QR_SIZE,
  height: QR_SIZE,
  margin: QR_MARGIN,
  qrOptions: {
    typeNumber: 0,
    mode: 'Byte',
    errorCorrectionLevel: 'M',
  },
  dotsOptions: {
    color: '#0F172A',
    type: 'square',
  },
  cornersSquareOptions: {
    color: '#0F172A',
    type: 'square',
  },
  cornersDotOptions: {
    color: '#0F172A',
    type: 'square',
  },
  backgroundOptions: {
    color: '#FFFFFF',
  },
  imageOptions: {
    crossOrigin: 'anonymous',
    margin: 4,
  },
};

/* ============================================================
   STATE
   ============================================================ */
let qrCode       = null;   // QRCodeStyling instance
let currentData  = '';     // Last successfully generated QR data string
let activeTab    = 'link'; // Currently active tab id

/* ============================================================
   DOM REFERENCES (resolved at DOMContentLoaded)
   ============================================================ */
let canvasWrapper, canvasPlaceholder, scannerImg;
let downloadBtn, copyBtn, editBtn, exportFormat;
let tabs, panels;
let inputLink, inputText;
let inputWifiSsid, inputWifiPass, inputWifiSec;
let inputImage;
let hintLink;
let modalEdit, btnCloseModal, btnApplyEdit, btnDefaultEdit, colorFg, colorBg, inputQrLabel, inputQrLogo, inputQrShape;
let inputVcardFname, inputVcardLname, inputVcardPhone, inputVcardEmail, inputVcardOrg;
let inputEmailTo, inputEmailName, inputEmailBody;
let inputSmsPhone, inputSmsName, inputSmsBody;
let inputBatch;

/* ============================================================
   INITIALISE
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  resolveDOM();
  initQRCode();
  bindTabs();
  bindInputs();
  bindDownload();
  bindCopy();
  bindEditModal();
  updateDownloadBtn(false);
  initMobileNav();
  initDynamicCopyright();
});

function resolveDOM() {
  canvasWrapper     = document.getElementById('qr-canvas-wrapper');
  canvasPlaceholder = document.getElementById('qr-placeholder');
  scannerImg        = document.getElementById('scanner-canvas');
  downloadBtn       = document.getElementById('btn-download');
  copyBtn           = document.getElementById('btn-copy');
  editBtn           = document.getElementById('btn-edit');
  exportFormat      = document.getElementById('export-format');
  tabs              = document.querySelectorAll('.qr-tab-btn');
  panels            = document.querySelectorAll('.qr-tab-panel');
  inputLink         = document.getElementById('input-link');
  inputText         = document.getElementById('input-text');
  inputWifiSsid     = document.getElementById('input-wifi-ssid');
  inputWifiPass     = document.getElementById('input-wifi-pass');
  inputWifiSec      = document.getElementById('input-wifi-sec');
  inputImage        = document.getElementById('input-image');
  hintLink          = document.getElementById('hint-link');

  modalEdit         = document.getElementById('edit-modal');
  btnCloseModal     = document.getElementById('btn-close-modal');
  btnApplyEdit      = document.getElementById('btn-apply-edit');
  btnDefaultEdit    = document.getElementById('btn-default-edit');
  colorFg           = document.getElementById('color-fg');
  colorBg           = document.getElementById('color-bg');
  inputQrLabel      = document.getElementById('input-qr-label');
  inputQrLogo       = document.getElementById('input-qr-logo');
  inputQrShape      = document.getElementById('input-qr-shape');

  inputVcardFname   = document.getElementById('input-vcard-fname');
  inputVcardLname   = document.getElementById('input-vcard-lname');
  inputVcardPhone   = document.getElementById('input-vcard-phone');
  inputVcardEmail   = document.getElementById('input-vcard-email');
  inputVcardOrg     = document.getElementById('input-vcard-org');
  
  inputEmailTo      = document.getElementById('input-email-to');
  inputEmailName    = document.getElementById('input-email-name');
  inputEmailBody    = document.getElementById('input-email-body');

  inputSmsPhone     = document.getElementById('input-sms-phone');
  inputSmsName      = document.getElementById('input-sms-name');
  inputSmsBody      = document.getElementById('input-sms-body');
  inputBatch        = document.getElementById('input-batch');
}

/* ============================================================
   QR CODE ENGINE
   ============================================================ */
function initQRCode() {
  // QRCodeStyling is loaded globally via CDN script tag
  qrCode = new QRCodeStyling({ ...QR_STYLE_OPTIONS, data: 'https://qrgenplus.com' });
}

/**
 * Generate a QR code from a data string and render it into the canvas wrapper.
 * @param {string} data — The string to encode
 */
async function generateQR(data) {
  if (!data || !data.trim()) {
    showToast('Please enter some content first.', 'error');
    return;
  }

  let trimmed = data.trim();
  
  // Handle Dynamic Toggle (Premium Feature)
  const activePanel = document.querySelector(`.qr-tab-panel[data-panel="${activeTab}"]`);
  const dynamicToggle = activePanel ? activePanel.querySelector('.toggle-dynamic') : null;
  if (dynamicToggle && dynamicToggle.checked) {
    try {
      const btn = document.activeElement;
      const oldText = btn.innerText;
      if (btn.tagName === 'BUTTON') btn.innerText = 'Creating...';
      
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          target_url: trimmed, 
          original_title: 'Dynamic QR (' + activeTab + ')' 
        })
      });
      
      if (btn.tagName === 'BUTTON') btn.innerText = oldText;
      
      if (res.status === 401 || res.status === 403) {
        dynamicToggle.checked = false;
        showToast('Active subscription required for Dynamic QRs. Redirecting...', 'error');
        setTimeout(() => window.location.href = 'dashboard.html', 1500);
        return;
      }
      
      const json = await res.json();
      if (json.success && json.link) {
        trimmed = json.link.short_url;
      } else {
        showToast('Error creating dynamic link', 'error');
        return;
      }
    } catch (e) {
      showToast('Network error while creating dynamic link', 'error');
      return;
    }
  }

  currentData = trimmed;

  // Remove existing canvas/svg child (QRCodeStyling appends, not replaces)
  const existing = canvasWrapper.querySelector('canvas, svg');
  if (existing) existing.remove();

  // Hide placeholder
  if (canvasPlaceholder) canvasPlaceholder.style.display = 'none';

  // Update QRCodeStyling data and append fresh render
  qrCode.update({ data: trimmed });
  qrCode.append(canvasWrapper);

  // After a short frame, sync the scanner preview
  requestAnimationFrame(() => {
    syncScannerPreview();
    updateDownloadBtn(true);
    showToast('QR code generated!', 'success');
  });
}

function getWrapperCanvas() {
  const original = canvasWrapper.querySelector('canvas');
  if (!original) return null;
  const labelText = inputQrLabel ? inputQrLabel.value.trim() : '';
  if (!labelText) return original; // No text, just use original

  const width = original.width;
  const qrHeight = original.height;
  const textHeight = 40;
  const padding = 10;
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = qrHeight + textHeight + padding;
  const ctx = canvas.getContext('2d');
  
  // Fill background
  const bgColor = colorBg ? colorBg.value : '#FFFFFF';
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw QR
  ctx.drawImage(original, 0, 0);
  
  // Draw text
  const fgColor = colorFg ? colorFg.value : '#0F172A';
  ctx.fillStyle = fgColor;
  ctx.font = 'bold 20px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(labelText, width / 2, qrHeight + textHeight / 2 + padding / 2);
  
  return canvas;
}

/**
 * Copy the rendered QR canvas into the smaller scanner preview.
 */
function syncScannerPreview() {
  const canvas = getWrapperCanvas();
  if (!canvas || !scannerImg) return;
  scannerImg.src = canvas.toDataURL('image/png');
}

/* ============================================================
   TAB SWITCHING
   ============================================================ */
function bindTabs() {
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  activeTab = tabId;

  // Toggle button states
  tabs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
    btn.setAttribute('aria-selected', btn.dataset.tab === tabId ? 'true' : 'false');
  });

  // Toggle panel visibility
  panels.forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === tabId);
  });

  // Reset QR output when switching tabs
  clearOutput();
}

/* ============================================================
   INPUT BINDING — Generate on button click or Enter key
   ============================================================ */
function bindInputs() {
  const bindEnter = (inputs, handler) => {
    inputs.forEach(input => {
      if (input) {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handler();
          }
        });
      }
    });
  };

  const bindCtrlEnter = (inputs, handler) => {
    inputs.forEach(input => {
      if (input) {
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handler();
          }
        });
      }
    });
  };

  // ----- Link Tab -----
  const btnLink = document.getElementById('btn-generate-link');
  if (btnLink) btnLink.addEventListener('click', handleLinkGenerate);
  if (inputLink) inputLink.addEventListener('input', () => validateURL(inputLink.value));
  bindEnter([inputLink], handleLinkGenerate);

  // ----- Text Tab -----
  const btnText = document.getElementById('btn-generate-text');
  if (btnText) btnText.addEventListener('click', handleTextGenerate);
  bindEnter([inputText], handleTextGenerate);

  // ----- WiFi Tab -----
  const btnWifi = document.getElementById('btn-generate-wifi');
  if (btnWifi) btnWifi.addEventListener('click', handleWifiGenerate);
  bindEnter([inputWifiSsid, inputWifiPass, inputWifiSec], handleWifiGenerate);

  // ----- Image/PDF Tab -----
  const btnImage = document.getElementById('btn-generate-image');
  if (btnImage) btnImage.addEventListener('click', handleImageGenerate);
  bindEnter([inputImage], handleImageGenerate);

  // ----- PDF Tab -----
  window.inputPdf = document.getElementById('input-pdf');
  const btnPdf = document.getElementById('btn-generate-pdf');
  if (btnPdf) btnPdf.addEventListener('click', handlePdfGenerate);

  // ----- VCard Tab -----
  const btnVcard = document.getElementById('btn-generate-vcard');
  if (btnVcard) btnVcard.addEventListener('click', handleVcardGenerate);
  bindEnter([inputVcardFname, inputVcardLname, inputVcardPhone, inputVcardEmail, inputVcardOrg], handleVcardGenerate);

  // ----- Email Tab -----
  const btnEmail = document.getElementById('btn-generate-email');
  if (btnEmail) btnEmail.addEventListener('click', handleEmailGenerate);
  bindEnter([inputEmailTo, inputEmailName, inputEmailBody], handleEmailGenerate);

  // ----- SMS Tab -----
  const btnSms = document.getElementById('btn-generate-sms');
  if (btnSms) btnSms.addEventListener('click', handleSmsGenerate);
  bindEnter([inputSmsPhone, inputSmsName, inputSmsBody], handleSmsGenerate);

  // ----- Batch Tab -----
  // For batch input, we want to preserve Enter for new lines by default since it requires one per line.
  // We will keep Batch as Ctrl+Enter.
  const btnBatch = document.getElementById('btn-generate-batch');
  if (btnBatch) btnBatch.addEventListener('click', handleBatchGenerate);
  bindCtrlEnter([inputBatch], handleBatchGenerate);
}

/* ============================================================
   GENERATE HANDLERS (per tab)
   ============================================================ */
async function handleLinkGenerate() {
  const val = inputLink ? inputLink.value.trim() : '';
  if (!val) { showHint(hintLink, 'Please enter a URL.', 'error'); return; }

  const valid = isValidURL(val);
  if (!valid) {
    showHint(hintLink, 'Please enter a valid URL (must start with http:// or https://).', 'error');
    inputLink.classList.add('error');
    return;
  }

  inputLink.classList.remove('error');
  showHint(hintLink, 'Valid URL ✓', 'success');

  const isDynamic = document.getElementById('toggle-dynamic') && document.getElementById('toggle-dynamic').checked;
  
  if (isDynamic) {
    try {
      const btnLink = document.getElementById('btn-generate-link');
      const originalText = btnLink.innerText;
      btnLink.innerText = 'Creating...';
      
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_url: val, original_title: val.substring(0, 50) })
      });
      
      btnLink.innerText = originalText;
      
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Failed to create dynamic link', 'error');
        return;
      }
      
      const data = await res.json();
      generateQR(data.link.short_url);
    } catch (err) {
      console.error(err);
      showToast('Network error while creating dynamic link', 'error');
    }
  } else {
    generateQR(val);
  }
}

function handleTextGenerate() {
  const val = inputText ? inputText.value.trim() : '';
  if (!val) { showToast('Please enter some text first.', 'error'); return; }
  if (val.length > 2500) { showToast('Text is too long (max 2500 characters).', 'error'); return; }
  generateQR(val);
}

function handleWifiGenerate() {
  const ssid = inputWifiSsid ? inputWifiSsid.value.trim() : '';
  const pass  = inputWifiPass ? inputWifiPass.value : '';
  const sec   = inputWifiSec  ? inputWifiSec.value  : 'WPA';

  if (!ssid) { showToast('Network Name (SSID) is required.', 'error'); return; }

  // Build standard WiFi QR string
  const wifiString = buildWifiString(ssid, pass, sec);
  generateQR(wifiString);
}

function handleImageGenerate() {
  const val = inputImage ? inputImage.value.trim() : '';
  if (!val) { showToast('Please paste your file share link first.', 'error'); return; }
  if (!isValidURL(val)) { showToast('Please enter a valid URL.', 'error'); return; }
  generateQR(val);
}

async function handlePdfGenerate() {
  if (!inputPdf || !inputPdf.files || inputPdf.files.length === 0) {
    showToast('Please select a PDF file first.', 'error');
    return;
  }
  
  const file = inputPdf.files[0];
  if (file.type !== 'application/pdf') {
    showToast('Only PDF files are supported.', 'error');
    return;
  }

  const btnPdf = document.getElementById('btn-generate-pdf');
  const defaultText = btnPdf.innerText;
  btnPdf.innerText = 'Uploading...';
  btnPdf.disabled = true;

  try {
    const formData = new FormData();
    formData.append('pdf', file);

    const res = await fetch('/api/upload-pdf', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload PDF');
    }

    showToast('PDF Uploaded! Generating QR...', 'success');
    generateQR(data.link.short_url);
  } catch (err) {
    showToast(err.message, 'error');
    if (err.message.toLowerCase().includes('subscription')) {
      if(window.location.pathname !== '/dashboard.html') {
         window.location.href = '/dashboard.html';
      }
    }
  } finally {
    btnPdf.innerText = defaultText;
    btnPdf.disabled = false;
  }
}

function handleVcardGenerate() {
  const fn = inputVcardFname ? inputVcardFname.value.trim() : '';
  const ln = inputVcardLname ? inputVcardLname.value.trim() : '';
  const phone = inputVcardPhone ? inputVcardPhone.value.trim() : '';
  const email = inputVcardEmail ? inputVcardEmail.value.trim() : '';
  const org = inputVcardOrg ? inputVcardOrg.value.trim() : '';
  
  if (!fn && !ln && !phone && !email && !org) {
    showToast('Please fill out at least one contact field.', 'error');
    return;
  }
  
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nN:${ln};${fn};;;\nFN:${fn} ${ln}\nORG:${org}\nTEL;TYPE=CELL:${phone}\nEMAIL:${email}\nEND:VCARD`;
  generateQR(vcard);
}

function handleEmailGenerate() {
  const to = inputEmailTo ? inputEmailTo.value.trim() : '';
  const name = inputEmailName ? inputEmailName.value.trim() : '';
  const body = inputEmailBody ? inputEmailBody.value.trim() : '';
  
  if (!to) {
    showToast('Recipient email is required.', 'error');
    return;
  }
  
  const recipient = name ? `${name} <${to}>` : to;
  let mailto = `mailto:${recipient}`;
  if (body) {
    mailto += `?body=${encodeURIComponent(body)}`;
  }
  
  generateQR(mailto);
}

function handleSmsGenerate() {
  const phone = inputSmsPhone ? inputSmsPhone.value.trim() : '';
  const name = inputSmsName ? inputSmsName.value.trim() : '';
  const body = inputSmsBody ? inputSmsBody.value.trim() : '';

  if (!phone) { showToast('Phone Number is required.', 'error'); return; }

  let finalBody = body;
  if (name && finalBody) {
    finalBody = `Hi ${name},\n\n${finalBody}`;
  } else if (name) {
    finalBody = `Hi ${name}`;
  }

  let smsto = `smsto:${phone}`;
  if (finalBody) {
    smsto += `:${finalBody}`;
  }
  generateQR(smsto);
}

async function handleBatchGenerate() {
  if (typeof JSZip === 'undefined') {
    showToast('JSZip library is not loaded yet.', 'error');
    return;
  }
  const val = inputBatch ? inputBatch.value : '';
  const lines = val.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) { showToast('Please enter at least one line of text or URL.', 'error'); return; }
  if (lines.length > 500) { showToast('Maximum 500 codes per batch to prevent browser freezing.', 'error'); return; }

  showToast(`Generating ${lines.length} QR codes... Please wait.`, 'info');
  const btn = document.getElementById('btn-generate-batch');
  if (btn) btn.disabled = true;

  try {
    const zip = new JSZip();
    const format = exportFormat ? exportFormat.value : 'png';
    const ext = format === 'svg' ? 'svg' : format;

    for (let i = 0; i < lines.length; i++) {
      const dataString = lines[i];
      const qr = new QRCodeStyling({ ...QR_STYLE_OPTIONS, data: dataString });
      
      // Apply current appearance options
      const fg = colorFg ? colorFg.value : '#0F172A';
      const bg = colorBg ? colorBg.value : '#FFFFFF';
      const shape = inputQrShape ? inputQrShape.value : 'square';
      const logo = inputQrLogo && inputQrLogo.value ? inputQrLogo.value : undefined;
      qr.update({
        dotsOptions: { color: fg, type: shape },
        cornersSquareOptions: { color: fg, type: shape.includes('rounded') ? 'extra-rounded' : 'square' },
        cornersDotOptions: { color: fg, type: shape.includes('rounded') ? 'dots' : 'square' },
        backgroundOptions: { color: bg },
        image: logo
      });

      const blob = await qr.getRawData(ext);
      // Clean up filename: max 15 chars, alphanumeric
      let cleanName = dataString.replace(/[^a-z0-9]/gi, '_').substring(0, 15);
      if (!cleanName) cleanName = 'code';
      const filename = `qr_${i + 1}_${cleanName}.${ext}`;
      zip.file(filename, blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qrgenplus_batch.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`✅ Batch of ${lines.length} QR codes downloaded as ZIP!`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Error generating batch.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ============================================================
   WIFI STRING FORMATTER
   Reference: https://github.com/zxing/zxing/wiki/Barcode-Contents#wifi-network-config-android-ios-11
   Format: WIFI:T:[type];S:[ssid];P:[pass];;
   ============================================================ */
function buildWifiString(ssid, password, secType) {
  // Escape special characters: \ ; , " :
  const esc = str => str.replace(/[\\;,"':]/g, c => '\\' + c);

  const escapedSsid = esc(ssid);
  const escapedPass = password ? esc(password) : '';
  const type        = secType === 'nopass' ? 'nopass' : secType.toUpperCase();

  if (type === 'NOPASS') {
    return `WIFI:T:nopass;S:${escapedSsid};;`;
  }

  return `WIFI:T:${type};S:${escapedSsid};P:${escapedPass};;`;
}

/* ============================================================
   DOWNLOAD HANDLER
   ============================================================ */
function bindDownload() {
  if (!downloadBtn) return;
  downloadBtn.addEventListener('click', handleDownload);
}

function handleDownload() {
  if (!currentData || !qrCode) {
    showToast('Generate a QR code first!', 'error');
    return;
  }

  const format = exportFormat ? exportFormat.value : 'png';
  const labelText = inputQrLabel ? inputQrLabel.value.trim() : '';

  if (format === 'svg' && !labelText) {
    qrCode.download({ name: 'qrgenplus-code', extension: 'svg' });
    showToast('✅ QR code saved as SVG!', 'success');
    return;
  }

  const canvas = getWrapperCanvas();
  if (!canvas) return;
  
  const ext = format === 'svg' ? 'png' : format; 
  if (format === 'svg' && labelText) {
      showToast('SVG export with custom text is converted to PNG.', 'info');
  }

  const url = canvas.toDataURL(`image/${ext}`);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qrgenplus-code.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`✅ QR code saved as ${ext.toUpperCase()}!`, 'success');
}

/* ============================================================
   COPY TO CLIPBOARD HANDLER
   ============================================================ */
function bindCopy() {
  if (!copyBtn) return;
  copyBtn.addEventListener('click', handleCopy);
}

async function handleCopy() {
  if (!currentData || !qrCode) {
    showToast('Generate a QR code first!', 'error');
    return;
  }

  // Get the canvas element rendered by qrcode-styling
  const canvas = getWrapperCanvas();
  if (!canvas) {
    showToast('Could not find QR canvas to copy.', 'error');
    return;
  }

  // Check if Clipboard API with ClipboardItem is supported (not available in Firefox)
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    // Fallback: trigger a download instead
    showToast('Clipboard not supported — downloading instead.', 'info');
    handleDownload();
    return;
  }

  try {
    // Convert canvas to blob and copy via Clipboard API
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        // Visual feedback: briefly change button text
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `<svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Copied!`;
        setTimeout(() => { copyBtn.innerHTML = originalHTML; }, 2000);
        showToast('✅ QR code copied to clipboard!', 'success');
      } catch {
        // Fallback on permission denied / secure context issues
        showToast('Copy failed — downloading instead.', 'info');
        handleDownload();
      }
    }, 'image/png');
  } catch {
    showToast('Copy not supported — downloading instead.', 'info');
    handleDownload();
  }
}

/* ============================================================
   CLEAR OUTPUT (on tab switch)
   ============================================================ */
function clearOutput() {
  currentData = '';

  const existing = canvasWrapper ? canvasWrapper.querySelector('canvas, svg') : null;
  if (existing) existing.remove();

  if (canvasPlaceholder) canvasPlaceholder.style.display = '';
  if (scannerImg) scannerImg.src = '';

  updateDownloadBtn(false);

  // Clear all hints
  document.querySelectorAll('.input-hint').forEach(el => {
    el.textContent = '';
    el.className = 'input-hint';
  });
}

/* ============================================================
   VALIDATION HELPERS
   ============================================================ */
function isValidURL(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateURL(value) {
  if (!hintLink) return;
  if (!value) {
    showHint(hintLink, '', 'muted');
    if (inputLink) inputLink.classList.remove('error');
    return;
  }
  if (isValidURL(value)) {
    showHint(hintLink, 'Valid URL ✓', 'success');
    if (inputLink) inputLink.classList.remove('error');
  } else {
    showHint(hintLink, 'Enter a full URL including https://', 'error');
    if (inputLink) inputLink.classList.add('error');
  }
}

/* ============================================================
   UI HELPERS
   ============================================================ */
function updateDownloadBtn(enabled) {
  if (downloadBtn) downloadBtn.disabled = !enabled;
  if (copyBtn)     copyBtn.disabled     = !enabled;
  if (editBtn)     editBtn.disabled     = !enabled;
}

function bindEditModal() {
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (modalEdit) modalEdit.style.display = 'flex';
    });
  }
  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
      if (modalEdit) modalEdit.style.display = 'none';
    });
  }
  if (btnApplyEdit) {
    btnApplyEdit.addEventListener('click', () => {
      if (modalEdit) modalEdit.style.display = 'none';
      if (!currentData) return;
      
      const fg = colorFg ? colorFg.value : '#0F172A';
      const bg = colorBg ? colorBg.value : '#FFFFFF';
      const shape = inputQrShape ? inputQrShape.value : 'square';
      const logo = inputQrLogo && inputQrLogo.value.trim() ? inputQrLogo.value.trim() : undefined;
      const labelText = inputQrLabel ? inputQrLabel.value.trim() : '';
      
      const textNode = document.getElementById('qr-text-label');
      if (textNode) {
        textNode.textContent = labelText;
        textNode.style.display = labelText ? 'block' : 'none';
      }
      
      qrCode.update({
        dotsOptions: { color: fg, type: shape },
        cornersSquareOptions: { color: fg, type: shape.includes('rounded') ? 'extra-rounded' : 'square' },
        cornersDotOptions: { color: fg, type: shape.includes('rounded') ? 'dots' : 'square' },
        backgroundOptions: { color: bg },
        image: logo
      });
      
      // Syncing preview after rendering
      requestAnimationFrame(() => {
        syncScannerPreview();
      });
    });
  }

  if (btnDefaultEdit) {
    btnDefaultEdit.addEventListener('click', () => {
      if (colorFg) colorFg.value = '#0F172A';
      if (colorBg) colorBg.value = '#FFFFFF';
      if (inputQrShape) inputQrShape.value = 'square';
      if (inputQrLogo) inputQrLogo.value = '';
      if (btnApplyEdit) btnApplyEdit.click();
    });
  }

  // Allow pressing Enter inside the modal to apply changes
  if (modalEdit) {
    modalEdit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnApplyEdit) btnApplyEdit.click();
      }
    });
  }
}

function showHint(el, message, type = 'muted') {
  if (!el) return;
  el.textContent = message;
  el.className = `input-hint ${type}`;
}

/* ============================================================
   TOAST NOTIFICATION SYSTEM
   ============================================================ */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.classList.add('exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ============================================================
   MOBILE NAV TOGGLE
   ============================================================ */
function initMobileNav() {
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('mobile-nav-menu');

  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    mobileMenu.style.display = open ? 'flex' : 'none';
  });

  // Close menu when any nav link is tapped (mobile UX)
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      mobileMenu.style.display = 'none';
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  // Handle Dynamic Toggle Privacy Banner Visibility
  document.querySelectorAll('.toggle-dynamic').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      const toggleContainer = e.target.closest('.flex.items-center.justify-between.p-4.mb-4');
      if (toggleContainer) {
        const privacyBanner = toggleContainer.nextElementSibling;
        if (privacyBanner && privacyBanner.getAttribute('role') === 'note') {
          privacyBanner.style.display = e.target.checked ? 'none' : 'flex';
        }
      }
    });
  });
}

/* ============================================================
   DYNAMIC COPYRIGHT YEAR
   ============================================================ */
function initDynamicCopyright() {
  const els = document.querySelectorAll('.copyright-year');
  const year = new Date().getFullYear();
  els.forEach(el => { el.textContent = year; });
}
