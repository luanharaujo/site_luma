// Aba Bastidores do /adm: cota do Luan, quando cada pedido pode andar, o que espera o Luan, agentes e fila do Mac.
// Port of the treinos React screen (treine-com-a-gente/app/src/pages/bastidores.tsx) to plain strings.
// Data: S.bast = { dados, recebido_em } (JSON v1 from ~/.ai-shared/bastidores/exportar.py, already filtered to sys-adm-*).
// Everything here is a pure function of S + the clock: the host re-renders and we recompute "há X min" at render time.
import { S } from './estado.js?v=a8a3ca4557'
import { esc } from './util.js?v=a8a3ca4557'

const FUSO = 3 * 3600e3 // Brasília, UTC-3 fixed (no DST since 2019)
const DIA_MS = 864e5
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const NIVEIS = ['bug_critico', 'bug', 'feature_urgente', 'feature_importante', 'feature_quando_der', 'so_registro']
const NIVEIS_FILA = NIVEIS.filter((n) => n !== 'so_registro')
const ROTULO = { bug_critico: 'Bug crítico', bug: 'Bug', feature_urgente: 'Feature urgente', feature_importante: 'Feature importante', feature_quando_der: 'Feature quando der', so_registro: 'Só registro' }
const ALIAS = { lancamento: 'feature_urgente', importante: 'feature_importante', pode_esperar: 'feature_quando_der' }
const VELHO_MIN = 15 // no news from the Mac for longer than this: red footer
const DESLIGADO_MIN = 20 // only after this we say the Mac may be off
const VELHO_LIB_MIN = 30 // liberacaoNivel gives up after this

// ---------- small helpers ----------
const num = (x, a = -1e9, b = 1e9) => { const v = Number(x); return isFinite(v) ? Math.min(b, Math.max(a, v)) : 0 }
const f1 = (x) => num(x).toFixed(1)
const pad = (n) => String(n).padStart(2, '0')
const brt = (t) => new Date(t - FUSO)
const hhmm = (t) => { const d = brt(t); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) }
const meiaNoite = (t) => { const d = brt(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + FUSO }
const diaSemana = (t) => brt(t).getUTCDay()
const ddmm = (t) => { const d = brt(t); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) }
const minutos = (hm) => { const [h, m] = String(hm || '').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
const ms = (iso) => (iso ? Date.parse(iso) : NaN)
const horaRedonda = (t) => brt(t + 30 * 6e4).getUTCHours() + 'h'
const minusc1 = (t) => String(t).charAt(0).toLowerCase() + String(t).slice(1)
const listaE = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1])
const b = (t) => `<b>${t}</b>`

