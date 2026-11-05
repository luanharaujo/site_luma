// Writes the monthly cash-flow spreadsheet (.xlsx) for the accountant from the JSON of GET /excel/:mes.
// One module for the browser and for node: the caller passes the ExcelJS 4.4.0 object
//   browser: <script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"> (global ExcelJS)
//   node:    import ExcelJS from 'exceljs'
// and receives the file bytes (Uint8Array). It holds no data: everything comes from the API.

const MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const DATA = 'dd/mm/yyyy'

const reais = (centavos) => Number((centavos / 100).toFixed(2))
const data = (iso) => {
  if (!iso) return null
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}
const br = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/')

// modo 'contador' (default): the file that goes to the accountant, ONE sheet "Fluxo de caixa".
// modo 'interno': the 4-tab version, the ADM's internal check; its name says so and it never goes to the accountant.
export function nomeDoArquivo(dados, modo = 'contador') {
  return modo === 'interno' ? dados.nome_arquivo : (dados.contador && dados.contador.nome_arquivo) || dados.nome_arquivo
}

// Throws when a check of the generator fails (unless opcoes.ignorarConferencias).
export async function gerarXlsx(ExcelJS, dados, opcoes = {}) {
  if ((opcoes.modo || 'contador') === 'contador') return gerarContador(ExcelJS, dados, opcoes)
  const falhas = (dados.conferencias || []).filter((c) => !c.ok)
  if (falhas.length && !opcoes.ignorarConferencias)
    throw new Error('Conferência falhou: ' + falhas.map((f) => `${f.nome} (${f.detalhe})`).join('; '))

  const wb = new ExcelJS.Workbook()
  wb.creator = dados.empresa.nome
  wb.created = new Date()
  const emp = dados.empresa
  const cabecalho = (ws, colunas) => {
    ws.addRow([`${emp.razao_social || emp.nome} - CNPJ ${emp.cnpj || '(não informado)'}`])
    ws.addRow([`Competência: ${br(dados.periodo.de)} a ${br(dados.periodo.ate)}`])
    const g = new Date(dados.gerado_em)
    const p = (n) => String(n).padStart(2, '0')
    ws.addRow([`Gerado em: ${p(g.getDate())}/${p(g.getMonth() + 1)}/${g.getFullYear()} ${p(g.getHours())}:${p(g.getMinutes())}`])
    for (let i = 1; i <= 3; i++) ws.getRow(i).font = { bold: i === 1 }
    ws.addRow([])
    ws.columns = colunas.map((c) => ({ width: c.largura }))
  }
  // writes a table block: title (optional), header, rows; returns the first data row number
  const tabela = (ws, titulo, cols, linhas, opts = {}) => {
    if (titulo) ws.addRow([titulo]).font = { bold: true, size: 12 }
    const h = ws.addRow(cols.map((c) => c.titulo))
    h.font = { bold: true }
    h.alignment = { vertical: 'middle', wrapText: true }
    h.border = { bottom: { style: 'thin' } }
    const primeira = ws.rowCount + 1
    for (const l of linhas) {
      const r = ws.addRow(cols.map((c) => l[c.campo] ?? null))
      cols.forEach((c, i) => {
        const cel = r.getCell(i + 1)
        if (c.tipo === 'moeda') cel.numFmt = MOEDA
        if (c.tipo === 'data') cel.numFmt = DATA
      })
    }
    if (opts.vazio && !linhas.length) ws.addRow([opts.vazio]).font = { italic: true }
    return { cabecalho: h.number, primeira }
  }
  const prep = (linhas, campos) => linhas.map((l) => {
    const o = { ...l }
    for (const [k, t] of Object.entries(campos)) o[k] = t === 'moeda' ? (l[k] === null || l[k] === undefined ? null : reais(l[k])) : data(l[k])
    return o
  })

  // ---- 1. Lançamentos
  const ws1 = wb.addWorksheet('Lançamentos')
  const col1 = [
    { titulo: 'Data', campo: 'data', tipo: 'data', largura: 12 }, { titulo: 'Conta', campo: 'conta', largura: 28 },
    { titulo: 'Entrada (R$)', campo: 'entrada', tipo: 'moeda', largura: 16 }, { titulo: 'Saída (R$)', campo: 'saida', tipo: 'moeda', largura: 16 },
    { titulo: 'Saldo da conta (R$)', campo: 'saldo', tipo: 'moeda', largura: 18 }, { titulo: 'Histórico', campo: 'historico', largura: 52 },
    { titulo: 'Categoria', campo: 'categoria', largura: 36 }, { titulo: 'Contraparte', campo: 'contraparte', largura: 34 },
    { titulo: 'Nota fiscal', campo: 'nota_fiscal', largura: 12 }, { titulo: 'Comprovante', campo: 'comprovante', largura: 46 },
    { titulo: 'Observação', campo: 'observacao', largura: 46 },
  ]
  cabecalho(ws1, col1)
  const t1 = tabela(ws1, null, col1, prep(dados.lancamentos.linhas, { data: 'data', entrada: 'moeda', saida: 'moeda', saldo: 'moeda' }))
  const totais = (rotulo, t) => {
    const r = ws1.addRow([rotulo, null, reais(t.entradas), reais(t.saidas)])
    r.font = { bold: true }
    r.getCell(3).numFmt = MOEDA
    r.getCell(4).numFmt = MOEDA
  }
  totais('Total (inclui transferências entre contas da empresa)', dados.lancamentos.totais)
  totais('Total sem transferências', dados.lancamentos.totais_sem_transferencias)
  ws1.views = [{ state: 'frozen', ySplit: t1.cabecalho, xSplit: 0 }]
  ws1.autoFilter = { from: { row: t1.cabecalho, column: 1 }, to: { row: t1.cabecalho + dados.lancamentos.linhas.length, column: col1.length } }

  // ---- 2. Resumo
  const ws2 = wb.addWorksheet('Resumo')
  cabecalho(ws2, [{ largura: 36 }, { largura: 18 }, { largura: 18 }, { largura: 24 }, { largura: 20 }, { largura: 18 }, { largura: 18 }, { largura: 16 }])
  const R = dados.resumo
  const bloco = (titulo, cols, linhas, vazio) => { tabela(ws2, titulo, cols, linhas, { vazio }); ws2.addRow([]) }
  bloco('A. Saldos por conta', [
    { titulo: 'Conta', campo: 'conta' }, { titulo: 'Saldo inicial', campo: 'inicial', tipo: 'moeda' }, { titulo: 'Entradas', campo: 'entradas', tipo: 'moeda' },
    { titulo: 'Saídas', campo: 'saidas', tipo: 'moeda' }, { titulo: 'Saldo final', campo: 'final', tipo: 'moeda' }, { titulo: 'Bate com o extrato', campo: 'bate_extrato' },
  ], prep(R.saldos, { inicial: 'moeda', entradas: 'moeda', saidas: 'moeda', final: 'moeda' }))
  const cat = [{ titulo: 'Categoria', campo: 'categoria' }, { titulo: 'Total', campo: 'total', tipo: 'moeda' }]
  bloco('B. Entradas por categoria (sem transferências)', cat, prep(R.entradas_por_categoria, { total: 'moeda' }), 'Sem entradas no mês')
  bloco('C. Saídas por categoria (sem transferências)', cat, prep(R.saidas_por_categoria, { total: 'moeda' }), 'Sem saídas no mês')
  bloco('D. Notas fiscais emitidas no mês', [
    { titulo: 'Nº', campo: 'numero' }, { titulo: 'Emissão', campo: 'emissao', tipo: 'data' }, { titulo: 'Tomador', campo: 'tomador' },
    { titulo: 'CNPJ do tomador', campo: 'cnpj_tomador' }, { titulo: 'Código do serviço', campo: 'codigo_servico' }, { titulo: 'Valor', campo: 'valor', tipo: 'moeda' },
    { titulo: 'Recebida em', campo: 'recebida_em', tipo: 'data' }, { titulo: 'Responsável', campo: 'responsavel' },
  ], prep(R.notas, { emissao: 'data', valor: 'moeda', recebida_em: 'data' }), 'Nenhuma nota emitida no mês')
  bloco('E. Pró-labore do mês (eSocial)', [
    { titulo: 'Sócio', campo: 'socio' }, { titulo: 'Bruto', campo: 'bruto', tipo: 'moeda' }, { titulo: 'INSS 11%', campo: 'inss', tipo: 'moeda' },
    { titulo: 'IRRF', campo: 'irrf', tipo: 'moeda' }, { titulo: 'Líquido', campo: 'liquido', tipo: 'moeda' }, { titulo: 'Data do Pix', campo: 'data_pix', tipo: 'data' },
    { titulo: 'Valor do Pix', campo: 'valor_pix', tipo: 'moeda' },
  ], prep(R.prolabore, { bruto: 'moeda', inss: 'moeda', irrf: 'moeda', liquido: 'moeda', data_pix: 'data', valor_pix: 'moeda' }), 'Sem pró-labore no mês')
  bloco('F. Distribuição de lucros no mês', [
    { titulo: 'Sócio', campo: 'socio' }, { titulo: 'Valor', campo: 'valor', tipo: 'moeda' }, { titulo: 'Data', campo: 'data', tipo: 'data' },
  ], prep(R.lucros, { valor: 'moeda', data: 'data' }), 'Sem distribuição de lucros no mês')
  bloco('G. Aportes dos sócios', [
    { titulo: 'Sócio', campo: 'socio' }, { titulo: 'Valor', campo: 'valor', tipo: 'moeda' }, { titulo: 'Data', campo: 'data', tipo: 'data' }, { titulo: 'Finalidade', campo: 'finalidade' },
  ], prep(R.aportes, { valor: 'moeda', data: 'data' }), 'Sem aportes no mês')
  bloco('H. Impostos pagos no mês', [
    { titulo: 'Guia', campo: 'guia' }, { titulo: 'Período de apuração', campo: 'pa' }, { titulo: 'Valor', campo: 'valor', tipo: 'moeda' }, { titulo: 'Data', campo: 'data', tipo: 'data' },
  ], prep(R.impostos, { valor: 'moeda', data: 'data' }), 'Nenhum imposto pago no mês')
  if ((dados.alertas || []).length) bloco('I. Alertas (só conferência interna)', [{ titulo: 'Alerta', campo: 'texto' }], dados.alertas.map((texto) => ({ texto })))
  ws2.views = [{ state: 'frozen', ySplit: 3 }]

  // ---- 3. Pagas pelos sócios (only when there is any)
  if (dados.pagas_socios) {
    const ws3 = wb.addWorksheet('Pagas pelos sócios')
    const col3 = [
      { titulo: 'Data', campo: 'data', tipo: 'data', largura: 12 }, { titulo: 'Despesa', campo: 'despesa', largura: 50 }, { titulo: 'Categoria', campo: 'categoria', largura: 30 },
      { titulo: 'Valor', campo: 'valor', tipo: 'moeda', largura: 16 }, { titulo: 'Pago por', campo: 'pago_por', largura: 14 },
      { titulo: 'Tratamento (aporte do sócio ou reembolso)', campo: 'tratamento', largura: 30 }, { titulo: 'Comprovante', campo: 'comprovante', largura: 46 },
    ]
    cabecalho(ws3, col3)
    const t3 = tabela(ws3, null, col3, prep(dados.pagas_socios, { data: 'data', valor: 'moeda' }))
    ws3.views = [{ state: 'frozen', ySplit: t3.cabecalho }]
    ws3.autoFilter = { from: { row: t3.cabecalho, column: 1 }, to: { row: t3.cabecalho + dados.pagas_socios.length, column: col3.length } }
  }

  // ---- 4. Divisão entre os sócios
  const ws4 = wb.addWorksheet('Divisão entre os sócios')
  cabecalho(ws4, [{ largura: 110 }])
  const rd = ws4.addRow([dados.divisao.texto])
  rd.alignment = { wrapText: true }
  ws4.views = [{ state: 'frozen', ySplit: 3 }]

  return new Uint8Array(await wb.xlsx.writeBuffer())
}

