// Todo dado vem daqui. Login (A1): sessão do adm-api aberta com Face ID, guardada SÓ nesta variável (trava T1 da Segurança):
// nada em localStorage nem sessionStorage, então recarregar a página ou abrir outra aba pede o Face ID de novo.
// O token do /treinos (localStorage "luma_token", mesma origem) só é lido no cadastro da passkey, junto com o link de uso único.
const cfg = () => window.ADM_CONFIG
export class ErroApi extends Error { constructor(status, msg) { super(msg); this.status = status } }
let sessao = (cfg() && cfg().previaSessao) || null // previaSessao: só na prévia local com a API de mentira
export const temSessao = () => !!sessao
// For the audio parts (raw base64 text, XHR with progress) and the ideas WebSocket: the token never leaves this page.
export const tokenSessao = () => sessao
export const urlApi = () => cfg().api.replace(/\/+$/, '')
export const defineSessao = (t) => { sessao = t || null }
export const tokenTreinos = () => { try { return localStorage.getItem('luma_token') } catch (e) { return null } }

// extra.token: outro Bearer (null = nenhum) só para as rotas de login; sem ele, vai a sessão do ADM.
async function chama(metodo, rota, corpo, extra = {}) {
  const deLogin = 'token' in extra
  const t = deLogin ? extra.token : sessao
  if (!t && !deLogin) throw new ErroApi(401, 'Entre com Face ID')
  const h = { ...(extra.headers || {}) }
  if (t) h.Authorization = 'Bearer ' + t
  let body
  if (corpo !== undefined) {
    if (corpo instanceof Blob) body = corpo
    else { h['Content-Type'] = 'application/json'; body = JSON.stringify(corpo) }
  }
  let r
  try { r = await fetch(cfg().api.replace(/\/+$/, '') + rota, { method: metodo, headers: h, body }) } catch (e) { throw new ErroApi(0, 'Sem conexão com o servidor') }
  if (r.status === 204) return null
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (r.status === 401 && !deLogin) sessao = null // sessão vencida ou encerrada: some da memória
    throw new ErroApi(r.status, j.erro || `Erro ${r.status}`)
  }
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
  voto: (id, voto, aprovacao) => chama('POST', `/decisoes/${encodeURIComponent(id)}/voto`, aprovacao ? { voto, aprovacao } : { voto }),
  ideias: () => chama('GET', '/ideias'),
  criaIdeia: (b) => chama('POST', '/ideias', b),
  editaIdeia: (id, b) => chama('PUT', `/ideias/${encodeURIComponent(id)}`, b),
  moveIdeia: (id, b) => chama('POST', `/ideias/${encodeURIComponent(id)}/mover`, b),
  comentaIdeia: (id, texto) => chama('POST', `/ideias/${encodeURIComponent(id)}/comentarios`, { texto }),
  agoraIdeia: (id, b) => chama('POST', `/ideias/${encodeURIComponent(id)}/agora`, b),
  jaFizIdeia: (id) => chama('POST', `/ideias/${encodeURIComponent(id)}/ja-fiz`, {}),
  ideiaPorChave: (chave) => chama('GET', `/ideias/chave/${encodeURIComponent(chave)}`),
  audioIniciar: (id, mime) => chama('POST', `/ideias/${encodeURIComponent(id)}/audio/iniciar`, { mime }),
  audioPartes: (id) => chama('GET', `/ideias/${encodeURIComponent(id)}/audio/partes`),
  audioFinalizar: (id, b) => chama('POST', `/ideias/${encodeURIComponent(id)}/audio/finalizar`, b),
  bastidores: () => chama('GET', '/bastidores'),
  anexo: (arquivo, refTipo, refId) => chama('POST', '/anexos' + q({ ref_tipo: refTipo, ref_id: refId }), arquivo, { headers: { 'Content-Type': arquivo.type, 'X-Nome': encodeURIComponent(arquivo.name || 'anexo') } }),
}

export const LOGIN = {
  opcoesEntrar: () => chama('POST', '/entrar/opcoes', {}, { token: null }),
  entrar: (b) => chama('POST', '/entrar', b, { token: null }),
  opcoesCadastro: (tokTreinos, convite) => chama('POST', '/passkey/cadastro/opcoes', { convite }, { token: tokTreinos }),
  cadastrar: (tokTreinos, b) => chama('POST', '/passkey/cadastro', b, { token: tokTreinos }),
  sair: () => chama('POST', '/sair', {}),
  acesso: () => chama('GET', '/acesso'),
  revogar: (id) => chama('POST', `/acesso/passkeys/${encodeURIComponent(id)}/revogar`, {}),
  opcoesAprovar: (b) => chama('POST', '/aprovacoes/opcoes', b),
  aprovar: (b) => chama('POST', '/aprovacoes', b),
}
