export interface OptionsType {
  rootDir: string;
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
  "x-oss-security-token"?: string;
}

export type SignedUrlVerb = "POST" | "PUT" | "DELETE" | "GET";
export type SignedUrlAction = "init" | "part" | "complete" | "abort" | "listParts";

export interface SignedUrlRequest {
  verb: SignedUrlVerb;
  objectKey: string;
  partNumber?: number;
  uploadId?: string;
  action?: SignedUrlAction;
}

export type GetSignedUrl = (req: SignedUrlRequest) => Promise<string>;

export interface PartInfo {
  partNumber: number;
  etag: string;
}

export interface ResumeState {
  objectKey: string;
  uploadId: string;
  chunkSize: number;
  parts: PartInfo[];
}

export interface MultipartUploadOptions {
  file: File;
  dirName: string;
  getSignedUrl: GetSignedUrl;
  selfName?: boolean;
  chunkSize?: number;
  concurrency?: number;
  onProgress?: Function;
  resumeKey?: string;
}

declare class LingOssUpload {
  constructor(ossInfo?: OssInfoType, options?: OptionsType);

  upload(uploadType: UploadType): Promise<OutType>;
  createMiniUploadInfo(miniUploadType: MiniUploadType): MiniOutType;
  uploadLarge(options: MultipartUploadOptions): Promise<OutType>;
}

export default LingOssUpload;
