// Aba Ideias (contrato em api/IDEIAS.md): cópia da aba de ideias do /treinos, no visual Passaporte, sem LuMamigos.
// Três abas: Nova ideia (texto, áudio, nível, "Guardar como ideia" | "Mandar implementar"), Ideias (fluxograma das etapas que
// filtra a lista, cards, folhas Mover e Nível, ação rápida nos chips) e Bastidores (bastidores.js). Regra de dinheiro: só o Luan,
// com Face ID (proposito ideia:<id>). Este arquivo desenha e entrega as ações; app.js só liga as peças.
import { S } from './estado.js?v=969408b8fd'
import { ic } from './icones.js?v=969408b8fd'
import { esc } from './util.js?v=969408b8fd'
import { API, ErroApi, tokenSessao, urlApi } from './api.js?v=969408b8fd'
import { telaBastidores, liberacaoNivel, pendenciaDaIdeia, htmlAvisoBugCritico } from './bastidores.js?v=969408b8fd'
import { htmlGravador, gravacaoAtual, gravando, limparGravador, guardarNovaIdeia, htmlEnvios, htmlOuvir } from './audio.js?v=969408b8fd'

const NIVEIS = [
  ['bug_critico', 'Bug crítico', 'bad'], ['bug', 'Bug', 'bad'], ['feature_urgente', 'Feature urgente', 'mari'],
  ['feature_importante', 'Feature importante', 'warn'], ['feature_quando_der', 'Feature quando der', 'neutro'], ['so_registro', 'Só registro', 'neutro'],
]
const NIVEL = Object.fromEntries(NIVEIS.map(([k, t, c]) => [k, { t, c }]))
const ORDEM_NIVEL = NIVEIS.map(([k]) => k)
const DICA_NIVEL = { feature_importante: 'Pode esperar, mas é bom implementar logo.', so_registro: 'Guardada, nunca vai para o agente.' }
const ROTULO = { ideia: 'Ideia', 'a implementar': 'A implementar', 'para avaliar': 'Para avaliar', feito: 'Aprovadas', arquivada: 'Arquivada' }
const TOM = { ideia: 'neutro', 'a implementar': 'info', 'para avaliar': 'bad', feito: 'ok', arquivada: 'neutro' }
const INFO_ESTAGIO = {
  ideia: 'Só registrada: vocês conversam, o agente não pega.', 'a implementar': 'Entra na fila do agente, pelo nível.',
  'para avaliar': 'Já está no ar: vocês testam e aprovam ou comentam.', feito: 'Ficou bom: vira histórico.', arquivada: 'Sai da lista (fica guardada no banco).',
}
const ICONE_ESTAGIO = { ideia: 'ideias', 'a implementar': 'setas', 'para avaliar': 'site', feito: 'check', arquivada: 'arquivo' }
const NOME_ESTAGIO = { abertas: 'Todas as abertas', ideia: 'Ideia', agora: 'Implementando', fila: 'Na fila', parada: 'Bloqueadas', espera: 'Esperando o Luan', avaliar: 'Para avaliar', feito: 'Aprovadas', registro: 'Só registro' }
const ORDEM_STATUS = ['a implementar', 'para avaliar', 'ideia', 'feito']
const LS_NOVA = 'adm_ideia_nova'

const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`
const dtHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const dtCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '')
const corta = (t, n) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length <= n ? x : x.slice(0, n).replace(/\s+\S*$/, '') + '...' }
const ehLuan = () => S.eu === 'luan'
const rasc = (k) => (S.rasc && S.rasc[k]) || ''
const aberto = (k) => !!(S.detAbertos && S.detAbertos[k])
const nivelDe = (i) => (NIVEL[i.nivel] ? i.nivel : 'feature_quando_der')
const base = (i) => String(i.texto || '').trim() || String(i.transcricao || '').trim()
const nomeIdeia = (i) => String(i.titulo || '').trim() || corta(base(i), 90) || '(ideia em áudio)'
const nomeCurto = (i) => { const n = String(i.nome_curto || '').trim(); if (n) return n; const p = (String(i.titulo || '').trim() || base(i)).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean); return p.length ? p.slice(0, 3).join(' ') + (p.length > 3 ? '...' : '') : '(áudio)' }
const textoHtml = (t) => esc(t).replace(/\n/g, '<br>')
function partes(texto) {
  const out = []
  String(texto || '').split(/```/).forEach((seg, k) => { if (k % 2 === 1) out.push({ codigo: seg.replace(/^\w*\n/, '').replace(/^\n+|\n+$/g, '') }); else if (seg.trim()) out.push({ texto: seg.trim() }) })
  return out
}
const blocos = (t) => partes(t).map((p) => (p.codigo != null
  ? `<div class="cod"><pre>${esc(p.codigo)}</pre><button class="btn mini" data-acao="ideia-copiar" data-v="${esc(p.codigo)}">${ic('copiar')} Copiar comando</button></div>`
  : `<p>${textoHtml(p.texto)}</p>`)).join('')
function haQuanto(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); if (s < 90) return 'agora há pouco'
  const m = Math.round(s / 60); if (m < 90) return `há ${m} min`; const h = Math.round(m / 60); return h < 36 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`
}
export function duracao(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(seg).padStart(2, '0')}`
}
function inicioEspera(i) { const p = (i.historico || []).filter((h) => h.para === 'a implementar'); return Date.parse(p.length ? p[p.length - 1].em : i.criado_em) }

