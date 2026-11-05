import { S } from './estado.js?v=c87da59460'
import { API, ErroApi, LOGIN, defineSessao, temSessao, tokenTreinos } from './api.js?v=c87da59460'
import { criarPasskey, erroPasskey, suportaPasskey, usarPasskey } from './passkey.js?v=c87da59460'
import { ic, TELAS } from './icones.js?v=c87da59460'
import { cab, nav, derivar, TELA_R } from './telas.js?v=c87da59460'
import { novaFolhaLancar, dadosPadrao, folhaLancar, folhaRetirar, lerCampos, montaPayload, corpoSimular, pendentesDe } from './folhas.js?v=c87da59460'
import { lerArquivo, prepararAnexo } from './leitor.js?v=c87da59460'
import { estilizar, esc, antMes, brl, hojeIso, horaTxt, nomeMes, reaisTxt, cap, lerReais } from './util.js?v=c87da59460'
import { ligarPuxar } from './puxar.js?v=c87da59460'
import { conferirVersao } from './versao.js?v=c87da59460'

const raiz = document.getElementById('casco')
const app = document.getElementById('app')
const lista = (x, k) => (Array.isArray(x) ? x : (x && x[k]) || [])

/* ===== avisos ===== */
let tToast
function toast(txt, erro) {
  const t = document.getElementById('toast')
  t.className = 'toast' + (erro ? ' erro' : '')
  t.innerHTML = ic(erro ? 'alerta' : 'check') + '<span></span>'
  t.lastChild.textContent = txt
  t.hidden = false
  clearTimeout(tToast); tToast = setTimeout(() => { t.hidden = true }, erro ? 5200 : 3400)
}
const msgErro = (e) => (e instanceof ErroApi ? (e.status === 403 ? 'Sem permissão para isso: ' + e.message : e.message) : 'Não deu certo. Tente de novo.')

/* ===== carga de dados (sem laço de consulta) ===== */
let seq = 0
async function carregar() {
  const meu = ++seq
  S.erroTela = ''
  const [r, dec, ev] = await Promise.all([API.resumo(), API.decisoes(), API.eventos().catch(() => ({ eventos: [] }))])
  if (meu !== seq) return
  S.resumo = r; S.decisoes = lista(dec, 'decisoes'); S.eventos = lista(ev, 'eventos')
  const a = r.mes_aberto, ant = antMes(a)
  if (!S.contMes) S.contMes = ant
  if (!S.excelMes) S.excelMes = ant
  const t = S.tela
  const extra = []
  if (t === 'inicio') extra.push(API.lancamentos(a).then((x) => { S.lancMes = lista(x, 'lancamentos') }))
  if (t === 'quem') extra.push(Promise.all([API.notas(a), API.notas(ant)]).then(([x, y]) => { S.notas = [...lista(y, 'notas'), ...lista(x, 'notas')] }))
  if (t === 'livro') { const c = S.filtro.mes === 'aberto' ? a : S.filtro.mes === 'anterior' ? ant : ''; extra.push(API.lancamentos(c).then((x) => { S.livro = { itens: lista(x, 'lancamentos') } })) }
  if (t === 'contabil') extra.push(API.mes(S.contMes).then((x) => { S.mesDados = x }))
  if (t === 'excel') { S.erroExcel = ''; extra.push(API.excel(S.excelMes).then((x) => { S.excel = x }).catch((e) => { S.excel = null; S.erroExcel = msgErro(e) })) }
  if (t === 'certidoes') extra.push(API.certidoes().then((x) => { S.cert = lista(x, 'certidoes') }))
  await Promise.all(extra)
  if (meu !== seq) return
  S.atualizadoEm = horaTxt()
  S.hoje = r.data || hojeIso()
}

let tDeb
// Ponto único de atualização: depois de cada escrita, ao voltar para a aba, e (no futuro) quando
// chegar mensagem de um WebSocket da API. Para ligar o WebSocket: chame aoMudar('ws') no onmessage.
export function aoMudar(motivo) {
  clearTimeout(tDeb)
  return new Promise((ok) => { tDeb = setTimeout(async () => { await recarrega(); ok() }, motivo === 'escrita' ? 0 : 250) })
}
async function recarrega() {
  try { await carregar() } catch (e) { if (tratarLogin(e)) return; S.erroTela = msgErro(e) }
  render()
}
// Sessão vencida (8 h, 30 min parada) ou encerrada: volta para a entrada com Face ID; nada da sessão fica guardado.
function tratarLogin(e) {
  if (e instanceof ErroApi && e.status === 401) { defineSessao(null); S.folha = null; S.fase = 'entrar'; S.msgLogin = 'Sessão encerrada. Abra com Face ID de novo.'; render(); prepararEntrada(); return true }
  return false
}
let ultimaVolta = 0
const voltou = () => { if (document.visibilityState === 'hidden' || S.fase !== 'ok') return; if (Date.now() - ultimaVolta < 10000) return; ultimaVolta = Date.now(); aoMudar('volta') }

