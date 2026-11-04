# upload file to oss

> add ossutil
  upload build files, auto find .ossutilconfig config.(current project root path > global)
  ossutil 首次运行时按平台下载（不需要提前放二进制），见文末「CLI 与 ossutil」。

> constructor need two parameters

| parameter | type | default  | explain |
| :----: | :----: | :----: | :----: |
| ossInfo | Object | ———— | { accessId, accessKey, securityToken? } oss info |
| options | Object | {} | rootDir(start directory) |

> upload need a object parameter (浏览器单次 POST 表单上传, 客户端签名)
 
| parameter | type | default  | explain |
| :----: | :----: | :----: | :----: |
| file | File | ———— | upload file |
| host | String | ———— | oss upload host |
| selfName | Boolean | false | use file self name |
| limitSize | Number | 0 | limit upload file size |
| limitType | String or Function | '' | limit upload file type |
| dirName | String | ———— | upload file to oss path |
| onProgress | Function | () => {} | xhr upload progress |
| uploadFile | Promise | use XMLHttpRequest return Promise | upload file |
| cdnHost | String | host | cdn host |
| isCompressor | Boolean | true | 图片是否压缩 |

> uploadLarge need a object parameter (大文件分片上传 + 断点续传, 签名 URL 模式, 前端零密钥)

| parameter | type | default  | explain |
| :----: | :----: | :----: | :----: |
| file | File | ———— | upload file |
| dirName | String | ———— | upload file to oss path |
| getSignedUrl | Function | ———— | 获取签名 URL 回调 |
| selfName | Boolean | false | use file self name |
| chunkSize | Number | 1MB | 分片大小(最小 100KB) |
| concurrency | Number | 3 | 并发分片数 |
| onProgress | Function | () => {} | 进度回调 {loaded, total} |
| resumeKey | String | ———— | 断点续传状态标识(可选) |

> 注意：`getSignedUrl` 的 `req.contentType` 是请求实际携带的 Content-Type（分片为文件的 MIME 类型，complete 为 `application/xml`）。
> 后端签名时必须把它一并纳入签名，否则 OSS 会返回 `SignatureDoesNotMatch`。

> uploadBySts need a object parameter (STS 临时凭证直传, 不分片)

| parameter | type | default | explain |
| :----: | :----: | :----: | :----: |
| file | File | ———— | upload file |
| host | String | ———— | oss upload host |
| dirName | String | ———— | upload file to oss path |
| getStsToken | Function | ———— | 获取 STS 临时凭证回调, 返回 { accessId, accessKey, securityToken? } |
| selfName | Boolean | false | use file self name |
| limitSize | Number | 0 | limit upload file size |
| limitType | String or Function | '' | limit upload file type |
| onProgress | Function | () => {} | xhr upload progress |
| cdnHost | String | host | cdn host |
| isCompressor | Boolean | true | 图片是否压缩 |

> createMiniUploadInfo need a object parameter (小程序 POST 表单, 客户端签名)

| parameter | type | default  | explain |
| :----: | :----: | :----: | :----: |
| limitSize | Number | 0 | limit upload file size |
| dirName | String | ———— | upload file to oss path |
| selfName | Boolean | false | use file self name |

> createMiniUploadInfoBySigner need a object parameter (小程序零密钥, 后端签名)

| parameter | type | default  | explain |
| :----: | :----: | :----: | :----: |
| dirName | String | ———— | upload file to oss path |
| getMiniUploadInfo | Function | ———— | 获取签名 POST 字段回调 |
| limitSize | Number | 0 | limit upload file size |
| selfName | Boolean | false | use file self name |

> code example

