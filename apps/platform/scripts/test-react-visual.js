const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run({ origin, legacyOrigin, admin, customer }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tikka-visual-"));
  const output = path.resolve(__dirname, "../../../artifacts/r6-1");
  fs.mkdirSync(output, { recursive: true });
  const browser = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "--disable-gpu", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    let port;
    for (let i = 0; i < 200 && !port; i++) {
      try { port = fs.readFileSync(portFile, "utf8").split("\n")[0]; } catch {}
      if(!port) await pause(50);
    }
    if(!port) throw new Error('Browser debugging port unavailable.');
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    let loads = 0;
    const pending = new Map();
    socket.onmessage = ({ data }) => {
      const event = JSON.parse(data);
      if (event.method === 'Page.loadEventFired') loads++;
      if (!event.id) return;
      const item = pending.get(event.id);
      if (!item) return;
      pending.delete(event.id);
      if (event.error) item.reject(new Error(JSON.stringify(event.error))); else item.resolve(event.result);
    };
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const cdp = (method, params) => send(method, params, sessionId);
    await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
    await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const evaluate = async (expression) => {
      const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async (expression) => {
      for (let i = 0; i < 400; i++) { if (await evaluate(expression)) return; await pause(50); }
      throw new Error(`Timed out: ${expression}; page: ${await evaluate("location.href+' '+document.body.innerText.slice(0,500)")}`);
    };
    const navigate = async (url, allowRedirect = false) => {
      await cdp('Page.navigate', {url:'about:blank'});
      await wait("location.href === 'about:blank'");
      const previous = loads;
      await cdp('Page.navigate', {url});
      {
        for(let i=0;i<200&&loads===previous;i++) await pause(50);
        if(loads===previous) throw new Error(`Document did not load: ${url}`);
      }
      if(!allowRedirect) await wait(`location.href===${JSON.stringify(url)}`);
    };
    const clickText = (text) => evaluate(`(() => {const el=[...document.querySelectorAll('button,a')].find(e=>e.getClientRects().length && e.textContent.trim()===${JSON.stringify(text)}); if(!el) return false; el.click();return true;})()`);
    const setRoleCookie = async (role, url) => {
      if (!role) return;
      const [name, ...value] = role.cookie.split("=");
      await cdp("Network.setCookie", { name, value: value.join("="), url, httpOnly: true });
    };
    const screens = [
      { name: "public-home", route: "/", role: null, ready: ".hero-deck" },
      { name: "public-menu", route: "/", role: null, ready: ".hero-deck", menu: true },
      { name: "public-services", route: "/#services", role: null, ready: "#services", scroll: "#services" },
      { name: "customer-auth", route: "/app.html?service=Plumbing#request", role: null, ready: ".customer-auth" },
      { name: "customer-overview", route: "/app.html#overview", role: customer, ready: ".customer-card-grid article" },
      { name: "customer-form", route: "/app.html?service=Plumbing#request", role: customer, ready: ".request-form" },
      { name: "customer-requests", route: "/app.html#requests", role: customer, ready: ".customer-request-list button" },
      { name: "customer-detail", route: "/app.html#requests", role: customer, ready: ".customer-request-list button", detail: true },
      { name: "customer-dialog", route: "/app.html#requests", role: customer, ready: ".customer-request-list button", detail: true, dialog: "Confirm completion" },
      { name: "admin-login", route: "/admin-login.html", role: null, ready: "form" },
      { name: "admin-overview", route: "/admin.html#overview", role: admin, ready: ".ops-metrics article" },
      { name: "admin-requests", route: "/admin.html#requests", role: admin, ready: ".ops-table-wrap tbody button" },
      { name: "admin-detail", route: "/admin.html#requests", role: admin, ready: ".ops-table-wrap tbody button", select: "TIKKA-QA-003" },
      { name: "admin-workers", route: "/admin.html#workers", role: admin, ready: ".ops-table-wrap tbody button" },
      { name: "admin-dialog", route: "/admin.html#workers", role: admin, ready: ".ops-table-wrap tbody button", dialog: "Mark inactive" },
      { name: "admin-menu", route: "/admin.html#requests", role: admin, ready: ".ops-table-wrap tbody button", menu: true },
    ];
    const results = [];
    for (const legacy of [false]) {
      for (const width of [320, 375, 640, 768, 900, 1024, 1280, 1440]) {
        for (const screen of screens) {
          await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
          await cdp("Network.clearBrowserCookies");
          if (screen.role) await setRoleCookie(screen.role, legacy ? legacyOrigin : origin);
          console.log(`Render ${legacy ? 'legacy' : 'react'} ${width} ${screen.name}`);
          await navigate(`${legacy ? legacyOrigin : origin}${screen.route}`);
          if (screen.role && await evaluate("location.pathname === '/admin-login.html' || (location.pathname === '/app.html' && document.querySelector('.customer-auth'))")) {
            await setRoleCookie(screen.role, legacy ? legacyOrigin : origin);
            await navigate(`${legacy ? legacyOrigin : origin}${screen.route}`);
          }
          const ready = legacy && screen.name === "customer-overview" ? "[data-active-requests] article" : screen.ready;
          await wait(`[...document.querySelectorAll(${JSON.stringify(ready)})].some(e=>e.getClientRects().length>0)`);
          if (screen.name.startsWith("public")) await pause(1600);
          if (screen.detail) {
            if (legacy) await clickText("Completed");
            else await clickText("Completed");
            await wait(`document.querySelector('.customer-request-list button')?.getClientRects().length > 0`);
            await evaluate(`document.querySelector('.customer-request-list button').click()`);
            await wait(`document.querySelector('.customer-detail-panel')?.textContent.includes('Kitchen tap repair')`);
          }
          if (screen.select) await clickText(screen.select);
          if (legacy && screen.name === 'admin-dialog') await clickText('QA Technician');
          if (screen.dialog) { if (!await clickText(screen.dialog)) throw new Error(`Missing ${screen.dialog}`); await wait("document.querySelector('dialog[open]') !== null"); }
          if (screen.menu) await evaluate(`(() => {const e=document.querySelector('.nav-toggle,.ops-nav-toggle'); if(e?.getClientRects().length) e.click();})()`);
          if (screen.scroll) await evaluate(`document.querySelector(${JSON.stringify(screen.scroll)}).scrollIntoView()`);
          await evaluate("document.fonts.ready");
          const metrics = await evaluate(`(() => {const visible=e=>e.getClientRects().length>0; const rect=e=>{const r=e.getBoundingClientRect();return {text:e.textContent.trim().slice(0,80),left:r.left,right:r.right,width:r.width,height:r.height}};return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,images:[...document.images].filter(visible).filter(e=>e.complete&&!e.naturalWidth).map(e=>e.getAttribute('src')),outside:[...document.querySelectorAll('button,input,select,textarea')].filter(visible).filter(e=>!e.closest('.ops-table-wrap')).map(rect).filter(r=>r.left < -1 || r.right>innerWidth+1),dialog:document.querySelector('dialog[open]')?rect(document.querySelector('dialog[open]')):null,headings:[...document.querySelectorAll('h1,h2')].filter(visible).map(e=>e.textContent.trim())};})()`);
          // Inactive lazy carousel slots intentionally have no src. Filter chips
          // intentionally scroll within their own region, just like tables.
          metrics.images = metrics.images.filter(Boolean);
          metrics.outside = metrics.outside.filter(control => !['Active','Completed','Cancelled','All'].includes(control.text));
          const record = { implementation: legacy ? "legacy" : "react", screen: screen.name, width, ...metrics };
          results.push(record);
          if ([375,1280].includes(width)) {
            const screenshot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
            const file = `${record.implementation}-${screen.name}-${width}.png`;
            fs.writeFileSync(path.join(output,file), Buffer.from(screenshot.data,"base64")); record.screenshot = file;
          }
        }
      }
    }
    // 1280px physical viewport at 200% has 640 CSS pixels. Device scale 2
    // exercises equivalent reflow; this is not browser toolbar zoom automation.
    fs.writeFileSync(path.join(output,'visual-results.json'),JSON.stringify({browser:version.Browser,reducedMotion:true,results,zoom:[]},null,2));
    const zoom = [];
    for (const screen of screens.filter(s=>!s.name.includes("overview")&&!s.name.includes("services"))) {
      await cdp("Emulation.setDeviceMetricsOverride", { width:640,height:450,deviceScaleFactor:2,mobile:false });
      await cdp("Network.clearBrowserCookies");
      if(screen.role){const [name,...value]=screen.role.cookie.split("=");await cdp("Network.setCookie",{name,value:value.join("="),url:origin,httpOnly:true});}
      console.log(`Render zoom ${screen.name}`);
      await navigate(origin+screen.route);
      await wait(`document.querySelector(${JSON.stringify(screen.ready)})?.getClientRects().length>0`);
      if(screen.name.startsWith("public")) await pause(1600);
      if(screen.detail){await clickText("Completed"); await evaluate("document.querySelector('.customer-request-list button').click()");}
      if(screen.dialog){await clickText(screen.dialog);await wait("document.querySelector('dialog[open]')!==null");}
      if(screen.menu) await evaluate("document.querySelector('.nav-toggle,.ops-nav-toggle')?.click()");
      zoom.push({screen:screen.name,...await evaluate("(() => {const d=document.querySelector('dialog[open]');const r=d?.getBoundingClientRect();return {width:innerWidth,pageWidth:document.documentElement.scrollWidth,dialog:r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}:null};})()")});
      const screenshot=await cdp("Page.captureScreenshot",{format:"png"});fs.writeFileSync(path.join(output,`zoom-${screen.name}.png`),Buffer.from(screenshot.data,"base64"));
    }
    await cdp('Network.clearBrowserCookies');
    await navigate(origin+'/admin.html#requests', true);
    await wait("location.pathname === '/admin-login.html' && document.querySelector('form')!==null");
    const report={browser:version.Browser,reducedMotion:true,results,zoom,unauthenticatedAdminRedirect:true,zoomMethod:"200% equivalent CSS viewport/device scale, not toolbar zoom"};
    fs.writeFileSync(path.join(output,"visual-results.json"),JSON.stringify(report,null,2));
    console.log(`Visual checks recorded: ${results.length} rendered layouts; ${zoom.length} zoom-equivalent layouts. Evidence: ${output}`);
    const failures=results.filter(r=>r.implementation==='react'&&(r.pageWidth>r.width+1||r.images.length||r.outside.length));
    const zoomFailures=zoom.filter(r=>r.pageWidth>r.width+1||(r.dialog&&(r.dialog.left<0||r.dialog.right>r.width+1||r.dialog.top<0||r.dialog.bottom>451)));
    console.log(JSON.stringify({reactFailures:failures,zoomFailures,legacyOverflow:results.filter(r=>r.implementation==='legacy'&&r.pageWidth>r.width+1).map(r=>({screen:r.screen,width:r.width,pageWidth:r.pageWidth}))},null,2));
    await send("Browser.close");
    if(failures.length||zoomFailures.length) throw new Error('Rendered React layout assertions failed; inspect visual-results.json.');
    return report;
  } finally {
    socket?.close(); browser.kill(); await pause(300);
    if(path.dirname(profile)===path.resolve(os.tmpdir())&&path.basename(profile).startsWith("tikka-visual-")) {
      try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200}); }
      catch { console.warn("Temporary browser profile remains locked; retained for safe later cleanup."); }
    }
  }
}
module.exports={run};
