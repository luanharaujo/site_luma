// Único lugar com os endereços das páginas do /adm. Roda primeiro: também recusa rodar dentro de iframe.
if (window.top !== window.self) { document.documentElement.innerHTML = ''; throw new Error('Esta página não abre dentro de outra.') }
window.ADM_CONFIG = {
  versao: 'ca4851692a', // carimbada pelo scripts/publicar.sh na cópia publicada
  api: 'https://adm-api.duoluma.workers.dev',
  exceljs: '/adm/vendor/exceljs.min.js?v=ca4851692a',
  pdfjs: '/adm/vendor/pdf.min.js?v=ca4851692a',
  pdfworker: '/adm/vendor/pdf.worker.min.js?v=ca4851692a',
}
// Só na prévia local: aponta para a API de mentira (127.0.0.1:8965; a integração troca a porta) e, com ?token=, usa esse valor como
// sessão do ADM só em memória (a API de mentira aceita "luan"/"mari"). localhost: o Face ID de teste (WebAuthn não aceita IP).
if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  window.ADM_CONFIG.api = 'http://127.0.0.1:8965'
  window.ADM_CONFIG.previa = true
  const t = new URLSearchParams(location.search).get('token')
  if (t) window.ADM_CONFIG.previaSessao = t
}
