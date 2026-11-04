// 本地开发配置示例
// 复制为 test/ossInfo.js 后填入真实值；test/ossInfo.js 已被 .gitignore 忽略
// 切勿提交、上传或把真实密钥粘贴到 issue / 日志 / 聊天中
export default {
  // 长期 AK/SK
  accessId: "",
  accessKey: "",

  // bucket 信息（bucketName / ossRegion 优先；也可只给 ossHost 自动解析）
  ossHost: "https://<bucket>.oss-cn-shenzhen.aliyuncs.com",
  bucketName: "",
  ossRegion: "oss-cn-shenzhen",

  // CDN 访问域名
  host: "https://<cdn-domain>",

  // 可选：已有 STS 临时凭证
  securityToken: "",

  // 可选：AssumeRole 生成 STS
  roleArn: "acs:ram::<account-id>:role/<role-name>",
  stsKey: "",
  stsSecret: "",
  stsEndpoint: "https://sts.cn-shanghai.aliyuncs.com",
  stsRegion: "cn-shanghai",
  stsDurationSeconds: 900,
  stsImgPrefixes: "formal/,tmp/,upload/",
  stsVideoPrefixes: "formal/,tmp/"
};
