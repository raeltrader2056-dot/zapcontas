import localtunnel from 'localtunnel';
import { botEngine } from './botEngine.js';

const ZAPI_INSTANCE_ID = '3FA7E27F394B01FCA004A2F817CD9F04';
const ZAPI_TOKEN = 'F22E48CB54D35D012715492A';
const ZAPI_CLIENT_TOKEN = 'F94b6c825d19946f38aa6a251bdcae02cS';

/**
 * Registra o webhook HTTPS no painel oficial da Z-API via API REST
 */
export async function registerZapiWebhook(webhookUrl: string): Promise<boolean> {
  const updateUrl = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/update-webhook-received`;
  try {
    console.log(`📡 [Z-API] Registrando webhook oficial em: ${webhookUrl}`);
    const res = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN
      },
      body: JSON.stringify({ value: webhookUrl })
    });
    const data = await res.json();
    console.log('✅ [Z-API Webhook Confirmado]:', data);
    return true;
  } catch (error) {
    console.error('❌ [Z-API Falha no Registro do Webhook]:', error);
    return false;
  }
}

/**
 * Inicia túnel público HTTPS e sincroniza automaticamente com a Z-API
 */
export async function startPublicTunnel(port: number = 3000): Promise<void> {
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
  const isProduction = process.env.NODE_ENV === 'production' || isRender;

  // URL pública oficial do ZapContas em produção
  const targetBaseUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || (isProduction ? 'https://zapcontas.onrender.com' : 'https://zapcontas.onrender.com');

  if (targetBaseUrl && !targetBaseUrl.includes('localhost') && !process.env.FORCE_LOCALTUNNEL) {
    console.log(`🌐 [Ambiente Oficial ZapContas]: ${targetBaseUrl}`);
    botEngine.setBaseUrl(targetBaseUrl);
    await registerZapiWebhook(`${targetBaseUrl}/webhook/whatsapp`);
    return;
  }

  try {
    console.log('🚀 Criando túnel HTTPS para testes locais...');
    const tunnel = await localtunnel({ port });
    console.log(`\n======================================================`);
    console.log(`🌐 TÚNEL HTTPS ATIVO: ${tunnel.url}`);
    console.log(`📡 WEBHOOK Z-API:     ${tunnel.url}/webhook/whatsapp`);
    console.log(`======================================================\n`);

    botEngine.setBaseUrl(tunnel.url);

    // Registra o webhook automaticamente na Z-API
    await registerZapiWebhook(`${tunnel.url}/webhook/whatsapp`);

    tunnel.on('close', () => {
      console.warn('⚠️ [Túnel HTTPS Encerrado] Reiniciando túnel em 4 segundos...');
      setTimeout(() => startPublicTunnel(port), 4000);
    });

    tunnel.on('error', (err) => {
      console.error('❌ [Túnel HTTPS Erro]:', err);
    });
  } catch (err) {
    console.error('❌ Erro ao inicializar túnel público local:', err);
    // Em caso de falha no localtunnel, assegura que a URL do Render continue salva no Z-API
    await registerZapiWebhook('https://zapcontas.onrender.com/webhook/whatsapp');
  }
}
