import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { router as apiRouter } from './routes/api.js';
import { botEngine } from './services/botEngine.js';
import { startPublicTunnel } from './services/tunnel.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
// Servir arquivos estáticos (Dashboard e Simulador)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
// Rotas da API e Webhook
app.use(apiRouter);
// Rota amigável para o Dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(publicDir, 'dashboard.html'));
});
// Rota da Landing Page de Alta Conversão
app.get('/lp', (req, res) => {
    res.sendFile(path.join(publicDir, 'lp.html'));
});
// Rota de Login Seguro por SMS (WebOTP & Supabase)
app.get('/login', (req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
});
// Rota de Checkout Seguro PIX / Cartão
app.get('/checkout', (req, res) => {
    res.sendFile(path.join(publicDir, 'checkout.html'));
});
// Rota raiz (Landing Page Oficial para novos usuários mobile)
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'lp.html'));
});
// Simulador exclusivo de desenvolvimento (para você testar no PC)
app.get('/simulator', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});
app.listen(PORT, async () => {
    botEngine.setBaseUrl(`http://localhost:${PORT}`);
    console.log(`\n======================================================`);
    console.log(`⚡ ZapContas rodando com sucesso!`);
    console.log(`📱 Simulador WhatsApp:  http://localhost:${PORT}`);
    console.log(`📊 Dashboard Financeiro: http://localhost:${PORT}/dashboard?token=demo`);
    console.log(`======================================================\n`);
    // Inicializa túnel público HTTPS e sincroniza webhook com Z-API
    await startPublicTunnel(Number(PORT));
});
