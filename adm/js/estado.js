// Estado único da página. Nada daqui é guardado no navegador; vem da API a cada carga.
import { hojeIso } from './util.js?v=d2226dfcd2'
export const S = {
  fase: 'carregando', // carregando | ok | restrito | proibido | erro
  eu: null, apelido: '',
  tela: 'inicio',
  resumo: null, decisoes: [], eventos: [], lancMes: [], avisosWise: [], livro: null, notas: [], mesDados: null, excel: null, cert: null,
  filtro: { mes: 'aberto', tipo: 'tudo' },
  contMes: null, excelMes: null, excelAba: 'fluxo', excelGerado: null,
  ideias: null, erroIdeias: '', ideiaAberta: null, comentando: null, confArq: null, feitasAbertas: false, rasc: {},
  folha: null, destaque: null, erroTela: '', atualizadoEm: null, hoje: hojeIso(),
}
