export interface OptionsType {
  rootDir: string;
}

export interface OssInfoType {
  accessId: string;
  accessKey: string;
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
}

export interface MiniUploadType {
  dirName: string;
  limitSize?: number;
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
}

declare class LingOssUpload {
  constructor(ossInfo: OssInfoType, options?: OptionsType): LingOssUpload;

  upload(uploadType: UploadType): Promise<OutType>;
  createMiniUploadInfo(miniUploadType: UploadType): MiniOutType;
}

export default LingOssUpload;
