// Pull to refresh: in the iPhone home-screen app (standalone) there is no reload button, so dragging down at the top
// of the page reloads it. Works on the inner scroller (#tela) or, on the login/error screens, on the document.
const LIMIAR = 80 // px of finger travel (after damping) needed before releasing reloads
const MAX = 130

// aoAtualizar (opcional): chamado ao soltar; se devolver uma Promise, atualiza sem recarregar a página (com o ADM aberto,
// recarregar pediria o Face ID de novo); se devolver null, recarrega a página como antes.
export function ligarPuxar(aoAtualizar) {
  const ind = document.createElement('div')
  ind.className = 'puxar'
  ind.setAttribute('aria-hidden', 'true')
  ind.innerHTML = '<span class="puxar-seta">↓</span><span class="puxar-txt">Puxe para atualizar</span>'
  document.body.appendChild(ind)
  const txt = ind.querySelector('.puxar-txt')

  let y0 = null, x0 = 0, puxado = 0, ativo = false, recarregando = false
  const rolador = () => document.getElementById('tela') || document.scrollingElement
  const noTopo = () => { const r = rolador(); return !r || r.scrollTop <= 0 }
  const mostrar = (px) => {
    ind.style.setProperty('--puxar', px + 'px')
    ind.classList.toggle('visivel', px > 6)
    ind.classList.toggle('pronto', px >= LIMIAR)
    txt.textContent = px >= LIMIAR ? 'Solte para atualizar' : 'Puxe para atualizar'
  }
  const zerar = () => { y0 = null; puxado = 0; ativo = false; if (!recarregando) mostrar(0) }

  document.addEventListener('touchstart', (e) => {
    if (recarregando || e.touches.length !== 1) return
    // never while a sheet (lançar, retirar) is open or while typing
    if (document.querySelector('.folha-fundo') || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) return
    if (!noTopo()) return
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; puxado = 0; ativo = false
  }, { passive: true })

  document.addEventListener('touchmove', (e) => {
    if (y0 === null || recarregando) return
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0)
    if (dy <= 0 || dx > dy || !noTopo()) { zerar(); return } // scrolling up, sideways, or no longer at the top
    ativo = true
    puxado = Math.min(MAX, dy * 0.5)
    mostrar(puxado)
  }, { passive: true })

  const soltar = () => {
    if (y0 === null) return
    if (ativo && puxado >= LIMIAR) {
      recarregando = true
      ind.classList.add('carregando')
      txt.textContent = 'Atualizando…'
      const p = aoAtualizar ? aoAtualizar() : null
      if (p && typeof p.then === 'function') {
        const fim = () => { recarregando = false; ind.classList.remove('carregando'); zerar() }
        p.then(fim, fim)
        return
      }
      location.reload()
      return
    }
    zerar()
  }
  document.addEventListener('touchend', soltar, { passive: true })
  document.addEventListener('touchcancel', zerar, { passive: true })
}
