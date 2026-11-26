import type { QuestionKey } from "./types";

export interface Question {
  key: QuestionKey;
  /** pergunta como o vendedor lê no balcão */
  title: string;
  /** nome curto (tabela de descontos, resumo) */
  short: string;
  /** como conferir */
  hint: string;
  /** várias respostas (peças trocadas, o que falta) */
  multi: boolean;
  /** botão de "nada disso" nas perguntas de várias respostas */
  noneLabel?: string;
}

// A ordem aqui é a ordem dos passos no simulador.
export const QUESTIONS: Question[] = [
  { key: "conta", title: "A conta do cliente já saiu do aparelho?", short: "Conta (iCloud / Google)", multi: false,
    hint: "Peça para o cliente sair do iCloud ou da conta Google na sua frente. Aparelho com conta presa não dá para revender." },
  { key: "tela", title: "Como está a tela?", short: "Tela", multi: false,
    hint: "Olhe com a tela acesa (fundo branco) e apagada. Teste o toque nos cantos." },
  { key: "bateria", title: "Qual a saúde da bateria?", short: "Bateria", multi: false,
    hint: "iPhone: Ajustes › Bateria › Saúde da Bateria." },
  { key: "carcaca", title: "E a carcaça (laterais e traseira)?", short: "Carcaça", multi: false,
    hint: "Procure amassados nas quinas e trincas no vidro de trás." },
  { key: "biometria", title: "A biometria funciona (Face ID ou digital)?", short: "Biometria (Face ID / digital)", multi: false,
    hint: "Peça para o cliente desbloquear com o rosto ou o dedo." },
  { key: "pecas", title: "Alguma peça já foi trocada?", short: "Peças trocadas", multi: true, noneLabel: "Nenhuma peça trocada",
    hint: "iPhone: Ajustes › Geral › Sobre mostra \"peça desconhecida\" ou \"histórico de peças\"." },
  { key: "acessorios", title: "Vem com caixa e cabo?", short: "Acessórios", multi: true, noneLabel: "Vem com tudo",
    hint: "Marque o que está faltando." },
];

export const QUESTION_BY_KEY = new Map(QUESTIONS.map((q) => [q.key, q]));