function quando(t, agora) {
  const dias = Math.round((meiaNoite(t) - meiaNoite(agora)) / DIA_MS)
  const h = hhmm(t)
  if (h === '00:00' && dias >= 1 && dias <= 2) return dias === 1 ? 'hoje à meia-noite' : 'amanhã à meia-noite'
  if (dias === 0) return `hoje às ${h}`
  if (dias === 1) return `amanhã às ${h}`
  return `${DIAS_LONGOS[diaSemana(t)]} (${ddmm(t)}) às ${h}`
}
function duracao(msDur) {
  const min = Math.max(0, Math.round(msDur / 6e4))
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h`
  return `${Math.round(h / 24)} dias`
}
function diasTexto(d) {
  const v = Math.round(d * 10) / 10
  return `${String(v).replace('.', ',')} ${v >= 2 ? 'dias' : 'dia'}`
}

// ---------- names ----------
const NOMES_AGENTES = {
  maestro: 'Maestro', arquiteto: 'Arquiteto', 'agente-marcação-de-treino': 'Agente de treino', 'agente-marcacao-de-treino': 'Agente de treino',
  'agente-vlogs': 'Vlogs', vlogs: 'Vlogs', 'agente-luma': 'Agente do LuMa', 'agente-empresa': 'Agente da empresa', pendencias: 'Pendências', 'agente-site-rotina': 'Rotina do site',
}
function nomeAgente(n) {
  const raw = String(n == null ? '' : n)
  const k = raw.trim().toLowerCase()
  if (NOMES_AGENTES[k]) return NOMES_AGENTES[k]
  const ideia = /^sys-adm-ideia-(\d+)$/.exec(k)
  if (ideia) return `ADM: ideia ${ideia[1]}`
  if (k.startsWith('sys-adm-')) return 'ADM: ' + k.slice(8).replace(/-/g, ' ')
  const t = raw.replace(/^agente-/, 'agente ').replace(/-/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// short names for the 24 h timeline (the full ones do not fit beside the bars on a phone)
const CURTO = { bug_critico: 'Crítico', bug: 'Bug', feature_urgente: 'Urgente', feature_importante: 'Importante', feature_quando_der: 'Quando der' }
export const rotuloNivel = (n) => ROTULO[n] || ROTULO.feature_quando_der
const nivelDe = (i) => { const n = (i && i.nivel && ALIAS[i.nivel]) || (i && i.nivel); return NIVEIS.includes(n) ? n : 'feature_quando_der' }

// ---------- rules (verbatim logic from bastidoresDados.tsx) ----------
// matriz[nível][modo]: 'q' any time, 'm' only dawn, 'm5' dawn or any time with the 5 h window under janela_m5_pct, '-' never.
function faixasDoNivel(r, modo, n, janela) {
  const fs = (r && r.faixas) || []
  const porNivel = r && r.matriz && r.matriz[n]
  if (porNivel && typeof porNivel === 'object' && modo && typeof porNivel[modo] === 'string') {
    const c = porNivel[modo]
    const m5Dia = c === 'm5' && typeof janela === 'number' && janela < ((r && r.janela_m5_pct) ?? 50)
    return fs.filter((f) => c === 'q' || ((c === 'm' || c === 'm5') && f.id === 'madrugada') || (m5Dia && f.id !== 'pausa') || (c === 'f' && (f.id === 'madrugada' || f.id === 'manha_mari')))
  }
  const m = modo && r && r.matriz && r.matriz[modo]
  return fs.filter((f) => !!(m && m[f.id] && m[f.id][n]))
}
function freioDe(c, r, n) {
  const fr = r && r.freios
  if (!fr) return null
  if (n === 'bug_critico' && typeof fr.bug_critico === 'number') return { pct: fr.bug_critico, nome: 'do Bug crítico' }
  if (c && c.faixa && typeof fr[c.faixa] === 'number') {
    const f = ((r && r.faixas) || []).find((x) => x.id === c.faixa)
    return { pct: fr[c.faixa], nome: `da ${minusc1(f ? f.nome : c.faixa)}` }
  }
  return typeof fr.geral === 'number' ? { pct: fr.geral, nome: 'geral' } : null
}

// Can the agent take this level right now? d is the wrapper S.bast. null = no data or data older than 30 min.
export function liberacaoNivel(d, n) {
  const dd = d && d.dados
  const c = dd && dd.cota
  if (!dd || !c) return null
  const t = ms(d.recebido_em)
  if (isNaN(t) || Date.now() - t > VELHO_LIB_MIN * 6e4) return null
  const r = dd.regras
  const nome = rotuloNivel(n)
  const modoNome = c.modo_nome || c.modo || 'modo atual'
  const naFaixa = !!(c.faixa && faixasDoNivel(r, c.modo, n, c.janela5h_pct).some((f) => f.id === c.faixa))
  const pode = c.pode && c.pode[n] !== undefined ? !!c.pode[n] : naFaixa
  if (!pode) return { pode: false, porque: `O modo “${modoNome}” não libera ${nome} agora.` }
  const fr = freioDe(c, r, n)
  if (fr && typeof c.janela5h_pct === 'number' && c.janela5h_pct >= fr.pct)
    return { pode: false, porque: `A janela de 5 horas está em ${c.janela5h_pct}% e o freio ${fr.nome} é ${fr.pct}%.` }
  return { pode: true, porque: '' }
}

// A pending question of the agents that cites this idea ("ideia 27", "#27").
function pendDe(dd, id) {
  const re = new RegExp(`(ideia\\s*#?|#)${Number(id)}(?!\\d)`, 'i')
  return ((dd && dd.pendencias) || []).find((p) => re.test(`${p.pergunta} ${p.parado || ''}`)) || null
}
export function pendenciaDaIdeia(id) {
  const p = pendDe(S.bast && S.bast.dados, id)
  return p ? String(p.pergunta) : null
}

// ---------- pieces ----------
const secao = (titulo, expl, corpo, extra, dado) =>
  `<section class="sec bs-sec" data-secao="${esc(dado || '')}"><div class="sec-cab"><h2>${titulo}</h2>${extra || ''}</div>${expl ? `<p class="bs-expl">${expl}</p>` : ''}${corpo}</section>`
const chip = (cls, t) => `<span class="chip ${cls}">${t}</span>`
const giro = (t) => `<span class="bs-giro"><i class="bs-spin" aria-hidden="true"></i>${t}</span>`
const ponto = (cls) => `<i class="bs-ponto ${cls}" aria-hidden="true"></i>`

function anel(pct) {
  const C = 2 * Math.PI * 14
  const p = num(pct, 0, 100)
  const cls = p >= 70 ? 'bad' : p >= 50 ? 'warn' : 'ok'
  return `<svg class="bs-anel" viewBox="0 0 36 36" width="36" height="36" aria-hidden="true"><circle class="bs-anel-fundo" cx="18" cy="18" r="14"/>`
    + `<circle class="bs-anel-v ${cls}" cx="18" cy="18" r="14" transform="rotate(-90 18 18)" stroke-dasharray="${f1((p / 100) * C)} ${f1(C)}"/></svg>`
}

// minute-of-day chunks [start, end) of a band; a band crossing midnight becomes two chunks
function pedacos(f) {
  const a = minutos(f.de)
  const e = minutos(f.ate) || 1440
  return a < e ? [[a, e]] : [[a, 1440], [0, e]]
}
function proximaJanela(r, modo, n, agora, pularAtual) {
  const fs = faixasDoNivel(r, modo, n)
  let melhor = null
  for (let d = 0; d < 8; d++) {
    const base = meiaNoite(agora) + d * DIA_MS
    for (const f of fs)
      for (const [a, e] of pedacos(f)) {
        const ini = base + a * 6e4
        const fim = base + e * 6e4
        if (fim <= agora) continue
        if (ini <= agora && pularAtual) continue
        const t = Math.max(ini, agora)
        if (!melhor || t < melhor.t) melhor = { t, f }
      }
    if (melhor) return melhor
  }
  return null
}
const faixasTexto = (fs) => listaE(fs.map((f) => esc(`${minusc1(f.nome)} (${f.de} às ${f.ate === '24:00' ? '0h' : f.ate})`)))
function nomesRodam(rodam) {
  const bugs = rodam.includes('bug') && rodam.includes('bug_critico')
  return rodam.map((n) => (bugs && n.startsWith('bug') ? 'bugs' : ROTULO[n].toLowerCase())).filter((x, k, a) => a.indexOf(x) === k)
}

// Crosses an idea with cota.pode and the rules (and with questions that wait for Luan). pend = {pergunta} | null.
function situacao(i, d, agora, posicao, pend) {
  const c = d.cota
  const r = d.regras
  const marcada = i.status === 'a implementar' && !!i.agora
  const n = marcada ? 'bug_critico' : nivelDe(i)
  const nome = esc(ROTULO[n])
  const modoNome = esc((c && (c.modo_nome || c.modo)) || 'modo atual')
  const f0 = ((r && r.faixas) || []).find((f) => c && f.id === c.faixa)
  const faixaNome = f0 ? f0.nome : ''
  const doModo = faixasDoNivel(r, c && c.modo, n, c && c.janela5h_pct)
  const naFaixa = !!(c && c.faixa && doModo.some((f) => f.id === c.faixa))
  const podeAgora = c && c.pode && c.pode[n] !== undefined ? !!c.pode[n] : naFaixa
  const prox = proximaJanela(r, c && c.modo, n, agora, !podeAgora)
  const frente = posicao && posicao > 1 ? `${posicao - 1} na frente dela` : null
  const renova = ms(c && c.semana_renova)
  if (i.agente_trabalhando)
    return { selo: giro('Sendo feita agora'), rotulo: 'Por que anda', porque: `O agente já começou a fazer.${podeAgora ? ` ${nome} pode rodar agora no “${modoNome}”.` : ''}`, previsao: b('Vai para "Para avaliar" quando ficar pronta.') }
  // ADM: audio waiting for the Mac's transcription, and a money rule waiting for Luan's Face ID, stop the card before the budget
  if (i.precisa_transcrever)
    return { selo: chip('warn', 'Espera a transcrição'), rotulo: 'Por que parou', porque: i.audio_estado === 'enviando' ? 'O áudio ainda está chegando do aparelho que gravou.' : 'O Mac ainda vai transcrever o áudio (fila do Mac).', previsao: 'Entra na fila do agente assim que a transcrição chegar.' }
  if (i.regra_dinheiro && !i.aprovada_por_luan)
    return { selo: chip('bad', 'Espera o Luan'), rotulo: 'Por que parou', porque: 'Regra de dinheiro: falta o OK do Luan com Face ID.', previsao: 'Anda logo depois que ele aprovar no card.' }
  if (pend) {
    const depois = podeAgora ? 'Anda logo depois que ele responder.'
      : prox ? `Depois que ele responder, entra na próxima janela de ${nome}: ${b(esc(quando(prox.t, agora)))}.`
      : 'Depois que ele responder, ainda espera a cota folgar.'
    return { selo: chip('bad', 'Espera o Luan'), rotulo: 'Por que parou', porque: `Falta resposta do Luan: “${esc(pend.pergunta)}” (ver “Esperando o Luan”).`, previsao: depois }
  }
  if (podeAgora) {
    const fr = freioDe(c, r, n)
    if (fr && typeof c.janela5h_pct === 'number' && c.janela5h_pct >= fr.pct) {
      const z = ms(c.janela5h_renova)
      return {
        selo: chip('warn', 'Espera a janela de 5 h'), rotulo: 'Por que espera',
        porque: `A janela de 5 horas está em ${num(c.janela5h_pct)}% e o freio ${esc(fr.nome)} é ${num(fr.pct)}%.`,
        previsao: isNaN(z) ? 'Volta quando a janela zerar.' : `Volta a andar ${b(esc(quando(z, agora)))}, quando a janela zera.`,
      }
    }
    return {
      selo: chip('ok', 'Pode andar agora'), rotulo: 'Por que anda',
      porque: `${nome} pode rodar agora no “${modoNome}”${faixaNome ? ` (${esc(minusc1(faixaNome))})` : ''}.`,
      previsao: frente ? `Na fila: ${esc(frente)}. Sai depois delas.` : b('É a próxima: o agente pega na próxima rodada da fila.'),
    }
  }
  if (prox)
    return {
      selo: chip('warn', 'Espera a hora'), rotulo: 'Por que espera',
      porque: `No “${modoNome}”, ${nome} só roda ${faixasTexto(doModo)}.`,
      previsao: `Próxima vez: ${b(esc(quando(prox.t, agora)))}${frente ? ` (${esc(frente)} na fila)` : ''}, se o modo não mudar.`,
    }
  const rodam = nomesRodam(NIVEIS_FILA.filter((x) => c && c.pode && c.pode[x]))
  const max = c && c.max_pct_dia_para_durar
  return {
    selo: chip('warn', 'Espera a cota'), rotulo: 'Por que espera',
    porque: `No “${modoNome}”, ${nome} não roda em hora nenhuma${rodam.length ? `: a cota vai para ${esc(listaE(rodam))}` : ''}.`,
    previsao: `Entra quando o ritmo da semana couber até a renovação${typeof max === 'number' ? ` (gastando até ${b(num(max) + '% por dia')})` : ''}${!isNaN(renova) ? `; no máximo ${b(esc(quando(renova, agora)))}, quando a cota renova.` : '.'}`,
  }
}

// ---------- top: Agora / Semana / 5 horas + phrase ----------
function topo(c, agora) {
  const rodam = NIVEIS_FILA.filter((n) => c.pode && c.pode[n])
  const detModo = !c.pode ? '' : rodam.length === NIVEIS_FILA.length ? 'todos os níveis andam' : !rodam.length ? 'nada anda agora' : `só ${listaE(nomesRodam(rodam))}`
  const acaba = ms(c.acaba_em)
  const renova = ms(c.semana_renova)
  const zera = ms(c.janela5h_renova)
  const curto = !isNaN(acaba) && (isNaN(renova) || acaba < renova)
  const modo = c.modo && c.modo_nome ? `<span class="bs-modo-l">${esc(c.modo)} · </span>${esc(c.modo_nome)}` : esc(c.modo_nome || c.modo || '?')
  const adi = typeof c.adiantamento_dias === 'number'
    ? `<div class="bs-peq" data-adiantamento>${c.adiantamento_dias > 0.05 ? diasTexto(c.adiantamento_dias) + ' adiantado' : c.adiantamento_dias < -0.05 ? diasTexto(-c.adiantamento_dias) + ' de folga' : 'no ritmo da semana'}</div>` : ''
  const sem = curto ? `acaba ${DIAS_CURTOS[diaSemana(acaba)]} ~${horaRedonda(acaba)} no ritmo atual`
    : !isNaN(renova) ? `dura até ${DIAS_CURTOS[diaSemana(renova)]} ${hhmm(renova)} no ritmo atual` : 'usado na semana'
  const frase = c.frase ? esc(c.frase)
    : curto ? `No ritmo desta semana, a cota do Luan ${b('acaba ' + esc(quando(acaba, agora)))}${!isNaN(renova) ? ` e só volta ${b(esc(quando(renova, agora)))}` : ''}.`
    : 'No ritmo desta semana, a cota dura até a renovação.'
  return `<div class="bs-topo" data-topo>`
    + `<div class="bs-caixa bs-caixa-modo"><div class="bs-rot">Agora</div><div class="bs-grande bs-modo" data-modo="${esc(c.modo || '')}">${modo}</div>${detModo ? `<div class="bs-peq">${esc(detModo)}</div>` : ''}${adi}</div>`
    + `<div class="bs-caixa"><div class="bs-rot">Semana</div><div class="bs-grande ${curto ? 'bad' : ''}">${c.semana_pct ?? '?'}%</div><div class="bs-peq">${esc(sem)}</div></div>`
    + `<div class="bs-caixa"><div class="bs-rot">5 horas</div><div class="bs-anel-l">${anel(c.janela5h_pct ?? 0)}<span class="bs-grande">${c.janela5h_pct ?? '?'}%</span></div>${!isNaN(zera) ? `<div class="bs-peq">zera às ${hhmm(zera)}</div>` : ''}</div>`
    + `</div><p class="bs-frase" data-frase>${frase}</p>`
}

// ---------- 24 h timeline per level ----------
function linhaDoDia(d, agora) {
  const r = d.regras
  const modo = d.cota && d.cota.modo
  const faixas = (r && r.faixas) || []
  const W = 340, x0 = 88, x1 = W - 6, linha = 32, tp = 24
  const H = tp + NIVEIS_FILA.length * linha + 30
  const X = (min) => f1(x0 + ((x1 - x0) * min) / 1440)
  const Xn = (min) => x0 + ((x1 - x0) * min) / 1440
  const agoraMin = (agora - meiaNoite(agora)) / 6e4
  const xa = Xn(agoraMin)
  const rotuloFaixa = (f, w) => {
    const nm = String(f.nome)
    if (w >= nm.length * 5.8 + 6) return nm
    const ult = nm.split(' ').pop() || nm
    if (w >= ult.length * 5.8 + 6) return ult
    return nm.slice(0, Math.max(2, Math.floor(w / 6.2) - 1)) + '.'
  }
  let s = `<svg class="bs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Horas de hoje em que cada nível pode rodar">`
  faixas.forEach((f, k) => pedacos(f).forEach(([a, e], j) => {
    s += `<rect class="bs-banda bs-banda${k % 5}" x="${X(a)}" y="${tp - 4}" width="${f1(Xn(e) - Xn(a))}" height="${NIVEIS_FILA.length * linha + 6}"/>`
    if (j === 0) s += `<text class="bs-t bs-t-faixa" x="${f1((Xn(a) + Xn(e)) / 2)}" y="${tp - 9}" text-anchor="middle">${esc(rotuloFaixa(f, Xn(e) - Xn(a)))}</text>`
  }))
  NIVEIS_FILA.forEach((n, k) => {
    const y = tp + k * linha
    const fs = faixasDoNivel(r, modo, n)
    s += `<text class="bs-t bs-t-nivel" x="${x0 - 8}" y="${y + 17}" text-anchor="end">${esc(CURTO[n] || ROTULO[n])}</text>`
    s += `<rect class="bs-trilho" x="${x0}" y="${y + 1}" width="${x1 - x0}" height="24" rx="6"/>`
    fs.flatMap(pedacos).forEach(([a, e]) => {
      s += `<rect class="bs-barra-n bs-n-${n}" x="${f1(Xn(a) + 1)}" y="${y + 4}" width="${f1(Math.max(2, Xn(e) - Xn(a) - 2))}" height="18" rx="5"/>`
    })
    if (!fs.length) s += `<text class="bs-t bs-t-faixa" x="${(x0 + x1) / 2}" y="${y + 17}" text-anchor="middle">hoje não: espera a cota folgar</text>`
  })
  s += `<line class="bs-agora" x1="${f1(xa)}" y1="${tp - 4}" x2="${f1(xa)}" y2="${H - 14}"/>`
  ;[0, 6, 12, 18, 24].filter((h) => Math.abs(Xn(h * 60) - xa) > 34).forEach((h) => {
    s += `<text class="bs-t bs-t-faixa" x="${X(h * 60)}" y="${H - 2}" text-anchor="${h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}">${h}h</text>`
  })
  const px = Math.min(Math.max(xa, x0 + 24), x1 - 24)
  s += `<rect class="bs-pilula" x="${f1(px - 24)}" y="${H - 16}" width="48" height="16" rx="8"/><text class="bs-t bs-t-pilula" x="${f1(px)}" y="${H - 4.5}" text-anchor="middle">${hhmm(agora)}</text></svg>`
  return s
}

// ---------- "Quando cada pedido pode andar hoje" ----------
const MODOS = ['A', 'B', 'C', 'D', 'E', 'F']
const MODO_NOME = { A: 'Folga', B: 'Normal', C: 'Atenção', D: 'Segurar', E: 'Freio', F: 'Só crítico' }
const CELULA = { q: ['q', 'q'], m: ['m', 'm'], f: ['m', 'm'], m5: ['m5', 'm'], '-': ['x', 'nao'] }
function matrizModos(r, modo) {
  const m = r && r.matriz
  const linhas = NIVEIS_FILA.filter((n) => m && m[n] && typeof m[n] === 'object')
  if (!linhas.length) return ''
  const modos = MODOS.filter((x) => linhas.some((n) => typeof m[n][x] === 'string'))
  if (!modos.length) return ''
  const th = modos.map((x) => `<th class="${x === modo ? 'atual' : ''}" title="${esc(MODO_NOME[x])}">${x}<span>${esc(MODO_NOME[x] || '')}</span></th>`).join('')
  const tr = linhas.map((n) => `<tr><td class="bs-ln">${esc((r.rotulos && r.rotulos[n]) || ROTULO[n])}</td>${modos.map((x) => {
    const cel = CELULA[String(m[n][x] ?? '-')] || CELULA['-']
    return `<td class="${x === modo ? 'atual' : ''}"><span class="bs-cel ${cel[1]}">${cel[0]}</span></td>`
  }).join('')}</tr>`).join('')
  return `<div class="bs-matriz" data-matriz><div class="bs-sub">Todos os modos</div><div class="bs-rola"><table><thead><tr><th></th>${th}</tr></thead><tbody>${tr}</tbody></table></div>`
    + `<p class="nota" data-legenda>q = qualquer hora · m = só de madrugada · m5 = madrugada, ou de dia com a janela de 5 h abaixo de ${num((r && r.janela_m5_pct) ?? 50)}% · x = não roda</p></div>`
}

function pedidos(d, ideias, agora, carregando, erro) {
  const c = d.cota
  const marcada = (i) => i.status === 'a implementar' && !!i.agora
  const lista = ideias || []
  const ordem = (a, bb) => Number(marcada(bb)) - Number(marcada(a)) || NIVEIS.indexOf(nivelDe(a)) - NIVEIS.indexOf(nivelDe(bb)) || String(a.criado_em || '').localeCompare(String(bb.criado_em || ''))
  const fila = lista.filter((i) => i.status === 'a implementar' && (nivelDe(i) !== 'so_registro' || marcada(i))).sort(ordem)
  const pos = new Map(fila.map((i, k) => [i.id, k + 1]))
  const mostrar = [...lista.filter((i) => i.agente_trabalhando && !pos.has(i.id)), ...fila]
  const modoNome = c.modo_nome || c.modo
  const faixas = (d.regras && d.regras.faixas) || []
  const expl = `Barra colorida = horas em que o agente pode pegar aquele nível hoje${modoNome ? ` (no “${esc(modoNome)}”)` : ''}. A linha preta é agora.${faixas.length ? ' ' + esc(faixas.map((f) => `${f.nome}: ${f.de} às ${f.ate === '24:00' ? 'meia-noite' : f.ate}`).join('; ')) + '.' : ''}`
  let cards = ''
  for (const i of mostrar) {
    const pg = pendDe(d, i.id)
    const espera = pg || (i.espera_luan ? { pergunta: i.espera_luan } : null) || (esperaDinheiro(i) ? { pergunta: TXT_DINHEIRO } : null)
    const s = situacao(i, d, agora, pos.get(i.id), espera)
    cards += `<div class="bs-pedido" data-pedido="${num(i.id)}"><div class="bs-linha-selos"><span class="bs-id">#${esc(i.id)}</span>${chip(nivelCls(nivelDe(i)), esc(ROTULO[marcada(i) ? 'bug_critico' : nivelDe(i)]))}${marcada(i) ? chip('bad', 'Agora') : ''}${s.selo}</div>`
      + `<p class="bs-txt">${esc(i.titulo || i.nome_curto || i.texto || i.transcricao || '(ideia em áudio)')}</p>`
      + `<dl class="bs-dl"><dt>${s.rotulo}</dt><dd>${s.porque}</dd><dt>Previsão</dt><dd>${s.previsao}</dd></dl></div>`
  }
  const regras = NIVEIS.map((n) => {
    const fs = faixasDoNivel(d.regras, c.modo, n, c.janela5h_pct)
    const todas = faixas.length > 0 && fs.length === faixas.length
    const t = n === 'so_registro' ? 'Nunca entra na fila: é só anotação' : todas ? 'Sempre, a qualquer hora' : fs.length ? `Só ${faixasTexto(fs)}` : 'Espera a cota folgar'
    return `<tr><td>${chip(nivelCls(n), esc(ROTULO[n]))}</td><td class="bs-cinza">${t}${c.pode && c.pode[n] && n !== 'so_registro' ? '<b class="bs-ok"> · anda agora</b>' : ''}</td></tr>`
  }).join('')
  return secao('Quando cada pedido pode andar hoje', expl,
    `<div class="bs-svg-w" data-linha-do-dia>${linhaDoDia(d, agora)}</div><h3 class="bs-h3">Seus pedidos na fila do agente</h3>`
    + (carregando ? '<p class="nota">Carregando as ideias...</p>' : '')
    + (erro ? '<p class="bs-erro">Não deu para carregar as ideias.</p>' : '')
    + (!carregando && !erro && !mostrar.length ? '<p class="nota">Nenhuma ideia de vocês em “A implementar” agora.</p>' : '')
    + `<div class="bs-pedidos">${cards}</div>`
    + `<details class="bs-det" data-regras><summary>Ver regras: o que cada nível pode fazer${modoNome ? ` no “${esc(modoNome)}”` : ''}</summary><table class="bs-regras"><tbody>${regras}</tbody></table>${matrizModos(d.regras, c.modo)}</details>`,
    '', 'pedidos')
}
function nivelCls(n) { return n === 'bug_critico' || n === 'bug' ? 'bad' : n === 'feature_urgente' ? 'mari' : n === 'feature_importante' ? 'warn' : 'neutro' }

// ---------- waiting for Luan ----------
const TXT_DINHEIRO = 'Regra de dinheiro: falta o OK do Luan com Face ID'
const esperaDinheiro = (i) => !!i.regra_dinheiro && !i.aprovada_por_luan && (i.status === 'ideia' || i.status === 'a implementar')

function esperandoLuan(d, ideias, agora) {
  // questions from the agents + ideas that wait for Luan on their own (money rule, espera_luan) not already cited by a question
  const itens = ((d.pendencias) || []).map((p) => ({ pergunta: p.pergunta, quem: p.de ? nomeAgente(p.de) : '', parado: p.parado, desde: p.desde, id: p.id }))
  for (const i of ideias || []) {
    if (i.status === 'arquivada' || i.status === 'feito' || pendDe(d, i.id)) continue
    const nome = `ideia ${num(i.id)}`
    if (i.espera_luan) itens.push({ pergunta: i.espera_luan, quem: nome, parado: nome, desde: i.agente_desde || i.criado_em })
    else if (esperaDinheiro(i)) itens.push({ pergunta: TXT_DINHEIRO, quem: nome, parado: nome, desde: i.criado_em })
  }
  const lista = itens.sort((a, bb) => (ms(a.desde) || agora) - (ms(bb.desde) || agora))
  const maior = Math.max(1, ...lista.map((p) => agora - (ms(p.desde) || agora)))
  const lis = lista.map((p) => {
    const t = ms(p.desde)
    const idade = isNaN(t) ? 0 : Math.max(0, agora - t)
    return `<li class="bs-pend" data-pendencia><div class="bs-pend-c"><div class="bs-pend-q">${esc(p.pergunta)}</div>${p.quem ? `<div class="bs-cinza bs-pq">${esc(p.quem)}</div>` : ''}${p.parado ? `<div class="bs-bad bs-pq">Parado: ${esc(p.parado)}</div>` : ''}</div>`
      + (isNaN(t) ? '' : `<div class="bs-pend-t"><b>${duracao(idade)}</b><span class="bs-cinza">desde ${hhmm(t)}</span><div class="bs-fio"><i data-w="${f1(Math.max(4, (idade / maior) * 100))}"></i></div></div>`)
      + '</li>'
  }).join('')
  return secao('Esperando o Luan', 'Perguntas que só ele responde. A mais antiga primeiro. Enquanto ele não responde, o que está em “Parado” não anda.',
    (lista.length ? '' : `<p class="bs-ok-caixa">${ponto('ok')}Nada esperando o Luan.</p>`) + `<ul class="bs-lista">${lis}</ul>`,
    lista.length ? chip('bad', String(lista.length)) : '', 'pendencias')
}

// ---------- week quota ----------
function graficoSemana(c, agora) {
  const renova = ms(c.semana_renova)
  const pts = (c.pontos_semana || []).map(([t, p]) => [Date.parse(t), Number(p)]).filter(([t, p]) => !isNaN(t) && !isNaN(p)).sort((a, bb) => a[0] - bb[0])
  const inicio = !isNaN(ms(c.semana_inicio)) ? ms(c.semana_inicio) : !isNaN(renova) ? renova - 7 * DIA_MS : pts[0] && pts[0][0]
  if (isNaN(renova) || inicio === undefined || isNaN(inicio)) return '<p class="nota">Sem os dados da semana.</p>'
  const ult = pts.length ? pts[pts.length - 1] : [agora, c.semana_pct ?? 0]
  const tAgora = Math.min(Math.max(ult[0], inicio), renova)
  const pAgora = num(c.semana_pct ?? ult[1], 0, 1000)
  let acaba = ms(c.acaba_em)
  if (isNaN(acaba) && typeof c.projecao_semana_pct === 'number' && c.projecao_semana_pct > 100 && c.projecao_semana_pct > pAgora)
    acaba = tAgora + ((100 - pAgora) / (c.projecao_semana_pct - pAgora)) * (renova - tAgora)
  const curto = !isNaN(acaba) && acaba < renova
  const fimProj = curto ? [acaba, 100] : [renova, Math.min(100, c.projecao_semana_pct ?? pAgora + (pAgora / Math.max(1, tAgora - inicio)) * (renova - tAgora))]
  const W = 340, L = 36, R = W - 10, T = 40, B = 168, H = B + 24, fs = 11
  const X = (t) => L + ((R - L) * (t - inicio)) / (renova - inicio)
  const Y = (p) => B - ((B - T) * Math.min(100, Math.max(0, p))) / 100
  const caminho = [[inicio, 0], ...pts.filter(([t]) => t > inicio), ...(pts.length ? [] : [[tAgora, pAgora]])]
  const meias = []
  for (let t = meiaNoite(inicio) + DIA_MS; t < renova; t += DIA_MS) meias.push(t)
  const rotulos = [inicio, ...meias.map((t) => t + DIA_MS / 2)].filter((t, k) => k === 0 || t < renova - DIA_MS / 6)
  const xa = X(acaba)
  const aria = `Uso da semana: ${pAgora}% até agora; ${curto ? `no ritmo atual chega a 100% ${quando(acaba, agora)}` : 'no ritmo atual dura até a renovação'}; a cota renova ${quando(renova, agora)}`
  let s = `<svg class="bs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`
  if (curto) {
    s += `<rect class="bs-semcota" x="${f1(xa)}" y="${T}" width="${f1(R - xa)}" height="${B - T}"/>`
    if (R - xa > 60) s += `<text class="bs-t bs-t-bad" x="${f1((xa + R) / 2)}" y="${B - 34}" text-anchor="middle" font-size="${fs + 1}">sem cota</text><text class="bs-t bs-t-faixa" x="${f1((xa + R) / 2)}" y="${B - 18}" text-anchor="middle">até ${DIAS_CURTOS[diaSemana(renova)]} ${horaRedonda(renova)}</text>`
  }
  meias.forEach((t) => { s += `<line class="bs-grade" x1="${f1(X(t))}" y1="${T - 10}" x2="${f1(X(t))}" y2="${B}"/>` })
  s += `<line class="bs-grade" x1="${L}" y1="${f1(Y(50))}" x2="${R}" y2="${f1(Y(50))}"/><line class="bs-eixo" x1="${L}" y1="${B}" x2="${R}" y2="${B}"/>`
  s += `<line class="bs-cem" x1="${L}" y1="${f1(Y(100))}" x2="${R}" y2="${f1(Y(100))}"/>`
  s += `<text class="bs-t bs-t-bad" x="${L - 5}" y="${f1(Y(100) + 4)}" text-anchor="end" font-size="${fs - 1}">100%</text><text class="bs-t bs-t-faixa" x="${L - 5}" y="${f1(Y(50) + 4)}" text-anchor="end" font-size="${fs - 1}">50%</text><text class="bs-t bs-t-faixa" x="${L - 5}" y="${B + 4}" text-anchor="end" font-size="${fs - 1}">0%</text>`
  s += `<line class="bs-ideal" x1="${L}" y1="${B}" x2="${R}" y2="${f1(Y(100))}"/>`
  s += `<path class="bs-proj" d="M${f1(X(tAgora))} ${f1(Y(pAgora))} L${f1(X(fimProj[0]))} ${f1(Y(fimProj[1]))}"/>`
  s += `<path class="bs-usado" d="${caminho.map(([t, p], k) => `${k ? 'L' : 'M'}${f1(X(t))} ${f1(Y(p))}`).join(' ')}"/>`
  s += `<circle class="bs-pt-ok" cx="${f1(X(tAgora))}" cy="${f1(Y(pAgora))}" r="5.5"/>`
  s += `<text class="bs-t bs-t-forte" x="${f1(Math.min(X(tAgora) + 8, R - 70))}" y="${f1(Math.min(Y(pAgora) + 16, B - 4))}" font-size="${fs + 0.5}">agora: ${pAgora}%</text>`
  if (curto) s += `<circle class="bs-pt-warn" cx="${f1(xa)}" cy="${f1(Y(100))}" r="5.5"/>`
  s += `<text class="bs-t bs-t-ok" x="${R}" y="14" text-anchor="end" font-size="${fs + 0.5}">renova ${DIAS_CURTOS[diaSemana(renova)]} ${horaRedonda(renova)}</text>`
  if (curto) s += `<text class="bs-t bs-t-warn" x="${f1(Math.max(xa, L + 110))}" y="30" text-anchor="end" font-size="${fs + 0.5}">acaba ${DIAS_CURTOS[diaSemana(acaba)]} ~${horaRedonda(acaba)}</text>`
  rotulos.forEach((t, k) => { s += `<text class="bs-t bs-t-faixa" x="${f1(k === 0 ? L : X(t))}" y="${B + 18}" text-anchor="${k === 0 ? 'start' : 'middle'}" font-size="${fs - 1}">${DIAS_CURTOS[diaSemana(t)]}</text>` })
  s += '</svg>'
  return `<div class="bs-svg-w" data-grafico-semana>${s}<div class="bs-leg"><span><i class="bs-lg usado"></i>usado</span><span><i class="bs-lg proj"></i>se continuar neste ritmo</span><span><i class="bs-lg ideal"></i>ritmo que dura até a renovação</span></div></div>`
}

function cotaSemana(c, r, agora) {
  const inicio = ms(c.semana_inicio)
  const dias = !isNaN(inicio) ? (agora - inicio) / DIA_MS : NaN
  const ritmo = dias > 0.05 && typeof c.semana_pct === 'number' ? Math.round(c.semana_pct / dias) : null
  const max = c.max_pct_dia_para_durar
  const rapido = ritmo !== null && typeof max === 'number' && ritmo > max
  const fr = r && r.freios
  const manha = ((r && r.faixas) || []).find((f) => f.id === 'manha_mari')
  let j = ''
  if (typeof c.janela5h_pct === 'number') {
    const z = ms(c.janela5h_renova)
    const ticks = [fr && fr.manha_mari, fr && fr.geral].filter((x) => typeof x === 'number').map((p) => `<i class="bs-freio" data-left="${f1(num(p, 0, 100))}"></i>`).join('')
    const w = f1(num(c.janela5h_pct, 0, 100))
    j = `<div class="bs-j5" data-janela5h><div class="bs-j5-t"><b>Janela de 5 horas</b><span><b>${num(c.janela5h_pct)}%</b>${!isNaN(z) ? ` · zera às ${hhmm(z)}` : ''}</span></div>`
      + `<div class="bs-fio bs-fio-g"><i class="bs-j5-v" data-w="${w}"></i>${ticks}</div>`
      + (fr && (typeof fr.manha_mari === 'number' || typeof fr.geral === 'number')
        ? `<p class="nota">${typeof fr.manha_mari === 'number' ? `Na ${manha ? esc(`${minusc1(manha.nome)} (${manha.de} às ${manha.ate})`) : 'manhã da Mari'} os agentes param em ${num(fr.manha_mari)}% desta janela, para sobrar para o Luan. ` : ''}${typeof fr.geral === 'number' ? `No resto do dia, em ${num(fr.geral)}%. ` : ''}${typeof fr.bug_critico === 'number' ? `Bug crítico vai até ${num(fr.bug_critico)}%.` : ''}</p>` : '')
      + '</div>'
  }
  return secao('Cota da semana', 'A assinatura tem dois limites. O da <b>semana</b> é o que importa: se a linha laranja bate nos 100% antes da renovação, os agentes param até a cota voltar. O de <b>5 horas</b> só faz esperar umas horas.',
    graficoSemana(c, agora)
    + `<div class="bs-tres"><div class="bs-mini"><b>${c.semana_pct ?? '?'}%</b><span>usado${!isNaN(inicio) ? ` desde ${DIAS_CURTOS[diaSemana(inicio)]} ${horaRedonda(inicio)}` : ''}</span></div>`
    + `<div class="bs-mini ${rapido ? 'alerta' : ''}"><b>${ritmo ?? '?'}%</b><span>por dia, no ritmo de agora</span></div>`
    + `<div class="bs-mini"><b>${max ?? '?'}%</b><span>por dia, para durar até a renovação</span></div></div>` + j, '', 'semana')
}

// ---------- agents ----------
const ESTADO_AG = {
  trabalhando: ['trabalhando', 'info'], ocioso: ['livre', 'ok'], travado: ['travado', 'bad'], esperando_luan: ['esperando o Luan', 'warn'],
}
const PESSOAS = ['luan', 'mari']
function agentesAgora(ags, esperas, ps, agora) {
  const travados = ags.filter((a) => a.estado === 'travado')
  const porNome = new Map(ags.map((a) => [String(a.nome).toLowerCase(), a]))
  const descNo = (n) => {
    const k = String(n).toLowerCase()
    if (k === 'luan') return ps.length ? `${ps.length} ${ps.length === 1 ? 'resposta pendente' : 'respostas pendentes'}` : ''
    const a = porNome.get(k)
    return (a && a.fazendo) || (a ? (ESTADO_AG[a.estado] || [])[0] || a.estado || '' : '')
  }
  const cadeias = (esperas || []).filter(Array.isArray).map((cad) => `<ol class="bs-cad">${cad.map((n, j) => {
    const pessoa = PESSOAS.includes(String(n).toLowerCase())
    const cls = String(n).toLowerCase() === 'luan' ? 'luan' : pessoa ? 'pessoa' : 'ag'
    const desc = descNo(n)
    return `<li>${j > 0 ? '<span class="bs-seta" aria-hidden="true">↓ espera</span>' : ''}<div class="bs-no ${cls}"><b>${esc(pessoa ? n : nomeAgente(n))}</b>${desc ? `<span class="bs-cinza">${esc(desc)}</span>` : ''}</div></li>`
  }).join('')}</ol>`).join('')
  const linhas = ags.map((a) => {
    const [rot, cls] = ESTADO_AG[a.estado] || [a.estado || '?', 'neutro']
    const nome = nomeAgente(a.nome)
    const t = ms(a.desde)
    const ini = nome.replace(/^Agente (de |do |da )?/, '')
    const faz = a.fazendo ? (a.estado === 'trabalhando'
      ? giro(`${esc(a.fazendo)}${a.ajudantes ? `, com ${num(a.ajudantes)} ${a.ajudantes === 1 ? 'ajudante' : 'ajudantes'}` : ''}`)
      : `<span class="bs-faz ${cls}">${esc(a.fazendo)}</span>`) : ''
    return `<div class="bs-ag" data-agente="${esc(a.nome)}"><span class="bs-av ${cls}" aria-hidden="true">${esc(ini.charAt(0).toUpperCase() + ini.charAt(1))}</span><div class="bs-ag-c">`
      + `<div class="bs-ag-t"><b>${esc(nome)}</b><span class="bs-est">${ponto(cls)}${esc(rot)}${!isNaN(t) ? ` há ${duracao(agora - t)}` : ''}</span></div>`
      + `${a.papel ? `<div class="bs-cinza">${esc(a.papel)}</div>` : ''}${faz ? `<div class="bs-faz-l">${faz}</div>` : ''}</div></div>`
  }).join('')
  return secao('Agentes agora', 'Cada agente é uma sessão do Claude aberta no Mac do Luan, com um trabalho fixo.',
    (cadeias ? `<div class="bs-esperas" data-esperas><b>Quem espera quem</b><p class="nota">Cada um espera o próximo da corrente.</p>${cadeias}</div>` : '')
    + `<div class="bs-ags">${linhas}${ags.length ? '' : '<p class="nota">Nenhum agente aberto agora.</p>'}</div>`
    + (travados.length
      ? `<div class="bs-trav bad" data-travados><b>${travados.length === 1 ? '1 agente travado' : `${travados.length} agentes travados`}:</b> ${esc(travados.map((a) => `${nomeAgente(a.nome)}${a.fazendo ? ` (${a.fazendo})` : ''}`).join('; '))}</div>`
      : `<div class="bs-trav ok" data-travados>${ponto('ok')}Nenhum agente travado (erro ou 30 min sem resposta)</div>`), '', 'agentes')
}

// ---------- Mac queue ----------
const NOMES_RECURSOS = { pesado: 'Trabalho pesado', tela: 'Tela do Mac', vkey: 'Teclado físico', tv: 'TV da sala', 'tv-sala': 'TV da sala', rode: 'Lapelas RØDE', lapelas: 'Lapelas RØDE', flipper: 'Flipper', usb: 'Placas na USB' }
const estadoDe = (r) => r.estado || (r.livre === false ? 'ocupado' : 'livre')
function filaMac(fila) {
  const esperando = fila.reduce((s, r) => s + (Number(r.esperando) || 0), 0)
  const cards = fila.map((r) => {
    const e = estadoDe(r)
    const txt = e === 'desligado' ? 'desligada' : e === 'fora_do_usb' ? 'fora do USB' : e === 'livre' ? 'livre' : `com ${r.dono ? nomeAgente(r.dono) : '?'}${r.tarefa ? `: ${r.tarefa}` : ''}`
    return `<div class="bs-rec" data-recurso="${esc(r.recurso)}">${ponto(e === 'livre' ? 'ok' : e === 'ocupado' ? 'info' : 'off')}<b>${esc(r.rotulo || NOMES_RECURSOS[r.recurso] || r.recurso)}</b><span class="bs-cinza">${esc(txt)}</span>${r.esperando ? `<span class="bs-warn bs-fila-n">+${num(r.esperando)} na fila</span>` : ''}</div>`
  }).join('')
  return secao('Fila do Mac', 'Coisas do Mac que só um agente usa por vez, como transcrever áudio ou usar a tela. Quem chega depois espera a vez aqui.',
    (fila.length ? '' : '<p class="nota">Sem dados da fila.</p>') + `<div class="bs-recs">${cards}</div>`,
    chip(esperando ? 'warn' : 'ok', esperando ? `${esperando} esperando` : 'Vazia'), 'fila')
}

// ---------- footer ----------
function idadeDados(w) {
  const g = ms(w && w.dados && w.dados.gerado_em)
  const rec = ms(w && w.recebido_em)
  if (!isNaN(g) && (isNaN(rec) || g <= rec + 2 * 6e4)) return w.dados.gerado_em
  return (w && w.recebido_em) || null
}
function rodape(recebido, agora) {
  const t = ms(recebido)
  if (isNaN(t)) return ''
  const min = Math.max(0, Math.round((agora - t) / 6e4))
  const velho = min > VELHO_MIN
  const ha = min < 1 ? 'agora há pouco' : `há ${min < 120 ? min + ' min' : duracao(agora - t)}`
  const fim = min > DESLIGADO_MIN ? ' · o Mac do Luan pode estar desligado ou fora do ar' : ' · os dados vêm do Mac do Luan a cada rodada da fila (no máximo 15 min)'
  return `<p class="bs-rodape ${velho ? 'velho' : ''}" data-rodape="${velho ? 'velho' : 'ok'}"><span>${ponto(velho ? 'bad' : 'ok')}Atualizado ${ha} (${hhmm(t)})</span>${fim}</p>`
}

// ---------- the screen ----------
export function telaBastidores() {
  const w = S.bast
  const agora = Date.now()
  const intro = '<p class="bs-intro">Agentes, pedidos e cota do Luan, num olhar. Só vocês dois veem.</p>'
  if (w === null || w === undefined) return `<div class="bs">${intro}<p class="nota centro">Carregando os bastidores...</p></div>`
  const d = w.dados
  if (S.erroBast && !d) return `<div class="bs">${intro}<p class="bs-erro">Não deu para carregar os bastidores.</p></div>`
  if (!d) {
    return `<div class="bs">${intro}<section class="sec bs-sec bs-vazio" data-vazio><h2>Ainda não chegou nada do Mac</h2>`
      + '<p>Esta tela mostra o que o Mac do Luan manda por script a cada rodada da fila de ideias (no máximo 15 min): cota, agentes, fila e o que espera o Luan. Quando chegar o primeiro envio, tudo aparece aqui.</p></section></div>'
  }
  const ideias = S.ideias
  const carregando = ideias === null || ideias === undefined
  const erroIdeias = !!S.erroIdeias && carregando
  const lista = Array.isArray(ideias) ? ideias : []
  return `<div class="bs">${intro}<div class="bs-pilha">`
    + (d.cota ? topo(d.cota, agora) : '')
    + (d.cota ? pedidos(d, lista, agora, carregando && !erroIdeias, erroIdeias) : '')
    + esperandoLuan(d, lista, agora)
    + (d.cota ? cotaSemana(d.cota, d.regras, agora) : '')
    + agentesAgora(d.agentes || [], d.esperas || [], d.pendencias || [], agora)
    + filaMac(d.fila || [])
    + `</div>${rodape(idadeDados(w), agora)}</div>`
}

// ---------- warning shown before marking a critical bug (the host wraps it in its own sheet and adds the buttons) ----------
export function htmlAvisoBugCritico() {
  const w = S.bast
  const d = w && w.dados
  const c = d && d.cota
  const temPct = !!c && (typeof c.janela5h_pct === 'number' || typeof c.semana_pct === 'number')
  const r5 = ms(c && c.janela5h_renova)
  const rs = ms(c && c.semana_renova)
  const t = ms(w && w.recebido_em)
  const velho = !isNaN(t) && Date.now() - t > VELHO_MIN * 6e4
  const frBug = d && d.regras && d.regras.freios && d.regras.freios.bug_critico
  let h = '<span class="chip bad">Bug crítico</span><h2 class="bs-av-t">Você está decidindo gastar mais cota do que o razoável hoje</h2>'
    + `<p class="bs-av-p">Bug crítico passa na frente de tudo e o agente pega a qualquer hora, mesmo com a cota apertada (só para quando a janela de 5 horas${typeof frBug === 'number' ? ` chega a ${num(frBug)}%` : ' está quase no fim'}).</p>`
  if (w === null || w === undefined) h += '<p class="nota">Vendo a cota de agora...</p>'
  else if (temPct) {
    h += `<div class="bs-tres bs-dois" data-pct-cota><div class="bs-mini"><div class="bs-rot">5 horas</div><b>${c.janela5h_pct ?? '?'}%</b>${!isNaN(r5) ? `<span>zera às ${hhmm(r5)}</span>` : ''}</div>`
      + `<div class="bs-mini"><div class="bs-rot">Semana</div><b>${c.semana_pct ?? '?'}%</b>${!isNaN(rs) ? `<span>renova ${esc(quando(rs, Date.now()))}</span>` : ''}</div></div>`
    if (c.modo_nome) h += `<p class="nota">Modo agora: <b>${esc(c.modo_nome)}</b>.${velho ? ' (Dados do Mac atrasados: podem ter mudado.)' : ''}</p>`
  } else h += '<p class="bs-aviso-sem" data-sem-pct>Não deu para ver a cota agora (o Mac ainda não mandou os dados). Use Bug crítico só para o que está quebrado e não pode esperar.</p>'
  return h
}
