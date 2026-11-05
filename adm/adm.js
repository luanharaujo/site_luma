// Guard for the duo's admin area. Reads the same login as /treinos (localStorage "luma_token", same origin)
// and asks the API who it is. This only hides the page: the real protection must live in the API that
// serves the admin data (the site is static and public).
(function () {
  var API = 'https://treinos-api.duoluma.workers.dev'
  var tela = document.getElementById('tela')
  function bloquear(msg) {
    tela.innerHTML = '<h1>Área restrita</h1><p>' + msg + '</p><p><a class="botao" href="/treinos/">Entrar</a></p>'
  }
  var tok = null
  try { tok = localStorage.getItem('luma_token') } catch (e) {}
  if (!tok) return bloquear('Só o Luan e a Mari entram aqui. Faça login pelo WhatsApp do Duo.')
  fetch(API + '/eu', { headers: { Authorization: 'Bearer ' + tok } })
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (eu) {
      if (!eu || !(eu.duo_real || eu.duo)) return bloquear('Só o Luan e a Mari entram aqui.')
      document.body.classList.add('liberado')
      var n = document.getElementById('nome')
      if (n && eu.apelido) n.textContent = eu.apelido
    })
    .catch(function () { bloquear('Não deu para conferir o login agora. Tente de novo.') })
})()
