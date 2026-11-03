# upload file to oss

> add ossutil
  upload build files, auto find .ossutilconfig config.(current project root path > global)

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
// 大文件分片上传 + 断点续传(签名 URL, 前端零密钥)
const uploader = new LingOssUpload(); // 无需密钥

// getSignedUrl 回调: 请求后端签名接口, 返回签名 URL
const getSignedUrl = (req) => {
  // req: { verb, objectKey, partNumber?, uploadId?, action }
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

## STS 本地服务

`server/sts-server.js` 提供签名接口(后端签名, 前端零密钥), 供上面两个新方法使用。启动:

```bash
OSS_ACCESS_ID=xxx OSS_ACCESS_KEY=xxx OSS_BUCKET=cdn-didano OSS_REGION=oss-cn-shenzhen node server/sts-server.js
```

接口:

- `GET /sign?verb=POST&objectKey=formal/a.jpg&action=init` → `{ url }`(分片上传各步骤)
- `GET /mini-post?objectKey=formal/a.jpg&limitSize=1048576` → `{ OSSAccessKeyId, policy, signature, "x-oss-security-token" }`(小程序 POST 表单)
