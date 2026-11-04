# Changelog

本项目所有值得注意的变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- `uploadBySts()`：通过 `getStsToken` 获取临时凭证后一次性直传（不分片），兼容阿里云 SDK 的 PascalCase 字段
- demo 服务与页面：覆盖 `upload` / `uploadBySts` / `uploadLarge` / 小程序两种签名方式
- `/api/sts`：支持已有临时凭证、AssumeRole，或回退长期 AK/SK（仅本地 demo）
- CLI 按平台按需下载 ossutil 1.7.9 并校验 SHA256

### Fixed
- 分片签名缺少 `Content-Type` 导致 `SignatureDoesNotMatch`
- 全新上传不必要地调用 `ListParts`；现在仅在续传对账时调用
- `x-oss-security-token` 位于 `file` 之后被 OSS 忽略，导致 STS 上传失败

### Changed
- 仓库与 npm 包移除 macOS / Linux / Windows 三个 ossutil 二进制
- README 重写：补充五种上传方式的实现流程、参数、后端契约与示例
- 凭证校验集中到 `ensureOssCredentials()`，demo 页面逻辑拆分为 `test/demo.js`

## [2.5.0] - 2026-11-03

### Added
- 大文件分片上传 + 断点续传：新增 `uploadLarge()`，走 OSS Multipart Upload API，采用签名 URL 模式（注入 `getSignedUrl` 回调，前端零密钥），localStorage 持久化续传状态
- 小程序零密钥上传：新增 `createMiniUploadInfoBySigner()`，通过注入 `getMiniUploadInfo` 回调向后端获取签名 POST 表单字段，小程序不持有密钥
- STS 本地服务 `server/sts-server.js`：提供 `/sign`（分片各步骤签名 URL）与 `/mini-post`（小程序 POST 表单签名）接口

### Fixed
- `getMessage2Xml` 在错误 XML 无 `<Message>` 元素时抛 TypeError 的问题

### Changed
- 构造函数不再强校验密钥（改为 `upload()` / `createMiniUploadInfo()` 内校验），使 `uploadLarge()` / `createMiniUploadInfoBySigner()` 可零密钥使用
- tsconfig：`types: []` + `lib es2015/dom`，规避 TS4 语法 @types 破坏 TS 3.9 编译
- `index.d.ts` 与 `src/interface.ts` 对齐（`rootDir` 改可选、补 `cdnHost`/`isCompressor`/`options`/`selfName`）

### Tests
- 引入 jest + jsdom，新增 12 例单测（分片成功/续传/abort/并发进度/回归 + 小程序零密钥）
