// Formatação e pequenos auxiliares. Dinheiro sempre em centavos inteiros.
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const brl = (c) => fmt.format(Math.abs(c || 0) / 100)
export const sbrl = (c) => (c < 0 ? '− ' : '') + brl(c)
export const dbrl = (c) => (c > 0 ? '+ ' : c < 0 ? '− ' : '') + brl(c)
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const dm = (d) => (d ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) : '')
export const dmy = (d) => (d ? dm(d) + '/' + String(d).slice(0, 4) : '')
export const nomeMes = (c) => MESES[+c.slice(5, 7) - 1]
export const mesAno = (c) => nomeMes(c) + ' de ' + c.slice(0, 4)
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
export const proxMes = (c) => { let [y, m] = c.split('-').map(Number); m++; if (m > 12) { m = 1; y++ } return y + '-' + String(m).padStart(2, '0') }
export const antMes = (c) => { let [y, m] = c.split('-').map(Number); m--; if (m < 1) { m = 12; y-- } return y + '-' + String(m).padStart(2, '0') }
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
export const pct = (x, d = 1) => (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
export const lerReais = (s) => { const t = String(s || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'); const v = Math.round(parseFloat(t) * 100); return isFinite(v) ? v : 0 }
export const reaisTxt = (c) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const NOME = { luan: 'Luan', mari: 'Mari', duo: 'Caixa do Duo', impostos: 'Impostos', a_decidir: 'A decidir', comum: 'Empresa' }
export const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
export const horaTxt = (d = new Date()) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
export const soma = (a, f) => a.reduce((t, x) => t + (f(x) || 0), 0)

// Estilo dinâmico sem atributo style no HTML (a CSP barra): o HTML leva data-*, o JS aplica pelo CSSOM.
export function estilizar(raiz) {
  raiz.querySelectorAll('[data-w]').forEach((e) => { e.style.width = e.dataset.w + '%' })
  raiz.querySelectorAll('[data-bg]').forEach((e) => { e.style.background = e.dataset.bg })
  raiz.querySelectorAll('[data-cor]').forEach((e) => { e.style.setProperty('--cor', e.dataset.cor) })
  raiz.querySelectorAll('[data-left]').forEach((e) => { e.style.left = e.dataset.left + '%' })
  raiz.querySelectorAll('[data-delay]').forEach((e) => { e.style.animationDelay = e.dataset.delay })
}
