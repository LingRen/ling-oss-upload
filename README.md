# ling-oss-upload

上传文件到阿里云 OSS 的轻量库，支持浏览器、小程序、STS 临时凭证、大文件分片与断点续传。

## 特性

- 五种上传方式：浏览器 POST、STS 直传、分片续传、小程序客户端签名、小程序服务端签名
- 零密钥模式：`uploadLarge` 只拿签名 URL，`createMiniUploadInfoBySigner` 只拿签名 POST 字段
- 大文件分片上传 + 断点续传（localStorage 持久化）
- 图片上传前压缩（`isCompressor`）
- CLI 按平台按需下载 ossutil，不再随包携带三平台二进制

## 上传方式对比

| 方法 | 场景 | 凭证位置 | 分片 | 断点续传 | 需要后端 |
| :---- | :---- | :---- | :----: | :----: | :----: |
| `upload()` | 浏览器单文件 POST 表单 | 浏览器（长期 AK/SK 或 STS） | 否 | 否 | 否 |
| `uploadBySts()` | 浏览器单文件 STS 直传 | 浏览器只拿临时凭证 | 否 | 否 | STS 接口 |
| `uploadLarge()` | 浏览器大文件 | 后端持有 AK/SK，浏览器只拿签名 URL | 是 | 是 | 签名接口 |
| `createMiniUploadInfo()` | 小程序单文件 POST | 小程序持有 AK/SK 或 STS | 否 | 否 | 否 |
| `createMiniUploadInfoBySigner()` | 小程序单文件 POST | 后端持有 AK/SK | 否 | 否 | 签名接口 |

## 安装

~~~bash
npm i ling-oss-upload
~~~

浏览器通过打包工具引入：

~~~javascript
import LingOssUpload from "ling-oss-upload";
~~~

也可以直接使用 UMD 产物 `dist/index.js`，全局变量为 `LingOssUpload`。

## 初始化

~~~javascript
const uploader = new LingOssUpload(
  {
    accessId: "your accessId",
    accessKey: "your accessKey",
    securityToken: "" // 可选，STS 临时凭证
  },
  {
    rootDir: "" // 可选，policy 中限制 key 前缀
  }
);
~~~

| 参数 | 类型 | 默认 | 说明 |
| :----: | :----: | :----: | :---- |
| ossInfo | Object | ———— | `{ accessId, accessKey, securityToken? }` |
| options | Object | `{}` | `{ rootDir? }` |

构造函数不再强制校验密钥，以便零密钥模式使用；`upload()` / `createMiniUploadInfo()` 在调用时校验。

---

## 1. upload()：浏览器 POST 表单（客户端签名）

### 实现流程

1. 校验凭证；如果 accessId 以 `STS.` 开头，必须同时提供 `securityToken`
2. 图片文件按 `isCompressor` 压缩
3. 校验 `limitType` / `limitSize`
4. 生成 objectKey：`dirName + 随机名 + 后缀`；`selfName` 为 true 时使用 OSS 的 filename 占位符
5. 生成 policy：`starts-with $bucket`、可选 `rootDir`、可选 `content-length-range`，有效期 1 天
6. 用 HMAC-SHA1 计算 `signature`
7. 组装 FormData：`name`、`key`、`policy`、`OSSAccessKeyId`、`success_action_status`、`signature`、`x-oss-security-token`、`file`
8. POST 到 `host`，返回 `{ code, data, message, success }`，`data` 为 CDN 地址

> OSS PostObject 要求 `file` 必须是最后一个字段，`x-oss-security-token` 必须在 `file` 之前。库已按此顺序组装。

### 参数

