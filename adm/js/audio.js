// Idea audio: recorder, background sending queue (IndexedDB, retries) and listening on cards.
// Port of treine-com-a-gente app/src/pages/ideiasEnvio.tsx + enviosGuardados.ts (vanilla, no framework).
// The host re-renders by replacing innerHTML, so all state lives in module variables and live bits
// (timer, waveform, progress bar) are updated by id.
import { API, ErroApi, tokenSessao, urlApi } from './api.js?v=47d287d395'
import { esc } from './util.js?v=47d287d395'
import { ic } from './icones.js?v=47d287d395'

const PARTE = 512 * 1024, PARADO_MS = 30000, ESPERA_MAX = 60000, MAX_SEG = 90 * 60
const MIME_API = /^audio\/[a-z0-9.+-]+(;\s*codecs=[a-z0-9.,"-]+)?$/i
const $ = (id) => document.getElementById(id)
const mmss = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(Math.floor(s % 60)).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}` }
const mb = (b) => `${(b / 1048576).toFixed(1).replace('.', ',')} MB`
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')
const sha256 = async (d) => hex(await crypto.subtle.digest('SHA-256', d))
function base64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x2000) s += String.fromCharCode(...u8.subarray(i, i + 0x2000)); return btoa(s) }
const texto64 = (dados, n) => base64(new Uint8Array(dados, n * PARTE, Math.min(PARTE, dados.byteLength - n * PARTE)))
const deBase64 = (b) => { const bin = atob(b.trim()), o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o }
const novaChave = () => crypto.randomUUID?.() ?? hex(crypto.getRandomValues(new Uint8Array(16)))

async function prepararAudio(blob, segundos, mime) {
  const dados = await blob.arrayBuffer()
  if (!dados.byteLength) throw new Error('A gravação veio vazia')
  const meta = { mime: mime || blob.type || 'audio/webm', segundos, bytes: dados.byteLength, sha256: await sha256(dados), partes: [] }
  for (let n = 0; n * PARTE < meta.bytes; n++) meta.partes.push(await sha256(new TextEncoder().encode(texto64(dados, n))))
  return { meta, dados }
}

const SEM = () => {}
let avisar = SEM, avisarChegou = () => {}
let toastFn = () => {}

// ---------- IndexedDB (database adm_ideias v1: envios, audios, gravacao) ----------
let conexao = null
function abrir() {
  if (conexao) return conexao
  conexao = new Promise((ok, erro) => {
    const t = setTimeout(() => erro(new Error('IndexedDB não respondeu')), 5000) // iPhone: open may never answer
    const r = indexedDB.open('adm_ideias', 1)
    r.onupgradeneeded = () => {
      const db = r.result
      db.createObjectStore('envios', { keyPath: 'chave' }); db.createObjectStore('audios'); db.createObjectStore('gravacao')
    }
    r.onsuccess = () => { clearTimeout(t); const db = r.result; db.onversionchange = () => db.close(); db.onclose = () => { conexao = null }; ok(db) }
    r.onerror = () => (clearTimeout(t), erro(r.error))
    r.onblocked = () => (clearTimeout(t), erro(new Error('IndexedDB bloqueado')))
  }).catch((e) => { conexao = null; throw e })
  return conexao
}
async function op(loja, modo, f) {
  const db = await abrir()
  return new Promise((ok, erro) => {
    const tx = db.transaction(loja, modo)
    let res
    const req = f(tx.objectStore(loja))
    if (req) req.onsuccess = () => { res = req.result }
    tx.oncomplete = () => ok(res) // only done when the transaction closes (data on disk)
    tx.onerror = () => erro(tx.error)
    tx.onabort = () => erro(tx.error || new Error('transação abortada'))
  })
}
const memoria = new Map(), memoriaAudio = new Map(), descartados = new Set()
async function guardarTudo(e, dados) {
  const db = await abrir()
  await new Promise((ok, erro) => {
    const tx = db.transaction(['envios', 'audios'], 'readwrite')
    tx.objectStore('envios').put(e)
    if (dados) tx.objectStore('audios').put(dados, e.chave)
    tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error); tx.onabort = () => erro(tx.error || new Error('transação abortada'))
  })
}
async function todos() {
  const por = new Map()
  try { for (const e of (await op('envios', 'readonly', (s) => s.getAll())) || []) por.set(e.chave, e) } catch (e) { /* memory only */ }
  for (const e of memoria.values()) por.set(e.chave, e)
  return [...por.values()].filter((e) => !descartados.has(e.chave)).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
}
async function gravar(e) {
  if (descartados.has(e.chave)) return
  if (memoria.has(e.chave)) return void memoria.set(e.chave, e)
  try { await op('envios', 'readwrite', (s) => s.put(e)) } catch (x) { memoria.set(e.chave, e) }
}
async function apagar(chave) {
  memoria.delete(chave); memoriaAudio.delete(chave)
  try {
    const db = await abrir()
    await new Promise((ok, erro) => {
      const tx = db.transaction(['envios', 'audios'], 'readwrite')
      tx.objectStore('envios').delete(chave); tx.objectStore('audios').delete(chave)
      tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error)
    })
  } catch (e) { /* no IndexedDB */ }
}
async function lerAudio(chave) {
  const m = memoriaAudio.get(chave)
  if (m) return m
  try { return (await op('audios', 'readonly', (s) => s.get(chave))) || null } catch (e) { return null }
}

// ---------- recording in progress, piece by piece ----------
let fila = Promise.resolve()
const naFila = (f) => (fila = fila.then(f, f))
const gravComecar = (mime, inicio) => naFila(() => op('gravacao', 'readwrite', (s) => { s.clear(); s.put({ mime, inicio, segundos: 0, pedacos: 0 }, 'meta') }).catch(() => {}))
const gravPedaco = (n, pedaco, segundos) => naFila(async () => {
  try {
    const dados = await pedaco.arrayBuffer()
    await op('gravacao', 'readwrite', (s) => {
      s.put(dados, `p${String(n).padStart(5, '0')}`)
      const r = s.get('meta')
      r.onsuccess = () => r.result && s.put({ ...r.result, segundos, pedacos: n + 1 }, 'meta')
    })
  } catch (e) { /* memory only */ }
})
const gravApagar = () => naFila(() => op('gravacao', 'readwrite', (s) => s.clear()).catch(() => {}))
async function gravLer() {
  try {
    await fila
    const meta = await op('gravacao', 'readonly', (s) => s.get('meta'))
    if (!meta || !meta.pedacos) return null
    const chaves = (await op('gravacao', 'readonly', (s) => s.getAllKeys())).filter((k) => String(k).startsWith('p')).sort()
    const partes = []
    for (const k of chaves) partes.push(await op('gravacao', 'readonly', (s) => s.get(k)))
    const blob = new Blob(partes, { type: meta.mime })
    return blob.size ? { meta, blob } : null
  } catch (e) { return null }
}

// ---------- microphone reused (iPhone asks permission on every new getUserMedia) ----------
let micGuardado = null, micTimer = 0
function fecharMic() { if (micGuardado) micGuardado.getTracks().forEach((t) => t.stop()); micGuardado = null; clearTimeout(micTimer) }
async function pegarMic() {
  clearTimeout(micTimer)
  if (micGuardado && micGuardado.getAudioTracks().every((t) => t.readyState === 'live')) { micGuardado.getAudioTracks().forEach((t) => (t.enabled = true)); return micGuardado }
  fecharMic()
  micGuardado = await navigator.mediaDevices.getUserMedia({ audio: true })
  return micGuardado
}
function soltarMic(s, agora) {
  if (agora || s !== micGuardado) return s.getTracks().forEach((t) => t.stop())
  s.getAudioTracks().forEach((t) => (t.enabled = false)) // muted, mic not in use; really closed after 10 min
  micTimer = setTimeout(fecharMic, 10 * 60 * 1000)
}
function formatoAudio() {
  const ops = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']
  return ops.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || ''
}

// ---------- recorder state ----------
const R = { estado: 'idle', rec: null, ctx: null, an: null, inicio: 0, relogio: 0, raf: 0, trava: null, url: null, blob: null, segundos: 0, mime: '', erro: '', achada: null, mudo: false }
const TXT_MIC = 'Não deu para usar o microfone. No iPhone: Ajustes > Safari > Microfone > Permitir (ou toque em aA na barra do Safari > Ajustes do site > Microfone > Permitir). No app da tela de início, a permissão é pedida a cada abertura: use o site no Safari para ela ficar guardada.'

export const gravando = () => R.estado === 'gravando'
export const gravacaoAtual = () => (R.estado === 'gravado' ? { blob: R.blob, mime: R.mime, segundos: R.segundos } : null)
export function limparGravador() {
  if (R.url) URL.revokeObjectURL(R.url)
  Object.assign(R, { estado: 'idle', url: null, blob: null, achada: null, erro: '' })
  void gravApagar()
}

function desenharOnda() {
  const dados = new Uint8Array(R.an.fftSize), barras = [], comeco = performance.now()
  let ultima = 0, ultimoSom = comeco
  const quadro = (t) => {
    if (R.estado !== 'gravando' || !R.an) return
    R.raf = requestAnimationFrame(quadro)
    if (t - ultima < 60) return
    ultima = t
    R.an.getByteTimeDomainData(dados)
    let soma = 0
    for (const v of dados) soma += ((v - 128) / 128) ** 2
    const rms = Math.sqrt(soma / dados.length)
    if (rms > 0.012) ultimoSom = t
    const m = t - comeco > 3000 && t - ultimoSom > 3500 // no sound for ~3.5 s
    if (m !== R.mudo) { R.mudo = m; const el = $('aud-mudo'); if (el) el.hidden = !m }
    const cv = $('aud-onda'), g = cv && cv.getContext('2d') // the canvas may be replaced by a re-render: look it up again
    if (!g) return
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr) }
    barras.push(Math.min(1, Math.sqrt(rms) * 2.2)) // sqrt: quiet speech still shows
    while (barras.length > Math.ceil(w / 5)) barras.shift()
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h)
    g.fillStyle = getComputedStyle(cv).getPropertyValue('--bad').trim() || '#b42318'
    barras.forEach((v, i) => { const bh = Math.max(3, v * (h - 2)); g.fillRect(w - (barras.length - i) * 5, (h - bh) / 2, 3, bh) })
  }
  R.raf = requestAnimationFrame(quadro)
}

function mostrar(blob, segundos) {
  if (R.url) URL.revokeObjectURL(R.url)
  Object.assign(R, { estado: 'gravado', blob, segundos, mime: blob.type, url: URL.createObjectURL(blob), achada: null })
}
function fimGravacao(aberto, mime, pedacos) {
  soltarMic(aberto)
  clearInterval(R.relogio); cancelAnimationFrame(R.raf)
  if (R.trava) R.trava.release().catch(() => {})
  if (R.ctx) R.ctx.close().catch(() => {})
  Object.assign(R, { ctx: null, an: null, trava: null, rec: null, mudo: false })
  const segundos = Math.round((Date.now() - R.inicio) / 1000)
  const blob = new Blob(pedacos, { type: mime })
  if (!blob.size) { R.estado = 'idle'; R.erro = 'A gravação veio vazia. Confira o microfone e grave de novo.'; void gravApagar() } else mostrar(blob, segundos)
  avisar()
}
async function comecar() {
  R.erro = ''
  let ctx = null
  try { const AC = window.AudioContext || window.webkitAudioContext; ctx = AC ? new AC() : null; ctx && ctx.resume().catch(() => {}) } catch (e) { ctx = null } // created in the tap (Safari)
  let stream = null
  try {
    stream = await pegarMic()
    const aberto = stream, mime = formatoAudio()
    const r = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: /opus/.test(mime) ? 24000 : 32000 })
    const pedacos = [], tipo = () => r.mimeType || mime || 'audio/webm'
    let n = 0
    r.ondataavailable = (e) => { if (!e.data.size) return; pedacos.push(e.data); void gravPedaco(n++, e.data, Math.round((Date.now() - R.inicio) / 1000)) }
    r.onstop = () => fimGravacao(aberto, tipo(), pedacos)
    R.rec = r; R.inicio = Date.now(); R.achada = null; R.mudo = false
    void gravComecar(tipo(), R.inicio)
    r.start(5000) // 5 s pieces go to IndexedDB: a closed tab loses at most that
    R.estado = 'gravando'
    if (ctx) {
      try { const an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(aberto).connect(an); R.ctx = ctx; R.an = an } catch (e) { ctx.close().catch(() => {}) } // analysis only, not connected to destination (no echo)
    }
    R.relogio = setInterval(() => {
      const s = (Date.now() - R.inicio) / 1000, el = $('aud-tempo')
      if (el) el.textContent = mmss(s)
      if (s >= MAX_SEG && r.state === 'recording') r.stop()
    }, 250)
    avisar()
    if (R.an) desenharOnda()
    try {
      const t = (await navigator.wakeLock?.request('screen')) || null
      if (r.state === 'inactive') t && t.release().catch(() => {}); else R.trava = t
    } catch (e) { /* no wake lock */ }
  } catch (e) {
    if (stream) soltarMic(stream, true)
    if (ctx) ctx.close().catch(() => {})
    R.estado = 'idle'; R.erro = TXT_MIC
    avisar()
  }
}

export function htmlGravador() {
  if (R.estado === 'gravando')
    return `<div class="aud-box aud-grav"><div class="aud-linha"><span class="aud-ponto"></span><span class="aud-tempo" id="aud-tempo">${mmss((Date.now() - R.inicio) / 1000)}</span>` +
      `<span class="aud-ondawrap">${R.an ? '<canvas id="aud-onda" class="aud-onda" aria-hidden="true"></canvas>' : ''}</span>` +
      `<button type="button" class="btn pri aud-parar" data-acao="aud-parar">Parar</button></div>` +
      `<span class="aud-mudo" id="aud-mudo"${R.mudo ? '' : ' hidden'}>Não estou ouvindo nada. Confira se o microfone está liberado e sem nada tampando.</span>` +
      `<span class="nota">Pode falar à vontade (para sozinho em 90 min). Deixe a tela acesa.</span></div>`
  if (R.estado === 'gravado')
    return `<div class="aud-box"><audio controls src="${esc(R.url)}"></audio><span class="nota aud-info">${mmss(R.segundos)} · ${mb(R.blob.size)}</span>` +
      `<button type="button" class="btn mini" data-acao="aud-descartar">${ic('x')} Descartar o áudio</button></div>`
  if (R.achada) {
    const d = new Date(R.achada.meta.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return `<div class="aud-box aud-achada"><span>Achei neste aparelho uma gravação de <b>${mmss(R.achada.meta.segundos)}</b> (${esc(d)}) que não foi enviada.</span>` +
      `<button type="button" class="btn pri" data-acao="aud-usar">Usar este áudio</button>` +
      `<button type="button" class="btn mini" data-acao="aud-apagar">${ic('x')} Apagar a gravação</button></div>`
  }
  return `<button type="button" class="btn" data-acao="aud-gravar">Gravar áudio</button>` + (R.erro ? `<div class="erro-faixa">${esc(R.erro)}</div>` : '')
}

// ---------- sender views ----------
const vistas = new Map() // chave -> view
let publicarT
function publicar(jaJa) {
  if (jaJa) { clearTimeout(publicarT); publicarT = undefined; return avisar() }
  if (publicarT === undefined) publicarT = setTimeout(() => { publicarT = undefined; avisar() }, 150)
}
const pctDe = (v) => (v.bytes ? Math.min(100, Math.round((v.enviados / v.bytes) * 100)) : 0)
function fraseDe(v) {
  const s = Math.max(0, Math.ceil(((v.proxima || 0) - Date.now()) / 1000))
  return ({
    guardado: 'Guardada neste aparelho. Já vai começar a enviar.',
    criando: 'Criando a ideia no site...',
    enviando: `Enviando o áudio: ${pctDe(v)}% (${mb(v.enviados)} de ${mb(v.bytes)}).`,
    conferindo: 'Conferindo se o áudio chegou inteiro...',
    pronto: v.segundos != null ? 'O áudio chegou inteiro ao site (conferido).' : 'Chegou ao site.',
    sem_internet: 'Sem internet. Está guardada neste aparelho e vai sozinha quando a internet voltar.',
    tentando: `A conexão falhou${v.erro ? ` (${v.erro})` : ''}. Tento de novo ${s ? `em ${s} s` : 'agora'}. Está guardada neste aparelho.`,
    sem_login: 'Entre de novo no site para terminar o envio. Está guardada neste aparelho.',
    outra_aba: 'Outra aba do site está enviando. Está guardada neste aparelho.',
    parado: v.erro || 'O envio parou.',
  })[v.fase]
}
function vista(e, mudou) {
  const base = vistas.get(e.chave) || { chave: e.chave, ideiaId: e.ideiaId, texto: e.texto, segundos: e.audio ? e.audio.segundos : null, bytes: e.audio ? e.audio.bytes : 0, criadoEm: e.criadoEm, fase: 'guardado', enviados: 0, proxima: null, erro: null, parado: null }
  const v = { ...base, ideiaId: e.ideiaId, parado: e.parado || null, persistido: !memoria.has(e.chave), ...mudou }
  vistas.set(e.chave, v)
  if (mudou.fase === undefined && 'enviados' in mudou) { // progress only: update the bar by id, no re-render
    const b = $('env-barra-' + e.chave), f = $('env-frase-' + e.chave)
    if (b) b.style.width = pctDe(v) + '%'
    if (f) f.textContent = fraseDe(v)
  } else publicar(mudou.fase !== undefined)
}
function sincronizar(lista) {
  const chaves = new Set(lista.map((e) => e.chave))
  for (const [k, v] of vistas) if (!chaves.has(k) && v.fase !== 'pronto') vistas.delete(k)
  for (const e of lista) {
    const v = vistas.get(e.chave)
    if (e.parado) vista(e, { fase: 'parado', erro: e.motivo || null, proxima: null })
    else if (!v || v.fase === 'parado') vista(e, { fase: 'guardado', erro: null })
  }
}
setInterval(() => { for (const v of vistas.values()) if (v.fase === 'tentando') { const f = $('env-frase-' + v.chave); if (f) f.textContent = fraseDe(v) } }, 1000)

let confirmaDescarte = null
function linhaEnvio(v, noCartao) {
  const tit = `${v.ideiaId ? `Ideia #${v.ideiaId}` : 'Ideia nova'}${v.segundos != null ? ` · áudio de ${mmss(v.segundos)}` : ''}`
  const k = esc(v.chave), f = v.fase
  const btn = (acao, txt) => `<button type="button" class="aud-link" data-acao="${acao}" data-chave="${k}">${txt}</button>`
  return `<div class="aud-env aud-${f === 'pronto' ? 'ok' : f === 'parado' ? 'bad' : ['sem_internet', 'tentando', 'sem_login', 'outra_aba'].includes(f) ? 'warn' : 'neutro'}" data-envio="${esc(f)}">` +
    (noCartao ? '' : `<b class="aud-env-tit">${esc(tit)}${v.texto ? ': ' + esc(v.texto) : ''}</b>`) +
    `<span id="env-frase-${k}">${esc(fraseDe(v))}</span>` +
    ((f === 'enviando' || f === 'conferindo') && v.bytes > 0 ? `<div class="aud-trilho"><div class="aud-barra" id="env-barra-${k}" data-w="${pctDe(v)}"></div></div>` : '') +
    (v.persistido === false && f !== 'pronto' ? '<span class="aud-semguardar">Este navegador não deixou guardar no aparelho: não feche o site até terminar.</span>' : '') +
    `<span class="aud-acoes">` +
    (['tentando', 'sem_internet', 'outra_aba', 'sem_login'].includes(f) ? btn('env-tentar', 'Tentar agora') : '') +
    (f === 'parado' && v.parado !== 'conflito' ? btn('env-tentar', v.parado === 'perdida' ? 'Mandar como ideia nova' : 'Tentar de novo') : '') +
    (f !== 'pronto' && !['criando', 'enviando', 'conferindo'].includes(f) ? btn('env-descartar', confirmaDescarte === v.chave ? 'Toque de novo para descartar' : 'Descartar') : '') +
    `</span></div>`
}
const lista = () => [...vistas.values()].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
export const htmlEnvios = () => (vistas.size ? `<div class="aud-envios">${lista().map((v) => linhaEnvio(v, false)).join('')}</div>` : '')
export const envioDaIdeia = (id) => lista().find((v) => v.ideiaId === id) || null
export function htmlEnvioDaIdeia(i) {
  const v = envioDaIdeia(i.id)
  return v ? `<div class="aud-cartao">${linhaEnvio(v, true)}</div>` : '<p class="nota">O áudio ainda não chegou inteiro ao site. Ele fica guardado no aparelho que gravou e vai sozinho quando esse aparelho abrir o site com internet.</p>'
}

// ---------- background sender ----------
class Parou extends Error { constructor(tipo, msg) { super(msg); this.tipo = tipo } }
class Descartado extends Error {}
const tentativas = new Map(), proximaEm = new Map()
let rodando = false, deNovo = false, acordar = null, semLogin = false, ligado = false

function putParte(id, n, corpo, sha, progresso) {
  return new Promise((ok) => {
    const x = new XMLHttpRequest()
    let ultimo = Date.now()
    const vigia = setInterval(() => Date.now() - ultimo > PARADO_MS && x.abort(), 3000) // no progress for 30 s = dead connection
    const fim = (r) => (clearInterval(vigia), ok(r))
    x.open('PUT', `${urlApi()}/ideias/${encodeURIComponent(id)}/audio/partes/${n}`)
    x.setRequestHeader('Authorization', `Bearer ${tokenSessao() || ''}`)
    x.setRequestHeader('Content-Type', 'text/plain')
    x.setRequestHeader('X-Parte-Sha256', sha)
    x.timeout = 5 * 60000
    x.upload.onprogress = (ev) => { ultimo = Date.now(); progresso(ev.loaded) }
    x.onprogress = () => { ultimo = Date.now() }
    x.onload = () => { let dados = {}; try { dados = JSON.parse(x.responseText) } catch (e) { /* empty */ } fim({ ok: x.status >= 200 && x.status < 300, status: x.status, dados }) }
    x.onerror = x.onabort = x.ontimeout = () => fim({ ok: false, status: 0, dados: {} })
    x.send(corpo)
  })
}

let trava = null, querTela = false
async function segurarTela() {
  querTela = true
  if (trava || document.visibilityState !== 'visible') return
  try { const t = (await navigator.wakeLock?.request('screen')) || null; if (querTela) trava = t; else t && t.release().catch(() => {}) } catch (e) { trava = null }
}
function soltarTela() { querTela = false; if (trava) trava.release().catch(() => {}); trava = null }
const vivo = (e) => { if (descartados.has(e.chave)) throw new Descartado() }

async function concluir(e) {
  await apagar(e.chave)
  vista(e, { fase: 'pronto', enviados: e.audio ? e.audio.bytes : 0, erro: null, proxima: null })
  setTimeout(() => { if (vistas.get(e.chave)?.fase === 'pronto') { vistas.delete(e.chave); publicar(true) } }, 12000)
  try { avisarChegou(e.ideiaId) } catch (x) { /* host error */ }
}

async function processar(e) {
  if (e.ideiaId == null) {
    vista(e, { fase: 'criando', erro: null, proxima: null })
    let id = null
    try { id = (await API.criaIdeia(e.corpo)).ideia.id } catch (x) {
      if (x instanceof ErroApi && x.status >= 400 && x.status < 500 && x.status !== 408 && x.status !== 429) throw x
      try { id = (await API.ideiaPorChave(e.chave)).id } catch (y) { throw x } // the answer may have been lost: look it up by key
    }
    if (descartados.has(e.chave)) throw new Descartado()
    e.ideiaId = id
    await gravar(e) // from here on only the audio is missing (the POST never repeats)
    vista(e, {})
  }
  const id = e.ideiaId, a = e.audio
  if (!a) return concluir(e)
  vista(e, { fase: 'enviando', erro: null, proxima: null })
  const dados = await lerAudio(e.chave)
  if (!dados || dados.byteLength !== a.bytes) throw new Parou('erro', 'O áudio guardado neste aparelho não abriu. Se tiver como, grave de novo.')
  const total = a.partes.length, tamanho = (n) => Math.min(PARTE, a.bytes - n * PARTE), mimeApi = MIME_API.test(a.mime) ? a.mime : 'audio/webm'
  void segurarTela()
  try {
    for (let volta = 0; ; volta++) {
      let d
      try { d = await API.audioPartes(id) } catch (x) { if (x instanceof ErroApi && x.status === 404) throw new Parou('perdida', `A ideia #${id} não existe mais no site.`); throw x }
      vivo(e)
      if (d.estado === 'completo' || d.estado === 'arquivado') {
        if (d.sha256 === a.sha256 || (!d.sha256 && d.bytes === a.bytes)) return concluir(e) // finalize worked but the answer was lost
        throw new Parou('conflito', `A ideia #${id} já tem outro áudio no site.`)
      }
      let prontas = new Set()
      if (d.estado === 'enviando' && d.mime === mimeApi) prontas = new Set((d.recebidas || []).filter((p) => p.n < total && p.bytes === tamanho(p.n) && p.sha256 === a.partes[p.n]).map((p) => p.n))
      else { await API.audioIniciar(id, a.mime); vivo(e) }
      let enviados = [...prontas].reduce((s, n) => s + tamanho(n), 0)
      vista(e, { fase: 'enviando', enviados })
      for (let n = 0; n < total; n++) {
        if (prontas.has(n)) continue
        const corpo = texto64(dados, n)
        const base = enviados
        const r = await putParte(id, n, corpo, a.partes[n], (b) => vista(e, { enviados: base + Math.round((b / corpo.length) * tamanho(n) * 0.98) }))
        vivo(e)
        if (r.status === 404) throw new Parou('perdida', `A ideia #${id} não existe mais no site.`)
        if (!r.ok) throw new ErroApi(r.status, String(r.dados.erro || `Erro ${r.status || 'de conexão'}`))
        if (Number(r.dados.bytes) !== tamanho(n) || (r.dados.sha256 && r.dados.sha256 !== a.partes[n])) throw new ErroApi(0, 'A parte chegou incompleta')
        enviados += tamanho(n)
        tentativas.delete(e.chave) // progress: the next failure waits little again
        vista(e, { enviados })
      }
      vista(e, { fase: 'conferindo' })
      try {
        const f = await API.audioFinalizar(id, { partes: total, bytes: a.bytes, segundos: a.segundos, sha256: a.sha256, partes_sha256: a.partes })
        vivo(e)
        if (f.ideia && f.ideia.audio_estado === 'completo' && f.ideia.audio_sha256 === a.sha256) return concluir(e)
        throw new ErroApi(0, 'O site não confirmou o áudio completo')
      } catch (x) {
        if (x instanceof ErroApi && x.status === 409 && volta < 3) continue // missing/different part: re-read and send only what is missing
        throw x
      }
    }
  } finally { soltarTela() }
}