/* ===== etapas (a mesma conta do /treinos; a liberação do nível vem dos Bastidores) ===== */
const ehAgora = (i) => i.status === 'a implementar' && !!i.agora
const lib = (n) => liberacaoNivel(S.bast, n)
function motivoParada(i) {
  if (i.autor === 'Agente') return 'Ideia escrita pelo agente: reescrevam com as palavras de vocês para ele pegar.'
  if (nivelDe(i) === 'so_registro' && !ehAgora(i)) return 'Só registro: nunca entra na fila do agente.'
  if (i.precisa_transcrever) return i.audio_estado === 'enviando' ? 'O áudio ainda está chegando do aparelho que gravou.' : 'Esperando a transcrição do áudio.'
  if (i.regra_dinheiro && !i.aprovada_por_luan) return 'Regra de dinheiro: falta o OK do Luan com Face ID.'
  const l = lib(ehAgora(i) ? 'bug_critico' : nivelDe(i))
  return l && !l.pode ? l.porque : null
}
const esperaDe = (i) => {
  if (i.status === 'feito' || nivelDe(i) === 'so_registro') return null
  if (i.espera_luan) return i.espera_luan
  const p = pendenciaDaIdeia(i.id)
  return p ? `Responder a pergunta em Bastidores > Esperando o Luan: “${p}”` : null
}
function estagioDe(i) {
  if (i.status === 'ideia') return 'ideia'
  if (i.status === 'a implementar') { if (i.agente_trabalhando) return 'agora'; if (motivoParada(i) || esperaDe(i)) return 'parada'; return 'fila' }
  if (i.status === 'para avaliar') return 'avaliar'
  return 'feito'
}
function ordemIdeias(a, b) {
  const ag = (x) => (ehAgora(x) ? 0 : 1)
  return ORDEM_STATUS.indexOf(a.status) - ORDEM_STATUS.indexOf(b.status) || ag(a) - ag(b)
    || ORDEM_NIVEL.indexOf(nivelDe(a)) - ORDEM_NIVEL.indexOf(nivelDe(b)) || String(a.criado_em).localeCompare(String(b.criado_em))
}
function filtra(f, i) {
  if (f === 'abertas') return i.status !== 'feito'
  if (f === 'espera') return !!esperaDe(i)
  if (f === 'registro') return nivelDe(i) === 'so_registro' && i.status !== 'feito'
  return estagioDe(i) === f
}
const abertas = () => (S.ideias || []).filter((i) => i.status !== 'arquivada')
const conta = (f) => abertas().filter((i) => filtra(f, i)).length
const posicoes = () => { const m = new Map(); abertas().filter((i) => estagioDe(i) === 'fila').sort(ordemIdeias).forEach((i, k) => m.set(i.id, k + 1)); return m }

/* ===== abas ===== */
function abas() {
  const a = S.ideiasAba || 'lista'
  const b = (k, t) => `<button class="${a === k ? 'sel' : ''}" aria-pressed="${a === k}" data-acao="ideia-aba" data-a="${k}">${t}</button>`
  return `<nav class="ideia-abas" aria-label="Ideias">${b('nova', 'Nova ideia')}${b('lista', 'Ideias')}${b('bast', 'Bastidores')}</nav>`
}
export function telaIdeias() {
  const a = S.ideiasAba || 'lista'
  return abas() + (a === 'nova' ? telaNova() : a === 'bast' ? telaBastidores() : telaLista())
}

/* ===== Nova ideia ===== */
function telaNova() {
  const d = S.nova || (S.nova = { nivel: 'feature_quando_der', agora: false, regra: false, ocupado: false, aviso: '' })
  const ag = d.agora && !d.regra
  return `<section class="sec ideia-nova"><div class="sec-cab"><h2>Nova ideia</h2></div><p class="nota">Escreva ou grave um áudio. Só vocês dois veem.</p>
    <div class="campo"><label for="ideia-texto">O que você quer?</label><textarea id="ideia-texto" rows="4" data-rasc="nova" placeholder="Escreva a ideia...">${esc(rasc('nova'))}</textarea></div>
    ${htmlGravador()}
    <div class="campo"><label>Nível</label><div class="ops">${NIVEIS.map(([k, t]) => `<button class="op ${d.nivel === k ? 'sel' : ''}" aria-pressed="${d.nivel === k}" data-acao="ideia-n" data-n="${k}">${t}</button>`).join('')}</div>${DICA_NIVEL[d.nivel] ? `<p class="nota">${DICA_NIVEL[d.nivel]}</p>` : ''}</div>
    <button class="ideia-switch${ag ? ' on' : ''}" role="switch" aria-checked="${ag}" data-acao="ideia-agora-nova"${d.regra ? ' disabled' : ''}><span class="trilho"><span class="bola"></span></span><span><b>${ic('zap')} Implementar agora</b><small>${d.regra ? 'Regra de dinheiro só vai para a fila com o Face ID do Luan.' : ag ? 'Ligado: nasce em "A implementar" e passa na frente de tudo.' : 'Exceção da exceção. Fura a fila e o orçamento. Só quando for testar na hora.'}</small></span></button>
    <label class="caixa"><input type="checkbox" data-acao="ideia-regra" ${d.regra ? 'checked' : ''}><span>Mexe em regra de dinheiro (só o Luan aprova)</span></label>
    ${d.aviso ? `<p class="erro-faixa">${esc(d.aviso)}</p>` : ''}
    <div class="btns">${ag ? '' : `<button class="btn" data-acao="ideia-salvar" data-st="ideia" ${d.ocupado ? 'disabled' : ''}>Guardar como ideia</button>`}<button class="btn pri" data-acao="ideia-salvar" data-st="a implementar" ${d.ocupado ? 'disabled' : ''}>${d.ocupado ? 'Guardando...' : ag ? 'Mandar implementar agora' : 'Mandar implementar'}</button></div>
    <p class="nota">"Guardar" só registra. "Mandar implementar" põe na fila do agente${d.regra ? '; regra de dinheiro só vai para a fila com o Face ID do Luan' : ''}.</p>
    ${htmlEnvios()}</section>`
}

