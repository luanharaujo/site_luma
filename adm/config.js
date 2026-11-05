// Único lugar com os endereços das páginas do /adm. Roda primeiro: também recusa rodar dentro de iframe.
if (window.top !== window.self) { document.documentElement.innerHTML = ''; throw new Error('Esta página não abre dentro de outra.') }
window.ADM_CONFIG = {
  api: 'https://adm-api.duoluma.workers.dev',
  exceljs: '/adm/vendor/exceljs.min.js',
  pdfjs: '/adm/vendor/pdf.min.js',
  pdfworker: '/adm/vendor/pdf.worker.min.js',
}
// Só na prévia local (127.0.0.1): aponta para a API de mentira e aceita ?token= para entrar sem login.
if (location.hostname === '127.0.0.1') {
  window.ADM_CONFIG.api = 'http://127.0.0.1:8965'
  window.ADM_CONFIG.previa = true
  try { const t = new URLSearchParams(location.search).get('token'); if (t) localStorage.setItem('luma_token', t) } catch (e) { /* sem storage */ }
}