/* ===== desenho ===== */
function render() {
  if (S.fase === 'carregando') { raiz.innerHTML = '<p class="carregando">Abrindo…</p>'; return }
  if (S.fase === 'entrar') { raiz.innerHTML = telaEntrar(); estilizar(raiz); return }
  if (S.fase === 'cadastro') { raiz.innerHTML = telaCadastro(); estilizar(raiz); return }
  if (S.fase === 'proibido') { raiz.innerHTML = '<div class="restrito"><a class="logo-link" href="/" aria-label="Página inicial do Duo LuMa"><span class="logo"></span></a><h1>Só o Luan e a Mari</h1><p>Seu login não dá acesso a esta área.</p><a class="btn" href="/">Voltar ao site</a></div>'; estilizar(raiz); return }
  if (S.fase === 'erro') { raiz.innerHTML = '<div class="restrito"><a class="logo-link" href="/" aria-label="Página inicial do Duo LuMa"><span class="logo"></span></a><h1>Sem conexão</h1><p>Não deu para conferir o login agora.</p><button class="btn" data-acao="de-novo">Tentar de novo</button></div>'; estilizar(raiz); return }
  if (S.folha && S.folha.passo === 'campos' && document.querySelector('.folha input:focus')) return
  const tela = document.getElementById('tela')
  const keep = tela && raiz.dataset.tela === S.tela ? tela.scrollTop : 0
  const folhaScroll = document.querySelector('.folha') ? document.querySelector('.folha').scrollTop : 0
  raiz.dataset.tela = S.tela
  let corpo
  if (!S.resumo) corpo = S.erroTela ? `<p class="erro-faixa">${esc(S.erroTela)}</p>` : '<p class="carregando">Carregando…</p>'
  else { const p = derivar(S.resumo); corpo = (S.erroTela ? `<p class="erro-faixa">${esc(S.erroTela)}</p>` : '') + (TELA_R[S.tela] || TELA_R.inicio)(S.resumo, p) }
  let folha = ''
  if (S.folha && S.resumo) folha = `<div class="folha-fundo"><div class="folha" role="dialog" aria-modal="true">${S.folha.tipo === 'lancar' ? folhaLancar() : S.folha.tipo === 'aprovar' ? folhaAprovar() : S.folha.tipo === 'acesso' ? folhaAcesso() : folhaRetirar()}</div></div>`
  raiz.innerHTML = cab() + nav() + `<main class="tela" id="tela"><div class="tela-in">${corpo}</div></main><button class="fab" data-acao="lancar" aria-label="Lançar">${ic('mais')}<span>Lançar</span></button>` + folha
  estilizar(raiz)
  const t2 = document.getElementById('tela'); if (t2) t2.scrollTop = keep
  const f2 = document.querySelector('.folha'); if (f2) f2.scrollTop = folhaScroll
  const ativo = raiz.querySelector('.nav-i.ativo'), nv = raiz.querySelector('.nav')
  if (ativo && nv && nv.scrollWidth > nv.clientWidth && nv.scrollHeight <= nv.clientHeight + 4) nv.scrollLeft = ativo.offsetLeft - 40
  S.feedNovo = false
}