/* ===== lista: fluxograma + cards ===== */
function chipsDe(f, pos) {
  const l = abertas().filter((i) => filtra(f, i)).sort(ordemIdeias)
  if (!l.length || f === 'feito') return ''
  return `<div class="flx-chips">${l.map((i) => {
    const ag = ehAgora(i), esp = f !== 'espera' && esperaDe(i)
    const pre = ag ? '<b>AGORA</b> ' : f === 'fila' && pos.get(i.id) ? `${pos.get(i.id)}ª ` : ''
    const aberto = S.rapido && S.rapido.no === f && String(S.rapido.id) === String(i.id)
    return `<button class="flx-chip${ag ? ' agora' : ''}${esp ? ' espera' : ''}${aberto ? ' sel' : ''}" data-acao="ideia-chip" data-no="${f}" data-id="${esc(i.id)}"${esp ? ' aria-label="esperando o Luan"' : ''}>${esp ? '<b class="ex">!</b>' : ''}${pre}#${esc(i.id)} ${esc(nomeCurto(i))}</button>`
  }).join('')}</div>${S.rapido && S.rapido.no === f ? painelRapido(S.rapido.id) : ''}`
}
function caixa(f, frase, pos, peq) {
  const n = conta(f), ativo = (S.filtroI || 'abertas') === f
  return `<div class="flx-caixa e-${f}${peq ? ' peq' : ''}${ativo ? ' ativo' : ''}${n ? '' : ' vazia'}${f === 'agora' && n ? ' girando' : ''}" role="button" tabindex="0" aria-pressed="${ativo}" data-acao="ideia-filtro" data-f="${f}">
    <div class="flx-linha"><span class="flx-rot">${f === 'agora' && n ? `<span class="engr">${ic('robo')}</span>` : ''}${NOME_ESTAGIO[f]}</span><span class="flx-n">${n}</span></div>${frase ? `<p>${frase}</p>` : ''}${chipsDe(f, pos)}</div>`
}
function fluxograma(pos) {
  const etapa = (num, conteudo, ultima) => `<div class="flx-etapa${ultima ? ' ultima' : ''}"><span class="flx-bola">${num}</span><div class="flx-corpo">${conteudo}</div></div>`
  const espera = conta('espera') > 0 || S.filtroI === 'espera' ? `<div class="flx-espera">${caixa('espera', 'Paradas até o Luan fazer algo. Toque na ideia para ver o quê.', pos)}</div>` : ''
  return `<section class="flx" aria-label="Etapas das ideias">${espera}
    ${etapa('1', caixa('ideia', 'Ainda conversando. O agente não pega.', pos) + `<div class="flx-desvio"><span>↳ desvio</span>${caixa('registro', 'guardada, nunca vai pro agente', pos, true)}</div>`)}
    ${etapa('2', `<div class="flx-tit">A implementar</div><div class="flx-duas">${caixa('fila', '', pos, true)}${caixa('parada', '', pos, true)}</div>`)}
    ${etapa('3', caixa('agora', 'O agente está fazendo agora.', pos))}
    ${etapa('4', caixa('avaliar', 'Já está no ar. Vocês testam e aprovam ou comentam.', pos))}
    ${etapa('✓', caixa('feito', 'Ficou bom. Vira histórico.', pos), true)}</section>`
}
function acaoRapida(i) {
  if (i.status === 'ideia') return { acao: 'ideia-mandar', rot: 'Mandar implementar', det: i.regra_dinheiro ? 'Regra de dinheiro: só o Luan, com Face ID.' : 'Vai para A implementar e entra na fila do agente pelo nível.' }
  if (i.status === 'a implementar' && !i.agora && !i.agente_trabalhando) return { acao: 'ideia-agora', rot: 'Implementar agora', det: 'Passa na frente da fila e do orçamento, como bug crítico.', ativo: '1', forte: true }
  if (i.status === 'para avaliar') return { acao: 'ideia-aprovar', rot: 'Aprovar', det: 'Ficou bom: vai para Aprovadas.' }
  return null
}
function painelRapido(id) {
  const i = abertas().find((x) => String(x.id) === String(id))
  if (!i) return '<div class="flx-rapido"><p class="nota">A ideia não está mais na lista.</p></div>'
  const a = acaoRapida(i)
  const est = i.status === 'a implementar' && i.agente_trabalhando ? 'Implementando' : ROTULO[i.status]
  return `<div class="flx-rapido"><b>#${esc(i.id)} ${esc(nomeIdeia(i))}</b><p>Está em: <b>${esc(est)}</b></p>${a ? `<p class="nota">${a.det}</p>` : ''}
    <div class="btns">${a ? `<button class="btn mini ${a.forte ? 'agora' : 'pri'}" data-acao="${a.acao}" data-id="${esc(i.id)}"${a.ativo ? ` data-ativo="${a.ativo}"` : ''}${i.regra_dinheiro && !ehLuan() && a.acao === 'ideia-mandar' ? ' disabled' : ''}>${a.forte ? ic('zap') + ' ' : ''}${a.rot}</button>` : ''}<button class="btn mini" data-acao="ideia-abrir-card" data-id="${esc(i.id)}">Abrir card</button></div></div>`
}
function cronometro(i, pos) {
  if (!(pos !== undefined || (i.status === 'a implementar' && i.comecou_em))) return ''
  const ini = inicioEspera(i), fim = i.comecou_em ? Date.parse(i.comecou_em) : NaN
  if (!isNaN(fim) && fim >= ini) return `<span class="cron parado" title="Tempo até o agente começar">${ic('proximas')} ${duracao(Math.floor((fim - ini) / 1000))}</span>`
  return `<span class="cron" title="Tempo esperando o agente" data-cron="${ini}">${ic('proximas')} ${duracao(Math.max(0, Math.floor((Date.now() - ini) / 1000)))}</span>`
}
function comentarios(i) {
  const cs = i.comentarios || []
  if (!cs.length && i.status !== 'para avaliar') return ''
  const todos = S.comsAbertos && S.comsAbertos[i.id]
  const vis = cs.length > 2 && !todos ? cs.slice(-2) : cs
  const lista = vis.map((c) => `<div class="ideia-com${c.autor === 'Agente' ? ' agente' : ''}"><span class="nota">${esc(c.autor)} · ${esc(dtHora(c.criado_em))}</span><div>${blocos(c.texto)}</div></div>`).join('')
  const mais = cs.length > 2 ? `<button class="btn link" data-acao="ideia-coms" data-id="${esc(i.id)}">${todos ? 'Mostrar só os mais recentes' : `Ver todos os ${cs.length} comentários`}</button>` : ''
  const t = rasc('c' + i.id)
  const comp = i.status === 'para avaliar' ? `<div class="campo"><textarea rows="2" data-rasc="c${esc(i.id)}" placeholder="O que precisa mudar?" aria-label="Comentário">${esc(t)}</textarea><div class="btns"><button class="btn mini${t.trim() ? ' pri' : ''}" data-acao="ideia-comentar" data-id="${esc(i.id)}">Comentar</button></div><p class="nota">Comentar devolve a ideia para a fila do agente.</p></div>` : ''
  return `<div class="ideia-coms"><h4>Comentários</h4>${mais}${lista}${comp}</div>`
}
function historico(i) {
  const hs = i.historico || []
  if (!hs.length) return ''
  const linhas = hs.map((h) => ({ em: h.em, t: `${h.de === h.para ? 'mexida de novo' : h.de ? `${ROTULO[h.de] || h.de} → ${ROTULO[h.para] || h.para}` : `criada em ${ROTULO[h.para] || h.para}`} (${h.por})` }))
  const ini = inicioEspera(i), fim = i.comecou_em ? Date.parse(i.comecou_em) : NaN
  if (!isNaN(fim) && fim >= ini) linhas.push({ em: i.comecou_em, t: `agente começou a implementar, depois de ${duracao(Math.floor((fim - ini) / 1000))} de espera` })
  linhas.sort((a, b) => String(a.em).localeCompare(String(b.em)))
  return `<details class="ideia-hist" data-det="h${esc(i.id)}"${aberto('h' + i.id) ? ' open' : ''}><summary>Histórico (${hs.length})</summary><ul>${linhas.map((l) => `<li>${esc(dtHora(l.em))}: ${esc(l.t)}</li>`).join('')}</ul></details>`
}
function cartao(i, pos) {
  const st = i.status, est = estagioDe(i), p = pos.get(i.id)
  const nv = NIVEL[nivelDe(i)]
  const esp = esperaDe(i), mot = est === 'parada' ? motivoParada(i) : null
  const dinheiroBloq = i.regra_dinheiro && !ehLuan()
  const semOk = i.regra_dinheiro && !i.aprovada_por_luan && (st === 'a implementar' || st === 'para avaliar')
  const podeEditar = st === 'ideia' || (st === 'a implementar' && !i.agente_trabalhando)
  const editTit = S.editTit === i.id, editTxt = S.editTxt === i.id
  const rap = acaoRapida(i)
  const titulo = editTit
    ? `<div class="campo"><input maxlength="120" data-rasc="tit${esc(i.id)}" placeholder="Título" aria-label="Título" value="${esc(rasc('tit' + i.id))}"><textarea rows="3" maxlength="800" data-rasc="res${esc(i.id)}" placeholder="Resumo" aria-label="Resumo">${esc(rasc('res' + i.id))}</textarea><p class="nota">Editado à mão, a IA não troca mais.</p><div class="btns"><button class="btn mini" data-acao="ideia-tit-cancelar">Cancelar</button><button class="btn mini pri" data-acao="ideia-tit-salvar" data-id="${esc(i.id)}"${S.salvandoI ? ' disabled' : ''}>${S.salvandoI ? 'Salvando...' : 'Salvar'}</button></div></div>`
    : `<div class="ideia-titulo"><h3>${esc(nomeIdeia(i))}</h3><button class="lapis" data-acao="ideia-tit-editar" data-id="${esc(i.id)}" aria-label="Editar título e resumo">${ic('lapis')}</button></div>${i.resumo ? `<p class="ideia-resumo">${textoHtml(i.resumo)}</p>` : ''}`
  const mostraOriginal = i.titulo || i.resumo || base(i).length > 90 || i.tem_audio || i.transcricao || podeEditar
  const original = !mostraOriginal ? '' : `<details class="ideia-orig" data-det="o${esc(i.id)}"${editTxt || aberto('o' + i.id) ? ' open' : ''}><summary>Ver texto original</summary>
    ${editTxt ? `<div class="campo"><textarea rows="5" data-rasc="txt${esc(i.id)}" aria-label="Texto da ideia">${esc(rasc('txt' + i.id))}</textarea><div class="btns"><button class="btn mini" data-acao="ideia-txt-cancelar">Cancelar</button><button class="btn mini pri" data-acao="ideia-txt-salvar" data-id="${esc(i.id)}"${S.salvandoI ? ' disabled' : ''}>${S.salvandoI ? 'Salvando...' : 'Salvar'}</button></div></div>`
    : `${String(i.texto || '').trim() ? `<div class="ideia-texto">${blocos(i.texto)}</div>` : ''}${podeEditar ? `<button class="btn link" data-acao="ideia-txt-editar" data-id="${esc(i.id)}">Editar texto</button>` : ''}`}
    ${i.tem_audio ? htmlOuvir(i) : ''}${i.transcricao ? `<p><b>Transcrição:</b> ${textoHtml(i.transcricao)}</p>` : ''}${!String(i.texto || '').trim() && !i.tem_audio && !i.transcricao ? '<p class="nota">Sem texto original.</p>' : ''}</details>`
  return `<article class="ideia${S.alvoI === i.id ? ' alvo' : ''}" data-ideia-id="${esc(i.id)}">
    <div class="ideia-cab"><div class="ideia-meta"><span class="ideia-num">#${esc(i.id)}</span>${chip(TOM[st] || 'neutro', ROTULO[st] || esc(st))}${chip(nv.c, nv.t)}${i.regra_dinheiro ? chip('bad', 'Regra de dinheiro') : ''}</div>
      <div class="ideia-quem"><span>${esc(i.autor || '')}${cronometro(i, p)}</span><span>${esc(dtCurta(i.criado_em))}</span></div></div>
    ${ehAgora(i) ? `<div class="selo-agora">${ic('zap')}<div><b>Implementar agora</b><small>Marcada${i.agora_por ? ' por ' + esc(i.agora_por) : ''} ${esc(haQuanto(i.agora_em || i.atualizado_em))}. Fura a fila e o orçamento.</small></div></div>` : ''}
    ${i.agente_trabalhando ? `<div class="selo-trab"><span class="gira"></span>Agente trabalhando nisso<span class="pontos"><i></i><i></i><i></i></span></div>` : ''}
    ${p && est === 'fila' ? `<div class="selo-fila">${p === 1 ? 'Próxima da fila do agente' : `${p}ª na fila do agente`}</div>` : ''}
    ${esp ? `<div class="espera-luan"><h4>${ic('alerta')} Esperando o Luan</h4>${blocos(esp)}${i.espera_luan ? `<div class="btns"><button class="btn mini pri" data-acao="ideia-ja-fiz" data-id="${esc(i.id)}">Já fiz</button></div>` : ''}</div>` : ''}
    ${mot ? `<p class="parada"><b>Parada.</b> ${esc(mot)}</p>` : ''}
    ${semOk && ehLuan() ? `<div class="btns"><button class="btn mini pri" data-acao="ideia-mandar" data-id="${esc(i.id)}">Mandar de volta (Face ID)</button></div>` : semOk ? '<p class="nota">Só o Luan manda de volta, com Face ID.</p>' : ''}
    ${titulo}${original}
    ${rap ? `<div class="btns"><button class="btn ${rap.forte ? 'agora' : 'pri'}" data-acao="${rap.acao}" data-id="${esc(i.id)}"${rap.ativo ? ` data-ativo="${rap.ativo}"` : ''}${(dinheiroBloq && rap.acao === 'ideia-mandar') || (rap.forte && i.regra_dinheiro && !i.aprovada_por_luan) ? ' disabled' : ''}>${rap.forte ? ic('zap') + ' ' : ''}${rap.rot}</button></div>` : ''}
    ${ehAgora(i) ? `<div class="btns"><button class="btn agora-off" data-acao="ideia-agora" data-id="${esc(i.id)}" data-ativo="0">Tirar o "Implementar agora"</button></div>` : ''}
    <div class="ideia-dois"><button class="btn" data-acao="ideia-mover" data-id="${esc(i.id)}">${ic('setas')} Mover</button><button class="btn" data-acao="ideia-nivel-folha" data-id="${esc(i.id)}">Mudar nível</button></div>
    ${comentarios(i)}${historico(i)}</article>`
}
function telaLista() {
  if (!S.ideias) return S.erroIdeias ? `<p class="erro-faixa">Não deu para carregar as ideias. ${esc(S.erroIdeias)}</p>` : '<p class="carregando">Carregando as ideias…</p>'
  const f = S.filtroI || 'abertas', nv = S.nivelI || 'todos'
  const pos = posicoes()
  let lista = abertas().filter((i) => filtra(f, i) && (nv === 'todos' || nivelDe(i) === nv))
  lista = S.recentesI ? lista.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))) : lista.sort(ordemIdeias)
  const nTot = f === 'abertas' ? conta('abertas') : conta(f)
  const mostrando = `<p class="flx-mostrando">Mostrando <b>${NOME_ESTAGIO[f]} (${nTot})</b>${f !== 'abertas' ? ` · <button class="btn link" data-acao="ideia-filtro" data-f="abertas">ver todas (${conta('abertas')})</button>` : ''}</p>`
  const filtros = `<div class="ideia-filtros"><select data-acao-change="ideia-nivel-filtro" aria-label="Nível"><option value="todos">Todos os níveis</option>${NIVEIS.map(([k, t]) => `<option value="${k}"${nv === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <button class="op ${S.recentesI ? 'sel' : ''}" aria-pressed="${!!S.recentesI}" data-acao="ideia-recentes">Mais recentes</button></div>`
  const guia = `<details class="ideia-guia" data-det="guia"${aberto('guia') ? ' open' : ''}><summary>Como o agente usa esta lista</summary><p><b>A implementar:</b> vocês aprovaram. O agente pega primeiro pelo nível (Bug crítico, Bug, Feature urgente, Feature importante, Feature quando der) e, no mesmo nível, na ordem em que foram criadas. "Implementando" é a que ele está fazendo; "Na fila" vai ser pega; "Bloqueadas" não vão ser pegas agora (o modo de orçamento do momento barra o nível, o áudio ainda não foi transcrito, falta o Face ID do Luan numa regra de dinheiro, é "Só registro" ou não é de vocês).</p><p><b>Ideia:</b> nasce na aba Nova ideia; vocês conversam.</p><p><b>Para avaliar:</b> o agente implementou e pôs no ar. Vocês testam e aprovam ou comentam no card. Comentário novo faz o agente voltar a ideia para a fila e refazer.</p><p><b>Aprovadas:</b> ficou bom; vira histórico e o agente não mexe mais.</p><p>Só entram na fila as ideias escritas por vocês dois.</p></details>`
  return `<p class="nota">Toquem numa etapa para ver as ideias dela. Toquem numa ideia para as ações rápidas.</p>${S.erroIdeias ? `<p class="erro-faixa">${esc(S.erroIdeias)}</p>` : ''}
    ${fluxograma(pos)}${mostrando}${filtros}${guia}
    ${lista.length ? `<p class="nota">${lista.length} ideia${lista.length === 1 ? '' : 's'}</p><div class="ideias-lista">${lista.map((i) => cartao(i, pos)).join('')}</div>` : '<section class="sec"><p>Nada aqui.</p></section>'}`
}

/* ===== folhas: Mover, Nível, confirmações ===== */
export function folhaIdeia() {
  const f = S.folha
  const cab = (t) => `<div class="folha-cab"><h3>${t}</h3><button data-acao="fechar" aria-label="Fechar">${ic('x')}</button></div>`
  const i = (S.ideias || []).find((x) => String(x.id) === String(f.id))
  if (f.passo === 'mover' && i) {
    const ops = ['ideia', 'a implementar', 'para avaliar', 'feito', 'arquivada'].filter((s) => s !== 'para avaliar' || i.status === 'a implementar' || i.status === 'para avaliar')
    return cab(`Mover #${esc(i.id)} para`) + `<div class="opcoes">${ops.map((s) => `<button class="opcao${s === i.status ? ' atual' : ''}" data-acao="ideia-mover-para" data-id="${esc(i.id)}" data-st="${s}"${s === 'a implementar' && i.regra_dinheiro && !ehLuan() && s !== i.status ? ' disabled' : ''}>${ic(ICONE_ESTAGIO[s])}<b>${ROTULO[s]}${s === i.status ? ' · Atual' : ''}</b><small>${INFO_ESTAGIO[s]}${s === 'a implementar' && i.regra_dinheiro ? ' Regra de dinheiro: só o Luan, com Face ID.' : ''}</small></button>`).join('')}</div>`
      + (i.status !== 'feito' ? `<div class="btns"><button class="btn ${ehAgora(i) ? 'agora-off' : 'agora'}" data-acao="ideia-agora" data-id="${esc(i.id)}" data-ativo="${ehAgora(i) ? '0' : '1'}">${ehAgora(i) ? 'Tirar o "Implementar agora"' : `${ic('zap')} Implementar agora`}</button></div>` : '')
  }
  if (f.passo === 'nivel' && i) return cab(`Nível de #${esc(i.id)}`) + `<div class="ops">${NIVEIS.map(([k, t]) => `<button class="op ${nivelDe(i) === k ? 'sel' : ''}" data-acao="ideia-nivel" data-id="${esc(i.id)}" data-n="${k}">${t}</button>`).join('')}</div><p class="nota">Feature importante: ${DICA_NIVEL.feature_importante}</p>`
  if (f.passo === 'critico') return cab('Bug crítico') + `<div class="aviso-cota"><h4>Você está decidindo gastar mais cota do que o razoável hoje</h4><p>Bug crítico passa na frente de tudo e o agente pega a qualquer hora, mesmo com a cota apertada.</p>${htmlAvisoBugCritico()}</div>
    <div class="btns"><button class="btn" data-acao="fechar">Cancelar</button><button class="btn pri" data-acao="ideia-critico-sim">Sim, é crítico</button></div>`
  if (f.passo === 'agora') return cab('Implementar agora') + `<div class="aviso-cota"><h4>Passar esta ideia na frente de tudo?</h4><p>Ela fura a fila e o orçamento, como um bug crítico${f.nova ? '' : ', e vai para "A implementar" se ainda não estiver lá'}. O nível dela não muda, e a marca some sozinha quando o agente terminar. Use só quando for testar na hora: tem que ser raro.</p></div>
    <div class="btns"><button class="btn" data-acao="fechar">Voltar</button><button class="btn agora" data-acao="ideia-agora-sim">Sim, agora</button></div>`
  return cab('Ideia') + '<p class="nota">A ideia não está mais na lista.</p>'
}

/* ===== ações (ligadas em app.js) ===== */
// c = { render, toast, escreve, aoMudar, abrirAprovacao, msgErro, tratarLogin, API }
export function acoesIdeias(c) {
  const solta = () => { const a = document.activeElement; if (a && a.blur && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName)) a.blur() }
  const acha = (id) => (S.ideias || []).find((x) => String(x.id) === String(id))
  const refaz = () => { solta(); c.render() }
  const move = (id, corpo, ok) => c.escreve(() => API.moveIdeia(id, corpo), ok)
  const comFaceId = (id, fn) => c.abrirAprovacao(`ideia:${id}`, null, async (ap) => { S.folha = null; await fn(ap) })
  const irAoCard = (id) => {
    const i = acha(id); if (!i) return c.toast(`A ideia #${id} não está mais na lista.`, true)
    S.rapido = null; S.ideiasAba = 'lista'
    if (!filtra(S.filtroI || 'abertas', i) || (S.nivelI && S.nivelI !== 'todos' && nivelDe(i) !== S.nivelI)) { S.filtroI = i.status === 'feito' ? 'feito' : 'abertas'; S.nivelI = 'todos' }
    S.alvoI = i.id; c.render()
    setTimeout(() => { const el = document.querySelector(`[data-ideia-id="${CSS.escape(String(i.id))}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 120)
    setTimeout(() => { if (S.alvoI === i.id) { S.alvoI = null; c.render() } }, 3500)
  }
  const mandar = (id) => {
    const i = acha(id); if (!i) return
    if (i.regra_dinheiro) { if (!ehLuan()) return c.toast('Só o Luan aprova regra de dinheiro, com Face ID.', true); return comFaceId(id, (ap) => move(id, { status: 'a implementar', aprovacao: ap }, 'Na fila do agente, aprovado com Face ID.')) }
    return move(id, { status: 'a implementar' }, 'Foi para A implementar.')
  }
  const marcaAgora = async (id, ativo) => {
    const i = acha(id); if (!i) return
    if (ativo && i.status !== 'a implementar') {
      // "Implementar agora" leva para a fila primeiro (como no /treinos); regra de dinheiro passa pelo Face ID do Luan
      if (i.regra_dinheiro && !i.aprovada_por_luan) { if (!ehLuan()) return c.toast('Só o Luan aprova regra de dinheiro, com Face ID.', true); return comFaceId(id, async (ap) => { const r = await c.escreve(() => API.moveIdeia(id, { status: 'a implementar', aprovacao: ap }), null); if (r) await c.escreve(() => API.agoraIdeia(id, { ativo: true }), 'Marcada: Implementar agora.') }) }
      const r = await c.escreve(() => API.moveIdeia(id, { status: 'a implementar' }), null)
      if (!r) return
    }
    return c.escreve(() => API.agoraIdeia(id, { ativo }), ativo ? 'Marcada: Implementar agora.' : 'Voltou à ordem normal.')
  }
  const salvarNova = async (st) => {
    const d = S.nova; if (!d || d.ocupado) return
    if (gravando()) { d.aviso = 'Pare a gravação antes de enviar.'; return refaz() }
    const texto = rasc('nova').trim(), audio = gravacaoAtual()
    if (!texto && !audio) { d.aviso = 'Escreva ou grave a ideia antes de enviar.'; return refaz() }
    const ag = st === 'a implementar' && d.agora && !d.regra
    const corpo = { texto, nivel: d.nivel, status: st, regra_dinheiro: !!d.regra, ...(ag ? { agora: true } : {}) }
    d.aviso = ''; d.ocupado = true; refaz()
    const limpa = () => { S.rasc.nova = ''; try { localStorage.removeItem(LS_NOVA) } catch (e) { /* sem armazenamento */ } S.nova = null }
    try {
      if (audio) {
        // ideia + áudio guardados no aparelho ANTES da rede; o envio continua sozinho (audio.js) e aparece aqui até chegar
        await guardarNovaIdeia(corpo, audio)
        limparGravador(); limpa(); c.render()
        return c.toast('Guardada neste aparelho. O áudio vai sozinho e a ideia aparece na lista quando chegar.')
      }
      const r = await API.criaIdeia(corpo)
      limpa()
      const i = r && r.ideia
      await c.aoMudar('escrita')
      if (i) irAoCard(i.id)
      if (st === 'a implementar' && i && i.status === 'ideia') c.toast('Ficou como ideia: regra de dinheiro só vai com o Face ID do Luan.')
      else c.toast(st === 'a implementar' ? 'Na fila do agente.' : 'Ideia guardada.')
    } catch (e) {
      if (c.tratarLogin(e)) return
      if (S.nova) S.nova.ocupado = false
      c.toast(audio ? `Não deu para guardar a ideia neste aparelho (${c.msgErro(e)}). Nada foi enviado; tente de novo.` : c.msgErro(e), true); refaz()
    }
  }
  const pedeConfirma = (passo, extra) => { S.folha = { tipo: 'ideia', passo, ...extra }; refaz() }
  return {
    'ideia-aba': (d) => { S.ideiasAba = d.a; S.rapido = null; c.render(); if (d.a !== 'nova') c.aoMudar('aba'); const t = document.getElementById('tela'); if (t) t.scrollTop = 0 },
    'ideia-nova': () => { S.ideiasAba = 'nova'; c.render() },
    'ideia-n': (d) => {
      const n = S.nova || (S.nova = { nivel: 'feature_quando_der', agora: false, regra: false })
      if (d.n === 'bug_critico' && n.nivel !== 'bug_critico') return pedeConfirma('critico', { nova: true })
      n.nivel = d.n; refaz()
    },
    'ideia-agora-nova': () => { const n = S.nova; if (!n || n.regra) return; if (!n.agora) return pedeConfirma('agora', { nova: true }); n.agora = false; refaz() },
    'ideia-regra': () => { S.nova.regra = !S.nova.regra; if (S.nova.regra) S.nova.agora = false; refaz() },
    'ideia-salvar': (d) => salvarNova(d.st),
    'ideia-critico-sim': () => {
      const f = S.folha; S.folha = null
      if (f && f.nova && S.nova) { S.nova.nivel = 'bug_critico'; return refaz() }
      if (f && f.id) return c.escreve(() => API.editaIdeia(f.id, { nivel: 'bug_critico' }), 'Nível: Bug crítico.')
      refaz()
    },
    'ideia-agora-sim': () => {
      const f = S.folha; S.folha = null
      if (f && f.nova && S.nova) { S.nova.agora = true; return refaz() }
      if (f && f.id) return marcaAgora(f.id, true)
      refaz()
    },
    'ideia-filtro': (d) => { S.filtroI = (S.filtroI || 'abertas') === d.f ? 'abertas' : d.f; S.nivelI = 'todos'; S.rapido = null; refaz(); setTimeout(() => { const el = document.querySelector('[data-ideia-id]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 120) },
    'ideia-chip': (d) => { S.rapido = S.rapido && S.rapido.no === d.no && String(S.rapido.id) === d.id ? null : { no: d.no, id: d.id }; refaz() },
    'ideia-abrir-card': (d) => irAoCard(d.id),
    'ideia-recentes': () => { S.recentesI = !S.recentesI; refaz() },
    'ideia-mover': (d) => pedeConfirma('mover', { id: d.id }),
    'ideia-nivel-folha': (d) => pedeConfirma('nivel', { id: d.id }),
    'ideia-mover-para': (d) => {
      const i = acha(d.id); S.folha = null
      if (!i || d.st === i.status) return refaz()
      if (d.st === 'a implementar') return mandar(d.id)
      return move(d.id, { status: d.st }, d.st === 'feito' ? 'Aprovada.' : d.st === 'arquivada' ? 'Ideia arquivada.' : `Foi para ${ROTULO[d.st]}.`)
    },
    'ideia-nivel': (d) => {
      const i = acha(d.id); S.folha = null
      if (!i || nivelDe(i) === d.n) return refaz()
      if (d.n === 'bug_critico') return pedeConfirma('critico', { id: d.id })
      return c.escreve(() => API.editaIdeia(d.id, { nivel: d.n }), 'Nível atualizado.')
    },
    'ideia-mandar': (d) => mandar(d.id),
    'ideia-agora': (d) => { if (d.ativo === '1') return pedeConfirma('agora', { id: d.id }); S.folha = null; return marcaAgora(d.id, false) },
    'ideia-aprovar': (d) => move(d.id, { status: 'feito' }, 'Aprovada.'),
    'ideia-coms': (d) => { S.comsAbertos = { ...(S.comsAbertos || {}), [d.id]: !(S.comsAbertos && S.comsAbertos[d.id]) }; refaz() },
    'ideia-comentar': async (d) => {
      const t = rasc('c' + d.id).trim()
      if (!t) return c.toast('Escreva o comentário.', true)
      solta()
      const r = await c.escreve(() => API.comentaIdeia(d.id, t), null)
      if (r) { S.rasc['c' + d.id] = ''; c.render(); c.toast('Comentário enviado. A ideia voltou para a fila do agente.') }
    },
    'ideia-tit-editar': (d) => { const i = acha(d.id); if (!i) return; S.rasc = { ...(S.rasc || {}), ['tit' + i.id]: nomeIdeia(i), ['res' + i.id]: i.resumo || '' }; S.editTit = i.id; c.render() },
    'ideia-tit-cancelar': () => { S.editTit = null; refaz() },
    'ideia-tit-salvar': async (d) => {
      const titulo = rasc('tit' + d.id).trim(), resumo = rasc('res' + d.id).trim()
      if (!titulo) return c.toast('Escreva o título.', true)
      S.salvandoI = true; refaz()
      const r = await c.escreve(() => API.editaIdeia(d.id, { titulo, resumo: resumo || null }), 'Título salvo.')
      S.salvandoI = false; if (r) S.editTit = null; c.render()
    },
    'ideia-txt-editar': (d) => { const i = acha(d.id); if (!i) return; S.rasc = { ...(S.rasc || {}), ['txt' + i.id]: i.texto || '' }; S.editTxt = i.id; c.render() },
    'ideia-txt-cancelar': () => { S.editTxt = null; refaz() },
    'ideia-txt-salvar': async (d) => {
      const i = acha(d.id); const texto = rasc('txt' + d.id).trim()
      if (!i) return
      if (!texto) return c.toast('Escreva a ideia.', true)
      S.salvandoI = true; refaz()
      const r = await c.escreve(() => API.editaIdeia(d.id, { texto, antes: i.atualizado_em }), 'Texto salvo.')
      S.salvandoI = false; if (r) S.editTxt = null; c.render()
    },
    'ideia-ja-fiz': (d) => c.escreve(() => API.jaFizIdeia(d.id), 'Anotado: o agente vê que você fez.'),
    'ideia-copiar': (d) => { const ok = () => c.toast('Copiado.'); try { navigator.clipboard.writeText(d.v).then(ok, () => c.toast('Não consegui copiar. Segure e copie o texto.', true)) } catch (e) { c.toast('Não consegui copiar. Segure e copie o texto.', true) } },
  }
}

// Guarda o que a pessoa digita (rascunho em memória; o da Nova ideia também no aparelho), para a tela se redesenhar sem perder o
// texto. O seletor de nível da lista avisa por `aoTrocarNivel`.
export function ligarRascunhos(raiz, aoTrocarNivel) {
  try { const v = localStorage.getItem(LS_NOVA); if (v) S.rasc = { ...(S.rasc || {}), nova: v } } catch (e) { /* sem armazenamento */ }
  raiz.addEventListener('input', (e) => {
    const k = e.target && e.target.dataset && e.target.dataset.rasc
    if (!k) return
    S.rasc = S.rasc || {}; S.rasc[k] = e.target.value
    if (k === 'nova') { try { localStorage.setItem(LS_NOVA, e.target.value) } catch (er) { /* sem armazenamento */ } }
  })
  // <details> abertos continuam abertos quando a tela se redesenha (WebSocket, volta à aba)
  raiz.addEventListener('toggle', (e) => { const k = e.target && e.target.dataset && e.target.dataset.det; if (k) S.detAbertos = { ...(S.detAbertos || {}), [k]: e.target.open } }, true)
  raiz.addEventListener('change', (e) => { if (e.target && e.target.dataset && e.target.dataset.acaoChange === 'ideia-nivel-filtro') { S.nivelI = e.target.value || 'todos'; if (aoTrocarNivel) aoTrocarNivel() } })
}

/* ===== ao vivo: WebSocket da aba (token no subprotocolo) + relógio do cronômetro ===== */
// Mensagens {"t":"ideias"|"bastidores"} sem dado: a aba busca de novo com a própria sessão. Ping a cada 50 s (o iPhone derruba
// socket parado); reconexão 1 s, 2 s, 4 s... até 30 s enquanto a aba está visível; ao abrir, busca de novo (o que mudou offline).
export function ligarAoVivo({ aoMudar, render }) {
  let ws = null, espera = 1000, tPing = 0, tPong = 0, tVolta = 0, ticks = 0, agendado = false
  // Security M1: each live reload calls the API with the session, which keeps it from idling out; after 30 min without a touch
  // or a key, the tab stops listening and the 30-min idle rule of the session works again (a touch brings it back)
  let mexeu = Date.now()
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, () => { mexeu = Date.now() }, { passive: true, capture: true })
  const parado = () => Date.now() - mexeu > 30 * 60e3
  const quer = () => S.fase === 'ok' && S.tela === 'ideias' && document.visibilityState === 'visible' && !!tokenSessao() && !parado()
  const fecha = () => { clearInterval(tPing); clearTimeout(tPong); if (ws) { const w = ws; ws = null; try { w.close() } catch (e) { /* já fechado */ } } }
  const abre = () => {
    clearTimeout(tVolta); agendado = false
    if (ws || !quer()) return
    let w
    try { w = new WebSocket(urlApi().replace(/^http/, 'ws') + '/ideias/ws', ['adm', tokenSessao()]) } catch (e) { return }
    ws = w
    w.onopen = () => { espera = 1000; aoMudar('ws'); tPing = setInterval(() => { try { w.send('{"t":"ping"}') } catch (e) { /* caiu */ } clearTimeout(tPong); tPong = setTimeout(() => { try { w.close() } catch (e) { /* já fechado */ } }, 10000) }, 50000) }
    w.onmessage = (e) => { clearTimeout(tPong); let t = ''; try { t = JSON.parse(e.data).t } catch (er) { return } if ((t === 'ideias' || t === 'bastidores') && S.tela === 'ideias' && !tocando()) aoMudar('ws') }
    w.onclose = () => { if (ws === w) ws = null; clearInterval(tPing); clearTimeout(tPong); if (quer()) { agendado = true; tVolta = setTimeout(abre, espera); espera = Math.min(30000, espera * 2) } }
  }
  // the 1 s tick only opens a socket when no retry is scheduled (the backoff of onclose stays in charge)
  const confere = () => { if (!quer()) { clearTimeout(tVolta); agendado = false; fecha() } else if (!agendado) abre() }
  document.addEventListener('visibilitychange', () => { espera = 1000; clearTimeout(tVolta); agendado = false; confere() })
  const tocando = () => [...document.querySelectorAll('audio')].some((a) => !a.paused && !a.ended)
  setInterval(() => {
    confere()
    if (document.visibilityState !== 'visible' || S.tela !== 'ideias') return
    // cronômetro dos cards: só o texto, sem redesenhar a tela
    document.querySelectorAll('[data-cron]').forEach((el) => { const s = Math.max(0, Math.floor((Date.now() - Number(el.dataset.cron)) / 1000)); const n = el.lastChild; if (n && n.nodeType === 3) n.textContent = ' ' + duracao(s) })
    // Bastidores ("há N min", linha do agora): redesenha a cada 30 s; a lista não precisa (o cronômetro anda sozinho acima)
    if (++ticks % 30 === 0 && S.ideiasAba === 'bast' && !S.folha && !tocando()) render()
  }, 1000)
  return { confere, fecha }
}

// O JSON dos Bastidores vem do Mac: todo número que a tela escreve direto passa a ser número de verdade (ou null), nunca texto
const NUMEROS_COTA = ['semana_pct', 'janela5h_pct', 'adiantamento_dias', 'decorrido_pct', 'projecao_semana_pct', 'max_pct_dia_para_durar', 'pontos_semana_pct']
const numOuNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
function numerosBast(x) {
  const d = x && x.dados
  if (!d || typeof d !== 'object') return x
  if (d.cota && typeof d.cota === 'object') for (const k of NUMEROS_COTA) if (k in d.cota) d.cota[k] = numOuNull(d.cota[k])
  if (d.regras && typeof d.regras === 'object') {
    if (d.regras.freios && typeof d.regras.freios === 'object') for (const k of Object.keys(d.regras.freios)) d.regras.freios[k] = numOuNull(d.regras.freios[k])
    if ('janela_m5_pct' in d.regras) d.regras.janela_m5_pct = numOuNull(d.regras.janela_m5_pct)
  }
  return x
}

// Recarga das ideias + bastidores (chamada por carregar() em app.js quando a tela é Ideias)
export function carregarIdeias(lista, msgErro) {
  return Promise.all([
    API.ideias().then((x) => { S.ideias = lista(x, 'ideias'); S.erroIdeias = '' }).catch((e) => { if (e instanceof ErroApi && e.status === 401) throw e; S.erroIdeias = msgErro(e) }),
    API.bastidores().then((x) => { S.bast = numerosBast(x || { dados: null, recebido_em: null }); S.erroBast = '' }).catch((e) => { if (e instanceof ErroApi && e.status === 401) throw e; S.erroBast = msgErro(e) }),
  ])
}