// ---- The accountant's file: one sheet, "Fluxo de caixa" (format v2 of FORMATO_excel_mensal_Helder.md)
async function gerarContador(ExcelJS, dados, opcoes = {}) {
  const falhas = (dados.conferencias || []).filter((c) => !c.ok)
  if (falhas.length && !opcoes.ignorarConferencias)
    throw new Error('Conferência falhou: ' + falhas.map((f) => `${f.nome} (${f.detalhe})`).join('; '))
  const C = dados.contador
  if (!C) throw new Error('A API não mandou os dados do arquivo do contador')
  const emp = dados.empresa
  const wb = new ExcelJS.Workbook()
  wb.creator = emp.nome
  wb.created = new Date()
  const ws = wb.addWorksheet('Fluxo de caixa')
  ws.columns = [{ width: 13 }, { width: 18 }, { width: 16 }, { width: 38 }, { width: 90 }]
  const p = (n) => String(n).padStart(2, '0')
  const g = new Date(dados.gerado_em)
  ws.addRow([`${emp.razao_social || emp.nome} - CNPJ ${emp.cnpj || '(não informado)'}`]).font = { bold: true }
  ws.addRow([`Competência: ${br(dados.periodo.de)} a ${br(dados.periodo.ate)}`])
  ws.addRow([`Gerado em: ${p(g.getDate())}/${p(g.getMonth() + 1)}/${g.getFullYear()} ${p(g.getHours())}:${p(g.getMinutes())}`])
  ws.addRow([])
  const h = ws.addRow(['Data', 'Entrada ou saída', 'Valor (R$)', 'Comprovante', 'Descrição'])
  h.font = { bold: true }
  h.border = { bottom: { style: 'thin' } }
  for (const l of C.linhas) {
    const r = ws.addRow([data(l.data), l.tipo, reais(l.valor), l.comprovante, l.descricao])
    r.getCell(1).numFmt = DATA
    r.getCell(3).numFmt = MOEDA
    r.getCell(5).alignment = { wrapText: true, vertical: 'top' }
  }
  ws.views = [{ state: 'frozen', ySplit: h.number }]
  ws.addRow([])
  const tot = (rotulo, v) => { const r = ws.addRow([rotulo, null, reais(v)]); r.font = { bold: true }; r.getCell(3).numFmt = MOEDA }
  tot('Total de entradas', C.totais.entradas)
  tot('Total de saídas', C.totais.saidas)
  ws.addRow([])
  ws.addRow(['Transferências entre contas da própria empresa (não são entrada nem saída da empresa)']).font = { bold: true }
  if (!C.transferencias.length) ws.addRow(['Nenhuma no mês.']).font = { italic: true }
  for (const t of C.transferencias) {
    const r = ws.addRow([data(t.data), null, reais(t.valor), null, `de ${t.de} para ${t.para}`])
    r.getCell(1).numFmt = DATA
    r.getCell(3).numFmt = MOEDA
  }
  ws.addRow([])
  ws.addRow([`Saldo final de cada conta da empresa em ${br(dados.periodo.ate)}`]).font = { bold: true }
  for (const s of C.saldos_finais) { const r = ws.addRow([s.conta, null, reais(s.saldo)]); r.getCell(3).numFmt = MOEDA }
  ws.addRow(['Rendimento das caixinhas não incluído; entra quando for resgatado.']).font = { italic: true }
  return new Uint8Array(await wb.xlsx.writeBuffer())
}
