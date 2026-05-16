const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = (_env, argv) => {
  const isDev = argv.mode === "development";

  return {
    entry: {
      "content/index": "./src/content/index.ts",
      "background/serviceWorker": "./src/background/serviceWorker.ts",
      "popup/popup": "./src/popup/popup.ts",
    },

    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true,
    },

    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: "ts-loader",
            options: { configFile: "tsconfig.build.json" },
          },
          exclude: /node_modules/,
        },
      ],
    },

    resolve: {
      extensions: [".ts", ".js"],
    },

    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: "manifest.json", to: "manifest.json" },
          { from: "src/popup/popup.html", to: "popup/popup.html" },
          { from: "src/popup/popup.css", to: "popup/popup.css" },
          { from: "src/content/badges.css", to: "content/badges.css" },
          { from: "src/assets", to: "assets", noErrorOnMissing: true },
        ],
      }),
    ],

    optimization: {
      // Chrome extensions can't use dynamic imports in content scripts,
      // so all shared modules must be inlined into each entry bundle.
      splitChunks: false,
    },

    devtool: isDev ? "inline-source-map" : false,
  };
};