```javascript
// init
const lingOssUpload = new LingOssUpload({
  accessId: "user accessId",
  accessKey: "user accessKey"
});

// user other ajax
const uploadFile = (host, formData, onProgress) => {
  return new Promise((resolve, reject) => {
    axios({
      url: host,
      method: "POST",
      data: formData,
      onUploadProgress: onProgress,
      validateStatus: function (status) {
        return true;
      },
      transformResponse: [
        function (data) {
          // no data is success
          if (!data) {
            resolve();
          } else {
            reject(data);
          }
        }
      ]
    });
  });
};

// upload
const handleChange = async (e) => {
  const file = e.target.files[0];
  try {
    const data = await lingOssUpload.upload({
      file,
      host: "host",
      dirName: "formal/test/hehe",
      selfName: false,
      limitType: "image",
      limitSize: 1024 * 1024 * 1,
      onProgress: (event) => {
        console.log(parseInt((event.loaded / event.total) * 100) + '%');
      },
      uploadFile
    });
    console.log(data);
  } catch (e) {
    console.log((e && e.message) || "Network Error");
  }
};
```

```javascript
// STS 直传(不分片): 先向后端拿临时凭证, 再一次性 POST 上传
const uploader = new LingOssUpload(); // 无需固化密钥

const result = await uploader.uploadBySts({
  file,
  host: "https://bucket.oss-cn-shenzhen.aliyuncs.com",
  dirName: "formal/test/sts",
  getStsToken: () => fetch("/api/sts").then((r) => r.json()),
  onProgress: (e) => {
    console.log(Math.floor((e.loaded / e.total) * 100) + "%");
  }
});
```

```javascript
// 大文件分片上传 + 断点续传(签名 URL, 前端零密钥)
const uploader = new LingOssUpload(); // 无需密钥

// getSignedUrl 回调: 请求后端签名接口, 返回签名 URL
const getSignedUrl = (req) => {
  // req: { verb, objectKey, partNumber?, uploadId?, action, contentType? }
  const params = new URLSearchParams(req);
  return fetch("/sign?" + params.toString()).then((r) => r.json()).then((d) => d.url);
};

const result = await uploader.uploadLarge({
  file,
  dirName: "formal/test/hehe",
  selfName: false,
  chunkSize: 5 * 1024 * 1024,
  concurrency: 3,
  getSignedUrl,
  onProgress: ({ loaded, total }) => {
    console.log(Math.floor((loaded / total) * 100) + '%');
  }
});
```

```javascript
// mini upload file
// init
const lingOssUpload = new LingOssUpload({
  accessId: "user accessId",
  accessKey: "user accessKey"
});

const formData = lingOssUpload.createMiniUploadInfo({
  dirName: 'formal/test/hehe',
  limitSize: 1024 * 1024 * 1,
});

wx.chooseImage({
  success(res) {
    const tempFilePaths = res.tempFilePaths;
    try {
      wx.uploadFile({
        url: "host",
        filePath: tempFilePaths[0],
        name: 'file',
        formData,
        success(res) {
          if (res && res.data) {
            const { data } = res;
            const result = /<Code>(.*)<\/Code>/gmi.exec(data);
            console.log(RegExp.$1);
          } else {
            console.log("host/" + formData.key);
          }
        },
        fail(res) {
          console.log(res);
        }
      });
    } catch (e) {
      console.log(e);
    }
  }
});
```

```javascript
// 小程序零密钥上传(后端签名)
const uploader = new LingOssUpload(); // 无需密钥

// getMiniUploadInfo 回调: 请求后端, 返回签名 POST 字段
const getMiniUploadInfo = (req) => {
  // req: { objectKey, limitSize }
  const params = new URLSearchParams(req);
  return fetch("/mini-post?" + params.toString()).then((r) => r.json());
};

const formData = await uploader.createMiniUploadInfoBySigner({
  dirName: "formal/test/hehe",
  limitSize: 1024 * 1024 * 1,
  getMiniUploadInfo
});

wx.uploadFile({
  url: "host",
  filePath: tempFilePaths[0],
  name: 'file',
  formData
});
```

## Demo 服务

`npm run demo` 同时托管 `test/demo.html`、打包产物，以及以下接口：

