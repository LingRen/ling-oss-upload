import Compressor from "compressorjs";

export function compressorImage(
  file: File,
  options: Compressor.Options = {}
): Promise<File> {
  return new Promise((resolve) => {
    new Compressor(file, {
      ...options,
      success(result: File | Blob) {
        if (result instanceof File) {
          resolve(result);
        } else {
          const newFile = new File([result], file.name, {
            type: file.type,
            lastModified: file.lastModified
          });
          resolve(newFile);
        }
      },
      error(err) {
        console.log(err.message);
        resolve(file);
      }
    });
  });
}
/**
 * 获取XML信息
 * @param {string} data xml字符串
 * @param {string} message 错误信息
 */
export const getMessage2Xml = (data: string, message = "上传失败") => {
  if (window.DOMParser) {
    message =
      new DOMParser()
        .parseFromString(data, "text/xml")
        .getElementsByTagName("Message")[0].textContent || message;
  }

  return message;
};

/**
 * 获取随机字符串
 * @param {number} len 字符长度
 */
export const getRandomString = (len = 32): string => {
  let chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
  let pwd = "";
  for (let i = 0; i < len; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
};

/**
 * 获取文件后缀名
 * @param {string} filename 文件名
 */
export const getSuffix = (filename: string): string => {
  let pos = filename.lastIndexOf(".");
  if (~pos) {
    return filename.substring(pos);
  }
  return "";
};

/**
 * ajax post
 * @param {string} url
 * @param {FormData} formData 请求数据
 * @param {Function} onProgress
 */
export const ajax = (url: string, formData: FormData, onProgress: Function) => {
  return new Promise((resolve, reject) => {
    let xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable) {
        onProgress(e);
      }
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.responseText);
      } else {
        reject(xhr.responseText);
      }
    };
    // false， true => 同步， 异步
    xhr.open("POST", url, true);
    xhr.send(formData);
  });
};