/* ===== ações ===== */
const irPara = (t) => { if (location.hash !== '#' + t) location.hash = '#' + t; else { S.folha = null; recarrega() } }
async function escreve(fn, ok) {
  try { const r = await fn(); await aoMudar('escrita'); if (ok) toast(ok); return r } catch (e) { if (!tratarLogin(e)) toast(msgErro(e), true); S.folha && S.folha.ocupado && (S.folha.ocupado = false) ; render(); return null }
}
const ACOES = {
  ir: (d) => irPara(d.t),
  'de-novo': () => iniciarSessao(),
  lancar: () => { S.folha = novaFolhaLancar(); render() },
  fechar: () => { S.folha = null; render() },
  passo: (d) => { lerCampos(); S.folha.passo = d.p; if (d.p === 'campos') S.folha.efeito = null; render() },
  digitar: () => { S.folha.arquivo = null; S.folha.lido = false; S.folha.aviso = ''; S.folha.dados = dadosPadrao(); S.folha.passo = 'campos'; render() },
  'lanc-zap': () => { S.folha.passo = 'zap'; render() },
  'escolher-arq': () => { document.getElementById('arq').click() },
  campo: (d) => { lerCampos(); let v = d.v; if (v === 'true') v = true; else if (v === 'false') v = false; S.folha.dados[d.k] = v; if (d.k === 'tipo' && v === 'saida') { S.folha.dados.conta = 'especie'; S.folha.dados.de = 'duo' } if (d.k === 'tipo' && v === 'nota') S.folha.dados.de = 'luan'; if (d.k === 'tipo' && v === 'entrada') S.folha.dados.conta = 'pj'; render() },
  efeito: async () => {
    lerCampos(); const d = S.folha.dados
    if (!d.valor) return toast('Falta o valor.', true)
    if (!d.desc && !d.tomador) return toast('Falta a descrição.', true)
    if (d.tipo === 'nota' && !d.desc) d.desc = 'Serviço para ' + d.tomador
    S.folha.passo = 'efeito'; S.folha.efeito = null; render()
    try { const res = await API.simular(corpoSimular(d)); if (!S.folha) return; S.folha.efeito = res } catch (e) { if (tratarLogin(e)) return; toast(msgErro(e), true); if (S.folha) S.folha.passo = 'campos' }
    render()
  },
  confirmar: async () => {
    const f = S.folha; if (!f || f.ocupado) return
    f.ocupado = true; render()
    const d = f.dados
    let p = montaPayload(d)
    let id = null, avisoAnexo = ''
    try {
      if (p.notas) {
        // id da nota: nf-AAAA-MM-NNN, o próximo número do mês da emissão
        const ym = d.data.slice(0, 7), ja = lista(await API.notas(ym), 'notas')
        const mx = ja.reduce((m, n) => { const k = /^nf-\d{4}-\d{2}-(\d+)$/i.exec(n.id); return k ? Math.max(m, +k[1]) : m }, 0)
        p = montaPayload(d, `nf-${ym}-${String(mx + 1).padStart(3, '0')}`)
        const r = await API.criaNota(p.corpo); id = (r.nota && r.nota.id) || p.corpo.id
      }
      else { const r = await API.criaLancamento(p.corpo); id = r.lancamento && r.lancamento.id }
    } catch (e) { f.ocupado = false; if (!tratarLogin(e)) toast(msgErro(e), true); render(); return }
    if (f.arquivo && id) {
      try { await API.anexo(await prepararAnexo(f.arquivo), p.notas ? 'nota' : 'lancamento', id) } catch (e) { avisoAnexo = ' O arquivo não subiu: ' + msgErro(e) }
    }
    S.folha = null; S.destaque = p.notas ? null : id
    S.tela = p.notas && !d.recebido ? 'proximas' : 'livro'
    if (S.tela === 'livro') S.filtro = { tipo: 'tudo', mes: 'aberto' }
    if (location.hash !== '#' + S.tela) history.replaceState(null, '', '#' + S.tela)
    S.feedNovo = true
    await aoMudar('escrita')
    toast('Lançado. O site já mostra para os dois.' + avisoAnexo, !!avisoAnexo)
  },
  retirar: (d) => { S.folha = { tipo: 'retirar', pessoa: d.p, ocupado: false }; render() },
  'ret-pessoa': (d) => { S.folha.pessoa = d.p; render() },
  retirei: async (d) => {
    const f = S.folha, x = pendentesDe(f.pessoa)[+d.i]; if (!x || f.ocupado) return
    f.ocupado = true; render()
    // sem `conta`: a API escolhe (caixinha do sócio, senão a conta central)
    const ok = await escreve(() => API.retirada({ socio: x.socio, tipo: x.tipo, competencia: x.competencia, valor: x.valor, data: hojeIso() }), 'Pix registrado: ' + brl(x.valor))
    if (S.folha) { S.folha.ocupado = false; render() }
    return ok
  },
  'retirei-lucro': async () => {
    const f = S.folha; if (!f || f.ocupado) return
    const max = S.resumo.donos[f.pessoa].pode_tirar_hoje, v = lerReais(document.getElementById('f-lucro').value)
    if (!v || v < 0) return toast('Falta o valor do lucro.', true)
    if (v > max) return toast('O máximo hoje é ' + brl(max) + '.', true)
    f.ocupado = true; render()
    const ok = await escreve(() => API.retirada({ socio: f.pessoa, tipo: 'lucro', competencia: S.resumo.mes_aberto, valor: v, data: hojeIso() }), 'Pix de lucro registrado: ' + brl(v))
    if (S.folha) { S.folha.ocupado = false; render() }
    return ok
  },
  'copiar-lucro': () => { const v = document.getElementById('f-lucro').value; ACOES.copiar({ v }) },
  copiar: (d) => { const ok = () => toast('Valor copiado: ' + d.v); try { navigator.clipboard.writeText(d.v).then(ok, () => toast('Valor: ' + d.v)) } catch (e) { toast('Valor: ' + d.v) } },
  arrumar: async () => {
    const arr = S.resumo.arrumar || []
    try { for (const m of arr) await API.transferencia({ de: m.de, para: m.para, valor: m.valor, data: hojeIso() }) } catch (e) { toast(msgErro(e), true); await aoMudar('escrita'); return }
    await aoMudar('escrita'); toast('Caixinhas arrumadas: cada uma com o que é do dono.')
  },
  votar: (d) => {
    const dec = S.decisoes.find((x) => String(x.id) === String(d.id))
    // regra de dinheiro (só o Luan decide): o voto vale com o Face ID dele, ligado a esta decisão e a este voto (T5)
    if (dec && dec.precisa === 'luan') return abrirAprovacao(`decisao:${d.id}:${d.v}`, null, async (ap) => { S.folha = null; await escreve(() => API.voto(d.id, d.v, ap), 'Voto registrado com Face ID.') })
    return escreve(() => API.voto(d.id, d.v), 'Voto registrado.')
  },
  'entrar-faceid': () => entrarFaceId(),
  cadastrar: () => cadastrarFaceId(),
  'cadastro-continuar': () => prepararCadastro(),
  'ir-entrar': () => { S.cad = null; S.convite = null; tirarCodigo(); S.fase = 'entrar'; S.msgLogin = ''; render(); prepararEntrada() },
  'aprovar-faceid': () => aprovarFaceId(),
  acesso: () => abrirAcesso(),
  'remover-passkey': (d) => removerPasskey(d.id),
  sair: async () => { try { await LOGIN.sair() } catch (e) { /* sai do mesmo jeito */ } defineSessao(null); location.replace('/adm/?saiu=' + Date.now()) },
  conferir: (d) => escreve(() => API.confere(d.id), 'Conferido.'),
  filtro: (d) => { S.filtro[d.k] = d.v; if (d.k === 'mes') { S.livro = null; recarrega() } else render() },
  'cont-mes': (d) => { S.contMes = d.m; S.mesDados = null; render(); recarrega() },
  'excel-mes': (d) => { S.excelMes = d.m; S.excel = null; S.excelGerado = null; render(); recarrega() },
  'excel-aba': (d) => { S.excelAba = d.a; render() },
  'excel-baixar': () => baixarExcel('contador'),
  'excel-baixar-interno': () => baixarExcel('interno'),
}

