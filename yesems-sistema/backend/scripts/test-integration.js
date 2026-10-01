// Pruebas locales con PostgreSQL real. Nunca carga .env ni conecta a la base de
// desarrollo/producción: inicializa un cluster temporal y lo apaga al terminar.
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const net = require('net');
const crypto = require('crypto');

const exec = promisify(execFile);
const backend = path.resolve(__dirname, '..');
const defaultBin = process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '';
const pgBin = process.env.PG_BIN || defaultBin;
const executable = (name) => path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name);

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function pg(name, args) {
  return exec(executable(name), args, { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
}

async function main() {
  const tempParent = path.resolve(os.tmpdir());
  const workspace = await fs.mkdtemp(path.join(tempParent, 'yesems-progress-test-'));
  const data = path.join(workspace, 'postgres');
  const log = path.join(workspace, 'postgres.log');
  let started = false;
  try {
    console.log('Preparando PostgreSQL temporal aislado (solo loopback)...');
    await pg('initdb', ['-D', data, '-U', 'yesems_test_admin', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    const port = await availablePort();
    await pg('pg_ctl', ['-D', data, '-l', log, '-w', '-t', '45', '-o', `-p ${port} -h 127.0.0.1 -c fsync=off`, 'start']);
    started = true;
    await pg('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'yesems_test_admin', 'yesems_progress_test']);
    const databaseUrl = `postgresql://yesems_test_admin@127.0.0.1:${port}/yesems_progress_test`;
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      TEST_PG_DATA_DIR: data,
      TEST_UPLOADS_DIR: path.join(workspace, 'uploads'),
      YES_EMS_ISOLATED_TEST: '1',
      JWT_SECRET: crypto.randomBytes(48).toString('hex'),
      DB_NAME: 'yesems_progress_test',
      DB_HOST: '127.0.0.1',
      DB_PORT: String(port),
      DB_USER: 'yesems_test_admin',
      DB_PASSWORD: '',
      CLOUDINARY_URL: '',
      RESEND_API_KEY: '',
      AUTH_EMAIL_FROM: '',
      GOOGLE_CLIENT_ID: '',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
      INITIAL_ADMIN_NAME: '',
      INITIAL_ADMIN_LASTNAME: '',
      INITIAL_ADMIN_EMAIL: '',
      INITIAL_ADMIN_PASSWORD: '',
    };
    console.log('Ejecutando suites de integración HTTP/PDF y navegador contra la base temporal...');
    const cliArgs = process.argv.slice(2);
    const selectedSuite = cliArgs.find((arg) => arg.startsWith('--suite='));
    const suite = selectedSuite ? selectedSuite.slice('--suite='.length) : 'integration.test.js';
    if (!/^[a-zA-Z0-9_.-]+integration\.test\.js$/.test(suite) && suite !== 'integration.test.js') {
      throw new Error('Usa --suite=nombre.integration.test.js para seleccionar una suite.');
    }
    const extraArgs = cliArgs.filter((arg) => arg !== selectedSuite);
    const args = [require.resolve('jest/bin/jest'), '--runInBand', `--testPathPatterns=${suite}`, ...extraArgs];
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: backend, env, windowsHide: true, stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === null) console.error('El proceso de pruebas terminó sin código de salida. Señal:', signal || 'desconocida');
        resolve(code ?? 1);
      });
    });
    process.exitCode = exitCode;
  } catch (error) {
    console.error('No se pudo completar la prueba aislada:', error.stderr || error.message);
    console.error('Verifica los binarios de PostgreSQL; puedes indicar su carpeta con PG_BIN.');
    process.exitCode = 1;
  } finally {
    let safeToClean = !started;
    if (started) {
      try {
        await pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']);
        safeToClean = true;
      } catch (error) {
        console.error('No se pudo apagar el cluster temporal; se conserva para revisión:', workspace);
        console.error(error.stderr || error.message);
        process.exitCode = 1;
      }
    }
    // Verificar el destino absoluto antes de borrar ÚNICAMENTE el temporal creado.
    const resolved = path.resolve(workspace);
    if (safeToClean && path.dirname(resolved) === tempParent && path.basename(resolved).startsWith('yesems-progress-test-')) {
      await fs.rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      console.log('Cluster y documentos temporales de prueba eliminados. Datos del proyecto conservados.');
    }
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