| 参数 | 类型 | 默认 | 说明 |
| :----: | :----: | :----: | :---- |
| file | File | ———— | 上传文件 |
| host | String | ———— | OSS 直传地址（bucket 域名） |
| dirName | String | ———— | OSS 目录 |
| selfName | Boolean | false | true: 使用原文件名；false: 随机名 + 后缀 |
| limitSize | Number | 0 | 大小限制（字节），0 为不限 |
| limitType | String or Function | '' | 类型限制，如 `"image"`，或自定义函数 |
| onProgress | Function | `() => {}` | XHR 进度回调（ProgressEvent） |
| uploadFile | Function | 内置 XHR | 自定义上传实现：`(host, formData, onProgress) => Promise` |
| cdnHost | String | host | 返回 URL 使用的 CDN 域名 |
| isCompressor | Boolean | true | 图片是否压缩 |

### 示例

~~~javascript
const uploader = new LingOssUpload({
  accessId: "your accessId",
  accessKey: "your accessKey"
});

const result = await uploader.upload({
  file,
  host: "https://bucket.oss-cn-shenzhen.aliyuncs.com",
  cdnHost: "https://cdn.example.com",
  dirName: "formal/test",
  selfName: false,
  limitType: "image",
  limitSize: 5 * 1024 * 1024,
  onProgress: (event) => {
    console.log(Math.floor((event.loaded / event.total) * 100) + "%");
  }
});

console.log(result.data); // https://cdn.example.com/formal/test/xxxx.jpg
~~~

### 说明

- 长期 AK/SK 放在浏览器有泄露风险，生产环境优先使用 `uploadLarge()`、`uploadBySts()` 或服务端签名
- 单次 POST 上限 5GB；需要断点续传请用 `uploadLarge()`
- Bucket 需要允许当前来源 POST
- 使用 STS 时，accessId 以 `STS.` 开头，必须传 `securityToken`，否则 OSS 会报 Access Key Id 不存在

---

## 2. uploadBySts()：STS 直传（不分片）

### 实现流程

1. 调用 `getStsToken()` 获取临时凭证
2. 兼容两种字段名：`{ accessId, accessKey, securityToken }` 或阿里云 SDK 的 `{ AccessKeyId, AccessKeySecret, SecurityToken }`
3. 用临时凭证创建内部实例
4. 复用 `upload()` 的 POST 表单流程，一次性上传
5. 返回结构与 `upload()` 相同

### 参数

在 `upload()` 参数基础上新增：

| 参数 | 类型 | 默认 | 说明 |
| :----: | :----: | :----: | :---- |
| getStsToken | Function | ———— | 获取 STS 临时凭证，返回 Promise |

### 示例

~~~javascript
const uploader = new LingOssUpload(); // 不需要固化密钥

const result = await uploader.uploadBySts({
  file,
  host: "https://bucket.oss-cn-shenzhen.aliyuncs.com",
  cdnHost: "https://cdn.example.com",
  dirName: "formal/test/sts",
  getStsToken: () => fetch("/api/sts").then((res) => res.json()),
  onProgress: (event) => {
    console.log(Math.floor((event.loaded / event.total) * 100) + "%");
  }
});
~~~

### 后端契约

`getStsToken()` 返回：

~~~javascript
{
  accessId: "STS.xxx",
  accessKey: "xxx",
  securityToken: "xxx",
  expiration: "2026-11-04T03:30:00Z" // 可选
}
~~~

### 说明

- STS AccessKey 必须和 `securityToken` 一起使用
- 临时凭证有有效期，过期后重新获取；不要在本地长期缓存
- 适合中小文件；超过 5GB 请用 `uploadLarge()`
- 建议通过 STS 会话 Policy 限制可写目录

---

## 3. uploadLarge()：分片上传 + 断点续传

### 实现流程

