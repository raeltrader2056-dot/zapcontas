import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const srcPublic = path.join(rootDir, 'src', 'public');
const distPublic = path.join(rootDir, 'dist', 'public');

if (fs.existsSync(srcPublic)) {
  fs.mkdirSync(distPublic, { recursive: true });
  fs.cpSync(srcPublic, distPublic, { recursive: true, force: true });
  console.log('✅ [Build] Arquivos estáticos copiados com sucesso para dist/public');
} else {
  console.warn('⚠️ [Build] src/public não encontrado');
}
