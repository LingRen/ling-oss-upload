import Base64 from "crypto-js/enc-base64";
import HmacSHA1 from "crypto-js/hmac-sha1";
import Utf8 from "crypto-js/enc-utf8";

import { getMessage2Xml, getRandomString, getSuffix, ajax } from "./utils";

import {
  OptionsType,
  UploadType,
  OutType,
  MiniOutType,
  MiniUploadType,
  OssInfoType
} from "./interface";

/**
 * 上传文件到oss
 */
class LingOssUpload {
  ossInfo: OssInfoType;
  accessId: string;
  accessKey: string;
  rootDir: string;

  /**
   * @constructor
   * @param {OssInfoType} ossInfo oss对象
   * @param {OptionsType} options 配置项，包括accessId、accessKey、rootDir(路径必须以该路径开始)
   */
  constructor(
    ossInfo: OssInfoType,
    { accessId = "accessid", accessKey = "accesskey", rootDir = "formal/" } = {}
  ) {
    this.ossInfo = ossInfo;
    this.accessId = accessId;
    this.accessKey = accessKey;
    this.rootDir = rootDir;

    if (!this.ossAccessId || !this.ossAccessKey) {
      throw new Error("check oss accessId || accessKey");
    }
  }

  /**
   * 获取oss的accessId
   * @readonly
   * @memberof LingOssUpload
   */
  get ossAccessId(): string {
    return this.ossInfo[this.accessId];
  }
  /**
   * 获取oss的accessKey
   * @readonly
   * @memberof LingOssUpload
   */
  get ossAccessKey(): string {
    return this.ossInfo[this.accessKey];
  }

  /**
   * 进行Policy base64编码
   * @param {number} limitSize 上传大小限制
   */
  getPolicyBase64(limitSize: number): string {
    let conditions: Array<any> = [["starts-with", "$key", this.rootDir]];

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
  upload({
    file,
    host,
    dirName,
    selfName = false,
    limitSize = 0,
    limitType = "",
    onProgress = () => {},
    uploadFile = ajax
  }: UploadType): Promise<OutType> {
    // 获取文件信息，
    const fileName = file.name;
    const fileSize = file.size;
    const fileType = file.type;
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
    formData.append("file", file);

    return new Promise((resolve, reject) => {
      uploadFile(host, formData, onProgress)
        .then(() => {
          // 上传成功的返回结果
          resolve({
            code: 200,
            data: `${host}/${objectName}`.replace("${filename}", fileName),
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
    limitSize = 0
  }: MiniUploadType): MiniOutType {
    // gen random file name
    const fileName = this.getCalculateObjectName("", false);
    const policy = this.getPolicyBase64(limitSize);
    const signature = this.getSignature(this.ossAccessKey, policy);
    const objectName = this.getDirName(dirName) + fileName;

    return {
      name: fileName,
      key: objectName,
      success_action_status: 200,
      OSSAccessKeyId: this.ossAccessId,
      policy,
      signature
    };
  }
}

export default LingOssUpload;