1. 生成 objectKey；如果 `selfName` 为 true 使用原文件名，否则随机名 + 后缀
2. 计算续传 key：`ling-oss-upload:` + `resumeKey` 或文件指纹 `name:size:lastModified` 的 MD5
3. 读取 localStorage 中的 `{ objectKey, uploadId, chunkSize, parts }`
4. 新上传：调用 `initiateMultipart`（POST `?uploads`）获取 `uploadId`
5. 续传且本地已有分片：调用 `listParts` 与服务端对账；全新上传跳过 `listParts`
6. 计算待传分片，按 `concurrency` 并发调用 `uploadPart`（PUT）
7. 每个分片完成后写入 localStorage，支持刷新页面后续传
8. 全部完成后调用 `completeMultipart`（POST XML）
9. 任一步失败：调用 `abortMultipart` 并清理续传状态

### getSignedUrl 契约

~~~typescript
type SignedUrlRequest = {
  verb: "POST" | "PUT" | "DELETE" | "GET";
  objectKey: string;
  action: "init" | "part" | "complete" | "abort" | "listParts";
  partNumber?: number;
  uploadId?: string;
  contentType?: string;
};

getSignedUrl(req: SignedUrlRequest): Promise<string>;
~~~

| action | verb | OSS 子资源 | 说明 |
| :----: | :----: | :---- | :---- |
| init | POST | `?uploads` | 初始化分片，返回 UploadId |
| part | PUT | `?partNumber=...&uploadId=...` | 上传单个分片 |
| complete | POST | `?uploadId=...` | 合并分片，Content-Type 为 `application/xml` |
| abort | DELETE | `?uploadId=...` | 中止上传 |
| listParts | GET | `?uploadId=...` | 查询已传分片 |

> `contentType` 是请求实际携带的 Content-Type（分片为文件 MIME，complete 为 `application/xml`）。
> 后端签名时必须把它一并纳入签名，否则 OSS 会返回 `SignatureDoesNotMatch`。

### 参数

| 参数 | 类型 | 默认 | 说明 |
| :----: | :----: | :----: | :---- |
| file | File | ———— | 上传文件 |
| dirName | String | ———— | OSS 目录 |
| getSignedUrl | Function | ———— | 获取签名 URL |
| selfName | Boolean | false | true: 使用原文件名 |
| chunkSize | Number | 1MB | 分片大小，最小 100KB |
| concurrency | Number | 3 | 并发分片数 |
| onProgress | Function | `() => {}` | 进度回调 `{ loaded, total }` |
| resumeKey | String | ———— | 续传标识，不传则按文件指纹 |

### 示例

~~~javascript
const uploader = new LingOssUpload(); // 不需要密钥

const getSignedUrl = (req) => {
  const params = new URLSearchParams(req);
  return fetch("/sign?" + params.toString())
    .then((res) => res.json())
    .then((data) => data.url);
};

const result = await uploader.uploadLarge({
  file,
  dirName: "formal/test/large",
  selfName: true,
  chunkSize: 5 * 1024 * 1024,
  concurrency: 3,
  getSignedUrl,
  onProgress: ({ loaded, total }) => {
    console.log(Math.floor((loaded / total) * 100) + "%");
  }
});

console.log(result.data); // objectKey
~~~

### 后端实现

参考 `server/sign.js` 和 `server/sts-server.js`，核心是使用 ali-oss 的 `signatureUrl`：

~~~javascript
const url = client.signatureUrl(objectKey, {
  method,
  expires: 3600,
  subResource,
  "Content-Type": contentType // 有 contentType 时必须带上
});
~~~

### 权限与 CORS

- 全新上传只需要 `oss:PutObject`
- 断点续传对账需要 `oss:ListParts`
- 失败清理需要 `oss:AbortMultipartUpload`
- Bucket CORS 需要允许 PUT / POST / GET / DELETE，并暴露 `ETag` 响应头

### 断点续传说明

- 上传过程中刷新页面，重新选择同一个文件即可命中 localStorage 状态
- `chunkSize` 变化后旧的续传状态不会复用
- 点击失败或调用 abort 会清理状态
- 可以用 `resumeKey` 手动指定续传标识

---

## 4. createMiniUploadInfo()：小程序客户端签名

### 实现流程

