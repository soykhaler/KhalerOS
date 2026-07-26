import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = process.env.KHALEROS_URL || 'http://127.0.0.1:8765/';
const chromium = process.env.CHROMIUM_BIN || '/snap/bin/chromium';
const windowSize = process.env.KHALEROS_WINDOW_SIZE || '1280,800';
const profile = await mkdtemp(join(process.cwd(), '.chromium-smoke-'));
const browserLog = [];
const browser = spawn(chromium, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-allow-origins=*',
  '--remote-debugging-port=0',
  `--window-size=${windowSize}`,
  `--user-data-dir=${profile}`,
  baseUrl,
], { stdio: ['ignore', 'ignore', 'pipe'] });
browser.stderr.on('data', chunk => browserLog.push(String(chunk)));

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function waitForValue(readValue, timeout = 15000, interval = 100) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await readValue();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(interval);
  }
  throw lastError || new Error(`Tiempo de espera agotado después de ${timeout} ms`);
}

class DevToolsClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method) this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }

  close() { this.socket.close(); }
}

let client;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  const port = await waitForValue(async () => {
    const contents = await readFile(portFile, 'utf8');
    return Number(contents.split('\n')[0]);
  });
  const target = await waitForValue(async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
    return targets.find(item => item.type === 'page' && item.url.startsWith(baseUrl));
  });

  client = new DevToolsClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await delay(1600);

  const initial = await client.evaluate(`({
    bootHidden: document.querySelector('#boot').classList.contains('hidden'),
    launcherInert: document.querySelector('#launcher').inert,
    appCount: document.querySelectorAll('.launcher-app').length,
    brightness: document.querySelector('#brightness').value
  })`);
  assert(initial.bootHidden, 'La pantalla de arranque no se cerró');
  assert(initial.launcherInert, 'El lanzador oculto debe estar fuera del orden de foco');
  assert(initial.appCount === 12, 'El lanzador no contiene todas las aplicaciones');
  assert(initial.brightness === '100', 'El brillo predeterminado no es 100%');

  await client.evaluate(`localStorage.setItem('khalerAccent', '{valor-corrupto'); location.reload()`);
  await delay(1700);
  assert(await client.evaluate(`document.querySelectorAll('.launcher-app').length === 12`), 'Un valor corrupto en localStorage impide arrancar KhalerOS');

  const calculator = await client.evaluate(`(() => {
    document.querySelector('#launcherButton').click();
    [...document.querySelectorAll('.launcher-app')].find(button => button.textContent.includes('Calculadora')).click();
    const press = key => document.querySelector('[data-calc="' + key + '"]').click();
    press('C'); press('8'); press('/'); press('0'); press('=');
    const error = document.querySelector('#calcDisplay').textContent;
    press('7');
    const recovered = document.querySelector('#calcDisplay').textContent;
    press('C'); press('0'); press('.'); press('1'); press('+'); press('0'); press('.'); press('2'); press('=');
    const precise = document.querySelector('#calcDisplay').textContent;
    press('=');
    const repeated = document.querySelector('#calcDisplay').textContent;
    return { error, recovered, precise, repeated };
  })()`);
  assert(calculator.error === 'Error', 'La división entre cero no muestra un error');
  assert(calculator.recovered === '7', 'La calculadora no se recupera después de un error');
  assert(calculator.precise === '0.3', 'La calculadora muestra ruido de coma flotante');
  assert(calculator.repeated === '0.5', 'La repetición de la última operación no funciona');

  const focusState = await client.evaluate(`(() => {
    document.querySelector('[data-panel-app="browser"]').click();
    const originalClick=HTMLAnchorElement.prototype.click;
    let openedUrl='';HTMLAnchorElement.prototype.click=function(){openedUrl=this.href};
    document.querySelector('#browserUrl').value='https://example.com/';
    document.querySelector('#browserGo').click();
    HTMLAnchorElement.prototype.click=originalClick;
    const externalLanding=document.querySelector('#browserPage').textContent.includes('pestaña real')&&document.querySelector('#browserFrame').hidden;
    document.querySelector('[data-panel-app="consoleapp"]').click();
    document.querySelector('#win-consoleapp [data-window="min"]').click();
    const afterMinimize = document.querySelector('.window.active')?.dataset.app;
    document.querySelector('#win-browser [data-window="close"]').click();
    const afterClose = document.querySelector('.window.active')?.dataset.app;
    return { afterMinimize, afterClose, openedUrl, externalLanding };
  })()`);
  assert(focusState.openedUrl === 'https://example.com/' && focusState.externalLanding, 'El navegador no abre la web real desde GitHub Pages');
  assert(focusState.afterMinimize === 'browser', 'Minimizar no activa la siguiente ventana');
  assert(focusState.afterClose === 'calculator', 'Cerrar no devuelve el foco a la ventana superior');

  const desktopToggle = await client.evaluate(`(() => {
    document.querySelector('#showDesktop').click();
    const hidden = [...document.querySelectorAll('.window.open')].every(win => win.style.display === 'none');
    document.querySelector('#showDesktop').click();
    const restored = document.querySelector('#win-calculator').style.display !== 'none';
    return { hidden, restored };
  })()`);
  assert(desktopToggle.hidden && desktopToggle.restored, 'Mostrar escritorio no restaura las ventanas');

  await client.evaluate(`document.querySelector('.desktop-icon[data-app="spectrum"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await waitForValue(() => client.evaluate(`Boolean(document.querySelector('#spectrumFrame').contentDocument?.querySelector('#startEmu'))`));
  await client.evaluate(`document.querySelector('#spectrumFrame').contentDocument.querySelector('#startEmu').click()`);
  const spectrumStatus = await waitForValue(async () => {
    const state = await client.evaluate(`(() => { const doc=document.querySelector('#spectrumFrame').contentDocument; return { text:doc?.querySelector('#status')?.textContent, ready:doc?.querySelector('#dot')?.classList.contains('ready') } })()`);
    return state.ready && state;
  }, 20000, 200);
  assert(spectrumStatus.text.includes('preparado'), 'JSSpeccy no terminó de iniciar con los recursos locales');

  await client.evaluate(`document.querySelector('#spectrumFrame').contentDocument.querySelector('.game').click()`);
  const gameStatus = await waitForValue(async () => {
    const state = await client.evaluate(`(() => { const doc=document.querySelector('#spectrumFrame').contentDocument; return { text:doc.querySelector('#status').textContent, active:doc.querySelector('.game').classList.contains('active') } })()`);
    return state.active && state.text.includes('ejecutándose') && state;
  });
  assert(gameStatus.text.includes('Parkour Labs'), 'La cinta instalada no se abrió en el emulador');
  await delay(500);

  await client.evaluate(`document.querySelector('#win-spectrum [data-window="close"]').click();document.querySelector('.desktop-icon[data-app="pixel"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await waitForValue(() => client.evaluate(`(() => { const frame=document.querySelector('#pixelFrame');const doc=frame.contentDocument;return doc?.readyState==='complete'&&Boolean(doc.querySelector('#pixelCanvas')) })()`));
  const pixelState = await client.evaluate(`(async () => {
    const frame=document.querySelector('#pixelFrame'),win=frame.contentWindow,doc=frame.contentDocument;
    doc.querySelector('[data-tool="fill"]').click();
    const canvas=doc.querySelector('#pixelCanvas'),rect=canvas.getBoundingClientRect();
    canvas.dispatchEvent(new win.PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:71,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
    const painted=doc.querySelector('#colorCount').textContent;
    doc.querySelector('#undoButton').click();
    const undone=doc.querySelector('#colorCount').textContent;
    doc.querySelector('#redoButton').click();
    const redone=doc.querySelector('#colorCount').textContent;
    const originalConfirm=win.confirm;win.confirm=()=>true;
    const size=doc.querySelector('#sizeSelect');size.value='16';size.dispatchEvent(new Event('change',{bubbles:true}));
    win.confirm=originalConfirm;
    let download='';const originalClick=win.HTMLAnchorElement.prototype.click;
    win.HTMLAnchorElement.prototype.click=function(){download=this.download};
    doc.querySelector('#exportButton').click();
    const deadline=Date.now()+3000;while(!download&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
    win.HTMLAnchorElement.prototype.click=originalClick;
    await new Promise(resolve=>setTimeout(resolve,350));
    const saved=JSON.parse(win.localStorage.getItem('khaleros.pixel.project.v1'));
    return {painted,undone,redone,width:canvas.width,height:canvas.height,download,savedSize:saved?.size,savedPixels:saved?.pixels?.length};
  })()`);
  assert(pixelState.painted === '1 color' && pixelState.undone === '0 colores' && pixelState.redone === '1 color', 'Dibujar, deshacer o rehacer falla en Pixel Art');
  assert(pixelState.width === 16 && pixelState.height === 16 && pixelState.savedSize === 16 && pixelState.savedPixels > 0, 'Pixel Art no redimensiona o persiste el proyecto');
  assert(pixelState.download === 'pixel-art-16x16.png', 'Pixel Art no exporta un PNG con el tamaño correcto');

  await client.evaluate(`document.querySelector('#win-pixel [data-window="close"]').click();document.querySelector('.desktop-icon[data-app="modeler"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await waitForValue(() => client.evaluate(`(() => { const doc=document.querySelector('#modelerFrame').contentDocument;const canvas=doc?.querySelector('#sceneCanvas');return doc?.readyState==='complete'&&canvas?.width>0&&!doc.querySelector('#fatalError:not([hidden])') })()`), 20000, 150);
  const modelerState = await client.evaluate(`(async () => {
    const frame=document.querySelector('#modelerFrame'),win=frame.contentWindow,doc=frame.contentDocument;
    doc.querySelector('[data-add="box"]').click();
    const positionX=doc.querySelector('[data-transform="position"][data-axis="x"]');positionX.value='2.5';positionX.dispatchEvent(new Event('change',{bubbles:true}));
    const color=doc.querySelector('#colorInput');color.value='#ef4444';color.dispatchEvent(new Event('input',{bubbles:true}));
    doc.querySelector('#duplicateButton').click();
    const countAfterDuplicate=doc.querySelector('#objectCount').textContent;
    doc.querySelector('#deleteButton').click();
    const countAfterDelete=doc.querySelector('#objectCount').textContent;
    let href='',download='';const originalClick=win.HTMLAnchorElement.prototype.click;
    win.HTMLAnchorElement.prototype.click=function(){href=this.href;download=this.download};
    doc.querySelector('#exportButton').click();
    const deadline=Date.now()+8000;while(!href&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));
    let signature='',version=0,declaredLength=0,actualLength=0;
    if(href){const bytes=new Uint8Array(await fetch(href).then(response=>response.arrayBuffer()));actualLength=bytes.length;signature=String.fromCharCode(...bytes.slice(0,4));const view=new DataView(bytes.buffer);version=view.getUint32(4,true);declaredLength=view.getUint32(8,true)}
    win.HTMLAnchorElement.prototype.click=originalClick;
    return {countAfterDuplicate,countAfterDelete,download,signature,version,declaredLength,actualLength,status:doc.querySelector('#statusMessage').textContent};
  })()`);
  assert(modelerState.countAfterDuplicate === '2 objetos' && modelerState.countAfterDelete === '1 objeto', 'Duplicar o eliminar falla en el Modelador 3D');
  assert(modelerState.download.endsWith('.glb') && modelerState.signature === 'glTF' && modelerState.version === 2 && modelerState.declaredLength === modelerState.actualLength, 'El Modelador 3D no genera un GLB 2.0 válido');

  const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
  const failedLocalRequests = client.events.filter(event => event.method === 'Network.loadingFailed' && event.params.requestId);
  assert(exceptions.length === 0, `Se detectaron ${exceptions.length} excepciones JavaScript`);
  assert(failedLocalRequests.length === 0, `Se detectaron ${failedLocalRequests.length} cargas fallidas`);

  console.log('Smoke test OK: escritorio, navegador, Spectrum, Pixel Art y Modelador 3D');
} catch (error) {
  console.error(error.stack || error);
  const relevantLog = browserLog.join('').split('\n').filter(line => /ERROR|SEVERE|Failed to load/i.test(line)).slice(-20);
  if (relevantLog.length) console.error(relevantLog.join('\n'));
  process.exitCode = 1;
} finally {
  client?.close();
  if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),delay(3000)])}
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
