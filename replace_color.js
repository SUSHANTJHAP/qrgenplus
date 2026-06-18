const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// The toggle background was bg-slate-200, which is too light against bg-indigo-50.
// Let's change it to bg-slate-300 or bg-slate-400. Let's use bg-slate-400 for better visibility.
html = html.replace(/bg-slate-200/g, 'bg-slate-400');

fs.writeFileSync(indexPath, html);
console.log('Toggle switch color updated to bg-slate-400 in index.html');
