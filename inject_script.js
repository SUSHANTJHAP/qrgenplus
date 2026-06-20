const fs = require('fs');
const path = require('path');
const publicDir = path.join(__dirname, 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(publicDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('api_config.js')) {
    content = content.replace('<head>', '<head>\n  <script src="assets/js/api_config.js"></script>');
    fs.writeFileSync(filePath, content);
    console.log('Updated ' + file);
  }
});
