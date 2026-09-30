const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

// The browser never contacts the public YES EMS API: CDP fulfills each API
// request with the response from the isolated integration server on loopback.
class BrowserClient {
  constructor(socket, processHandle, profile, origin) {
    this.socket = socket;
    this.process = processHandle;
    this.profile = profile;
    this.origin = origin;
    this.pending = new Map();
    this.listeners = new Map();
    this.nextId = 0;
    this.errors = [];
    this.requests = [];
    this.blockedExternal = [];
    socket.addEventListener('message', (message) => {
      const event = JSON.parse(String(message.data));
      if (event.id) {
        const pending = this.pending.get(event.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(event.id);
        if (event.error) pending.reject(new Error(`${pending.method}: ${event.error.message}`));
        else pending.resolve(event.result);
      } else {
        for (const callback of this.listeners.get(event.method) || []) {
          Promise.resolve().then(() => callback(event.params)).catch((error) => this.errors.push(error.message));
        }
      }
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
  }

  command(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 15000);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  async waitFor(expression, message = 'browser condition', timeout = 15000) {
    const end = Date.now() + timeout;
    let lastError;
    while (Date.now() < end) {
      try { if (await this.evaluate(expression)) return; } catch (error) { lastError = error; }
      await delay(80);
    }
    throw new Error(`Timed out waiting for ${message}${lastError ? `: ${lastError.message}` : ''}`);
  }

  async navigate(url) {
    await this.command('Page.navigate', { url });
    await this.waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`, `page ${new URL(url).pathname}`);
  }

  async click(selector) {
    return this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element || element.matches(':disabled')) throw new Error('Missing or disabled control: ' + ${JSON.stringify(selector)});
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      element.click();
    })()`);
  }

  async fill(selector, value) {
    return this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element || element.matches(':disabled')) throw new Error('Missing or disabled field: ' + ${JSON.stringify(selector)});
      element.value = ${JSON.stringify(String(value))};
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }

  async viewport(width, height) {
    await this.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await this.command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  }

  async screenshot(file) {
    const result = await this.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buffer = Buffer.from(result.data, 'base64');
    if (file) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, buffer); }
    return buffer;
  }

  async interceptRequest({ requestId, request }) {
    const url = new URL(request.url);
    if (url.origin === this.origin || ['data:', 'blob:', 'about:'].includes(url.protocol)) {
      await this.command('Fetch.continueRequest', { requestId });
      return;
    }
    if (url.origin !== 'https://yesems-sistema-1.onrender.com' || !url.pathname.startsWith('/api/')) {
      this.blockedExternal.push(url.origin);
      await this.command('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      return;
    }
    const headers = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (['authorization', 'content-type'].includes(name.toLowerCase())) headers[name] = value;
    }
    const response = await fetch(`${this.origin}${url.pathname}${url.search}`, {
      method: request.method, headers,
      ...(request.postData === undefined || ['GET', 'HEAD'].includes(request.method) ? {} : { body: request.postData }),
      redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    this.requests.push({ method: request.method, path: url.pathname, status: response.status });
    const responseHeaders = [
      { name: 'Content-Type', value: response.headers.get('content-type') || 'application/json' },
      { name: 'Access-Control-Allow-Origin', value: this.origin },
      { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type' },
      { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
    ];
    // A redirect outside loopback must never escape this test boundary.
    if (response.status >= 300 && response.status < 400) throw new Error(`Unexpected API redirect while testing ${url.pathname}`);
    await this.command('Fetch.fulfillRequest', {
      requestId, responseCode: response.status, responseHeaders,
      body: Buffer.from(await response.arrayBuffer()).toString('base64'),
    });
  }

  async close() {
    try { await this.command('Browser.close'); } catch { /* Process may have closed first. */ }
    this.socket.close();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Browser closed'));
    }
    this.pending.clear();
    if (this.process.exitCode === null) {
      await Promise.race([new Promise((resolve) => this.process.once('exit', resolve)), delay(3000)]);
      if (this.process.exitCode === null) this.process.kill();
    }
    await removeProfile(this.profile);
  }
}

async function removeProfile(profile) {
  const resolved = path.resolve(profile);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('yesems-edge-test-')) {
    throw new Error('Refusing to delete a directory that is not this test browser profile.');
  }
  await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

async function startBrowser(origin) {
  const exe = process.env.TEST_BROWSER_EXECUTABLE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  await fs.access(exe);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'yesems-edge-test-'));
  const browserProcess = spawn(exe, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  let processError;
  browserProcess.on('error', (error) => { processError = error; });
  try {
    const limit = Date.now() + 20000;
    let port;
    while (Date.now() < limit) {
      if (processError) throw processError;
      try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { /* Starting. */ }
      if (port) break;
      if (browserProcess.exitCode !== null) throw new Error('Headless browser exited before opening DevTools.');
      await delay(100);
    }
    if (!port) throw new Error('Headless browser did not open DevTools in time.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('Headless browser has no page target.');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('Could not connect to headless browser DevTools.')), { once: true });
    });
    const client = new BrowserClient(socket, browserProcess, profile, origin);
    client.on('Fetch.requestPaused', (event) => client.interceptRequest(event));
    client.on('Page.javascriptDialogOpening', () => client.command('Page.handleJavaScriptDialog', { accept: true }));
    client.on('Runtime.exceptionThrown', (event) => client.errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await client.viewport(1440, 1000);
    return client;
  } catch (error) {
    browserProcess.kill();
    await delay(300);
    await removeProfile(profile);
    throw error;
  }
}

module.exports = { startBrowser };
