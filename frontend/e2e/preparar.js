// Antes de las pruebas: deja la base de PRUEBAS limpia y con datos de ejemplo (scripts/preparar_base_e2e.py).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function preparar() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  execFileSync(process.env.E2E_PYTHON || 'python', ['scripts/preparar_base_e2e.py'], {
    cwd: raiz,
    stdio: 'inherit',
    env: { ...process.env },
  });
}
