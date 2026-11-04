/**
 * MÓDULOS FAKE DOS GRUPOS 2–5 (só para o G1 testar a integração enquanto os
 * módulos reais estão "em produção").
 *
 * Execução: node stubs/server.mjs   (ou: npm run stubs)
 * Sobe 4 servidores, nas mesmas URLs do apps/shell/public/importmap.json:
 *   G2 http://localhost:8081/smart40-ihm-siemens.js
 *   G3 http://localhost:8082/smart40-robo-ur.js
 *   G4 http://localhost:8083/smart40-rastreabilidade.js
 *   G5 http://localhost:8084/smart40-expedicao-oee.js
 *
 * Cada módulo é um bundle single-spa (System.register) que:
 *   - escuta os eventos "smart40:*" do barramento (igual o módulo real fará)
 *   - envia "smart40:command.requested" pelos botões e mostra o "command.ack"
 * Quando o grupo real publicar o módulo dele, basta parar este servidor.
 */
import http from "node:http";

const MODULES = [
  {
    port: 8081, file: "smart40-ihm-siemens.js", group: 2, title: "IHM Siemens (FAKE)", moduleId: "ihm",
    consumes: ["machine.telemetry", "machine.emergency"],
    commands: [
      ["MACHINE", "START"], ["MACHINE", "STOP"], ["MACHINE", "RESET"], ["MACHINE", "EMERGENCY_STOP"],
    ],
  },
  {
    port: 8082, file: "smart40-robo-ur.js", group: 3, title: "Robô UR (FAKE)", moduleId: "robot",
    consumes: ["robot.telemetry"],
    commands: [["ROBOT", "GRIPPER_OPEN"], ["ROBOT", "GRIPPER_CLOSE"], ["ROBOT", "JOG"]],
  },
  {
    port: 8083, file: "smart40-rastreabilidade.js", group: 4, title: "Rastreabilidade QR (FAKE)", moduleId: "traceability",
    consumes: ["traceability.piece-scanned"],
    commands: [["TRACEABILITY", "MANUAL_SCAN"]],
  },
  {
    port: 8084, file: "smart40-expedicao-oee.js", group: 5, title: "Expedição & OEE (FAKE)", moduleId: "expedition",
    consumes: ["expedition.metrics"],
    commands: [["EXPEDITION", "DISPATCH_ORDER"]],
  },
];

function bundle(cfg) {
  return `System.register([], function (_export) {
  "use strict";
  var CFG = ${JSON.stringify(cfg)};
  var offs = [];
  var root = null;

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  function on(type, fn) {
    var name = "smart40:" + type;
    var l = function (e) { fn(e.detail); };
    window.addEventListener(name, l);
    offs.push(function () { window.removeEventListener(name, l); });
  }

  function send(target, action) {
    var id = "cmd-fake-g" + CFG.group + "-" + Date.now();
    window.dispatchEvent(new CustomEvent("smart40:command.requested", {
      detail: {
        schemaVersion: "0.1.0", eventId: id, type: "command.requested",
        timestamp: new Date().toISOString(), source: "ui",
        data: { commandId: id, target: target, action: action, originModule: CFG.moduleId, simulation: true }
      }
    }));
  }

  function render(type, ev) {
    if (!root) return;
    var el = root.querySelector('[data-type="' + type + '"]');
    if (el) el.textContent = JSON.stringify(ev.data, null, 2);
    var ts = root.querySelector("[data-ts]");
    if (ts) ts.textContent = ev.timestamp;
  }

  function bootstrap() { return Promise.resolve(); }

  function mount(props) {
    var host = (props && props.domElement) || document.body;
    root = document.createElement("section");
    root.style.cssText = "padding:16px;font-family:system-ui,sans-serif;border:2px dashed #f5b301;border-radius:8px;margin:16px";
    var html = '<p style="margin:0;color:#f5b301;font-weight:700">MÓDULO FAKE · Grupo ' + CFG.group + '</p>' +
      '<h2 style="margin:4px 0 8px">' + esc(CFG.title) + '</h2>' +
      '<p style="margin:0 0 12px;opacity:.7">Último evento: <code data-ts>aguardando…</code></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
    CFG.commands.forEach(function (c) {
      html += '<button data-target="' + c[0] + '" data-action="' + c[1] + '" style="padding:8px 12px;cursor:pointer">' + c[1] + '</button>';
    });
    html += '</div><p style="margin:0 0 4px">command.ack:</p><pre data-ack style="background:#0002;padding:8px;margin:0 0 12px;white-space:pre-wrap">—</pre>';
    CFG.consumes.forEach(function (t) {
      html += '<p style="margin:0 0 4px"><code>smart40:' + t + '</code></p><pre data-type="' + t + '" style="background:#0002;padding:8px;margin:0 0 12px;max-height:260px;overflow:auto">aguardando…</pre>';
    });
    root.innerHTML = html;
    host.appendChild(root);

    root.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { send(b.dataset.target, b.dataset.action); });
    });

    CFG.consumes.forEach(function (t) {
      // cache do Shell: não começa vazio
      var last = window.smart40 && window.smart40.getLast(t);
      if (last) render(t, last);
      on(t, function (ev) { render(t, ev); });
    });
    on("command.ack", function (ev) {
      var a = root && root.querySelector("[data-ack]");
      if (a) a.textContent = ev.data.status + " — " + ev.data.message;
    });
    console.info("[fake G" + CFG.group + "] montado");
    return Promise.resolve();
  }

  function unmount() {
    offs.forEach(function (off) { off(); }); // limpeza obrigatória
    offs = [];
    if (root) root.remove();
    root = null;
    return Promise.resolve();
  }

  return { execute: function () { _export({ bootstrap: bootstrap, mount: mount, unmount: unmount }); } };
});
`;
}

for (const m of MODULES) {
  const code = bundle(m);
  http
    .createServer((req, res) => {
      const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
      if (req.method === "OPTIONS") return res.writeHead(204, headers).end();
      if (req.url.split("?")[0] === `/${m.file}`) {
        res.writeHead(200, { ...headers, "Content-Type": "application/javascript; charset=utf-8" });
        return res.end(code);
      }
      res.writeHead(404, { ...headers, "Content-Type": "text/plain" }).end("Use /" + m.file);
    })
    .listen(m.port, () => console.log(`G${m.group} fake → http://localhost:${m.port}/${m.file}`));
}
