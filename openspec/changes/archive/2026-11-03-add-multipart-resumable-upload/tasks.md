## 1. 类型与合同定义

- [x] 1.1 在 `src/interface.ts` 新增 `SignedUrlRequest` / `GetSignedUrl` / `MultipartUploadOptions` / `ResumeState` 等类型
- [x] 1.2 同步更新 `index.d.ts` 类型声明（含 securityToken 补齐）
- [x] 1.3 定义续传状态存储结构（objectKey、uploadId、chunkSize、parts[{partNumber, etag}]）

## 2. 分片上传引擎

- [x] 2.1 实现 initiate：调用 `getSignedUrl({verb:'POST', action:'init'})`，POST 后解析 XML 取 uploadId
- [x] 2.2 实现文件分片与单分片 PUT（`getSignedUrl({verb:'PUT', partNumber})`，取响应头 ETag）
- [x] 2.3 实现并发队列（默认 3 路，可配置）
- [x] 2.4 实现 complete：按 partNumber 升序提交分片列表（含 ETag）
- [x] 2.5 实现 abort 与失败清理

## 3. 断点续传

- [x] 3.1 实现文件指纹计算与 localStorage 读写
- [x] 3.2 实现续传恢复：读取已存状态，listParts 对账，只补传剩余分片
- [x] 3.3 成功/失败后清理续传状态

## 4. 公共 API

- [x] 4.1 在 `LingOssUpload` 新增 `uploadLarge()` 并接入引擎
- [x] 4.2 复用现有 objectKey 命名逻辑（dirName / selfName）
- [x] 4.3 onProgress 聚合上报（含续传恢复时的已完成字节）

## 5. 测试

- [x] 5.1 分片上传成功路径测试
- [x] 5.2 断点续传恢复测试
- [x] 5.3 失败 abort 与状态清理测试
- [x] 5.4 并发与进度上报测试
- [x] 5.5 回归验证旧 upload() / createMiniUploadInfo() 行为不变
