// 可配置的 FakeXMLHttpRequest, 用于 mock 分片上传各步骤的响应
// handler(method, url, body, xhr) -> { status, responseText, headers, progress }
function installFakeXhr(handler) {
  const requests = [];

  class FakeXhr {
    constructor() {
      this.upload = {};
      this.headers = {};
      this.status = 0;
      this.responseText = "";
      this._responseHeaders = {};
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    getResponseHeader(name) {
      const lower = String(name).toLowerCase();
      const keys = Object.keys(this._responseHeaders);
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === lower) {
          return this._responseHeaders[keys[i]];
        }
      }
      return null;
    }
    send(body) {
      this.body = body;
      const xhr = this;
      requests.push(xhr);
      setTimeout(() => {
        const spec = handler ? handler(xhr.method, xhr.url, xhr.body, xhr) : {};
        xhr.status = (spec && spec.status) || 200;
        xhr.responseText = (spec && spec.responseText) || "";
        xhr._responseHeaders = (spec && spec.headers) || {};
        if (spec && spec.progress) {
          xhr.upload.onprogress &&
            xhr.upload.onprogress({
              lengthComputable: true,
              loaded: spec.progress.loaded,
              total: spec.progress.total
            });
        }
        xhr.onload && xhr.onload();
      }, 0);
    }
  }

  global.XMLHttpRequest = FakeXhr;
  return requests;
}

// 解析 mock URL 的 query 参数
function parseUrl(url) {
  const q = {};
  const idx = url.indexOf("?");
  if (idx === -1) return q;
  url
    .slice(idx + 1)
    .split("&")
    .forEach((kv) => {
      const eq = kv.indexOf("=");
      const k = eq === -1 ? kv : kv.slice(0, eq);
      const v = eq === -1 ? "" : kv.slice(eq + 1);
      q[k] = decodeURIComponent(v);
    });
  return q;
}

// 生成 getSignedUrl 回调: 把请求编码进 mock URL, 并记录调用
function makeGetSignedUrl(calls) {
  return (req) => {
    if (calls) calls.push(req);
    const q = [];
    if (req.action) q.push("action=" + req.action);
    if (req.partNumber != null) q.push("partNumber=" + req.partNumber);
    if (req.uploadId) q.push("uploadId=" + req.uploadId);
    if (req.objectKey) q.push("objectKey=" + encodeURIComponent(req.objectKey));
    return Promise.resolve("https://fake.test/sign?" + q.join("&"));
  };
}

module.exports = { installFakeXhr, parseUrl, makeGetSignedUrl };
