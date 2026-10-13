/**
 * DSH 0.2.1-alpha.2 Web capability compatibility adapter.
 * Applies ONLY to an installed, disposable bridge copy after upstream pin
 * verification. Never ship this modified tarball or use allow-version.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function adaptAlphaWebSurface(installed) {
  const bridgeJsPath = join(installed, 'lib', 'bridge.js');
  let code = readFileSync(bridgeJsPath, 'utf8');
  const start = "this.apiProxy = asApiProxy(this.ctx.get('apiProxy'));";
  const health = "webSurface: this.apiProxy !== undefined || this.ctx.get('webRuntime') !== undefined,";
  assert.equal(code.split(start).length - 1, 1, 'Unexpected upstream start() implementation');
  assert.equal(code.split(health).length - 1, 1, 'Unexpected upstream health implementation');

  // Existing upstream management API also injects webServer. Treat this
  // service as evidence of a Web surface, not evidence of control-plane access.
  // No fabricated service, route registration, or authentication bypass.
  code = code.replace(start, start + `
        this.alphaWebServerObserved = false;
        this.ctx.inject(['webServer'], webCtx => {
            this.alphaWebServerObserved = webCtx.get('webServer') !== undefined;
            return () => { this.alphaWebServerObserved = false; };
        });
  `);
  code = code.replace(health,
    "webSurface: this.apiProxy !== undefined || this.ctx.get('webRuntime') !== undefined || this.alphaWebServerObserved === true,");
  writeFileSync(bridgeJsPath, code);
}