1. 校验凭证，STS accessId 必须带 `securityToken`
2. 生成随机 objectKey
3. 生成 policy 并用 HMAC-SHA1 计算签名
4. 返回 POST 表单字段，交给 `wx.uploadFile`

### 参数

| 参数 | 类型 | 默认 | 说明 |
| :----: | :----: | :----: | :---- |
| dirName | String | ———— | OSS 目录 |
| limitSize | Number | 0 | 大小限制（字节） |
| selfName | Boolean | false | 小程序接口不接收文件名，通常使用随机名 |

### 示例

~~~javascript
const uploader = new LingOssUpload({
  accessId: "your accessId",
  accessKey: "your accessKey"
});

const formData = uploader.createMiniUploadInfo({
  dirName: "formal/test/mini",
  limitSize: 5 * 1024 * 1024
});

wx.chooseImage({
  success(res) {
    wx.uploadFile({
      url: "https://bucket.oss-cn-shenzhen.aliyuncs.com",
      filePath: res.tempFilePaths[0],
      name: "file",
      formData,
      success(uploadRes) {
        console.log(uploadRes);
      }
    });
  }
});
~~~

### 返回字段

~~~javascript
{
  name,
  key,
  success_action_status: 200,
  OSSAccessKeyId,
  policy,
  signature,
  "x-oss-security-token": undefined
}
~~~

### 说明

- 小程序持有密钥，适合内部工具；生产建议用服务端签名
- 使用 STS 时，返回字段中会带 `x-oss-security-token`

---

## 5. createMiniUploadInfoBySigner()：小程序服务端签名

### 实现流程

1. 生成 objectKey（随机名，不需要密钥）
2. 调用 `getMiniUploadInfo({ objectKey, limitSize })`
3. 合并后端返回的 `OSSAccessKeyId` / `policy` / `signature` / `x-oss-security-token`
4. 返回与 `createMiniUploadInfo()` 相同结构

### 参数

| 参数 | 类型 | 默认 | 说明 |
| :----: | :----: | :----: | :---- |
| dirName | String | ———— | OSS 目录 |
| getMiniUploadInfo | Function | ———— | 获取签名 POST 字段 |
| limitSize | Number | 0 | 大小限制（字节） |
| selfName | Boolean | false | 小程序接口不接收文件名，通常使用随机名 |

### 后端契约

`getMiniUploadInfo({ objectKey, limitSize })` 返回：

~~~javascript
{
  OSSAccessKeyId: "STS.xxx",
  policy: "base64 policy",
  signature: "base64 signature",
  "x-oss-security-token": "xxx" // 可选
}
~~~

### 示例

~~~javascript
const uploader = new LingOssUpload(); // 不需要密钥

const getMiniUploadInfo = (req) => {
  const params = new URLSearchParams(req);
  return fetch("/mini-post?" + params.toString()).then((res) => res.json());
};

const formData = await uploader.createMiniUploadInfoBySigner({
  dirName: "formal/test/mini",
  limitSize: 5 * 1024 * 1024,
  getMiniUploadInfo
});

wx.uploadFile({
  url: "https://bucket.oss-cn-shenzhen.aliyuncs.com",
  filePath: tempFilePaths[0],
  name: "file",
  formData
});
~~~

### 说明

- policy 中的 key 必须与生成的 objectKey 一致
- 后端可以用 STS 临时凭证或长期 AK/SK 签名
- 生产环境推荐这种方式，小程序不接触长期密钥

---

## 6. 本地 Demo 与签名服务

~~~bash
npm run demo
# http://localhost:3000/demo.html
~~~

Demo 页面覆盖：

1. `uploadLarge()`：分片上传、进度、续传状态
2. `upload()`：浏览器 POST 表单
3. 小程序：`createMiniUploadInfoBySigner()` 与 `createMiniUploadInfo()`，含实际 POST 上传
4. `uploadBySts()`：STS 直传

