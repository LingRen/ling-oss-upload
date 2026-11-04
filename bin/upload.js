#! /usr/bin/env node

const os = require("os");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const childProcess = require("child_process");
const chalk = require("chalk");
const yargs = require("yargs");

const { config, dest, bucket, meta, download } = yargs
  .command("upload folder to oss")
  .option("config", {
    alias: "c",
    describe: "ossutil config file path"
  })
  .option("dest", {
    alias: "d",
    describe: "upload folder path"
  })
  .option("bucket", {
    alias: "b",
    describe: "oss bucket path"
  })
  .option("download", {
    alias: "download",
    describe: "is download"
  })
  .option("meta", {
    alias: "m",
    describe:
      "set meta [header:value#header:value...], eg: Cache-Control:no-cache#Content-Encoding:gzip"
  })
  .help().argv;

const platform = os.platform();

// ossutil 按平台按需下载，仓库/发包不再携带三个平台的二进制
const OSSUTIL_VERSION = "1.7.9";
const OSSUTIL_BASE =
  process.env.OSSUTIL_DOWNLOAD_BASE ||
  "https://gosspublic.alicdn.com/ossutil/" + OSSUTIL_VERSION;

const BINARIES = {
  darwin: {
    name: "ossutilmac64",
    sha256: "e04e80bce99f47f92c348ecda5703468ab2d99ec655e7aaf8bdd38dfe4c1fa98"
  },
  win32: {
    name: "ossutil64.exe",
    sha256: "5c4b71dbb2e17cde6ed78966defc797586def7238a40f3fc193ae603d87bec38"
  },
  linux: {
    name: "ossutil64",
    sha256: "cefdc6a521ab8ace00835d26f08443f9c13b859af2a3c5969525ca96e5562696"
  }
};

let configPath = config || ".ossutilconfig";
let existsConfig = fs.existsSync(path.resolve(configPath));

function upload(ossUtilPath) {
  childProcess.execFile(
    ossUtilPath,
    [
      "cp",
      ...(existsConfig ? ["-c", path.resolve(configPath)] : []),
      "-f",
      "-r",
      "--exclude",
      ".DS_Store",
      ...(meta == void 0 || meta == true ? [] : ["--meta", meta]),
      ...(download
        ? [path.resolve(dest || "./distCDN"), bucket, "--update"].reverse()
        : [path.resolve(dest || "./distCDN"), bucket])
    ],
    (error, stdout, stderr) => {
      if (error) {
        console.error(chalk.red("exec error: " + error));
        return;
      }
      if (stdout) {
        console.log(chalk.green("stdout: " + stdout));
      }
      if (stderr) {
        console.error(chalk.red("stderr: " + stderr));
      }
    }
  );
}

function downloadFile(url, destination, redirectCount) {
  const count = redirectCount || 0;

  return new Promise(function (resolve, reject) {
    const client = url.indexOf("http:") === 0 ? http : https;

    const request = client.get(url, function (res) {
      const status = res.statusCode || 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (count >= 5) {
          reject(new Error("too many redirects: " + url));
          return;
        }
        resolve(
          downloadFile(
            new URL(res.headers.location, url).toString(),
            destination,
            count + 1
          )
        );
        return;
      }

      if (status !== 200) {
        res.resume();
        reject(new Error("download failed HTTP " + status + ": " + url));
        return;
      }

      const total = Number(res.headers["content-length"] || 0);
      let received = 0;
      let lastPercent = -1;
      const output = fs.createWriteStream(destination);

      res.on("data", function (chunk) {
        received += chunk.length;
        if (total && process.stdout.isTTY) {
          const percent = Math.floor((received / total) * 100);
          if (percent !== lastPercent) {
            lastPercent = percent;
            process.stdout.write("\r[ossutil] downloading " + percent + "%");
          }
        }
      });

      res.pipe(output);

      output.on("finish", function () {
        output.close(function () {
          if (total && process.stdout.isTTY) {
            process.stdout.write("\n");
          }
          resolve();
        });
      });

      output.on("error", reject);
    });

    request.on("error", reject);
  });
}

function sha256File(file) {
  return new Promise(function (resolve, reject) {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", function (chunk) {
        hash.update(chunk);
      })
      .on("end", function () {
        resolve(hash.digest("hex"));
      })
      .on("error", reject);
  });
}

async function ensureOssutil() {
  const target = BINARIES[platform];
  if (!target) {
    throw new Error("can not support platform: " + platform);
  }

  const dir = path.join(__dirname, "upload");
  const file = path.join(dir, target.name);

  if (fs.existsSync(file)) {
    return file;
  }

  fs.mkdirSync(dir, { recursive: true });

  const temp = file + ".download." + process.pid;
  const url = OSSUTIL_BASE.replace(/\/$/, "") + "/" + target.name;

  console.log(
    "[ossutil] " + target.name + " 不存在，正在下载 " + OSSUTIL_VERSION + " ..."
  );

  try {
    await downloadFile(url, temp);
    const hash = await sha256File(temp);

    if (hash !== target.sha256) {
      throw new Error(
        "checksum mismatch: expected " +
          target.sha256 +
          ", got " +
          hash
      );
    }

    fs.renameSync(temp, file);
    fs.chmodSync(file, 0o755);
    console.log("[ossutil] 下载完成: " + file);
  } catch (error) {
    try {
      fs.unlinkSync(temp);
    } catch (cleanupError) {
      // ignore cleanup error
    }
    throw error;
  }

  return file;
}

(async function main() {
  try {
    const ossUtilPath = await ensureOssutil();
    upload(ossUtilPath);
  } catch (error) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }
})();
