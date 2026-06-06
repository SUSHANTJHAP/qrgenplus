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
const QR_MARGIN  = 1;

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
    type: 'rounded',
  },
  cornersSquareOptions: {
    color: '#6366F1',
    type: 'extra-rounded',
  },
  cornersDotOptions: {
    color: '#4F46E5',
    type: 'dot',
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
let downloadBtn, copyBtn;
let tabs, panels;
let inputLink, inputText;
let inputWifiSsid, inputWifiPass, inputWifiSec;
let inputImage;
let hintLink;

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
  updateDownloadBtn(false);
});

function resolveDOM() {
  canvasWrapper     = document.getElementById('qr-canvas-wrapper');
  canvasPlaceholder = document.getElementById('qr-placeholder');
  scannerImg        = document.getElementById('scanner-canvas');
  downloadBtn       = document.getElementById('btn-download');
  copyBtn           = document.getElementById('btn-copy');
  tabs              = document.querySelectorAll('.qr-tab-btn');
  panels            = document.querySelectorAll('.qr-tab-panel');
  inputLink         = document.getElementById('input-link');
  inputText         = document.getElementById('input-text');
  inputWifiSsid     = document.getElementById('input-wifi-ssid');
  inputWifiPass     = document.getElementById('input-wifi-pass');
  inputWifiSec      = document.getElementById('input-wifi-sec');
  inputImage        = document.getElementById('input-image');
  hintLink          = document.getElementById('hint-link');
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
function generateQR(data) {
  if (!data || !data.trim()) {
    showToast('Please enter some content first.', 'error');
    return;
  }

  const trimmed = data.trim();
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

/**
 * Copy the rendered QR canvas into the smaller scanner preview.
 */
function syncScannerPreview() {
  const src = canvasWrapper.querySelector('canvas');
  if (!src || !scannerImg) return;
  scannerImg.src = src.toDataURL('image/png');
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
  // ----- Link Tab -----
  const btnLink = document.getElementById('btn-generate-link');
  if (btnLink) btnLink.addEventListener('click', handleLinkGenerate);
  if (inputLink) {
    inputLink.addEventListener('keydown', e => { if (e.key === 'Enter') handleLinkGenerate(); });
    inputLink.addEventListener('input', () => validateURL(inputLink.value));
  }

  // ----- Text Tab -----
  const btnText = document.getElementById('btn-generate-text');
  if (btnText) btnText.addEventListener('click', handleTextGenerate);

  // ----- WiFi Tab -----
  const btnWifi = document.getElementById('btn-generate-wifi');
  if (btnWifi) btnWifi.addEventListener('click', handleWifiGenerate);

  // ----- Image/PDF Tab -----
  const btnImage = document.getElementById('btn-generate-image');
  if (btnImage) btnImage.addEventListener('click', handleImageGenerate);
}

/* ============================================================
   GENERATE HANDLERS (per tab)
   ============================================================ */
function handleLinkGenerate() {
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
  generateQR(val);
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

  if (type === 'NOPASS' || type === 'nopass') {
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

  // Use QRCodeStyling's built-in download method
  qrCode.download({
    name:      'qrgenplus-code',
    extension: 'png',
  });

  showToast('✅ QR code saved as PNG!', 'success');
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
  const canvas = canvasWrapper ? canvasWrapper.querySelector('canvas') : null;
  if (!canvas) {
    showToast('Could not find QR canvas to copy.', 'error');
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
        showToast('Copy failed — try downloading instead.', 'error');
      }
    }, 'image/png');
  } catch {
    showToast('Copy not supported in this browser.', 'error');
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
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('mobile-nav-menu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
      mobileMenu.style.display = open ? 'flex' : 'none';
    });
  }
});
