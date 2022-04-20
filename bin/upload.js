#! /usr/bin/env node

const os = require("os");
const path = require("path");
const childProcess = require("child_process");
const chalk = require("chalk");
const yargs = require("yargs");

const { config, dest, bucket, meta } = yargs
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
  .option("meta", {
    alias: "m",
    describe:
      "set meta [header:value#header:value...], eg: Cache-Control:no-cache#Content-Encoding:gzip"
  })
  .help().argv;

const platform = os.platform();

function upload(ossUtil) {
  childProcess.execFile(
    `${path.join(__dirname, "/upload", ossUtil)}`,
    [
      `cp`,
      `-c`,
      `${path.resolve(config || ".ossutilconfig")}`,
      `-f`,
      `-r`,
      `--exclude`,
      `.DS_Store`,
      ...(meta == void 0 || meta == true ? [] : [`--meta`, meta]),
      `${path.resolve(dest || "./distCDN")}`,
      bucket
    ],
    (error, stdout, stderr) => {
      if (error) {
        console.error(chalk.red(`exec error: ${error}`));
        return;
      }
      if (stdout) {
        console.log(chalk.green(`stdout: ${stdout}`));
      }
      if (stderr) {
        console.error(chalk.red(`stderr: ${stderr}`));
      }
    }
  );
}

if (platform == "darwin") {
  upload(`/ossutilmac64`);
} else if (platform == "win32") {
  upload(`/ossutil64.exe`);
} else if (platform == "linux") {
  upload(`/ossutil64`);
} else {
  console.error(chalk.red(`can not support platform: ${platform}`));
}