let exceljsPronto
function carregaExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS)
  if (exceljsPronto) return exceljsPronto
  exceljsPronto = new Promise((ok, falha) => { const s = document.createElement('script'); s.src = window.ADM_CONFIG.exceljs; s.onload = () => ok(window.ExcelJS); s.onerror = () => { exceljsPronto = null; falha(new Error('Não consegui carregar a biblioteca do Excel.')) }; document.head.appendChild(s) })
  return exceljsPronto
}
async function baixarExcel(modo = 'contador') {
  try {
    const { gerarXlsx, nomeDoArquivo } = await import('../excel/gerar_xlsx.mjs?v=c87da59460')
    const bytes = await gerarXlsx(await carregaExcelJS(), S.excel, { modo })
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a'); a.href = url; a.download = nomeDoArquivo(S.excel, modo); document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    S.excelGerado = horaTxt(); S.excelBaixado = bytes.length; S.excelModo = modo; render(); toast('Pronto: ' + nomeDoArquivo(S.excel, modo))
  } catch (e) { toast(e.message || 'Não deu certo. Tente de novo.', true) }
}

async function arquivoEscolhido(ev) {
  const arq = ev.target.files && ev.target.files[0]; ev.target.value = ''
  if (!arq || !S.folha) return
  S.folha.arquivo = arq; S.folha.passo = 'lendo'; render()
  let r
  try { r = await lerArquivo(arq) } catch (e) { r = { dados: {}, lido: false, aviso: e.message } }
  if (!S.folha) return
  S.folha.dados = { ...dadosPadrao(), ...r.dados }
  if (!S.folha.dados.desc && S.folha.dados.tomador) S.folha.dados.desc = 'Serviço para ' + S.folha.dados.tomador
  S.folha.lido = r.lido; S.folha.aviso = r.aviso; S.folha.passo = 'campos'; render()
}

