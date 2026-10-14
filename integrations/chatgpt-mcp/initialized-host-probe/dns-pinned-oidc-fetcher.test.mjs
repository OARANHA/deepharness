import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDnsPinnedOidcFetcher } from '../adapters/dns-pinned-oidc-fetcher.mjs';

const uri = 'https://id.example/.well-known/openid-configuration';
const options = { redirect: 'error', cache: 'no-store' };
function mocked({ addresses = ['8.8.8.8'], status = 200, body = '{}', certificateError = false } = {}) {
  const observed = [];
  const fetcher = createDnsPinnedOidcFetcher({
    lookup: async () => addresses.map(address => ({ address, family: address.includes(':') ? 6 : 4 })),
    requestImpl: (url, opts, onResponse) => {
      observed.push({ url: String(url), ...opts });
      const req = new EventEmitter();
      req.end = () => {
        opts.lookup(url.hostname, { all: false }, (error, ip, family) => {
          if (error) { req.emit('error', error); return; }
          observed.push({ ip, family });
          if (certificateError) { req.emit('error', Error('CERT_HAS_EXPIRED')); return; }
          const res = new EventEmitter();
          res.statusCode = status;
          res.headers = { 'content-type': 'application/json' };
          res.resume = () => {};
          onResponse(res);
          if (status === 200) {
            res.emit('data', Buffer.from(body));
            res.emit('end');
          }
        });
      };
      req.destroy = err => req.emit('error', err ?? Error('destroyed'));
      return req;
    },
  });
  return { fetcher, observed };
}
test('approved public IP is handed directly to HTTPS socket with original SNI and TLS verification', async () => {
  const { fetcher, observed } = mocked();
  const res = await fetcher(uri, options);
  assert.equal(await res.text(), '{}');
  assert.deepEqual(observed[1], { ip: '8.8.8.8', family: 4 });
  assert.equal(observed[0].servername, 'id.example');
  assert.equal(observed[0].rejectUnauthorized, true);
  assert.equal(observed[0].agent, false);
  assert.equal(observed[0].headers.connection, 'close');
});
test('private or mixed DNS answers never reach a connection', async () => {
  for (const addresses of [['127.0.0.1'], ['8.8.8.8', '10.0.0.2'], []]) {
    const { fetcher, observed } = mocked({ addresses });
    await assert.rejects(fetcher(uri, options), /denied/);
    assert.equal(observed.length, 1);
  }
});
test('redirect and TLS error are fatal; IP literal and unsafe URL rejected', async () => {
  for (const settings of [{ status: 302 }, { certificateError: true }]) {
    await assert.rejects(mocked(settings).fetcher(uri, options), /denied/);
  }
  const { fetcher } = mocked();
  await assert.rejects(fetcher('https://127.0.0.1/config', options), /denied/);
  await assert.rejects(fetcher('http://id.example/config', options), /denied/);
  await assert.rejects(fetcher('https://user@id.example/config', options), /denied/);
  await assert.rejects(fetcher(uri, { redirect: 'follow', cache: 'no-store' }), /denied/);
});