Demo 服务接口：

| 接口 | 说明 |
| :---- | :---- |
| `GET /api/config` | bucket / region / CDN 域名 / 默认目录 |
| `GET /api/sts` | STS 临时凭证，支持 `?roleArn=...` |
| `GET /sign` | 分片签名 URL |
| `GET /mini-post` | 小程序 POST 签名字段 |

配置来源（环境变量优先）：

- `test/ossInfo.js`：`accessId`、`accessKey`、`bucketName`、`ossRegion`、`host`、`roleArn`、`stsKey` / `stsSecret` 等
- 环境变量：`OSS_ACCESS_ID`、`OSS_ACCESS_KEY`、`OSS_BUCKET`、`OSS_REGION`、`OSS_SECURITY_TOKEN`、`STS_ROLE_ARN` 等

> `/api/sts` 会返回临时凭证。demo-server 默认只监听 `127.0.0.1`，CORS 仅允许本机来源；
> 不要部署到公网，也不要在不可信网络下设置 `DEMO_HOST=0.0.0.0`。

---

## 7. CLI 与 ossutil

`bin/upload.js` 首次执行时根据 `os.platform()` 下载对应的 ossutil 1.7.9：

| 平台 | 文件 |
| :----: | :----: |
| macOS | `ossutilmac64` |
| Linux | `ossutil64` |
| Windows | `ossutil64.exe` |

- 下载地址默认 `https://gosspublic.alicdn.com/ossutil/1.7.9/`
- 可通过 `OSSUTIL_DOWNLOAD_BASE` 覆盖（内网镜像/离线包地址）
- 下载后校验 SHA256，通过后 `chmod +x` 再执行
- 二进制保存到 `bin/upload/`，已被 `.gitignore` 忽略，不会提交或发布到 npm
- 仓库和 npm 包不再包含三个平台的二进制

~~~bash
npm run upload
npm run download
~~~

---

## 8. 安全与隐私

- 不要提交或上传真实密钥：`test/ossInfo.js` 已被 `.gitignore` 忽略，仅用于本地开发
  新环境请复制 `test/ossInfo.example.js` 为 `test/ossInfo.js` 后再填值
- 不要使用 `git add -f test/ossInfo.js`，也不要把 AccessKey / AccessKeySecret / SecurityToken
  粘贴到 issue、PR、日志或聊天记录中
- npm 包的 `files` 仅包含 `index.js`、`index.d.ts`、`dist/`、`bin/upload.js`、`CHANGELOG.md`，
  `test/` 目录（含 `ossInfo.js`）不会发布
- `demo-server` 只监听 `127.0.0.1`，`/api/sts` 的 CORS 仅允许 `localhost` / `127.0.0.1` 来源
- 生产环境请使用零密钥模式，避免把长期 AK/SK 放到前端
- 如果密钥疑似泄露：立即在 RAM 控制台禁用/轮换 AccessKey，并检查 OSS 访问日志

自查命令：

~~~bash
git ls-files | grep -i ossinfo   # 应为空
npm pack --dry-run               # 确认 test/ 不在发布内容中
~~~

---

## 9. 开发与测试

~~~bash
npm test          # tsc + jest
npm run build     # 构建 dist
npm run demo      # 构建 test bundle 并启动 demo 服务
npm run sts       # 仅启动签名服务（默认 8080）
~~~

项目结构：

~~~text
src/
  index.ts        # LingOssUpload 主类与五种上传方式
  multipart.ts    # 分片上传、续传状态、并发控制
  interface.ts    # 类型定义
server/
  config.js       # 环境变量 + test/ossInfo.js 配置解析
  sign.js         # OSS 签名核心
  sts-server.js   # 独立签名服务
  demo-server.js  # demo 页面 + 签名 + STS 接口
test/
  demo.html       # demo 页面
  demo.js         # demo 逻辑
  unit/           # jest 单测
~~~

## License

ISC
