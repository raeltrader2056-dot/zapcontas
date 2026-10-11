import { db } from '../database/db.js';

export interface CheckoutSession {
  checkoutUrl: string;
  qrCodePix: string;
  copyPastePix: string;
  amount: number;
  planName: string;
}

export class BillingService {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /**
   * Gera um link de pagamento (PIX ou Cartão) simulado/real integrado com Asaas / Mercado Pago
   */
  public createCheckout(accountId: string, plan: 'individual_monthly' | 'couple_annual'): CheckoutSession {
    const isAnnual = plan === 'couple_annual';
    const amount = isAnnual ? 119.00 : 14.90;
    const planName = isAnnual ? 'ZapContas Pro Casal/Família (Anual)' : 'ZapContas Pro Individual (Mensal)';

    // Código PIX Copia e Cola (padrão EMV QR Code simulado para demonstração)
    const copyPastePix = `00020126580014br.gov.bcb.pix0136zapcontas-${accountId}-payment520400005303986540${amount.toFixed(2)}5802BR5916ZAPCONTAS TECN6009SAO PAULO62070503***6304E1F2`;

    const checkoutUrl = `${this.baseUrl}/checkout?token=${accountId}&plan=${plan}`;

    return {
      checkoutUrl,
      qrCodePix: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(copyPastePix)}`,
      copyPastePix,
      amount,
      planName
    };
  }

  /**
   * Processa confirmação de webhook do gateway de pagamento
   */
  public handlePaymentWebhook(accountId: string, planType: 'individual_monthly' | 'couple_annual') {
    const updated = db.activateSubscription(accountId, planType);
    return updated;
  }
}

export const billingService = new BillingService();
