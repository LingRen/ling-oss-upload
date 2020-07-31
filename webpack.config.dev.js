const TerserPlugin = require("terser-webpack-plugin");

const webpackConfig = {
  entry: {
    index: "./src/index.ts",
    "index.min": "./src/index.ts"
  },
  output: {
    filename: "[name].js",
    library: "LingOssUpload",
    libraryTarget: "umd",
    libraryExport: "default"
  },
  mode: "none",
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: "babel-loader"
      },
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx"]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        include: /\.min\.js$/
      })
    ]
  }
};

module.exports = webpackConfig;