/* ===== início ===== */
function guilloche(cor, w, h) {
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!g) return 'none'
    g.strokeStyle = cor; g.lineWidth = 0.7
    const cx = w * 0.74, cy = h * 0.5
    for (let k = 0; k < 6; k++) {
      const R = 96 + k * 7, r = 23, d = 30 + k * 5, s = (Math.min(w, h) * 0.47) / (R + r + d)
      g.globalAlpha = 0.55 - k * 0.05; g.beginPath()
      for (let t = 0; t <= Math.PI * 2 * r + 0.02; t += 0.012) {
        const x = cx + s * ((R + r) * Math.cos(t) - d * Math.cos((R + r) / r * t)), y = cy + s * ((R + r) * Math.sin(t) - d * Math.sin((R + r) / r * t))
        if (t === 0) g.moveTo(x, y); else g.lineTo(x, y)
      }
      g.stroke()
    }
    g.globalAlpha = 0.28
    for (let i = 0; i < 22; i++) { g.beginPath(); const y0 = (h / 22) * i + 5; for (let x = 0; x <= w; x += 3) { const y = y0 + 5 * Math.sin(x / 38 + i * 0.6) + 2.2 * Math.sin(x / 11 + i); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y) } g.stroke() }
    return 'url("' + c.toDataURL('image/png') + '")'
  } catch (e) { return 'none' }
}
const hashTela = () => { const h = (location.hash || '').slice(1).toLowerCase(); return TELAS.some((t) => t.id === h) ? h : 'inicio' }

/* ===== entrada com Face ID (A1) ===== */
const LOGO = '<a class="logo-link" href="/" aria-label="Página inicial do Duo LuMa"><span class="logo"></span></a>'
const NOMEP = { luan: 'Luan', mari: 'Mari' }
const VALE_MS = 4 * 60e3 // o servidor dá 5 min para cada desafio; passou de 4, pede outro

function telaEntrar() {
  const pronto = !!S.opEntrar && !S.ocupado
  return `<div class="restrito">${LOGO}<h1>Financeiro</h1><p>${esc(S.msgLogin || 'Só o Luan e a Mari entram aqui, com o Face ID.')}</p>`
    + `<button class="btn" data-acao="entrar-faceid"${pronto || S.semRede ? '' : ' disabled'}>${S.ocupado ? 'Confirmando…' : 'Abrir com Face ID'}</button>`
    + '<p class="nota-login">Primeira vez neste aparelho? O cadastro é por um link de uso único que chega no seu WhatsApp.</p></div>'
}
// Pede o desafio ANTES do toque: no iPhone o Face ID precisa ser chamado direto do toque, sem esperar a rede.
async function prepararEntrada() {
  S.opEntrar = null; S.semRede = false
  try { S.opEntrar = { op: await LOGIN.opcoesEntrar(), em: Date.now() } } catch (e) { S.semRede = true; S.msgLogin = e instanceof ErroApi && e.status ? e.message : 'Sem conexão com o servidor. Toque para tentar de novo.' }
  if (S.fase === 'entrar') render()
}
async function entrarFaceId() {
  if (!suportaPasskey()) { S.msgLogin = 'Este navegador não tem Face ID para sites. Use o Safari ou o Chrome atualizados.'; render(); return }
  if (!S.opEntrar || Date.now() - S.opEntrar.em > VALE_MS) { await prepararEntrada(); if (S.opEntrar) { S.msgLogin = 'Toque de novo para abrir.'; render() } return }
  const o = S.opEntrar.op
  S.opEntrar = null; S.ocupado = true; render()
  try {
    const s = await LOGIN.entrar(await usarPasskey(o))
    defineSessao(s.sessao); S.msgLogin = ''
    S.ocupado = false
    await abrirComSessao()
  } catch (e) {
    S.ocupado = false
    S.msgLogin = e instanceof ErroApi ? e.message : erroPasskey(e)
    S.fase = 'entrar'; render(); prepararEntrada()
  }
}
async function abrirComSessao() {
  try {
    const eu = await API.eu()
    S.eu = eu.pessoa; S.apelido = eu.apelido || ''
  } catch (e) {
    if (e instanceof ErroApi && e.status === 401) { S.fase = 'entrar'; render(); prepararEntrada(); return }
    S.fase = e instanceof ErroApi && e.status === 403 ? 'proibido' : 'erro'; render(); return
  }
  S.fase = 'ok'; S.tela = hashTela(); render()
  await recarrega()
  if (S.pedido && S.fase === 'ok') { const p = S.pedido; S.pedido = null; abrirAprovacao(p.proposito, p.texto) }
}

