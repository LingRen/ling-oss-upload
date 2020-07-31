# upload file to oss

> constructor need two parameters

| parameter | type | default  | explain |
| :----: | :----: | :----: | :----: |
| ossInfo | Object | ———— | oss info |
| options | Object | { accessId = "accessid", accessKey = "accesskey", rootDir = "formal/" } | accessid && accessKey(these keys get information from ossInfo), rootDir(start directory) |

> upload need a object parameter
 
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

> createMiniUploadInfo need a object parameter

| parameter | type | default  | explain |
| :----: | :----: | :----: | :----: |
| limitSize | Number | 0 | limit upload file size |
| dirName | String | ———— | upload file to oss path |

> code example

```javascript
// init
const lingOssUpload = new LingOssUpload({
  accessId: "user accessId",
  accessKey: "user accessKey"
}, {
  accessId: "accessId",
  accessKey: "accessKey",
  rootDir: "formal"
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
    console.log(`Log: handleChange -> data`, data);
  } catch (e) {
    console.log((e && e.message) || "Network Error");
  }
};
```

```javascript
// mini upload file
// init
const lingOssUpload = new LingOssUpload({
  accessId: "user accessId",
  accessKey: "user accessKey"
}, {
  accessId: "accessId",
  accessKey: "accessKey",
  rootDir: "formal"
});

const formData = lingOssUpload.createMiniUploadInfo({
  dirName: 'formal/test/hehe',
  limitSize: 1024 * 1024 * 1,
})

wx.chooseImage({
  success (res) {
    const tempFilePaths = res.tempFilePaths
    try {
      // can use UploadTask listen progress
      wx.uploadFile({
        url: "host",
        filePath: tempFilePaths[0],
        name: 'file',
        formData,
        success (res){
          // has return message is upload file false
          if (res && res.data) {
            const { data } = res
            const result = /<Code>(.*)<\/Code>/gmi.exec(data)
            console.log(RegExp.$1)
          } else {
            console.log(`host/${formData.key}`)
          }
        },
        fail (res) {
          console.log(res)
        }
      })
    } catch (e) {
      console.log(e)
    }
  }
}
```
