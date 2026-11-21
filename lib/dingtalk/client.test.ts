import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// 本地模拟钉钉服务：按官方文档的路径、请求头和响应字段回数据，验证真实模式代码（取 token、翻页、错误码）
// 没有真实钉钉应用，这里只能证明「按文档写的请求能正确处理按文档格式返回的数据」，不等于联调通过

type Call = { path: string; query: Record<string, string>; token: string | null; body?: Record<string, unknown> };
const calls: Call[] = [];
let server: http.Server;

const para = (i: number, nickName: string, paragraph: string) => ({
  unionId: `u-${nickName}`, nickName, recordId: i, status: 1, startTime: i * 5000, endTime: i * 5000 + 3000,
  paragraph, sentenceList: [], nextTtoken: (i + 1) * 1000,
});

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) as Record<string, unknown> : undefined;
      calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), token: (req.headers['x-acs-dingtalk-access-token'] as string) ?? null, body });
      res.setHeader('Content-Type', 'application/json');
      if (url.pathname === '/v1.0/oauth2/accessToken') {
        if (body?.appKey !== 'stub-key') { res.statusCode = 400; return res.end(JSON.stringify({ code: 'invalidClientId', message: '应用不存在' })); }
        return res.end(JSON.stringify({ accessToken: 'stub-token-123', expireIn: 7200 }));
      }
      const m = url.pathname.match(/^\/v1\.0\/conference\/videoConferences\/([^/]+)\/cloudRecords\/getTexts$/);
      if (m) {
        if (m[1] === 'no-record') { res.statusCode = 400; return res.end(JSON.stringify({ code: 'cloudRecordNotFound', message: 'cloudRecordNotFound' })); }
        if (!url.searchParams.get('nextToken')) {
          return res.end(JSON.stringify({ hasMore: true, paragraphList: [para(1, '组长', '人到齐了，开始'), para(2, '然哥', 'ER 图我周六前补完')] }));
        }
        return res.end(JSON.stringify({ hasMore: false, paragraphList: [para(3, '小雨同学', '问卷收了两百份')] }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.DINGTALK_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.DINGTALK_APP_SECRET = 'stub-secret';
});

after(() => { server.close(); });

describe('钉钉 client（本地模拟服务）', () => {
  it('AppKey 不对：取 token 失败，给出钉钉的错误信息', async () => {
    process.env.DINGTALK_APP_KEY = 'bad-key';
    const { fetchCloudTexts } = await import('./client');
    await assert.rejects(fetchCloudTexts('conf-abc'), /获取钉钉 accessToken 失败：应用不存在/);
  });

  it('取 token 后带请求头翻两页，第二页用上一页最后一段的 nextTtoken', async () => {
    process.env.DINGTALK_APP_KEY = 'stub-key';
    calls.length = 0;
    const { fetchCloudTexts } = await import('./client');
    const paras = await fetchCloudTexts('conf-abc', 'u-leader');
    assert.deepEqual(paras.map((p) => p.paragraph), ['人到齐了，开始', 'ER 图我周六前补完', '问卷收了两百份']);
    const [tokenCall, page1, page2] = calls;
    assert.equal(tokenCall.path, '/v1.0/oauth2/accessToken');
    assert.deepEqual(tokenCall.body, { appKey: 'stub-key', appSecret: 'stub-secret' });
    assert.equal(page1.token, 'stub-token-123');
    assert.deepEqual(page1.query, { direction: '0', maxResults: '2000', unionId: 'u-leader' });
    assert.equal(page2.query.nextToken, '3000');
  });

  it('token 缓存复用；没开云录制时提示原因', async () => {
    calls.length = 0;
    const { fetchCloudTexts } = await import('./client');
    await assert.rejects(fetchCloudTexts('no-record'), /cloudRecordNotFound：这场会没开云录制（闪记），或者还没人发言/);
    assert.equal(calls.filter((c) => c.path === '/v1.0/oauth2/accessToken').length, 0, '不重复取 token');
  });
});