/* ===== cadastro do Face ID pelo link do WhatsApp (o login do /treinos diz quem é; o link prova que chegou no WhatsApp dela) ===== */
function telaCadastro() {
  const c = S.cad || { passo: 'preparando' }
  const nome = NOMEP[c.pessoa] || ''
  let corpo
  if (c.passo === 'preparando') corpo = '<p>Conferindo o link…</p>'
  else if (c.passo === 'cadastrando') corpo = '<p>Confirme com o Face ID…</p>'
  else if (c.passo === 'sem-treinos') corpo = '<p>Para cadastrar, entre primeiro no /treinos aqui neste navegador (no iPhone, o Safari), do jeito de sempre. Depois volte a esta aba e toque em Continuar: o link continua valendo.</p>'
    + '<a class="btn sec" href="/treinos/" target="_blank" rel="noopener">Entrar no /treinos</a><button class="btn" data-acao="cadastro-continuar">Continuar</button>'
  else if (c.passo === 'pronto') corpo = `<p>${esc(nome)}, este link cadastra o Face ID (ou Touch ID) deste aparelho para abrir o financeiro. Vale uma vez só.</p><button class="btn" data-acao="cadastrar">Cadastrar Face ID</button>`
  else if (c.passo === 'feito') corpo = `<p>Pronto, ${esc(nome)}: Face ID cadastrado. O financeiro abre só com ele, a cada vez, aqui e no app da tela de início.</p><button class="btn" data-acao="ir-entrar">Abrir o financeiro</button>`
  else corpo = `<p>${esc(c.msg || 'Não deu certo.')}</p>${c.irEntrar ? '<button class="btn" data-acao="ir-entrar">Abrir com Face ID</button>' : c.podeTentar ? '<button class="btn" data-acao="cadastro-continuar">Tentar de novo</button>' : ''}`
  return `<div class="restrito">${LOGO}<h1>Cadastrar Face ID</h1>${corpo}</div>`
}
async function prepararCadastro() {
  S.cad = { passo: 'preparando' }; render()
  if (!suportaPasskey()) { S.cad = { passo: 'erro', msg: 'Este navegador não tem Face ID para sites. Abra o link no Safari (iPhone) ou no Chrome atualizado.' }; render(); return }
  const tok = tokenTreinos()
  if (!tok) { S.cad = { passo: 'sem-treinos' }; render(); return }
  try {
    const op = await LOGIN.opcoesCadastro(tok, S.convite)
    S.cad = { passo: 'pronto', op, tok, em: Date.now(), pessoa: op.pessoa }
  } catch (e) {
    const st = e instanceof ErroApi ? e.status : 0
    if (st === 401) S.cad = { passo: 'sem-treinos' }
    else S.cad = { passo: 'erro', msg: e instanceof ErroApi && st ? e.message : 'Sem conexão com o servidor.', podeTentar: !(st === 400 || st === 403) }
  }
  render()
}
async function cadastrarFaceId() {
  const c = S.cad
  if (!c || c.passo !== 'pronto') return
  if (Date.now() - c.em > VALE_MS) { await prepararCadastro(); return }
  S.cad = { ...c, passo: 'cadastrando' }; render()
  try {
    await LOGIN.cadastrar(c.tok, { convite: S.convite, ...(await criarPasskey(c.op)) })
    S.convite = null; tirarCodigo(); S.cad = { passo: 'feito', pessoa: c.pessoa }
  } catch (e) {
    if (e && e.name === 'InvalidStateError') S.cad = { passo: 'erro', msg: erroPasskey(e) + ' Use "Abrir com Face ID".', irEntrar: true }
    else if (e instanceof ErroApi) S.cad = { passo: 'erro', msg: e.status ? e.message : 'Sem conexão com o servidor.', podeTentar: !(e.status === 400 || e.status === 403 || e.status === 409) }
    else S.cad = { passo: 'erro', msg: erroPasskey(e), podeTentar: true }
  }
  render()
}

