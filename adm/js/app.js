import { S } from './estado.js'
import { API, ErroApi, token } from './api.js'
import { ic, TELAS } from './icones.js'
import { cab, nav, derivar, TELA_R } from './telas.js'
import { novaFolhaLancar, dadosPadrao, folhaLancar, folhaRetirar, lerCampos, montaPayload, corpoSimular, pendentesDe } from './folhas.js'
import { lerArquivo, prepararAnexo } from './leitor.js'
import { estilizar, esc, antMes, brl, hojeIso, horaTxt, nomeMes, reaisTxt, cap, lerReais } from './util.js'
import { ligarPuxar } from './puxar.js'

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
function tratarLogin(e) {
  if (e instanceof ErroApi && e.status === 401) { S.fase = 'restrito'; render(); return true }
  if (e instanceof ErroApi && e.status === 403 && /^Só/.test(e.message || '') ) { S.fase = 'proibido'; render(); return true }
  return false
}
let ultimaVolta = 0
const voltou = () => { if (document.visibilityState === 'hidden' || S.fase !== 'ok') return; if (Date.now() - ultimaVolta < 10000) return; ultimaVolta = Date.now(); aoMudar('volta') }

/* ===== desenho ===== */
function render() {
  if (S.fase === 'carregando') { raiz.innerHTML = '<p class="carregando">Abrindo…</p>'; return }
  if (S.fase === 'restrito') { raiz.innerHTML = '<div class="restrito"><a class="logo-link" href="/" aria-label="Página inicial do Duo LuMa"><span class="logo"></span></a><h1>Área restrita</h1><p>Só o Luan e a Mari entram aqui. Faça login pelo WhatsApp do Duo.</p><a class="btn" href="/treinos/">Entrar</a></div>'; estilizar(raiz); return }
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
  if (S.folha && S.resumo) folha = `<div class="folha-fundo"><div class="folha" role="dialog" aria-modal="true">${S.folha.tipo === 'lancar' ? folhaLancar() : folhaRetirar()}</div></div>`
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
  votar: (d) => escreve(() => API.voto(d.id, d.v), 'Voto registrado.'),
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
    const { gerarXlsx, nomeDoArquivo } = await import('../excel/gerar_xlsx.mjs')
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

async function iniciarSessao() {
  S.fase = 'carregando'; render()
  if (!token()) { S.fase = 'restrito'; render(); return }
  try {
    const eu = await API.eu()
    S.eu = eu.pessoa; S.apelido = eu.apelido || ''
  } catch (e) {
    S.fase = e instanceof ErroApi && e.status === 401 ? 'restrito' : e instanceof ErroApi && e.status === 403 ? 'proibido' : 'erro'
    render(); return
  }
  S.fase = 'ok'; S.tela = hashTela(); render()
  await recarrega()
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
  ligarPuxar()
  iniciarSessao()
}
iniciar()