- `GET /api/config` → bucket/region/CDN 域名等非敏感配置
- `GET /sign` → 分片签名 URL
- `GET /mini-post` → 小程序 POST 表单签名字段
- `GET /api/sts` → STS 临时凭证，供 `uploadBySts()` 直传

`/api/sts` 凭证来源：

- 已配置 `OSS_SECURITY_TOKEN`：直接返回配置的临时凭证
- 配置了 `STS_ROLE_ARN`（或 `test/ossInfo.js` 的 `roleArn`）：调用 AssumeRole
- AssumeRole 默认使用主 AK/SK；也可在 `ossInfo.js` 单独配置 `stsKey` / `stsSecret`
- 可选 `ossInfo.js` 字段：`stsEndpoint` / `stsRegion` / `stsDurationSeconds` / `stsImgPrefixes` / `stsVideoPrefixes`
  （前缀会生成限制写入目录的会话 Policy）
- `GET /api/sts?roleArn=acs:ram::...` 可临时指定角色（页面第 4 节有输入框）
- 角色需信任当前 RAM 用户，且该用户需要 `sts:AssumeRole` 权限
- 都没有配置：无法生成 STS，回退使用长期 AK/SK（仅本地 demo 调试，页面会提示）
- 可选：`STS_DURATION`(默认 3600)、`STS_ROLE_SESSION`、`STS_POLICY`、`STS_ENDPOINT`

> `/api/sts` 会返回临时凭证。demo-server 默认只监听 `127.0.0.1`，CORS 仅允许本机来源；
> 不要把该服务部署到公网，也不要在不可信网络下设置 `DEMO_HOST=0.0.0.0`。

## 安全与隐私

- **不要提交或上传真实密钥**：`test/ossInfo.js` 已被 `.gitignore` 忽略，仅用于本地开发。
  新环境请复制 `test/ossInfo.example.js` 为 `test/ossInfo.js` 后再填值。
- 不要使用 `git add -f test/ossInfo.js`，也不要把 AccessKey / AccessKeySecret / SecurityToken
  粘贴到 issue、PR、日志或聊天记录中。
- npm 包的 `files` 仅包含 `index.js`、`index.d.ts`、`dist/`、`bin/upload.js`、`CHANGELOG.md`，
  `test/` 目录（含 `ossInfo.js`）不会发布。
- `demo-server` 只监听 `127.0.0.1`，`/api/sts` 的 CORS 仅允许 `localhost` / `127.0.0.1` 来源；
  它返回的是临时凭证，不要暴露到公网。
- 生产环境请使用零密钥模式（`uploadLarge` 的签名 URL、`createMiniUploadInfoBySigner` 的后端签名，
  或 `uploadBySts` + 自己的 STS 服务），避免把长期 AK/SK 放到前端。
- 如果密钥疑似泄露：立即在 RAM 控制台禁用/轮换 AccessKey，并检查 OSS 访问日志。

自查命令：

```bash
git ls-files | grep -i ossinfo   # 应为空
npm pack --dry-run               # 确认 test/ 不在发布内容中
```

## CLI 与 ossutil

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

## STS 本地服务

`server/sts-server.js` 提供签名接口(后端签名, 前端零密钥), 供上面两个新方法使用。启动:

```bash
# 直接读取 test/ossInfo.js 的 accessId / accessKey / bucketName / ossRegion
node server/sts-server.js

# 或全部通过环境变量覆盖
OSS_ACCESS_ID=xxx OSS_ACCESS_KEY=xxx OSS_BUCKET=cdn-didano OSS_REGION=oss-cn-shenzhen node server/sts-server.js
```

接口:

- `GET /sign?verb=POST&objectKey=formal/a.jpg&action=init` → `{ url }`(分片上传各步骤)
- `GET /mini-post?objectKey=formal/a.jpg&limitSize=1048576` → `{ OSSAccessKeyId, policy, signature, "x-oss-security-token" }`(小程序 POST 表单)