/* ===== aprovação assinada com Face ID (T5): voto em regra de dinheiro; deploy que muda as regras (link do deploy.sh) ===== */
function folhaAprovar() {
  const f = S.folha
  const regras = f.proposito.startsWith('regras:')
  const titulo = regras ? 'Aprovar mudança nas regras' : 'Confirmar com Face ID'
  let corpo
  if (f.passo === 'carregando') corpo = '<p class="carregando">Preparando…</p>'
  else if (f.passo === 'feito') corpo = `<p>${esc(f.feito)}</p>`
  else corpo = (f.msg ? `<p class="erro-faixa">${esc(f.msg)}</p>` : '')
    + `<p class="nota">${regras ? 'Mudança nas regras de dinheiro, versão ' + esc(f.proposito.slice(7, 19)) + '. O deploy só sai com a sua confirmação.' : 'Regra de dinheiro: o voto só vale com o seu Face ID.'}</p>`
    + `<div class="aprovar-texto">${esc(f.texto || '')}</div>`
  const botao = f.passo === 'feito' || f.passo === 'falhou' ? '' : `<button class="btn pri" data-acao="aprovar-faceid"${f.passo === 'pronto' ? '' : ' disabled'}>${f.passo === 'assinando' ? 'Confirmando…' : 'Confirmar com Face ID'}</button>`
  return `<div class="folha-cab"><h3>${titulo}</h3><button data-acao="fechar" aria-label="Fechar">${ic('x')}</button></div>${corpo}${botao}`
}
async function abrirAprovacao(proposito, texto, depois) {
  S.folha = { tipo: 'aprovar', proposito, texto: texto || '', textoCliente: texto || null, passo: 'carregando', depois }
  render()
  try {
    const op = await LOGIN.opcoesAprovar(texto ? { proposito, texto } : { proposito })
    if (!S.folha || S.folha.tipo !== 'aprovar') return
    Object.assign(S.folha, { op, texto: op.texto, em: Date.now(), passo: 'pronto', msg: '' })
  } catch (e) {
    if (tratarLogin(e)) return
    if (S.folha) Object.assign(S.folha, { passo: 'falhou', msg: msgErro(e) })
  }
  render()
}
async function aprovarFaceId() {
  const f = S.folha
  if (!f || f.tipo !== 'aprovar' || f.passo !== 'pronto') return
  if (Date.now() - f.em > VALE_MS) { await abrirAprovacao(f.proposito, f.textoCliente, f.depois); if (S.folha) { S.folha.msg = 'Toque de novo para confirmar.'; render() } return }
  f.passo = 'assinando'; f.msg = ''; render()
  try {
    const a = await LOGIN.aprovar(await usarPasskey(f.op))
    if (f.depois) { await f.depois(a.aprovacao); return }
    Object.assign(f, { passo: 'feito', feito: 'Aprovado com o seu Face ID. O deploy pode seguir.' })
  } catch (e) {
    if (tratarLogin(e)) return
    if (e instanceof ErroApi) { await abrirAprovacao(f.proposito, f.textoCliente, f.depois); if (S.folha) { S.folha.msg = e.message; render() } return }
    Object.assign(f, { passo: 'pronto', msg: erroPasskey(e) })
  }
  render()
}

