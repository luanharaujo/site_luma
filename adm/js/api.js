// Todo dado vem daqui. Token do login do /treinos (mesma origem): localStorage["luma_token"].
const cfg = () => window.ADM_CONFIG
export class ErroApi extends Error { constructor(status, msg) { super(msg); this.status = status } }
export const token = () => { try { return localStorage.getItem('luma_token') } catch (e) { return null } }

async function chama(metodo, rota, corpo, extra = {}) {
  const t = token()
  if (!t) throw new ErroApi(401, 'Sem login')
  const h = { Authorization: 'Bearer ' + t, ...(extra.headers || {}) }
  let body
  if (corpo !== undefined) {
    if (corpo instanceof Blob) body = corpo
    else { h['Content-Type'] = 'application/json'; body = JSON.stringify(corpo) }
  }
  let r
  try { r = await fetch(cfg().api.replace(/\/+$/, '') + rota, { method: metodo, headers: h, body }) } catch (e) { throw new ErroApi(0, 'Sem conexão com o servidor') }
  if (r.status === 204) return null
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroApi(r.status, j.erro || `Erro ${r.status}`)
  return j
}
const q = (o) => { const p = Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''); return p.length ? '?' + new URLSearchParams(p) : '' }

export const API = {
  eu: () => chama('GET', '/eu'),
  resumo: (data) => chama('GET', '/resumo' + q({ data })),
  decisoes: () => chama('GET', '/decisoes?abertas=1'),
  eventos: () => chama('GET', '/eventos'),
  lancamentos: (competencia) => chama('GET', '/lancamentos' + q({ competencia })),
  notas: (competencia) => chama('GET', '/notas' + q({ competencia })),
  mes: (c) => chama('GET', '/mes/' + c),
  excel: (c) => chama('GET', '/excel/' + c),
  certidoes: () => chama('GET', '/certidoes'),
  simular: (b) => chama('POST', '/simular', b),
  criaNota: (b) => chama('POST', '/notas', b),
  criaLancamento: (b) => chama('POST', '/lancamentos', b),
  confere: (id) => chama('POST', `/lancamentos/${encodeURIComponent(id)}/conferir`, {}),
  retirada: (b) => chama('POST', '/retiradas', b),
  transferencia: (b) => chama('POST', '/transferencias', b),
  voto: (id, voto) => chama('POST', `/decisoes/${encodeURIComponent(id)}/voto`, { voto }),
  anexo: (arquivo, refTipo, refId) => chama('POST', '/anexos' + q({ ref_tipo: refTipo, ref_id: refId }), arquivo, { headers: { 'Content-Type': arquivo.type, 'X-Nome': encodeURIComponent(arquivo.name || 'anexo') } }),
}