async function falhou(e, erro) {
  if (erro instanceof Descartado) return
  const parar = async (tipo, msg) => { e.parado = tipo; e.motivo = msg; await gravar(e); vista(e, { fase: 'parado', erro: msg, proxima: null }) }
  if (erro instanceof Parou) return parar(erro.tipo, erro.message)
  const st = erro instanceof ErroApi ? erro.status : 0, msg = erro instanceof Error ? erro.message : 'Erro'
  if (st === 401) { semLogin = true; return vista(e, { fase: 'sem_login', erro: null, proxima: null }) }
  if (st >= 400 && st < 500 && ![404, 408, 409, 422, 429].includes(st)) return parar('erro', msg) // repeating will not fix it
  // a 409 that says the idea can no longer take this audio (done/archived elsewhere, or it already has one) is final too
  if (st === 409 && /feita ou arquivada|já tem áudio/i.test(msg)) return parar('erro', msg)
  const n = (tentativas.get(e.chave) || 0) + 1
  tentativas.set(e.chave, n)
  const espera = Math.min(ESPERA_MAX, 2000 * 2 ** (n - 1)) * (0.85 + Math.random() * 0.3)
  proximaEm.set(e.chave, Date.now() + espera)
  vista(e, { fase: navigator.onLine === false ? 'sem_internet' : 'tentando', erro: st ? msg : null, proxima: Date.now() + espera })
}