/* ===== acesso: os Face ID cadastrados (trava 6 da Segurança) e sair ===== */
function folhaAcesso() {
  const f = S.folha
  const dt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca')
  let lista
  if (!f.dados) lista = `<p class="carregando">${f.msg ? esc(f.msg) : 'Carregando…'}</p>`
  else lista = (f.msg ? `<p class="erro-faixa">${esc(f.msg)}</p>` : '') + (f.dados.passkeys || []).map((p) => `<div class="dec"><b>${esc(p.aparelho || 'Aparelho')}${p.desta_sessao ? ' · este' : ''}</b><p class="nota">Cadastrado em ${esc(dt(p.criado_em))} · último uso ${esc(dt(p.usado_em))}</p>`
    + `<div class="btns"><button class="btn mini" data-acao="remover-passkey" data-id="${esc(p.id)}">${String(f.confirmar) === String(p.id) ? 'Toque de novo para remover' : 'Remover'}</button></div></div>`).join('')
    + `<p class="nota">Se aparecer um aparelho que não é seu, remova: quem estiver dentro com ele sai na hora. ${(f.dados.sessoes || []).length} sessão(ões) aberta(s) agora.</p>`
  return `<div class="folha-cab"><h3>Acesso de ${esc(NOMEP[S.eu] || '')}</h3><button data-acao="fechar" aria-label="Fechar">${ic('x')}</button></div>${lista}<button class="btn" data-acao="sair">Sair do financeiro</button>`
}
async function abrirAcesso() {
  S.folha = { tipo: 'acesso', dados: null }
  render()
  try { const d = await LOGIN.acesso(); if (S.folha && S.folha.tipo === 'acesso') S.folha.dados = d } catch (e) { if (tratarLogin(e)) return; if (S.folha) S.folha.msg = msgErro(e) }
  render()
}
async function removerPasskey(id) {
  const f = S.folha
  if (!f || f.tipo !== 'acesso') return
  if (String(f.confirmar) !== String(id)) { f.confirmar = id; render(); return }
  try {
    const r = await LOGIN.revogar(id)
    if (r.encerrou_esta_sessao) { defineSessao(null); location.replace('/adm/?saiu=' + Date.now()); return }
    toast('Face ID removido.')
    await abrirAcesso()
  } catch (e) { if (tratarLogin(e)) return; f.confirmar = null; f.msg = msgErro(e); render() }
}

// Abre a página: link de cadastro (#cadastro=), pedido de aprovação do deploy (#aprovar=regras:<commit>&texto=) ou entrada normal.
// O código do cadastro fica no endereço (só no fragmento, que não vai a servidor nenhum) até o cadastro terminar: se o iPhone
// recarregar a aba enquanto a pessoa entra no /treinos, nada se perde. Morre no servidor quando é usado. O pedido de aprovação sai na hora.
const tirarCodigo = () => { if (/cadastro=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#inicio') }
async function iniciarSessao() {
  const q = new URLSearchParams((location.hash || '').slice(1))
  const convite = q.get('cadastro'), aprovar = q.get('aprovar')
  if (aprovar) history.replaceState(null, '', location.pathname + location.search + '#inicio')
  if (convite) { S.convite = convite; S.fase = 'cadastro'; return prepararCadastro() }
  if (aprovar && /^regras:[0-9a-f]{40}$/.test(aprovar)) S.pedido = { proposito: aprovar, texto: q.get('texto') || '' }
  if (temSessao()) { S.fase = 'carregando'; render(); return abrirComSessao() } // só a prévia local entra assim
  S.fase = 'entrar'; S.msgLogin = ''; render()
  prepararEntrada()
}

function iniciar() {
  app.style.setProperty('--gl-verde', guilloche('#1f5a3c', 720, 420))
  app.style.setProperty('--gl-ouro', guilloche('#e2c56f', 720, 220))
  app.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('folha-fundo')) { S.folha = null; render(); return }
    const b = e.target.closest('[data-acao]'); if (!b || !app.contains(b)) return
    const f = ACOES[b.dataset.acao]; if (f) f(b.dataset, b)
  })
  document.getElementById('arq').addEventListener('change', arquivoEscolhido)
  window.addEventListener('hashchange', () => { if (S.fase !== 'ok') return; S.tela = hashTela(); S.folha = null; render(); recarrega(); const t = document.getElementById('tela'); if (t) t.scrollTop = 0 })
  document.addEventListener('visibilitychange', voltou)
  window.addEventListener('focus', voltou)
  // com a sessão aberta, puxar para atualizar só recarrega os dados (recarregar a página pediria o Face ID de novo, trava T1)
  ligarPuxar(() => (S.fase === 'ok' ? Promise.all([aoMudar('puxar'), conferirVersao()]) : null))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') conferirVersao() })
  // primeiro a versão (pode reabrir a página com o mesmo #cadastro=...), depois o login
  conferirVersao().then((reabrindo) => { if (!reabrindo) iniciarSessao() })
}
iniciar()
