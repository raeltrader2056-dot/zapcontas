const CATEGORY_RULES = [
    {
        category: 'Alimentação',
        keywords: ['almoço', 'jantar', 'lanche', 'pizza', 'hamburguer', 'restaurante', 'ifood', 'padaria', 'cafe', 'café', 'comida', 'mercado', 'supermercado', 'aougue', 'açougue', 'feira']
    },
    {
        category: 'Transporte',
        keywords: ['gasolina', 'combustivel', 'combustível', 'uber', '99', 'taxi', 'ônibus', 'onibus', 'metrô', 'metro', 'estacionamento', 'pedagio', 'pedágio', 'ipva', 'mecanico', 'mecânico']
    },
    {
        category: 'Moradia / Contas',
        keywords: ['aluguel', 'condomínio', 'condominio', 'luz', 'energia', 'agua', 'água', 'internet', 'gas', 'gás', 'iptu', 'faxina']
    },
    {
        category: 'Lazer & Entretenimento',
        keywords: ['cinema', 'show', 'netflix', 'spotify', 'jogo', 'steam', 'bar', 'cerveja', 'churrasco', 'viagem', 'praia']
    },
    {
        category: 'Saúde & Farmácia',
        keywords: ['farmacia', 'farmácia', 'remedio', 'remédio', 'médico', 'medico', 'dentista', 'consulta', 'exame', 'academia']
    },
    {
        category: 'Educação',
        keywords: ['curso', 'livro', 'faculdade', 'escola', 'mensalidade', 'apostila']
    },
    {
        category: 'Compras Pessoais',
        keywords: ['roupa', 'sapato', 'tenis', 'tênis', 'shopee', 'shein', 'amazon', 'mercado livre', 'perfume', 'corte', 'barba', 'cabelo']
    },
    {
        category: 'Renda & Entradas',
        keywords: ['salario', 'salário', 'freela', 'freelance', 'pix recebido', 'venda', 'comissao', 'comissão', 'rendimento', 'recebi']
    }
];
export class MessageAIParser {
    /**
     * Interpreta o texto em linguagem natural de forma precisa e rápida.
     * Suporta números em formatos variados: "45,50", "45.50", "45", "R$ 45", "45 reais", "quarenta e cinco"
     */
    parse(text) {
        const raw = text.trim();
        const clean = raw.toLowerCase();
        // 0. Respostas de Botões Interativos (Quick Reply Buttons)
        if (clean === 'btn_dashboard')
            return { intent: 'dashboard_link' };
        if (clean === 'btn_summary')
            return { intent: 'balance_query', queryPeriod: 'month' };
        if (clean === 'btn_vaults')
            return { intent: 'vault_query' };
        if (clean === 'btn_help')
            return { intent: 'help' };
        if (clean === 'btn_reset')
            return { intent: 'reset_balance' };
        // 1. Palavras-Chave de Menu e Ajuda Imediata
        const menuKeywords = ['menu', 'ajuda', 'help', 'comandos', 'opção', 'opções', 'opcao', 'opcoes', 'funcionalidades', 'como funciona', '?'];
        if (menuKeywords.includes(clean)) {
            return { intent: 'help' };
        }
        // 2. Saudações e Início de Conversa
        const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'e aí', 'opa', 'salve', 'iniciar', 'começar', 'inicio', 'início', 'start'];
        if (greetings.includes(clean)) {
            return { intent: 'greeting' };
        }
        // 3. Palavras-Chave de Consulta de Saldo / Resumo / Extrato
        if (clean === 'saldo' ||
            clean === 'resumo' ||
            clean === 'extrato' ||
            clean === 'balanco' ||
            clean === 'balanço' ||
            clean.startsWith('saldo') ||
            clean.includes('quanto gastei') ||
            clean.includes('quanto gastamos') ||
            clean.includes('meu saldo')) {
            let period = 'month';
            if (clean.includes('hoje'))
                period = 'today';
            if (clean.includes('semana'))
                period = 'week';
            return { intent: 'balance_query', queryPeriod: period };
        }
        // 4. Palavras-Chave de Caixinhas / Cofrinho / Investimentos (sem valor para depósito)
        if (clean === 'caixinha' ||
            clean === 'caixinhas' ||
            clean === 'cofrinho' ||
            clean === 'investimento' ||
            clean === 'investimentos' ||
            clean === 'poupanca' ||
            clean === 'poupança' ||
            clean === 'reserva' ||
            clean === 'guardar' ||
            clean.includes('minhas caixinhas') ||
            clean.includes('quanto guardei') ||
            clean.includes('quanto tenho guardado')) {
            return { intent: 'vault_query' };
        }
        // 5. Comandos de Dashboard / Link Web
        if (clean === 'painel' || clean === 'dashboard' || clean === 'link' || clean === 'site' || clean.includes('dashboard') || clean.includes('painel') || clean.includes('grafico') || clean.includes('gráfico')) {
            return { intent: 'dashboard_link' };
        }
        // 6. Comandos de Assinatura / Planos / Pagamento
        if (clean.includes('assinar') ||
            clean.includes('plano') ||
            clean.includes('planos') ||
            clean.includes('pagar') ||
            clean.includes('pix pro') ||
            clean.includes('virar pro') ||
            clean === 'pro') {
            return { intent: 'subscribe' };
        }
        // 7. Zerar / Limpar Saldo do Mês
        if (clean.includes('zerar saldo') ||
            clean.includes('limpar saldo') ||
            clean.includes('resetar saldo') ||
            clean.includes('zerar gastos') ||
            clean === 'zerar' ||
            clean === 'limpar' ||
            clean === 'resetar') {
            return { intent: 'reset_balance' };
        }
        // 8. Desfazer / Apagar Último Gasto
        if (clean.includes('desfazer') ||
            clean.includes('apagar ultimo') ||
            clean.includes('apagar último') ||
            clean.includes('cancelar ultimo') ||
            clean.includes('cancelar último') ||
            clean.includes('apagar gasto') ||
            clean === 'desfazer') {
            return { intent: 'delete_last' };
        }
        // 4. Adicionar Saldo Inicial / Ajuste ("definir saldo 2000", "meu saldo inicial é 3000", "adicionar saldo 500")
        if (clean.includes('adicionar saldo') ||
            clean.includes('add saldo') ||
            clean.includes('colocar saldo') ||
            clean.includes('saldo inicial') ||
            clean.includes('definir saldo')) {
            const val = this.extractAmount(clean);
            if (val) {
                return {
                    intent: 'set_initial_balance',
                    targetAmount: val
                };
            }
        }
        // 5. Definir Meta / Limite de Gastos ("meta 3000", "limite do mes 2500")
        if (clean.includes('meta') || clean.includes('limite')) {
            const val = this.extractAmount(clean);
            if (val) {
                return {
                    intent: 'set_budget',
                    targetAmount: val
                };
            }
        }
        // 6. Caixinhas e Investimentos: Guardar Dinheiro
        if (clean.includes('guardei') ||
            clean.includes('guardar') ||
            clean.includes('investi') ||
            clean.includes('investir') ||
            clean.includes('juntei') ||
            clean.includes('na caixinha') ||
            clean.includes('no cofrinho')) {
            const val = this.extractAmount(clean);
            if (val) {
                let vaultName = 'Reserva de Emergência';
                if (clean.includes('viagem'))
                    vaultName = 'Viagem dos Sonhos';
                else if (clean.includes('carro'))
                    vaultName = 'Carro Novo';
                else if (clean.includes('casa'))
                    vaultName = 'Casa Própria';
                else if (clean.includes('invest') || clean.includes('ação') || clean.includes('acoes') || clean.includes('cdb'))
                    vaultName = 'Investimentos';
                else if (clean.includes('reserva'))
                    vaultName = 'Reserva de Emergência';
                return {
                    intent: 'vault_deposit',
                    targetAmount: val,
                    vaultName
                };
            }
        }
        // 7. Caixinhas e Investimentos: Resgatar Dinheiro
        if (clean.includes('resgatei') ||
            clean.includes('resgatar') ||
            clean.includes('tirei da caixinha') ||
            clean.includes('tirar da caixinha') ||
            clean.includes('tirei da reserva') ||
            clean.includes('tirei do cofrinho')) {
            const val = this.extractAmount(clean);
            if (val) {
                let vaultName = 'Reserva de Emergência';
                if (clean.includes('viagem'))
                    vaultName = 'Viagem dos Sonhos';
                else if (clean.includes('carro'))
                    vaultName = 'Carro Novo';
                else if (clean.includes('invest'))
                    vaultName = 'Investimentos';
                return {
                    intent: 'vault_withdraw',
                    targetAmount: val,
                    vaultName
                };
            }
        }
        // 8. Consultar Caixinhas / Total Guardado
        if (clean === 'caixinhas' ||
            clean === 'caixinha' ||
            clean === 'cofrinho' ||
            clean === 'investimentos' ||
            clean === 'investimento' ||
            clean.includes('minhas caixinhas') ||
            clean.includes('quanto guardei') ||
            clean.includes('quanto tenho guardado') ||
            clean.includes('meus investimentos')) {
            return {
                intent: 'vault_query'
            };
        }
        // 9. Adicionar Dinheiro / Entrada Direta ("adicionar 500", "depositei 1000")
        if ((clean.startsWith('adicionar') || clean.startsWith('depositei') || clean.startsWith('deposito') || clean.startsWith('depósito')) &&
            !clean.includes('saldo inicial')) {
            const val = this.extractAmount(clean);
            if (val) {
                return {
                    intent: 'add_money',
                    targetAmount: val
                };
            }
        }
        // 10. Tirar / Retirar Dinheiro ("retirar 200", "saque 150", "tirei 100")
        if (clean.startsWith('retirar') || clean.startsWith('retirei') || clean.startsWith('saque') || clean.startsWith('saquei')) {
            const val = this.extractAmount(clean);
            if (val) {
                return {
                    intent: 'remove_money',
                    targetAmount: val
                };
            }
        }
        // 11. Consultas de Relatório / Divisão de quem gastou
        if (clean.includes('quem gastou') || clean.includes('divisao') || clean.includes('divisão') || clean.includes('por pessoa')) {
            return {
                intent: 'report_query',
                queryPeriod: 'by_person'
            };
        }
        // 12. Consultas de Saldo / Extrato
        if (clean.startsWith('saldo') ||
            clean.includes('quanto gastei') ||
            clean.includes('quanto gastamos') ||
            clean.includes('resumo') ||
            clean.includes('extrato') ||
            clean.includes('balanco') ||
            clean.includes('balanço')) {
            let period = 'month';
            if (clean.includes('hoje'))
                period = 'today';
            if (clean.includes('semana'))
                period = 'week';
            return {
                intent: 'balance_query',
                queryPeriod: period
            };
        }
        // 13. Comandos de Ajuda
        if (clean === 'ajuda' || clean === 'help' || clean === 'como funciona' || clean === 'menu') {
            return {
                intent: 'help'
            };
        }
        // 5. Tenta extrair transação financeira
        const tx = this.extractTransaction(raw, clean);
        if (tx) {
            return {
                intent: 'transaction',
                transaction: tx
            };
        }
        return {
            intent: 'unknown',
            explanation: 'Não entendi o lançamento. Você pode mandar por exemplo: "Almoço 35 no débito" ou "Gasolina 100".'
        };
    }
    extractAmount(text) {
        const match = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,\.]\d{1,2})?|\d+)\s*(?:reais|conto)?/i);
        if (!match)
            return null;
        let str = match[1];
        if (str.includes('.') && str.includes(',')) {
            str = str.replace(/\./g, '').replace(',', '.');
        }
        else if (str.includes(',')) {
            str = str.replace(',', '.');
        }
        const val = parseFloat(str);
        return isNaN(val) ? null : val;
    }
    extractTransaction(raw, clean) {
        // Detectar se é receita/entrada
        const isIncomeKeywords = ['recebi', 'salario', 'salário', 'caiu', 'freela', 'vendi', 'entrada', 'recebimento'];
        const isIncome = isIncomeKeywords.some(kw => clean.includes(kw));
        const amount = this.extractAmount(clean);
        if (!amount || amount <= 0)
            return null;
        // Detectar método de pagamento
        let paymentMethod = 'PIX';
        if (clean.includes('credito') || clean.includes('crédito'))
            paymentMethod = 'Cartão de Crédito';
        else if (clean.includes('debito') || clean.includes('débito'))
            paymentMethod = 'Cartão de Débito';
        else if (clean.includes('dinheiro'))
            paymentMethod = 'Dinheiro';
        else if (clean.includes('pix'))
            paymentMethod = 'PIX';
        else if (clean.includes('boleto'))
            paymentMethod = 'Boleto';
        // Detectar categoria
        let category = isIncome ? 'Renda Extra / Salário' : 'Outros';
        for (const rule of CATEGORY_RULES) {
            if (rule.keywords.some(kw => clean.includes(kw))) {
                category = rule.category;
                break;
            }
        }
        // Criar descrição amigável (remove o valor da mensagem para gerar o resumo)
        let description = raw
            .replace(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,\.]\d{1,2})?|\d+)\s*(?:reais|conto)?/gi, '')
            .replace(/reais|conto|no debito|no débito|no credito|no crédito|via pix|no pix|recebi|salario|salário/gi, '')
            .trim();
        if (!description || description.length < 2) {
            description = category;
        }
        else {
            // Capitalizar primeira letra
            description = description.charAt(0).toUpperCase() + description.slice(1);
        }
        return {
            type: (isIncome ? 'income' : 'expense'),
            amount,
            category,
            paymentMethod,
            description
        };
    }
}
export const aiParser = new MessageAIParser();
