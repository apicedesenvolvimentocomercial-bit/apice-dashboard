// Lista curada de CNAEs (Classificação Nacional de Atividades Econômicas)
// relevantes para clínicas de estética, beleza e saúde — o nicho da Senno.
// Não é a base completa (~1.3k subclasses): só os códigos que uma clínica do
// segmento costuma declarar. Usada no select de configurações (Client.cnae).
//
// `code` é o formato oficial "####-#/##". Mantenha em ordem de relevância.

export type CnaeOption = { code: string; label: string }

export const CNAE_OPTIONS: CnaeOption[] = [
  { code: '9602-5/02', label: 'Atividades de estética e outros serviços de cuidados com a beleza' },
  { code: '9602-5/01', label: 'Cabeleireiros, manicure e pedicure' },
  { code: '8690-9/04', label: 'Atividades de fisioterapia' },
  {
    code: '8690-9/01',
    label: 'Atividades de práticas integrativas e complementares em saúde humana',
  },
  { code: '8690-9/03', label: 'Atividades de acupuntura' },
  { code: '8690-9/99', label: 'Outras atividades de atenção à saúde humana não especificadas' },
  { code: '8650-0/04', label: 'Atividades de fisioterapia (profissional independente)' },
  { code: '8650-0/03', label: 'Atividades de psicologia e psicanálise' },
  { code: '8650-0/99', label: 'Atividades de profissionais da área de saúde não especificadas' },
  {
    code: '8630-5/01',
    label: 'Atividade médica ambulatorial com recursos para exames complementares',
  },
  { code: '8630-5/02', label: 'Atividade médica ambulatorial restrita a consultas' },
  { code: '8630-5/03', label: 'Atividade médica ambulatorial de especialidades' },
  { code: '8630-5/04', label: 'Atividade odontológica' },
  { code: '8630-5/06', label: 'Serviços de vacinação e imunização humana' },
  { code: '8640-2/02', label: 'Laboratórios clínicos' },
  { code: '8711-5/03', label: 'Clínicas e residências geriátricas' },
  {
    code: '4772-5/00',
    label: 'Comércio varejista de cosméticos, produtos de perfumaria e de higiene pessoal',
  },
  { code: '4774-1/00', label: 'Comércio varejista de artigos de óptica' },
  { code: '4789-0/05', label: 'Comércio varejista de produtos saneantes domissanitários' },
  { code: '9609-2/06', label: 'Serviços de tatuagem e colocação de piercing' },
  { code: '9609-2/99', label: 'Outras atividades de serviços pessoais não especificadas' },
  {
    code: '1062-7/00',
    label: 'Fabricação de produtos de higiene pessoal, perfumaria e cosméticos',
  },
]
