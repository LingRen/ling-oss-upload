import Base64 from "crypto-js/enc-base64";
import HmacSHA1 from "crypto-js/hmac-sha1";
import Utf8 from "crypto-js/enc-utf8";

import {
  getMessage2Xml,
  getRandomString,
  getSuffix,
  ajax,
  compressorImage
} from "./utils";

import {
  OptionsType,
  UploadType,
  OutType,
  MiniOutType,
  MiniUploadType,
  OssInfoType,
  MultipartUploadOptions,
  MiniUploadBySignerOptions,
  UploadByStsOptions
} from "./interface";

import {
  initiateMultipart,
  uploadPart,
  completeMultipart,
  abortMultipart,
  listParts,
  runWithConcurrency,
  getStorageKey,
  loadResumeState,
  saveResumeState,
  clearResumeState
} from "./multipart";

/**
 * 上传文件到oss
 */
class LingOssUpload {
  ossInfo: OssInfoType;
  options: OptionsType;

  /**
   * @constructor
   * @param {OssInfoType} ossInfo oss对象
   * @param {OptionsType} options 配置项
   */
  constructor(ossInfo: OssInfoType = {} as OssInfoType, options: OptionsType = {}) {
    this.ossInfo = ossInfo;
    this.options = options;
  }

  /**
   * 获取oss的accessId
   * @readonly
   * @memberof LingOssUpload
   */
  get ossAccessId(): string {
    return this.ossInfo.accessId;
  }
  /**
   * 获取oss的accessKey
   * @readonly
   * @memberof LingOssUpload
   */
  get ossAccessKey(): string {
    return this.ossInfo.accessKey;
  }

  /**
   * 进行Policy base64编码
   * @param {number} limitSize 上传大小限制
   */
  getPolicyBase64(limitSize: number): string {
    let conditions: Array<any> = [];

    conditions.push(["starts-with", "$bucket", ""]);

    if (this.options.rootDir) {
      conditions.push(["starts-with", "$key", this.options.rootDir]);
    }

    // 如果设置限制就追加进去
    if (limitSize && !Number.isNaN(+limitSize)) {
      // 设置上传文件的大小限制，如果超过限制，文件上传到OSS会报错
      conditions.push(["content-length-range", 0, limitSize]);
    }
    // 上传时间一天
    const DAY = new Date();
    DAY.setDate(DAY.getDate() + 1);

    let policy = {
      // 设置Policy的失效时间，如果超过失效时间，就无法通过此Policy上传文件
      expiration: DAY.toISOString(),
      conditions: conditions
    };

    return Utf8.parse(JSON.stringify(policy)).toString(Base64);
  }
  /**
   * Signature加密
   * @param {string} accessKey oss的accessKey
   * @param {string} policyBase64 Policy base64编码
   */
  getSignature(accessKey: string, policyBase64: string): string {
    return HmacSHA1(policyBase64, accessKey).toString(Base64);
  }

  /**
   * 获取上传文件目录名
   * @param {string} dirName 上传路径
   */
  getDirName(dirName: string): string {
    if (dirName != "" && !dirName.endsWith("/")) {
      return `${dirName}/`;
    }
    return dirName;
  }

