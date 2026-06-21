window.API_BASE = 'https://www.qrgenplus.com';
const originalFetch = window.fetch;
window.fetch = async function() {
  let [resource, config] = arguments;
  if(typeof resource === 'string' && resource.startsWith('/api/')) {
    resource = window.API_BASE + resource;
    config = config || {};
    config.credentials = 'include';
  }
  return originalFetch(resource, config);
};