const dormir = (ms) => new Promise((ok) => { const t = setTimeout(() => { acordar = null; ok() }, Math.max(200, ms)); acordar = () => { clearTimeout(t); acordar = null; ok() } })
async function corpoLaco() {
  for (;;) {
    const l = await todos()
    sincronizar(l)
    const ativos = l.filter((e) => !e.parado && !descartados.has(e.chave))
    if (!ativos.length) return
    if (!tokenSessao() || semLogin) { for (const e of ativos) vista(e, { fase: 'sem_login', proxima: null }); return } // back via retomarEnvios()
    if (navigator.onLine === false) { for (const e of ativos) vista(e, { fase: 'sem_internet', proxima: null }); await dormir(30000); continue }
    const agora = Date.now(), e = ativos.find((x) => (proximaEm.get(x.chave) || 0) <= agora)
    if (!e) { await dormir(Math.min(...ativos.map((x) => proximaEm.get(x.chave) || agora)) - agora); continue }
    try { await processar(e); tentativas.delete(e.chave); proximaEm.delete(e.chave) } catch (err) { await falhou(e, err) }
  }
}
async function laco() {
  if (rodando) return
  rodando = true
  try {
    sincronizar(await todos())
    const locks = navigator.locks // one tab at a time (Web Locks, Safari 15.4+)
    if (locks) await locks.request('adm-envios', { ifAvailable: true }, async (l) => {
      if (l) return corpoLaco()
      for (const v of vistas.values()) if (v.fase === 'guardado') vistas.set(v.chave, { ...v, fase: 'outra_aba' })
      publicar(true)
      setTimeout(() => cutucar(), 20000) // the other tab may close
    })
    else await corpoLaco()
  } finally {
    rodando = false
    if (deNovo) { deNovo = false; void laco() }
  }
}
function cutucar(agoraMesmo) {
  if (agoraMesmo) proximaEm.clear()
  if (acordar) acordar(); else if (rodando) deNovo = true; else void laco()
}
export function ligarEnvios(op) {
  const o = op || {}
  if (o.aoChegar) avisarChegou = o.aoChegar
  if (o.aoMudar) avisar = o.aoMudar
  if (ligado) return
  ligado = true
  window.addEventListener('online', () => cutucar(true))
  window.addEventListener('offline', () => cutucar())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && cutucar(true))
  window.addEventListener('pageshow', () => cutucar(true))
  window.addEventListener('beforeunload', (ev) => { if ([...vistas.values()].some((v) => ['criando', 'enviando', 'conferindo'].includes(v.fase) || (v.persistido === false && v.fase !== 'pronto'))) { ev.preventDefault(); ev.returnValue = '' } })
  cutucar(true)
}
export function retomarEnvios() { semLogin = false; cutucar(true) }