  /**
   * 如果采用本地名，则直接返回'${filename}'
   * 如果采用随机名，则通过随机名加上后缀名
   * @param {string} filename 文件名
   * @param {boolean} selfName 是否采用自身文件名称
   */
  getCalculateObjectName(filename: string, selfName: boolean): string {
    let objectName = "";
    if (selfName) {
      if (filename) {
        objectName = "${filename}";
      } else {
        objectName = `${getRandomString()}`;
      }
    } else {
      objectName = `${getRandomString()}${getSuffix(filename)}`;
    }

    return objectName;
  }
  /**
   * 上传文件
   * @param {UploadType} options 配置项
   *  @param {File} file 上传的文件
   *  @param {string} host 上传地址
   *  @param {boolean} selfName 是否使用文件本身名称
   *  @param {number} limitSize 文件上传大小限制（B）
   *  @param {string|Function} limitType 文件类型限制
   *  @param {string} dirName 上传到oss路径
   *  @param {Function} onProgress 上传进度方法
   */
  async upload({
    file,
    host,
    dirName,
    selfName = false,
    limitSize = 0,
    limitType = "",
    onProgress = () => ({}),
    uploadFile = ajax,
    cdnHost = host,
    isCompressor = true,
    options = {}
  }: UploadType): Promise<OutType> {
    if (!this.ossAccessId || !this.ossAccessKey) {
      throw new Error("check oss accessId || accessKey");
    }
    if (this.ossAccessId.indexOf("STS.") === 0 && !this.ossInfo.securityToken) {
      throw new Error("STS AccessId 需要同时提供 securityToken");
    }
    // 获取文件信息，
    const fileName = file.name;
    const fileSize = file.size;
    const fileType = file.type;

    if (fileType.startsWith("image") && isCompressor) {
      file = await compressorImage(file, options);
    }

    if (limitType && fileType) {
      let isLimitType = true;
      if (typeof limitType === "function") {
        isLimitType = limitType(file);
      } else {
        isLimitType = new RegExp(`${limitType}/(\\S)+`, "gi").test(fileType);
      }

      if (!isLimitType) {
        return Promise.reject({
          code: 400,
          data: ``,
          message: `请检查文件类型`,
          success: false
        });
      }
    }
    if (limitSize && fileSize) {
      if (limitSize < fileSize) {
        return Promise.reject({
          code: 400,
          data: ``,
          message: `最大上传${limitSize / 1024 / 1024}M的文件`,
          success: false
        });
      }
    }

    const objectName =
      this.getDirName(dirName) +
      this.getCalculateObjectName(fileName, selfName);
    const policy = this.getPolicyBase64(limitSize);
    // 获取
    const formData = new FormData();
    formData.append("name", file.name);
    formData.append("key", objectName);
    formData.append("policy", policy);
    formData.append("OSSAccessKeyId", this.ossAccessId);
    formData.append("success_action_status", "200");
    formData.append("signature", this.getSignature(this.ossAccessKey, policy));
    // OSS PostObject 要求 file 必须是最后一个字段，STS token 必须放在 file 之前
    if (this.ossInfo.securityToken) {
      formData.append("x-oss-security-token", this.ossInfo.securityToken);
    }
    formData.append("file", file);

    return new Promise((resolve, reject) => {
      uploadFile(host, formData, onProgress)
        .then(() => {
          // 上传成功的返回结果
          resolve({
            code: 200,
            data: `${cdnHost}/${objectName}`.replace("${filename}", fileName),
            message: "上传成功",
            success: true
          });
        })
        .catch((e: Error & string) => {
          reject({
            code: 400,
            data: ``,
            message: (e && e.message) || getMessage2Xml(e),
            success: false
          });
        });
    });
  }
  /**
   * create mini upload file oss info
   * @param {string} dirName upload file dir path
   * @param {number} limitSize upload file size limit
   */
  createMiniUploadInfo({
    dirName,
    limitSize = 0,
    selfName = false
  }: MiniUploadType): MiniOutType {
    if (!this.ossAccessId || !this.ossAccessKey) {
      throw new Error("check oss accessId || accessKey");
    }
    if (this.ossAccessId.indexOf("STS.") === 0 && !this.ossInfo.securityToken) {
      throw new Error("STS AccessId 需要同时提供 securityToken");
    }
    // gen random file name
    const fileName = this.getCalculateObjectName("", selfName);
    const policy = this.getPolicyBase64(limitSize);
    const signature = this.getSignature(this.ossAccessKey, policy);
    const objectName = this.getDirName(dirName) + fileName;

    return {
      name: fileName,
      key: objectName,
      success_action_status: 200,
      OSSAccessKeyId: this.ossAccessId,
      policy,
      signature,
      "x-oss-security-token": this.ossInfo.securityToken
    };
  }
  /**
   * 小程序零密钥上传：通过注入的 getMiniUploadInfo 回调向后端获取签名 POST 字段
   * 小程序不持有 accessKeySecret，policy/signature 由后端用 STS 签名
   * @param {MiniUploadBySignerOptions} options 配置项
   */
  async createMiniUploadInfoBySigner({
    dirName,
    getMiniUploadInfo,
    limitSize = 0,
    selfName = false
  }: MiniUploadBySignerOptions): Promise<MiniOutType> {
    // 计算 objectKey（复用命名逻辑，无需密钥）
    const fileName = this.getCalculateObjectName("", selfName);
    const objectName = this.getDirName(dirName) + fileName;

    // 从后端获取签名 POST 字段
    const signed = await getMiniUploadInfo({ objectKey: objectName, limitSize });

    return {
      name: fileName,
      key: objectName,
      success_action_status: 200,
      OSSAccessKeyId: signed.OSSAccessKeyId,
      policy: signed.policy,
      signature: signed.signature,
      "x-oss-security-token": signed["x-oss-security-token"]
    };
  }
  /**
   * STS 直传（不分片）：通过 getStsToken 回调获取临时凭证，
   * 复用 upload() 的 POST 表单方式一次性上传整个文件。
   * @param {UploadByStsOptions} options 配置项
   */
  async uploadBySts(options: UploadByStsOptions): Promise<OutType> {
    const { getStsToken, ...uploadOptions } = options;
    const token: any = await getStsToken();

    // 兼容阿里云 SDK 的 PascalCase 返回（AccessKeyId / AccessKeySecret / SecurityToken）
    const accessId =
      token && (token.accessId || token.AccessKeyId || token.accessKeyId);
    const accessKey =
      token &&
      (token.accessKey || token.AccessKeySecret || token.accessKeySecret);
    const securityToken =
      token &&
      (token.securityToken ||
        token.SecurityToken ||
        token.security_token ||
        token.token);

    if (!accessId || !accessKey) {
      throw new Error("check sts accessId || accessKey");
    }
    if (String(accessId).indexOf("STS.") === 0 && !securityToken) {
      throw new Error("STS AccessId 需要同时提供 securityToken");
    }

    const uploader = new LingOssUpload(
      { accessId, accessKey, securityToken },
      this.options
    );

    return uploader.upload(uploadOptions);
  }
  /**
   * 大文件分片上传（支持断点续传）
   * 通过 getSignedUrl 回调获取签名 URL，浏览器不持有密钥
   * @param {MultipartUploadOptions} options 配置项
   */
  async uploadLarge({
    file,
    dirName,
    getSignedUrl,
    selfName = false,
    chunkSize = 1024 * 1024,
    concurrency = 3,
    onProgress = () => ({}),
    resumeKey
  }: MultipartUploadOptions): Promise<OutType> {
    const fileName = file.name;
    const fileSize = file.size;

    const storageKey = getStorageKey(resumeKey, file);
    let state = loadResumeState(storageKey);

    let objectName: string;
    if (state && state.objectKey && state.chunkSize === chunkSize) {
      // 命中续传状态：复用已存 objectName 与 uploadId
      objectName = state.objectKey;
    } else {
      // 全新上传：计算 objectName 并初始化分片（selfName 用真实文件名，否则随机名+后缀）
      objectName = selfName
        ? this.getDirName(dirName) + fileName
        : this.getDirName(dirName) + getRandomString() + getSuffix(fileName);
      state = {
        objectKey: objectName,
        uploadId: await initiateMultipart(getSignedUrl, objectName),
        chunkSize,
        parts: []
      };
      saveResumeState(storageKey, state);
    }

    // 仅续传时与服务端对账已传分片（uploadId 可能已被回收）。
    // 全新上传没有已传分片，跳过 ListParts：少一次请求，也不需要 oss:ListParts 权限。
    if (state.parts.length > 0) {
      try {
        const serverParts = await listParts(
          getSignedUrl,
          objectName,
          state.uploadId
        );
        state.parts = serverParts;
        saveResumeState(storageKey, state);
      } catch (e) {
        const uploadId = await initiateMultipart(getSignedUrl, objectName);
        state = { objectKey: objectName, uploadId, chunkSize, parts: [] };
        saveResumeState(storageKey, state);
      }
    }

    // 计算剩余待传分片与已完成字节
    const completed: { [key: number]: boolean } = {};
    state.parts.forEach((p) => {
      completed[p.partNumber] = true;
    });

    let completedBytes = state.parts.reduce((sum, p) => {
      const start = (p.partNumber - 1) * chunkSize;
      return sum + Math.min(chunkSize, fileSize - start);
    }, 0);

    const totalParts = Math.ceil(fileSize / chunkSize);
    const pending: Array<{ partNumber: number; blob: Blob }> = [];
    for (let n = 1; n <= totalParts; n++) {
      if (!completed[n]) {
        const start = (n - 1) * chunkSize;
        pending.push({
          partNumber: n,
          blob: file.slice(start, Math.min(start + chunkSize, fileSize))
        });
      }
    }

    const inFlight: { [key: number]: number } = {};

    const report = () => {
      let loaded = completedBytes;
      Object.keys(inFlight).forEach((k) => {
        loaded += inFlight[Number(k)];
      });
      onProgress({ loaded, total: fileSize });
    };

    try {
      await runWithConcurrency(pending, concurrency, async (item) => {
        const part = await uploadPart(
          getSignedUrl,
          objectName,
          state.uploadId,
          item.partNumber,
          item.blob,
          (e: ProgressEvent) => {
            inFlight[item.partNumber] = e.loaded;
            report();
          }
        );
        delete inFlight[item.partNumber];
        completedBytes += item.blob.size;
        state.parts.push(part);
        saveResumeState(storageKey, state);
        report();
      });

      await completeMultipart(
        getSignedUrl,
        objectName,
        state.uploadId,
        state.parts
      );
      clearResumeState(storageKey);
    } catch (e) {
      try {
        await abortMultipart(getSignedUrl, objectName, state.uploadId);
      } catch (abortError) {
        // 中止失败时忽略，尽力清理即可
      }
      clearResumeState(storageKey);
      return Promise.reject({
        code: 400,
        data: "",
        message: (e && e.message) || getMessage2Xml(e),
        success: false
      });
    }

    return {
      code: 200,
      data: objectName,
      message: "上传成功",
      success: true
    };
  }
}


export default LingOssUpload;
