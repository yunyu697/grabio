// 通过 CDP 在页面里点一个元素：只走 DevTools 协议，不移动真实鼠标、不向桌面注入输入。
// 用法：node tools/Click-FwUi.mjs <debugPort> <CSS 选择器>
// 退出码：0 点到了；1 元素不存在/超时；2 参数错误。
const port = Number(process.argv[2]);
const selector = process.argv[3];
if (!port || !selector) {
  console.error('用法: node tools/Click-FwUi.mjs <debugPort> <CSS 选择器>');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget(deadline) {
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && /tauri\.localhost/.test(t.url || ''));
      if (page) return page;
    } catch { /* 调试端口还没起 */ }
    await sleep(150);
  }
  return null;
}

const target = await findTarget(Date.now() + 60000);
if (!target) {
  console.error('调试目标未出现');
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

let seq = 1;
function call(method, params) {
  const id = seq++;
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMsg);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function clickOnce() {
  const expr = `(() => { const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return 'missing';
    el.click();
    return 'ok';
  })()`;
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result && r.result.value;
}

let result = 'missing';
const deadline = Date.now() + 20000;
while (Date.now() < deadline) {
  try {
    result = await clickOnce();
    if (result === 'ok') break;
  } catch { /* 页面还在导航 */ }
  await sleep(200);
}
ws.close();
if (result !== 'ok') {
  console.error(`没找到可点的元素: ${selector}`);
  process.exit(1);
}
console.log(`clicked ${selector}`);
