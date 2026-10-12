import dotenv from 'dotenv';
dotenv.config();

const ZAPI_INSTANCE_ID = '3FA7E27F394B01FCA004A2F817CD9F04';
const ZAPI_TOKEN = 'F22E48CB54D35D012715492A';
const ZAPI_CLIENT_TOKEN = 'F94b6c825d19946f38aa6a251bdcae02cS';
const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

export interface WhatsAppButton {
  id: string;
  label: string;
}

export class WhatsAppClient {
  /**
   * Envia uma mensagem de texto simples para qualquer número de WhatsApp
   * @param phone Telefone no formato 5511999998888
   * @param message Texto a ser enviado
   */
  public async sendMessage(phone: string, message: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    try {
      console.log(`📡 [Z-API REAL] Disparando texto para ${fullPhone}...`);

      const res = await fetch(`${ZAPI_BASE}/send-text`, {
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

  /**
   * Envia mensagem com Botões de Resposta Rápida (Quick Reply Buttons)
   * Se os botões falharem por restrição do WhatsApp, faz fallback automático para texto.
   * @param phone Telefone no formato 5511999998888
   * @param message Texto principal da mensagem
   * @param buttons Lista de até 3 botões interativos
   */
  public async sendButtonList(phone: string, message: string, buttons: WhatsAppButton[]): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    if (!buttons || buttons.length === 0) {
      return this.sendMessage(fullPhone, message);
    }

    try {
      console.log(`📡 [Z-API BOTÕES] Enviando ${buttons.length} botões para ${fullPhone}...`);

      const res = await fetch(`${ZAPI_BASE}/send-button-list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': ZAPI_CLIENT_TOKEN
        },
        body: JSON.stringify({
          phone: fullPhone,
          message: message,
          buttonList: {
            buttons: buttons.slice(0, 3) // Limite nativo do WhatsApp: até 3 botões
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        console.log('✅ [Z-API Botões Enviados com Sucesso]:', data);
        return true;
      } else {
        const errData = await res.text();
        console.warn('⚠️ [Z-API Botões Não Aceitos - Fallback]:', errData);
        return this.sendMessage(fullPhone, message);
      }
    } catch (error) {
      console.error('❌ [Z-API Erro Botões - Fallback para Texto]:', error);
      return this.sendMessage(fullPhone, message);
    }
  }
}

export const whatsappClient = new WhatsAppClient();
