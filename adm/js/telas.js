import { S } from './estado.js?v=3b99968d59'
import { ic, TELAS } from './icones.js?v=3b99968d59'
import { telaIdeias } from './ideias.js?v=3b99968d59'
import { brl, sbrl, dbrl, dm, dmy, nomeMes, mesAno, cap, proxMes, antMes, esc, pct, NOME, soma, horaTxt } from './util.js?v=3b99968d59'

const COR = { luan: 'var(--luan)', mari: 'var(--mari)', duo: 'var(--duo)', impostos: 'var(--imp)', a_decidir: 'var(--muted)' }
export const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`
const sec = (titulo, corpo, acao) => `<section class="sec"><div class="sec-cab"><h2>${titulo}</h2>${acao || ''}</div>${corpo}</section>`
const linha = (a, b, cls) => `<div class="linha ${cls || ''}"><span>${a}</span><span class="r">${b}</span></div>`
const irBtn = (t, txt) => `<button class="acao" data-acao="ir" data-t="${t}">${txt}</button>`
const origemIc = (o) => ic(o === 'whatsapp' ? 'zap' : o === 'extrato' ? 'extrato' : o === 'planilha' ? 'planilha' : o === 'robo' || o === 'calculado' ? 'robo' : 'site')
const origemTxt = (o) => ({ whatsapp: 'pelo WhatsApp', extrato: 'do extrato', planilha: 'da planilha', robo: 'robô', calculado: 'calculado', manual: 'manual', site: 'pelo site' }[o] || esc(o || ''))
const pessoaNome = (q) => NOME[q] || (q === 'robo' ? 'Robô' : esc(q || ''))
const barra = (itens) => `<div class="pilha" aria-hidden="true">${itens.map(([w, bg]) => `<span data-w="${w.toFixed(1)}" data-bg="${bg}"></span>`).join('')}</div>`
const ctaLanc = '<button class="fab" data-acao="lancar" aria-label="Lançar">' + ic('mais') + '<span>Lançar</span></button>'

export function derivar(r) {
  const d = r.donos, ks = ['luan', 'mari', 'duo']
  const reservado = soma(ks, (k) => d[k].guardado)
  return { total: r.total, reservado, verdade: r.total - reservado, falta: soma(r.reservas || [], (x) => x.falta), v0: (r.reservas || [])[0] }
}
// por_socio vem como número (contrato) ou como objeto do motor ({bruto, ...}); aceita os dois
const valSocio = (x) => (x && typeof x === 'object' ? x.bruto ?? x.brutoComPiso ?? 0 : x || 0)
const mesAberto = () => S.resumo.mes_aberto
const mesAnterior = () => antMes(mesAberto())

export function cab() {
  const r = S.resumo
  return `<header class="cab"><a class="logo-link" href="/" aria-label="Página inicial do Duo LuMa"><span class="logo"></span></a><div class="cab-tit">Duo LuMa<small>Financeiro${r ? ' · ' + mesAno(r.mes_aberto) : ''}</small></div><span class="vivo"><i></i>atualizado ${S.atualizadoEm || ''}</span><button class="sair" data-acao="acesso" aria-label="Acesso: Face ID cadastrados e sair">Acesso</button></header>`
}
export function nav() {
  return `<nav class="nav" aria-label="Seções">${TELAS.map((t) => `<button class="nav-i ${S.tela === t.id ? 'ativo' : ''}" data-acao="ir" data-t="${t.id}">${ic(t.id)}<span>${t.nome}</span></button>`).join('')}</nav>`
}

/* ===== peças do início ===== */
function mrz(p, bate) {
  const n = (c) => String(Math.round(Math.abs(c))).padStart(8, '0')
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const l1 = ('P<BRADUO<LUMA<<FINANCEIRO<' + meses[+mesAberto().slice(5, 7) - 1] + mesAberto().slice(0, 4)).padEnd(44, '<').slice(0, 44)
  const l2 = (n(p.total) + 'BRL' + n(p.reservado) + 'RES' + n(p.verdade) + 'VER<' + (bate ? 'OK' : 'XX')).padEnd(44, '<').slice(0, 44)
  return esc(l1) + '\n' + esc(l2)
}
function heroA(r, p) {
  const v = p.v0
  return `<section class="passa"><div class="passa-fundo"></div>
    <div class="passa-topo"><span>Folha de saldo</span><span>${dmy(r.data)} · ${S.atualizadoEm || ''}</span></div>
    <div class="passa-corpo"><div class="passa-foto"><span class="logo"></span></div>
      <dl class="passa-campos">
        <div class="dv"><dt>Dinheiro de verdade</dt><dd>${brl(p.verdade)}</dd></div>
        <div><dt>Temos</dt><dd>${brl(p.total)}</dd></div>
        <div><dt>Reservado p/ impostos</dt><dd>${brl(p.reservado)}</dd></div>
        <div><dt>Próximo vencimento</dt><dd>${v ? dm(v.vence) + ' · ' + brl(v.valor) : 'nenhum'}</dd></div>
        <div><dt>Falta guardar</dt><dd>${brl(p.falta)}</dd></div>
      </dl></div>
    <div class="mrz" aria-hidden="true">${mrz(p, r.bate)}</div>
    ${r.bate ? `<span class="carimbo">Confere<small>${dm(r.data)} · ${S.atualizadoEm || ''}</small></span>` : ''}
  </section>`
}
function secDeQuem(r, p) {
  const d = r.donos
  const comp = (k) => d[k].comprometido || 0
  const sub = (k) => (d[k].pode_tirar_hoje > 0 ? 'pode tirar hoje ' + brl(d[k].pode_tirar_hoje) : 'nada a retirar hoje') + (comp(k) ? ' · comprometido (pró-labore planejado) ' + brl(comp(k)) : '')
  const t = (k, valor, s) => `<button class="pessoa" data-cor="${COR[k]}" data-acao="ir" data-t="${k === 'impostos' ? 'impostos' : 'quem'}"><span class="quem"><i></i>${NOME[k]}</span><span class="v">${brl(valor)}</span><small>${s}</small></button>`
  const tot = r.total || 1
  const partes = [['luan', d.luan.disponivel + comp('luan')], ['mari', d.mari.disponivel + comp('mari')], ['duo', d.duo.disponivel + comp('duo')], ['impostos', p.reservado], ['a_decidir', d.a_decidir ? d.a_decidir.saldo : 0]]
  const aDec = d.a_decidir && d.a_decidir.saldo ? `<p class="nota">${brl(d.a_decidir.saldo)} ainda sem dono (a decidir).</p>` : ''
  return sec('De quem é', `<div class="pessoas">${t('luan', d.luan.disponivel, sub('luan'))}${t('mari', d.mari.disponivel, sub('mari'))}${t('duo', d.duo.disponivel, 'livre para o Duo')}${t('impostos', p.reservado, p.v0 ? 'próximo: ' + dm(p.v0.vence) : 'nada a pagar')}</div>
    ${barra(partes.map(([k, v]) => [100 * v / tot, COR[k]]))}${aDec}
    <p class="nota">Soma das partes: ${brl(r.soma_donos)} · nas contas: ${brl(r.total)} ${r.bate ? chip('ok', 'bate') : chip('bad', 'não bate')}</p>`, irBtn('onde', 'Onde está'))
}
export function blocoDecisao(d) {
  const meu = d.votos ? d.votos[S.eu] : null
  const rot = (v) => { const o = (d.opcoes || []).find((x) => x.v === v); return o ? o.rotulo : v }
  const podeVotar = d.precisa !== 'luan' || S.eu === 'luan'
  let corpo
  if (meu) corpo = `<span class="nota">Seu voto: ${esc(rot(meu))}.${d.precisa === 'os_dois' ? ' Falta ' + NOME[S.eu === 'luan' ? 'mari' : 'luan'] + '.' : ''}</span>`
  else if (!podeVotar) corpo = `<span class="nota">${ic('cadeado')} Regra de dinheiro: só o Luan decide.</span>`
  else corpo = `<div class="btns">${(d.opcoes || []).map((o, i) => `<button class="btn mini ${i === 0 ? 'pri' : ''}" data-acao="votar" data-id="${esc(d.id)}" data-v="${esc(o.v)}">${esc(o.rotulo)}</button>`).join('')}</div>`
  const regra = d.precisa === 'os_dois' ? 'Precisa dos dois.' : d.precisa === 'luan' ? 'Só o Luan decide.' : 'Um dos dois decide.'
  const titulo = d.assunto === 'divisao_nota' ? 'Divisão da nota ' + esc(String(d.ref_id || '').replace(/^nf-/i, '')) : esc(d.assunto)
  return `<div class="dec"><b>${titulo}</b><p class="nota">${esc(d.pergunta || (d.assunto === 'divisao_nota' ? 'Dividir em 3 ou deixar tudo no caixa do Duo?' : ''))} ${regra}</p><div class="votos"><span>Luan: ${d.votos && d.votos.luan ? esc(rot(d.votos.luan)) : 'ainda não votou'}</span><span>Mari: ${d.votos && d.votos.mari ? esc(rot(d.votos.mari)) : 'ainda não votou'}</span></div>${corpo}</div>`
}
function secDecisoes() {
  const out = S.decisoes.map(blocoDecisao)
  for (const l of S.lancMes.filter((x) => x.a_conferir))
    out.push(`<div class="dec"><b>Confirmar valor lido do comprovante: ${esc(l.descricao)} (${brl(l.valor)})</b><p class="nota">Veio com comprovante. Já conta no saldo, marcado a conferir, até um de vocês confirmar.</p><div class="btns"><button class="btn mini pri" data-acao="conferir" data-id="${esc(l.id)}">Confere</button></div></div>`)
  return out.length ? sec('Para decidir', out.join(''), `<span class="nota">${out.length} ${out.length > 1 ? 'pendências' : 'pendência'}</span>`) : ''
}
const VERBO = { criar: 'lançou', editar: 'editou', apagar: 'apagou', anexar: 'anexou arquivo em', conferir: 'conferiu', importar: 'importou', gravar: 'atualizou', votar: 'votou em', retirar: 'registrou', transferir: 'registrou' }
const OBJ = { nota: 'a nota', lancamento: 'o lançamento', anexo: 'um anexo', lote: 'um lote de lançamentos', certidao: 'a certidão', decisao: 'a decisão', retirada: 'a retirada', transferencia: 'a transferência', conta: 'a conta' }
function secAtualizacoes() {
  const hoje = S.resumo.data
  const it = S.eventos.slice(0, 6).map((e, i) => {
    const em = String(e.em || ''), hora = em.startsWith(hoje) ? em.slice(11, 16) : dm(em)
    return `<div class="ev ${i === 0 && S.feedNovo ? 'novo' : ''}"><span class="o">${origemIc(e.origem)}</span><span class="t"><b>${pessoaNome(e.quem)}</b> ${VERBO[e.acao] || esc(e.acao)} ${OBJ[e.ref_tipo] || esc(e.ref_tipo || '')}${e.ref_id ? ' ' + esc(e.ref_id) : ''}</span><span class="h">${esc(hora)}</span></div>`
  }).join('')
  return sec('O que mudou', `<div class="feed">${it || '<p class="nota">Nada novo ainda.</p>'}</div><p class="nota">A tela recarrega depois de cada lançamento seu e quando você volta para ela. Mudança feita pelo WhatsApp ou pelo extrato aparece na próxima vez.</p>`)
}
function proximasEntradas(r) {
  return (r.a_receber || []).map((x) => ({ data: x.previsao || null, desc: 'NF ' + (x.numero || 'a emitir') + ' · ' + x.tomador, valor: x.valor, status: 'nota emitida · a receber', cls: 'ok', x })).sort((a, b) => (a.data ? 0 : 1) - (b.data ? 0 : 1) || String(a.data).localeCompare(String(b.data)))
}
const diaOuNada = (d) => (d ? dm(d) : 'sem data')
function proximasSaidas(r) {
  const out = (r.reservas || []).map((v) => ({ data: v.vence, desc: 'Impostos de ' + nomeMes(v.competencia), valor: v.valor, status: v.falta ? 'falta guardar ' + brl(v.falta) : 'guardado', cls: v.falta ? 'warn' : 'ok' }))
  for (const p of r.pendentes_retirada || []) out.push({ data: r.data, desc: `Retirada · ${NOME[p.socio]} · ${p.tipo === 'lucro' ? 'lucro' : 'pró-labore'} de ${nomeMes(p.competencia)}`, valor: p.valor, status: 'quando quiser', cls: 'neutro' })
  return out.sort((a, b) => String(a.data).localeCompare(String(b.data)))
}
function telaInicio(r, p) {
  const e = proximasEntradas(r).slice(0, 3).map((x) => linha(`${diaOuNada(x.data)} · ${esc(x.desc)}`, brl(x.valor))).join('')
  return heroA(r, p) + secDeQuem(r, p) + secDecisoes() + sec('Próximas entradas', `<div class="linhas">${e || '<p class="nota">Nenhuma nota a receber.</p>'}</div>`, irBtn('proximas', 'Ver todas')) + secAtualizacoes()
}

/* ===== Onde está ===== */
const SUBCONTA = { banco: 'conta da empresa', caixinha: 'caixinha', especie: 'dinheiro vivo, fora da empresa', outro: '' }
// o dono vem sempre de contas[].dono (luan | mari | duo | impostos | null), nunca do id da conta
const donoDaConta = (c) => c.dono || null
function telaOnde(r) {
  const contas = r.contas, nomeDe = (id) => (contas.find((c) => c.id === id) || { nome: id }).nome
  const row = (c, filho) => `<div class="conta ${filho ? 'filho' : ''}"><b>${esc(c.nome)}</b><small>${c.tipo === 'banco' && !c.contabil ? 'conta pessoal' : SUBCONTA[c.tipo] ?? ''}${donoDaConta(c) && donoDaConta(c) !== 'impostos' ? ' · ' + 'de: ' + NOME[donoDaConta(c)] : ''}</small><span class="r">${brl(c.saldo)}</span></div>`
  const mostra = (c) => c.saldo !== 0 || (c.contabil === 1 && c.tipo === 'caixinha' && !!c.dono)
  const topo = contas.filter((c) => !c.pai && (mostra(c) || contas.some((x) => x.pai === c.id && mostra(x))))
  const corpo = topo.map((c) => {
    const fil = contas.filter((x) => x.pai === c.id && mostra(x))
    if (!fil.length) return row(c)
    return `<div class="conta"><b>${esc(c.nome)} e caixinhas</b><small>${c.tipo === 'banco' && !c.contabil ? 'conta pessoal' : SUBCONTA[c.tipo] || 'conta'} e caixinhas</small><span class="r">${brl(c.saldo + soma(fil, (x) => x.saldo))}</span></div>` + row(c, 1) + fil.map((x) => row(x, 1)).join('')
  }).join('')
  const bar = barra(contas.filter((c) => c.saldo > 0).map((c) => [100 * c.saldo / (r.total || 1), donoDaConta(c) ? COR[donoDaConta(c)] : 'var(--muted)']))
  const arr = r.arrumar || []
  const falta = Number(r.arrumar_falta) || 0
  // the API only suggests what the main account holds; the rest has to come in as a partner's contribution
  const aviso = falta > 0 ? `<p>${chip('warn', 'falta dinheiro')} ${arr.length ? 'Mesmo depois disso, faltam' : 'Faltam'} <b class="num">${brl(falta)}</b> na conta para completar as caixinhas. Esse dinheiro precisa entrar na empresa como aporte de um sócio (veja quem está com disponível negativo em "De quem é").</p>` : ''
  const mov = arr.length ? `<div class="linhas">${arr.map((m) => `<div class="mov">${ic('setas')}<span>Mover <b class="num">${brl(m.valor)}</b> de ${esc(nomeDe(m.de))} para ${esc(nomeDe(m.para))}</span></div>`).join('')}</div>${aviso}
      <div class="btns"><button class="btn pri" data-acao="arrumar">Fiz as transferências no banco</button></div><p class="nota">O sistema não mexe no banco: ele diz o que mover, vocês fazem no app do banco e confirmam aqui.</p>`
    : aviso || `<p>${chip('ok', 'tudo no lugar')} Cada caixinha tem exatamente o que é do dono dela.</p>`
  return sec('Onde está o dinheiro', `${bar}<div class="linhas">${corpo}</div>${linha('Total', brl(r.total), 'tot')}`, irBtn('quem', 'De quem é'))
    + sec('Arrumar as caixinhas', mov)
    + sec('Bate?', `<div class="linhas">${linha('Onde está (contas)', brl(r.total))}${linha('De quem é (Luan + Mari + Caixa + Impostos + a decidir)', brl(r.soma_donos))}${linha('Diferença', brl(r.total - r.soma_donos), 'tot')}</div>${r.bate ? chip('ok', 'bate') : chip('bad', 'não bate')}`)
}

/* ===== De quem é ===== */
function blocoMes(c, m, p, aberto) {
  const s = m.por_socio ? m.por_socio[p] : null
  if (!s) return ''
  const falta = (liq, ret) => liq - (ret || 0)
  const ret = (v, ja, fechado) => (!v ? '' : v - (ja || 0) <= 0 ? chip('ok', 'Pix feito') : fechado ? chip('warn', 'falta ' + brl(v - (ja || 0))) : '')
  return `<div class="linhas">
    ${linha('Parte das notas recebidas', brl(s.partes))}
    ${m.rateio && m.rateio[p] ? linha('Despesas comuns (sua parte)', '− ' + brl(m.rateio[p]), 'sub') : ''}
    ${linha('Pró-labore bruto', brl(s.prolabore_bruto))}
    ${s.prolabore_bruto ? linha('INSS 11% (vai para Impostos)', '− ' + brl(s.inss), 'sub') + linha('IR', 'isento', 'sub') + linha('Pró-labore líquido ' + (aberto ? chip('neutro', 'sai no fechamento') : ret(s.prolabore_liquido, s.retirado_prolabore, true)), brl(s.prolabore_liquido), 'sub') : ''}
    ${linha('Lucro ' + ret(s.lucro > 0 ? s.lucro : 0, s.retirado_lucro, !aberto), sbrl(s.lucro))}
  </div>${s.lucro < 0 ? '<p class="nota">Lucro negativo: o pró-labore exigido pelas notas sai da sua parte acumulada, não do caixa do Duo.</p>' : ''}`
}
function cartaoPessoa(r, p) {
  const d = r.donos[p]
  const cs = Object.keys(r.meses || {}).sort().reverse().filter((c) => { const s = r.meses[c].por_socio && r.meses[c].por_socio[p]; return s && (s.partes || s.prolabore_bruto || s.retirado_prolabore || s.retirado_lucro) })
  const res = (r.reservas || []).map((v) => { const its = (v.itens || []).filter((i) => i.dono === p); if (!its.length) return ''; const das = soma(its.filter((i) => i.tipo === 'das'), (i) => i.valor), inss = soma(its.filter((i) => i.tipo === 'inss'), (i) => i.valor), irrf = soma(its.filter((i) => i.tipo === 'irrf'), (i) => i.valor)
    return linha(`${dm(v.vence)} · ${[das ? 'DAS ' + brl(das) : '', inss ? 'INSS ' + brl(inss) : '', irrf ? 'IRRF ' + brl(irrf) : ''].filter(Boolean).join(' + ')}`, brl(soma(its, (i) => i.valor)) + ' ' + (v.falta ? chip('warn', 'a guardar') : chip('ok', 'guardado'))) }).join('')
  const prev = (r.a_receber || []).filter((x) => x.partes && x.partes[p]).map((x) => `<p class="nota">A receber: NF ${esc(x.numero || x.nota_id)} traz + ${brl(x.partes[p])} para ${NOME[p]}.</p>`).join('')
  return `<section class="sec"><div class="sec-cab"><h2>${NOME[p]}</h2><span class="num tit-num">${brl(d.disponivel)}</span></div>
    <p class="nota">Dinheiro de verdade (já sem as reservas e o pró-labore planejado). Pode tirar hoje: <b>${brl(d.pode_tirar_hoje)}</b>.</p>
    <div class="linhas">${linha('Saldo', brl(d.saldo))}${linha('Guardado para impostos', brl(d.guardado))}${linha('Comprometido (pró-labore planejado)', brl(d.comprometido || 0))}</div>
    ${cs.map((c) => `<b class="sub-tit">${cap(nomeMes(c))} · ${c < r.mes_aberto ? 'fechado' : 'até hoje'}</b>${blocoMes(c, r.meses[c], p, c >= r.mes_aberto)}`).join('')}
    ${prev}${res ? `<b class="sub-tit">Reservado para impostos</b><div class="linhas">${res}</div>` : ''}
    <div class="btns"><button class="btn pri" data-acao="retirar" data-p="${p}">Retirar (2 Pix)</button></div></section>`
}
function regraNota(n) {
  if (n.tipo === 'socio' || n.trouxe) return 'trabalho ' + (n.trouxe === 'luan' ? 'do Luan: é dele' : 'da Mari: é dela')
  if (n.divisao === 'tudo_caixa') return 'nota do Duo: tudo no caixa (decisão dos dois)'
  return 'nota do Duo: 1/3 Luan, 1/3 Mari, 1/3 caixa'
}
function telaQuem(r) {
  const duo = r.donos.duo, cxDuo = soma(r.contas.filter((c) => c.dono === 'duo' && c.tipo !== 'especie'), (c) => c.saldo), espDuo = soma(r.contas.filter((c) => c.dono === 'duo' && c.tipo === 'especie'), (c) => c.saldo)
  const duoMes = Object.keys(r.meses || {}).sort().reverse().map((c) => { const m = r.meses[c], dd = m.duo; if (!dd || !(dd.partes || dd.informal || dd.gastos)) return ''
    return linha(`${cap(nomeMes(c))}: parte das notas ${brl(dd.partes)}, aulas e chapéu ${brl(dd.informal)}${dd.gastos ? ', gastos − ' + brl(dd.gastos) : ''}`, sbrl(dd.partes + dd.informal - Math.abs(dd.gastos || 0))) }).join('')
  const aRec = new Set((r.a_receber || []).map((x) => x.nota_id))
  const notas = S.notas.filter((n) => n.status !== 'cancelada' && n.status !== 'substituida').map((n) => {
    const imp = n.imposto_valor || 0, liq = n.valor - imp
    const cor = n.trouxe ? COR[n.trouxe] : 'var(--duo)'
    return `<div class="bloco-linha"><div class="linha"><span><b>NF ${esc(n.numero || '(a emitir)')}</b> · ${esc(n.tomador)}</span><span class="r">${brl(n.valor)}</span></div>
      ${barra([[100 * imp / n.valor, 'var(--imp)'], [100 * liq / n.valor, cor]])}
      <span class="nota">${regraNota(n)} · imposto ${brl(imp)} sai antes${!n.recebida_em || aRec.has(n.id) ? ' · ' + chip('info', 'a receber') : ''}${S.decisoes.some((d) => d.ref_tipo === 'nota' && d.ref_id === n.id) ? ' · ' + chip('warn', 'proposta: tudo no caixa') : ''}</span></div>`
  }).join('')
  return cartaoPessoa(r, 'luan') + cartaoPessoa(r, 'mari')
    + `<section class="sec"><div class="sec-cab"><h2>Caixa do Duo</h2><span class="num tit-num">${brl(duo.disponivel)}</span></div><p class="nota">Nas caixinhas ${brl(cxDuo)} · dinheiro vivo ${brl(espDuo)}. O imposto das notas do Duo sai antes da divisão e o caixa não paga despesa comum.</p><div class="linhas">${duoMes}</div></section>`
    + sec('Divisão por nota', `<div class="legenda"><span><i class="lg-imp"></i>imposto</span><span><i class="lg-luan"></i>Luan</span><span><i class="lg-mari"></i>Mari</span><span><i class="lg-duo"></i>Caixa</span></div>${notas || '<p class="nota">Nenhuma nota neste período.</p>'}`)
}

/* ===== Impostos ===== */
function telaImpostos(r) {
  const blocos = (r.reservas || []).map((v) => {
    const its = v.itens || [], das = its.filter((i) => i.tipo === 'das'), inss = its.filter((i) => i.tipo === 'inss'), irrf = its.filter((i) => i.tipo === 'irrf')
    const guia = das.length && das.every((i) => i.origem === 'guia')
    const dono = (i) => (i.dono === 'duo' ? 'Duo (antes da divisão)' : NOME[i.dono])
    return `<div class="bloco-linha"><div class="linha"><span><b>Dia ${dm(v.vence)}</b> · impostos de ${nomeMes(v.competencia)}</span><span class="r">${brl(v.valor)}</span></div>
      ${v.falta ? chip('warn', 'falta guardar ' + brl(v.falta)) : chip('ok', 'guardado na caixinha Impostos')}
      <div class="linhas">${das.length ? linha('DAS ' + (guia ? '(guia do contador)' : '(estimado)'), brl(soma(das, (i) => i.valor))) : ''}${das.map((i) => linha(`${i.nota_id ? 'NF ' + esc(String(i.nota_id).replace(/^nf-/i, '')) + ' · ' : ''}${dono(i)}${i.anexo ? ` · ${guia ? 'Anexo ' + esc(i.anexo) : `Anexo ${esc(i.anexo)}, ${pct(i.aliquota, 1)}`}` : ''}`, brl(i.valor), 'sub')).join('')}
      ${inss.length ? linha('INSS do pró-labore', brl(soma(inss, (i) => i.valor))) + inss.map((i) => linha(NOME[i.dono], brl(i.valor), 'sub')).join('') : ''}
      ${irrf.length ? linha('IRRF', brl(soma(irrf, (i) => i.valor))) : ''}</div></div>`
  }).join('')
  const prev = (r.previsoes || []).map((x) => `<div class="bloco-linha"><div class="linha"><span><b>Dia ${dm(x.vence)}</b> · ${x.tipo === 'inss' ? 'INSS' : 'IRRF'} do pró-labore de ${nomeMes(x.competencia)}</span><span class="r">${brl(x.valor)}</span></div>
      ${chip('info', 'previsão')}<div class="linhas">${linha(NOME[x.dono] + (x.tipo === 'inss' ? ' · 11% de ' + brl(x.base) + ' (pró-labore planejado)' : ''), brl(x.valor), 'sub')}</div></div>`).join('')
  const futuros = (r.a_receber || []).filter((x) => x.imposto).map((x) => `<p class="nota">Quando a NF ${esc(x.numero || x.nota_id)} for paga: + ${brl(x.imposto)} de imposto para guardar.</p>`).join('')
  const rs = r.reservas || []
  const porPessoa = `<div class="tabela-wrap"><table class="t"><thead><tr><th>Quem</th>${rs.map((v) => `<th>${dm(v.vence)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${['luan', 'mari', 'duo'].map((p) => `<tr><td>${p === 'duo' ? 'Duo' : NOME[p]}</td>${rs.map((v) => `<td class="n">${brl(soma((v.itens || []).filter((i) => i.dono === p), (i) => i.valor))}</td>`).join('')}<td class="n">${brl(soma(rs, (v) => soma((v.itens || []).filter((i) => i.dono === p), (i) => i.valor)))}</td></tr>`).join('')}</tbody></table></div>`
  const f = r.fator_r || {}, larg = Math.min(100, (f.razao || 0) / 0.4 * 100)
  const por = f.por_socio || {}
  const avisos = (f.avisos || []).map((a) => `<p class="nota">${ic('alerta')} ${esc(a)}</p>`).join('')
  const ano = r.mes_aberto.slice(0, 4), cs = Object.keys(r.meses || {}).filter((c) => c.startsWith(ano))
  const li = r.lucro_isento
  return sec('Reservas para os próximos dias 20', blocos + futuros || '<p class="nota">Nada a reservar.</p>')
    + (prev ? sec('Previsão (pró-labore ainda não pago)', prev + '<p class="nota">Ainda não é reserva: vira imposto a guardar quando o pró-labore for pago. O valor pode mudar se o pró-labore mudar.</p>') : '')
    + sec('Por pessoa', porPessoa + '<p class="nota">Cada um guarda o imposto das notas que trouxe e o INSS do próprio pró-labore. O DAS da nota do Duo sai antes da divisão.</p>')
    + (f.limite !== undefined ? sec('Fator R', `<div class="medidor"><div class="linha"><span>Pró-labore ÷ receita, últimos 12 meses</span><span class="r tit-num">${f.razao === null || f.razao === undefined ? '—' : pct(f.razao)}</span></div>
        <div class="barra"><span data-w="${larg.toFixed(1)}"></span><em data-left="${((f.limite || 0.28) / 0.4 * 100).toFixed(1)}"></em></div><div class="esc"><span>0%</span><span>${pct(f.limite || 0.28, 0)} (limite)</span><span>40%</span></div></div>
        <div class="linhas">${linha('Pró-labore (folha dos 12 meses)', brl(f.folha12))}${linha('Receita no mesmo período (todas as notas, inclusive do Duo)', brl(f.rbt12))}${linha('Pró-labore mínimo de ' + nomeMes(f.pa || r.mes_aberto) + ' (até agora)', brl(f.prolabore_minimo))}${por.luan !== undefined ? linha('Luan', brl(valSocio(por.luan)), 'sub') + linha('Mari', brl(valSocio(por.mari)), 'sub') : ''}</div>${avisos}
        <p class="nota">Sai da parte de lucro de cada sócio, na proporção das notas, sem mexer no caixa do Duo. Abaixo do limite, o imposto das notas de desenvolvimento sobe bastante.</p>
        <p class="nota">O sistema paga sempre o mínimo exato. Querem uma folga? Isso é regra de dinheiro: só com o OK do Luan.</p>`) : '')
    + sec('Quanto já foi de imposto em ' + ano, `<div class="grade"><div class="tile"><span>Imposto dos meses</span><b>${brl(soma(cs, (c) => r.meses[c].imposto))}</b></div><div class="tile"><span>INSS pago</span><b>${brl(soma(['luan', 'mari'], (k) => r.donos[k].inss_pago_ano))}</b></div></div><p class="nota">Soma dos meses do ano. A escrituração completa está com o contador.</p>`)
    + (li ? sec('Lucro isento em ' + li.ano, `<div class="grade g3"><div class="tile"><span>Lucro contábil</span><b>${brl(li.lucro_contabil)}</b></div><div class="tile"><span>Já distribuído</span><b>${brl(li.distribuido)}</b></div><div class="tile"><span>Ainda cabe</span><b>${brl(li.cabe)}</b></div></div><p class="nota">${li.balancete_ok ? chip('ok', 'balancete conferido') : chip('warn', 'balancete a conferir')} A distribuição isenta não passa do lucro contábil do ano.</p>`) : '')
}

/* ===== Próximas ===== */
function telaProximas(r) {
  const e = proximasEntradas(r).map((x) => { const a = x.x
    const div = `imposto ${brl(a.imposto)} · ` + ['luan', 'mari', 'duo'].filter((k) => a.partes && a.partes[k]).map((k) => NOME[k] + ' ' + brl(a.partes[k])).join(' · ')
    return `<div class="item-prox"><div class="linha"><span><b>${diaOuNada(x.data)}</b> · ${esc(x.desc)}</span><span class="r">${brl(x.valor)}</span></div><span class="nota">${chip(x.cls, x.status)} ${div}</span></div>` }).join('')
  const s = proximasSaidas(r).map((x) => linha(`<b>${dm(x.data)}</b> · ${esc(x.desc)} ${chip(x.cls, x.status)}`, brl(x.valor))).join('')
  return sec('Entradas previstas', (e || '<p class="nota">Nenhuma nota a receber.</p>') + '<p class="nota">A divisão prevista segue as regras de hoje; vale a do dia em que o dinheiro cair.</p>') + sec('Saídas previstas', `<div class="linhas">${s || '<p class="nota">Nada previsto.</p>'}</div>`)
}

/* ===== Livro ===== */
export const TIPO_LANC = { receita_nota: 'nota', receita_informal: 'sem nota', rendimento: 'rendimento', aporte: 'aporte', despesa_comum: 'despesa comum', despesa_duo: 'gasto do Duo', despesa_socio: 'pago por sócio', das: 'DAS', inss: 'INSS', irrf: 'IRRF', taxa: 'taxa', retirada_prolabore: 'pró-labore', retirada_lucro: 'lucro', reembolso: 'reembolso', transferencia: 'transferência', ajuste: 'ajuste' }
export function linhasLivro() {
  const ls = (S.livro && S.livro.itens) || [], f = S.filtro
  const pares = {}
  for (const l of ls) if (l.par) (pares[l.par] = pares[l.par] || []).push(l)
  const mostrados = ls.filter((l) => !(l.par && pares[l.par].length > 1 && l.valor > 0))
  return mostrados.filter((l) => l.tipo !== 'saldo_inicial').filter((l) => f.tipo === 'tudo' || (f.tipo === 'contabil' ? l.contabil : !l.contabil)).sort((a, b) => b.data.localeCompare(a.data) || String(b.id).localeCompare(String(a.id))).map((l) => {
    if (l.par && pares[l.par].length > 1) { const para = pares[l.par].find((x) => x !== l); return { ...l, _para: para ? para.conta : null } }
    return l
  })
}
function telaLivro(r) {
  const f = S.filtro, nomeConta = (id) => (r.contas.find((c) => c.id === id) || { nome: id }).nome
  const fb = (k, v, t) => `<button data-acao="filtro" data-k="${k}" data-v="${v}" aria-pressed="${f[k] === v}">${t}</button>`
  const ls = linhasLivro()
  const desc = (l) => (l._para ? `${esc(nomeConta(l.conta))} → ${esc(nomeConta(l._para))}` : esc(l.descricao))
  const valor = (l) => (l._para ? brl(l.valor) : dbrl(l.valor))
  const cls = (l) => (l._para ? 'transf' : l.valor > 0 ? 'entra' : 'sai')
  const selos = (l) => (l.a_conferir ? chip('warn', 'a conferir') : '') + (l.provisorio ? chip('neutro', 'provisório') : '')
  const lista = ls.map((l) => `<div class="lv ${cls(l)} ${S.destaque === l.id ? 'novo' : ''}"><span class="d">${dm(l.data)}</span><span class="t">${desc(l)}</span><span class="v">${valor(l)}</span><span class="m">${chip(l.contabil ? 'info' : 'neutro', l.contabil ? 'contábil' : 'só financeiro')}<span>${TIPO_LANC[l.tipo] || esc(l.tipo)}</span><span>${esc(nomeConta(l.conta))}</span>${l.comprovante ? ic('clip') : ''}<span>${origemIc(l.origem)} ${origemTxt(l.origem)}${l.criado_por && l.criado_por !== 'robo' ? ' · ' + pessoaNome(l.criado_por) : ''}</span>${selos(l)}</span></div>`).join('')
  const tabela = `<div class="tabela-wrap"><table class="t"><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Conta</th><th>Livro</th><th>Origem</th><th class="n">Valor</th></tr></thead><tbody>${ls.map((l) => `<tr class="${S.destaque === l.id ? 'novo' : ''}"><td class="num">${dm(l.data)}</td><td>${desc(l)} ${l.comprovante ? ic('clip') : ''} ${selos(l)}</td><td>${TIPO_LANC[l.tipo] || esc(l.tipo)}</td><td>${esc(nomeConta(l.conta))}</td><td>${l.contabil ? 'contábil' : 'financeiro'}</td><td>${origemTxt(l.origem)}</td><td class="n ${l._para ? 'muted' : l.valor > 0 ? 'mais-v' : 'menos-v'}">${valor(l)}</td></tr>`).join('')}</tbody></table></div>`
  const m1 = r.mes_aberto, m0 = antMes(m1)
  return sec('Livro', `<div class="filtros">${fb('mes', 'aberto', cap(nomeMes(m1)))}${fb('mes', 'anterior', cap(nomeMes(m0)))}${fb('mes', 'tudo', 'Tudo')}</div><div class="filtros">${fb('tipo', 'tudo', 'Todo o dinheiro')}${fb('tipo', 'contabil', 'Só contábil')}${fb('tipo', 'financeiro', 'Só financeiro')}</div>
    <div class="so-estreito">${lista || '<p class="nota">Nada neste filtro.</p>'}</div><div class="so-largo">${tabela}</div>
    <p class="nota">${ls.length} lançamentos. Contábil = passa pela empresa e vai ao contador. Só financeiro = dinheiro do Duo fora da empresa (aula sem nota, chapéu, dinheiro vivo).</p>`)
}

/* ===== Contábil ===== */
function telaContabil(r) {
  const c = S.contMes, d = S.mesDados
  if (!d) return sec('Contábil', '<p class="carregando">Carregando o mês…</p>')
  const ls = d.lancamentos || [], nt = (d.notas || []).filter((n) => n.status !== 'cancelada' && n.status !== 'substituida')
  const nTransf = (l) => l.tipo !== 'transferencia'
  const guias = (t) => (d.guias || []).filter((g) => g.tipo === t)
  const dasG = guias('das'), inssG = guias('inss')
  const das = soma(dasG, (g) => g.valor_principal + (g.multa_juros || 0)), inssRet = soma(d.prolabore || [], (p) => p.inss)
  const fora = ls.filter((l) => !l.contabil)
  const finEnt = soma(ls.filter((l) => l.valor > 0 && nTransf(l)), (l) => l.valor)
  const extEnt = soma(ls.filter((l) => l.contabil && l.valor > 0 && nTransf(l)), (l) => l.valor)
  const notasRec = soma(nt.filter((n) => n.recebida_em), (n) => n.valor)
  const semNota = ls.filter((l) => l.tipo === 'receita_informal' && l.contabil)
  const ck = (ok, txt) => `<div class="check ${ok ? 'ok' : 'warn'}">${ic(ok ? 'check' : 'alerta')}<span>${txt}</span></div>`
  const recebidasSemLanc = nt.filter((n) => n.recebida_em && !ls.some((l) => l.nota_id === n.id))
  const filtros = [r.mes_aberto, antMes(r.mes_aberto)].map((m) => `<button data-acao="cont-mes" data-m="${m}" aria-pressed="${c === m}">${cap(nomeMes(m))}</button>`).join('')
  const rv = (d.reservas_do_mes || (r.reservas || []).filter((v) => v.competencia === c))
  return `<div class="filtros">${filtros}</div>`
    + sec('O que vai ao contador · ' + nomeMes(c), `<div class="linhas">${linha('Receita (notas emitidas)', brl(soma(nt, (n) => n.valor)))}${nt.map((n) => linha('NF ' + esc(n.numero || '(a emitir)') + ' · ' + esc(n.tomador), brl(n.valor), 'sub')).join('')}
      ${linha('DAS ' + (dasG.length ? '(guia)' : '(ainda sem guia)') + (dasG[0] && dasG[0].vencimento ? ' · vence ' + dm(dasG[0].vencimento) : ''), brl(das))}${linha('Pró-labore bruto (eSocial)', brl(soma(d.prolabore || [], (p) => p.bruto)))}${linha('INSS retido', brl(inssRet))}
      ${linha('Despesas da empresa', brl(soma(ls.filter((l) => l.contabil && ['despesa_comum', 'despesa_socio', 'taxa'].includes(l.tipo)), (l) => Math.abs(l.valor))))}${linha('Lucro distribuído no mês (Pix)', brl(soma(ls.filter((l) => l.tipo === 'retirada_lucro'), (l) => Math.abs(l.valor))))}</div>`)
    + sec('Fora do contábil (só financeiro)', `<div class="linhas">${fora.filter(nTransf).map((l) => linha(dm(l.data) + ' · ' + esc(l.descricao), dbrl(l.valor))).join('') || '<p class="nota">Nada neste mês.</p>'}</div><p class="nota">Dinheiro vivo do Duo não passa pela empresa e não vai ao contador.</p>`)
    + sec('Conferência: financeiro × contábil × extrato', `<div class="grade g3"><div class="tile"><span>Entradas (todo o dinheiro)</span><b>${brl(finEnt)}</b></div><div class="tile"><span>Notas recebidas (contábil)</span><b>${brl(notasRec)}</b></div><div class="tile"><span>Entradas na empresa</span><b>${brl(extEnt)}</b></div></div>
      <div class="checks">${ck(!recebidasSemLanc.length, recebidasSemLanc.length ? recebidasSemLanc.length + ' nota recebida sem a entrada no extrato.' : 'Toda nota recebida aparece como entrada na conta da empresa.')}${semNota.length ? ck(false, semNota.map((l) => brl(l.valor) + ' de ' + esc(String(l.descricao).toLowerCase())).join(', ') + ' entrou na empresa sem nota: precisa de nome para o contábil.') : ck(true, 'Nenhuma entrada sem nota na empresa.')}
      ${ck(rv.every((v) => !v.falta), 'Reserva de impostos de ' + nomeMes(c) + (rv.every((v) => !v.falta) ? ' guardada.' : ' ainda incompleta.'))}${ck(r.bate, 'Saldo das contas igual à soma das partes (Luan, Mari, caixa, impostos).')}</div>`)
}

/* ===== Excel ===== */
const ABAS = [['fluxo', 'Fluxo de caixa (contador)'], ['resumo', 'Resumo'], ['lanc', 'Lançamentos'], ['pagas', 'Pagas pelos sócios'], ['divisao', 'Divisão entre os sócios']]
export function telaExcel() {
  const m = S.excelMes, e = S.excel
  const meses = (S.resumo ? [antMes(S.resumo.mes_aberto), S.resumo.mes_aberto] : [])
  const filtros = meses.map((x) => `<button data-acao="excel-mes" data-m="${x}" aria-pressed="${m === x}">${cap(nomeMes(x))}</button>`).join('')
  if (!e) return `<div class="filtros">${filtros}</div>` + sec('Excel do mês para o contador', S.erroExcel ? `<p class="erro-faixa">${esc(S.erroExcel)}</p>` : '<p class="carregando">Montando o mês…</p>')
  const ck = (c) => `<div class="check ${c.ok ? 'ok' : 'warn'}">${ic(c.ok ? 'check' : 'alerta')}<span>${esc(c.nome)}${c.ok ? '' : ': ' + esc(c.detalhe)}</span></div>`
  const R = e.resumo || {}, linhas = (e.lancamentos && e.lancamentos.linhas) || []
  const tb = (cols, rows) => `<table class="t"><thead><tr>${cols.map(([t, , n]) => `<th class="${n ? 'n' : ''}">${t}</th>`).join('')}</tr></thead><tbody>${rows.map((x) => `<tr>${cols.map(([, f, n]) => `<td class="${n ? 'n' : ''}">${f(x)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">Sem linhas.</td></tr>`}</tbody></table>`
  const C = e.contador || { linhas: [], totais: { entradas: 0, saidas: 0 }, transferencias: [], saldos_finais: [] }
  const conteudo = {
    fluxo: tb([['Data', (x) => dm(x.data)], ['Entrada ou saída', (x) => esc(x.tipo)], ['Valor', (x) => brl(x.valor), 1], ['Comprovante', (x) => esc(x.comprovante)], ['Descrição', (x) => esc(x.descricao)]], C.linhas)
      + `<p class="nota">Total de entradas ${brl(C.totais.entradas)} · total de saídas ${brl(C.totais.saidas)}</p>`
      + (C.transferencias.length ? `<p class="nota">Transferências entre contas da empresa (fora da tabela): ${C.transferencias.map((t) => `${dm(t.data)} ${brl(t.valor)} de ${esc(t.de)} para ${esc(t.para)}`).join('; ')}</p>` : '')
      + `<p class="nota">Saldo final: ${C.saldos_finais.map((s) => `${esc(s.conta)} ${brl(s.saldo)}`).join(' · ')}</p>`,
    resumo: tb([['Conta', (x) => esc(x.conta)], ['Saldo inicial', (x) => brl(x.inicial), 1], ['Entradas', (x) => brl(x.entradas), 1], ['Saídas', (x) => brl(x.saidas), 1], ['Saldo final', (x) => brl(x.final), 1], ['Bate com o extrato', (x) => esc(x.bate_extrato)]], R.saldos || [])
      + `<p class="nota">Notas do mês: ${(R.notas || []).length} · pró-labore: ${(R.prolabore || []).length} · impostos pagos: ${(R.impostos || []).length} · lucros: ${(R.lucros || []).length}</p>`,
    lanc: tb([['Data', (x) => dm(x.data)], ['Conta', (x) => esc(x.conta)], ['Entrada', (x) => (x.entrada ? brl(x.entrada) : ''), 1], ['Saída', (x) => (x.saida ? brl(x.saida) : ''), 1], ['Saldo', (x) => brl(x.saldo), 1], ['Histórico', (x) => esc(x.historico)]], linhas),
    pagas: e.pagas_socios ? tb([['Data', (x) => dm(x.data)], ['Despesa', (x) => esc(x.despesa)], ['Valor', (x) => brl(x.valor), 1], ['Pago por', (x) => esc(x.pago_por)], ['Tratamento', (x) => esc(x.tratamento)]], e.pagas_socios) : `<p class="nota">Nenhuma despesa da empresa paga por um sócio em ${nomeMes(m)}.</p>`,
    divisao: `<p class="tx-sm">${esc((e.divisao && e.divisao.texto) || '')}</p>`,
  }
  const falhas = (e.conferencias || []).filter((c) => !c.ok)
  return `<div class="filtros">${filtros}</div>`
    + ((e.alertas || []).length ? sec('Alertas', `<div class="checks">${e.alertas.map((a) => `<div class="check warn">${ic('alerta')}<span>${esc(a)}</span></div>`).join('')}</div>`) : '')
    + sec('Excel do mês para o contador', `<div class="linhas">${linha('Mês', mesAno(m))}${linha('Arquivo do contador', esc((e.contador && e.contador.nome_arquivo) || e.nome_arquivo), 'arq')}${linha('Conferência interna', esc(e.nome_arquivo), 'arq')}</div>
      <div class="checks">${(e.conferencias || []).map(ck).join('') || '<p class="nota">Sem conferências neste mês.</p>'}</div>
      <div class="btns"><button class="btn pri" data-acao="excel-baixar" ${falhas.length ? 'disabled' : ''}>Baixar para o contador</button><button class="btn" data-acao="excel-baixar-interno" ${falhas.length ? 'disabled' : ''}>Baixar conferência interna</button></div>
      <p class="nota">A conferência interna (4 abas) é só do ADM: nunca vai ao contador.</p>
      ${S.excelGerado ? `<p class="nota">${chip('ok', 'gerado')} hoje às ${S.excelGerado}. Quem manda ao contador é o Luan, por e-mail.</p>` : falhas.length ? '<p class="nota">O arquivo só baixa quando todas as conferências passam.</p>' : '<p class="nota">O arquivo do contador tem uma aba só (Fluxo de caixa), no formato que o contador pediu.</p>'}`)
    + sec('Prévia', `<div class="abas">${ABAS.map(([k, t]) => `<button data-acao="excel-aba" data-a="${k}" aria-pressed="${S.excelAba === k}">${t}</button>`).join('')}</div><div class="tabela-wrap">${conteudo[S.excelAba]}</div>`)
}

/* ===== Certidões ===== */
const ORDEM = ['falhou', 'vencida', 'vence_logo', 'renovando', 'manual', 'valida']
const COR_ST = { valida: 'ok', vence_logo: 'warn', renovando: 'info', falhou: 'bad', manual: 'warn', vencida: 'bad' }
const TXT_ST = { valida: 'válida', vence_logo: 'vence logo', renovando: 'renovando', falhou: 'falhou', manual: 'precisa de vocês', vencida: 'vencida' }
const MODO = { automatico: 'renova sozinha', semi: 'pede ação', sob_demanda: 'só quando houver edital', manual: 'manual' }
const NOME_CERT = { federal: 'Federal (Receita e PGFN)', fgts: 'FGTS', trabalhista: 'Trabalhista (CNDT)', estadual: 'Estadual (GDF)', municipal: 'Municipal', distrital: 'Distrital (GDF)', residencia: 'Comprovante de residência', antecedentes: 'Antecedentes criminais', cnpj: 'Cartão CNPJ' }
const GRUPO = { empresa: 'Empresa', luan: 'Luan', mari: 'Mari' }
const efetivo = (c, hoje) => ((c.status === 'valida' || c.status === 'vence_logo') && c.valida_ate && c.valida_ate < hoje ? 'vencida' : c.status)
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5)
function telaCertidoes() {
  if (!S.cert) return sec('Certidões', '<p class="carregando">Carregando…</p>')
  const hoje = S.resumo ? S.resumo.data : S.hoje
  const grupo = (t) => S.cert.filter((c) => c.titular === t).map((c) => ({ c, st: efetivo(c, hoje) })).sort((a, b) => ORDEM.indexOf(a.st) - ORDEM.indexOf(b.st) || String(a.c.valida_ate).localeCompare(String(b.c.valida_ate))).map(({ c, st }) => {
    const rest = c.valida_ate ? diasEntre(hoje, c.valida_ate) : null, tot = c.emitida_em && c.valida_ate ? Math.max(1, diasEntre(c.emitida_em, c.valida_ate)) : null
    const w = rest !== null && tot ? Math.max(0, Math.min(100, rest / tot * 100)) : 0
    const link = c.titular !== 'luan' && c.arquivo_ref && /^https:\/\//.test(c.arquivo_ref) ? ` · <a href="${esc(c.arquivo_ref)}" target="_blank" rel="noopener noreferrer">abrir arquivo</a>` : ''
    return `<div class="cert"><b class="tx-sm">${esc(NOME_CERT[c.tipo] || cap(String(c.tipo || '').replace(/[_-]/g, ' ')))}</b>${chip(COR_ST[st], TXT_ST[st])}<div class="vb"><span class="${COR_ST[st]}" data-w="${w.toFixed(1)}"></span></div>
      <small>${rest === null ? 'sem validade registrada' : rest >= 0 ? 'vale até ' + dmy(c.valida_ate) + ' (' + rest + ' dias)' : 'venceu em ' + dmy(c.valida_ate)}${c.modo ? ' · ' + MODO[c.modo] : ''}${c.proxima_renovacao ? ' · renova em ' + dm(c.proxima_renovacao) : ''}${c.erro_curto && (st === 'falhou' || st === 'manual') ? ' · ' + esc(c.erro_curto) : ''}${link}</small></div>`
  }).join('')
  const falhas = S.cert.filter((c) => c.status === 'falhou').length
  return (falhas ? `<div class="dec"><b>${ic('alerta')} ${falhas} emissão falhou</b><p class="nota">O sistema tenta de novo sozinho; só chama vocês se não der.</p></div>` : '')
    + ['empresa', 'luan', 'mari'].map((t) => { const g = grupo(t); return g ? sec(GRUPO[t], g) : '' }).join('')
    + '<p class="nota">Certidão vencida aparece como vencida mesmo que o robô ainda não tenha atualizado. Sem número de documento nem endereço nesta tela.</p>'
}


export const TELA_R = { inicio: telaInicio, onde: telaOnde, quem: telaQuem, impostos: telaImpostos, proximas: telaProximas, livro: telaLivro, contabil: telaContabil, excel: telaExcel, certidoes: telaCertidoes, ideias: telaIdeias }
export { ctaLanc, derivar as _d }
