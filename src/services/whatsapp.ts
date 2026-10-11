import dotenv from 'dotenv';
dotenv.config();

const ZAPI_URL = 'https://api.z-api.io/instances/3FA7E27F394B01FCA004A2F817CD9F04/token/F22E48CB54D35D012715492A/send-text';
const ZAPI_CLIENT_TOKEN = 'F94b6c825d19946f38aa6a251bdcae02cS';

export class WhatsAppClient {
  /**
   * Envia uma mensagem de texto real para qualquer número de WhatsApp
   * @param phone Telefone no formato 5511999998888
   * @param message Texto a ser enviado
   */
  public async sendMessage(phone: string, message: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    try {
      console.log(`📡 [Z-API REAL] Disparando mensagem real para ${fullPhone}...`);

      const res = await fetch(ZAPI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: fullPhone,
          message: message
        })
      });

      const data = await res.json();
      console.log('✅ [Z-API Resposta Oficial]:', data);
      return res.ok;
    } catch (error) {
      console.error('❌ [Z-API Erro no Envio]:', error);
      return false;
    }
  }
}

export const whatsappClient = new WhatsAppClient();
