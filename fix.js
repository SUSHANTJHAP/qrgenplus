const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Remove the global toggle
const globalToggleRegex = /<!-- ================================================\s+DYNAMIC TOGGLE \(PREMIUM\)\s+================================================ -->\s*<div class="flex items-center justify-between p-4 mb-4 rounded-xl bg-indigo-50 border border-indigo-100">[\s\S]*?<\/label>\s*<\/div>/;
html = html.replace(globalToggleRegex, '');

// 2. The toggle snippet to inject
const toggleSnippet = `          <!-- DYNAMIC TOGGLE (PREMIUM) -->
          <div class="flex items-center justify-between p-4 mb-4 rounded-xl bg-indigo-50 border border-indigo-100">
            <div>
              <h4 class="font-bold text-indigo-900 text-sm">Make Dynamic (Trackable)</h4>
              <p class="text-xs text-indigo-600 mt-0.5">Track scans & edit later <span class="font-bold text-xs bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded ml-1">PRO</span></p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" class="sr-only peer toggle-dynamic">
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
`;

// 3. Find the privacy banner and prepend the toggle
const bannerRegex = /(<div class="rounded-xl bg-indigo-950\/40 border border-indigo-500\/15 p-3 mb-4 flex gap-2\.5 items-start" role="note">)/g;

// Before replacing, let's make sure we don't duplicate it if we run it twice
if (!html.includes('<!-- DYNAMIC TOGGLE (PREMIUM) -->')) {
  html = html.replace(bannerRegex, toggleSnippet + '          $1');
}

fs.writeFileSync(indexPath, html);
console.log('index.html updated successfully.');

// Update app.js
const appPath = path.join(__dirname, 'public', 'assets', 'js', 'app.js');
let appJs = fs.readFileSync(appPath, 'utf8');

appJs = appJs.replace(
  "const dynamicToggle = document.getElementById('toggle-dynamic');",
  "const activePanel = document.querySelector(`.qr-tab-panel[data-panel=\"${activeTab}\"]`);\n  const dynamicToggle = activePanel ? activePanel.querySelector('.toggle-dynamic') : null;"
);

fs.writeFileSync(appPath, appJs);
console.log('app.js updated successfully.');
