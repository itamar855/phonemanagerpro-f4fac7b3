/**
 * Serviço de Consulta e Validação de CNPJ
 *
 * Utiliza a BrasilAPI para consulta gratuita e em tempo real dos dados cadastrais
 * da Receita Federal, preenchendo automaticamente razão social, nome fantasia,
 * endereço completo, código IBGE do município, CNAE e opção pelo Simples Nacional.
 */

export interface CnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  data_situacao_cadastral?: string;
  cnae_fiscal: string;
  cnae_fiscal_descricao: string;
  opcao_pelo_simples: boolean;
  opcao_pelo_mei: boolean;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  codigo_ibge_municipio: string;
  telefone: string;
  email: string;
}

/**
 * Remove caracteres não numéricos do CNPJ
 */
export function sanitizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

/**
 * Aplica máscara de CNPJ: 00.000.000/0000-00
 */
export function formatCnpj(cnpj: string): string {
  const clean = sanitizeCnpj(cnpj).slice(0, 14);
  if (clean.length <= 2) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
  if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
  if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

/**
 * Validador oficial de dígitos verificadores de CNPJ
 */
export function isValidCnpj(cnpj: string): boolean {
  const clean = sanitizeCnpj(cnpj);
  if (clean.length !== 14) return false;

  // Elimina sequências com todos os dígitos iguais
  if (/^(\d)\1+$/.test(clean)) return false;

  let length = clean.length - 2;
  let numbers = clean.substring(0, length);
  const digits = clean.substring(length);
  let sum = 0;
  let pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0), 10)) return false;

  length = length + 1;
  numbers = clean.substring(0, length);
  sum = 0;
  pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1), 10);
}

/**
 * Consulta os dados do CNPJ na BrasilAPI (com fallback de CEP para IBGE se necessário)
 */
export async function fetchCnpjData(rawCnpj: string): Promise<CnpjData> {
  const cleanCnpj = sanitizeCnpj(rawCnpj);

  if (cleanCnpj.length !== 14) {
    throw new Error("CNPJ incompleto. Digite os 14 números do CNPJ.");
  }

  if (!isValidCnpj(cleanCnpj)) {
    throw new Error("CNPJ inválido. Verifique os números digitados.");
  }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
    
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("CNPJ não encontrado na base da Receita Federal.");
      }
      throw new Error(`Erro ao consultar CNPJ na Receita Federal (HTTP ${res.status}).`);
    }

    const data = await res.json();

    // Se o código IBGE não veio no retorno principal do CNPJ, busca pelo CEP
    let ibgeCode = data.codigo_municipio_ibge ? String(data.codigo_municipio_ibge) : "";
    if (!ibgeCode && data.cep) {
      try {
        const cleanCep = String(data.cep).replace(/\D/g, "");
        const cepRes = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
        if (cepRes.ok) {
          const cepData = await cepRes.json();
          ibgeCode = cepData.ibge ? String(cepData.ibge) : "";
        }
      } catch {
        // Fallback silencioso se o CEP não resolver IBGE
      }
    }

    return {
      cnpj: formatCnpj(cleanCnpj),
      razao_social: data.razao_social || data.nome || "",
      nome_fantasia: data.nome_fantasia || data.fantasia || data.razao_social || "",
      situacao_cadastral: data.descricao_situacao_cadastral || data.situacao_cadastral || "ATIVA",
      data_situacao_cadastral: data.data_situacao_cadastral || "",
      cnae_fiscal: data.cnae_fiscal ? String(data.cnae_fiscal) : "",
      cnae_fiscal_descricao: data.cnae_fiscal_descricao || "",
      opcao_pelo_simples: Boolean(data.opcao_pelo_simples),
      opcao_pelo_mei: Boolean(data.opcao_pelo_mei),
      logradouro: data.logradouro || "",
      numero: data.numero || "",
      complemento: data.complemento || "",
      bairro: data.bairro || "",
      cep: data.cep ? data.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2") : "",
      municipio: data.municipio || "",
      uf: data.uf || "",
      codigo_ibge_municipio: ibgeCode,
      telefone: data.ddd_telefone_1 || data.telefone || "",
      email: data.email || "",
    };
  } catch (error: any) {
    console.error("Erro na consulta de CNPJ:", error);
    throw new Error(error.message || "Não foi possível consultar os dados do CNPJ no momento.");
  }
}