export async function guardarNovaIdeia(corpo, audio) {
  const chave = novaChave()
  const p = audio ? await prepararAudio(audio.blob, audio.segundos, audio.mime) : null
  const e = { chave, criadoEm: new Date().toISOString(), corpo: { ...corpo, chave_envio: chave, audio_pendente: !!audio }, ideiaId: null, texto: typeof corpo.texto === 'string' ? corpo.texto : null, audio: p ? p.meta : null }
  try { await guardarTudo(e, p ? p.dados : null); navigator.storage?.persist?.().catch(() => {}) } catch (x) { memoria.set(chave, e); if (p) memoriaAudio.set(chave, p.dados) }
  vista(e, { fase: 'guardado' })
  cutucar(true)
  return chave
}

// ---------- listening on a card ----------
const ideiasVistas = new Map() // id -> idea object last rendered by htmlOuvir (the click only carries the id)
const ouvindo = new Map() // id -> { carregando: 'Carregando n/N...', url, erro }
async function carregarAudio(i) {
  const o = { carregando: '', url: null, erro: false, ...(ouvindo.get(i.id) || {}) }
  ouvindo.set(i.id, o); o.erro = false
  try {
    const partes = []
    for (let n = 0; n < i.audio_partes; n++) {
      o.carregando = `Carregando ${n + 1}/${i.audio_partes}...`; avisar()
      const r = await fetch(`${urlApi()}/ideias/${encodeURIComponent(i.id)}/audio/partes/${n}`, { headers: { Authorization: `Bearer ${tokenSessao() || ''}` }, cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      partes.push(deBase64(await r.text()))
    }
    if (o.url) URL.revokeObjectURL(o.url)
    o.url = URL.createObjectURL(new Blob(partes, { type: i.audio_mime || 'audio/webm' }))
  } catch (e) { o.erro = true } finally { o.carregando = ''; avisar() }
}
export function htmlOuvir(i) {
  if (i.audio_estado === 'arquivado') return `<p class="nota">Áudio${i.audio_segundos ? ` de ${mmss(i.audio_segundos)}` : ''} guardado no Drive do duo (saiu do site).</p>`
  if (i.audio_estado === 'enviando') return htmlEnvioDaIdeia(i)
  if (i.audio_estado !== 'completo') return ''
  ideiasVistas.set(String(i.id), i)
  const o = ouvindo.get(i.id) || {}
  // autoplay only on the first draw after loading: a redraw later must not start it again
  if (o.url) { const auto = !o.tocou; o.tocou = true; return `<audio class="aud-player" controls${auto ? ' autoplay' : ''} src="${esc(o.url)}"></audio>` }
  return `<button type="button" class="btn mini" data-acao="aud-ouvir" data-id="${esc(i.id)}"${o.carregando ? ' disabled' : ''}>${esc(o.carregando || `Ouvir áudio${i.audio_segundos ? ` (${mmss(i.audio_segundos)})` : ''}`)}</button>` +
    (o.erro ? '<div class="erro-faixa">Não deu para carregar o áudio.</div>' : '')
}

// ---------- start-up and actions ----------
export function iniciarAudio(op) {
  avisar = (op && op.aoMudar) || avisar
  window.addEventListener('pagehide', () => { fecharMic(); for (const o of ouvindo.values()) o.url && URL.revokeObjectURL(o.url) })
  gravLer().then((g) => { if (g && !R.rec && R.estado === 'idle') { R.achada = g; avisar() } })
}
export function acoesAudio({ toast, render }) {
  toastFn = toast || toastFn
  if (render && avisar === SEM) avisar = render
  const mudar = () => avisar()
  return {
    'aud-gravar': async () => { await comecar() },
    'aud-parar': () => { if (R.rec && R.rec.state === 'recording') R.rec.stop() },
    'aud-descartar': () => { limparGravador(); mudar() },
    'aud-usar': () => { if (R.achada) { mostrar(R.achada.blob, R.achada.meta.segundos); mudar() } },
    'aud-apagar': () => { R.achada = null; void gravApagar(); mudar() },
    'aud-ouvir': (d) => { const i = ideiasVistas.get(String(d.id)); return i ? carregarAudio(i) : undefined },
    'env-tentar': async (d) => {
      const e = (await todos()).find((x) => x.chave === d.chave)
      if (e && e.parado) {
        if (e.parado === 'perdida') { e.ideiaId = null; e.corpo = e.corpo || { texto: e.texto, status: 'ideia', chave_envio: e.chave, audio_pendente: !!e.audio } } // idea gone: send as new
        e.parado = null; e.motivo = null
        await gravar(e); vista(e, { fase: 'guardado', erro: null })
      }
      semLogin = false; cutucar(true)
    },
    'env-descartar': async (d) => {
      if (confirmaDescarte !== d.chave) { confirmaDescarte = d.chave; setTimeout(() => { if (confirmaDescarte === d.chave) { confirmaDescarte = null; mudar() } }, 4000); return mudar() }
      confirmaDescarte = null
      const e = (await todos()).find((x) => x.chave === d.chave)
      descartados.add(d.chave); await apagar(d.chave); vistas.delete(d.chave)
      toast && toast(e && e.ideiaId ? 'A ideia ficou no site sem o áudio.' : 'Ideia descartada.')
      mudar(); cutucar()
    },
  }
}
export const _teste = { base64, sha256, prepararAudio, formatoDuracao: mmss, texto64, PARTE }
