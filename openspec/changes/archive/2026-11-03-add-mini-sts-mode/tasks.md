## 1. 类型与合同定义

- [x] 1.1 在 src/interface.ts 新增 MiniSignedFields / MiniSignRequest / GetMiniUploadInfo / MiniUploadBySignerOptions 类型
- [x] 1.2 同步更新 index.d.ts 类型声明

## 2. 库方法

- [x] 2.1 新增 createMiniUploadInfoBySigner()：计算 objectKey + 调用 getMiniUploadInfo 回调 + 组装 MiniOutType
- [x] 2.2 复用现有命名逻辑（getDirName / getCalculateObjectName）

## 3. STS 本地服务

- [x] 3.1 server/sts-server.js 新增 GET /mini-post 接口，返回签名 POST 表单字段
- [x] 3.2 后端构建 policy（expiration + conditions）并做 base64 + HMAC-SHA1 签名

## 4. 测试

- [x] 4.1 createMiniUploadInfoBySigner 成功路径（回调返回签名字段，组装正确）
- [x] 4.2 回调抛错时 reject
- [x] 4.3 回归验证 createMiniUploadInfo 行为不变
