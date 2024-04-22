export interface OptionsType {
  rootDir?: string;
}

export interface OssInfoType {
  accessId: string;
  accessKey: string;
  securityToken?: string;
}

export interface UploadType {
  file: File;
  host: string;
  dirName: string;
  selfName?: boolean;
  limitSize?: number;
  limitType?: string | Function;
  onProgress?: Function;
  uploadFile?: Function;
  cdnHost?: string;
  isCompressor?: Boolean;
  options?: Compressor.Options;
}

export interface MiniUploadType {
  dirName: string;
  limitSize?: number;
  selfName?: boolean;
}

export interface OutType {
  code: number;
  data: string;
  message: string;
  success: boolean;
}

export interface MiniOutType {
  name: string;
  key: string;
  success_action_status: number;
  OSSAccessKeyId: string;
  policy: string;
  signature: string;
  "x-oss-security-token"?: string;
}
