import fs from "fs/promises";
import path from "path";
import postcss from "postcss";
import autoprefixer from "autoprefixer";
import cssSorter from "css-declaration-sorter";
import cssnano from "cssnano";
import { compileAsync } from "sass";
import { minify as terserMinify } from "terser";
import { minify as htmlMinify } from "html-minifier-terser";
import { optimize as svgoOptimize } from "svgo";
import sharp from "sharp";
import chokidar from "chokidar";
import browserSync from "browser-sync";
import crypto from "crypto";
import pLimit from "p-limit";

// パス設定
const paths = {
  sass: "./src/assets/sass/",
  js: "./src/assets/js/",
  html: "./src/",
  images: "./src/assets/img/",
  destCss: "./public/assets/css/",
  destJs: "./public/assets/js/",
  destHtml: "./public/",
  destImages: "./public/assets/img/",
};

// ブラウザ同期インスタンス作成
const bs = browserSync.create();

// 並列度の制限
const limit = pLimit(5);

// ファイルのハッシュを保存するためのキャッシュ
const fileHashes = {};

// 共通関数: ディレクトリ作成
async function ensureDirectoriesExist(dirs) {
  await Promise.all(
    dirs.map(async (dir) => {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
      }
    })
  );
}

// 共通関数: ファイル取得
async function getFiles(dir, ext) {
  const files = await fs.readdir(dir);
  const result = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);
      return stat.isDirectory() ? getFiles(filePath, ext) : filePath.endsWith(ext) && !file.startsWith("_") ? [filePath] : [];
    })
  );
  return result.flat();
}

// 共通関数: ファイル出力
async function writeFile(outputFile, content) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, content);
}

// 共通関数: ファイルのハッシュ計算
async function getHash(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash("md5").update(data).digest("hex");
}

// 共通関数: タスク処理
async function processTask(files, processFn, cacheEnabled = false) {
  return Promise.allSettled(
    files.map((filePath) =>
      limit(async () => {
        try {
          if (cacheEnabled) {
            const newHash = await getHash(filePath);
            if (fileHashes[filePath] === newHash) return;
            fileHashes[filePath] = newHash;
          }
          await processFn(filePath);
        } catch (error) {
          console.error(`Error processing ${filePath}:`, error);
        }
      })
    )
  );
}

// CSS処理：Sassコンパイル + ミニファイ
async function compileSass() {
  const sassFiles = await getFiles(paths.sass, ".scss");
  await processTask(
    sassFiles,
    async (filePath) => {
      try {
        const result = await compileAsync(filePath, { style: "expanded" });
        const processedCss = await postcss([
          autoprefixer(),
          cssSorter({ order: "smacss" }),
          cssnano({
            preset: "default",
          }),
        ]).process(result.css, { from: undefined });
        const outputFile = path.join(paths.destCss, `${path.basename(filePath, ".scss")}.min.css`);
        await writeFile(outputFile, processedCss.css);
      } catch (error) {
        console.error(`Error compiling Sass file ${filePath}:`, error);
      }
    },
    false
  );
}

// JS処理：ミニファイ
async function minifyJs() {
  const jsFiles = await getFiles(paths.js, ".js");
  await processTask(
    jsFiles,
    async (filePath) => {
      const code = await fs.readFile(filePath, "utf8");
      const result = await terserMinify(code, {
        compress: {
          arguments: true,
          ecma: 2015,
          keep_fargs: false,
          passes: 3,
          pure_new: true,
          toplevel: true,
        },
        mangle: {
          toplevel: true,
        },
        format: {
          comments: /^!|license|preserve|copyright/i,
        },
        toplevel: true,
      });
      if (result.error) throw result.error;
      const outputFile = path.join(paths.destJs, `${path.basename(filePath, ".js")}.min.js`);
      await writeFile(outputFile, result.code);
    },
    true
  );
}

// HTML処理：圧縮
async function minifyHtml() {
  const htmlFiles = await getFiles(paths.html, ".html");
  await processTask(
    htmlFiles,
    async (filePath) => {
      const code = await fs.readFile(filePath, "utf8");
      const result = await htmlMinify(code, {
        collapseBooleanAttributes: true,
        collapseInlineTagWhitespace: true,
        collapseWhitespace: true,
        continueOnParseError: true,
        minifyCSS: true,
        minifyJS: true,
        minifyURLs: true,
        quoteCharacter: '"',
        removeComments: true,
        removeEmptyAttributes: true,
        removeScriptTypeAttributes: true,
        removeStyleLinkTypeAttributes: true,
        removeTagWhitespace: true,
        sortAttributes: true,
        sortClassName: true,
        useShortDoctype: true,
      });
      const outputFile = path.join(paths.destHtml, path.relative(paths.html, filePath));
      await writeFile(outputFile, result);
    },
    true
  );
}

// 画像処理：最適化（AVIFへの変換）
async function optimizeImages() {
  const imageFiles = await getFiles(paths.images, "");
  await processTask(imageFiles, async (filePath) => {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const outputFile = path.join(paths.destImages, path.relative(paths.images, filePath).replace(/\.(jpg|jpeg|png|webp)$/i, ".avif"));

    if (!(await fs.stat(outputFile).catch(() => false))) {
      if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
        await sharp(filePath)
          .toFormat("avif", {
            quality: 80,
            speed: 0,
            alphaQuality: 80,
          })
          .toFile(outputFile);
      }
    }
  });
}

// SVG処理：最適化
async function optimizeSvg() {
  const svgFiles = await getFiles(paths.images, ".svg");
  await processTask(svgFiles, async (filePath) => {
    const svgData = await fs.readFile(filePath, "utf8");
    const result = svgoOptimize(svgData, {
      multipass: true,
      plugins: [
        {
          name: "preset-default",
          params: {
            overrides: {
              removeViewBox: false,
            },
          },
        },
        "cleanupListOfValues",
        "convertOneStopGradients",
        "convertStyleToAttrs",
        "prefixIds",
        "removeDimensions",
        "removeOffCanvasPaths",
        "removeRasterImages",
        "removeScriptElement",
        "removeXMLNS",
        "removeXlink",
        "reusePaths",
      ],
    });
    const outputFile = path.join(paths.destImages, path.relative(paths.images, filePath));
    await writeFile(outputFile, result.data);
  });
}

// タスク実行
async function runTasks() {
  try {
    await ensureDirectoriesExist([paths.destCss, paths.destJs, paths.destHtml, paths.destImages]);
    await Promise.all([compileSass(), minifyJs(), minifyHtml(), optimizeImages(), optimizeSvg()]);
    console.log("Tasks completed successfully");
  } catch (error) {
    console.error("Error occurred during task execution:", error);
  }
}

// ブラウザのリロード
async function browserReload() {
  bs.reload();
}

// ブラウザの初期化
async function browserInit() {
  bs.init({
    server: { baseDir: paths.destHtml },
    files: ["*.html", "*.css", "*.js", "images/**/*", "svg/**/*"],
  });
}

// 初回実行
browserInit();
runTasks();

// 監視設定（バウンス処理追加）
let fileChangeBuffer = [];
let isProcessing = false;

chokidar
  .watch([paths.sass, paths.js, paths.html, paths.images], { persistent: true })
  .on("change", (filePath) => {
    fileChangeBuffer.push(filePath);
    if (!isProcessing) {
      isProcessing = true;
      setTimeout(async () => {
        const uniqueFiles = [...new Set(fileChangeBuffer)];
        for (const file of uniqueFiles) {
          if (file.endsWith(".scss")) {
            await compileSass();
          } else if (file.endsWith(".js")) {
            await minifyJs();
          } else if (file.endsWith(".html")) {
            await minifyHtml();
          } else if (["jpg", "jpeg", "png", "webp"].some((ext) => file.endsWith(ext))) {
            await optimizeImages();
          } else if (file.endsWith(".svg")) {
            await optimizeSvg();
          }
        }
        await browserReload();
        fileChangeBuffer = [];
        isProcessing = false;
      }, 200);
    }
  })
  .on("add", runTasks)
  .on("unlink", runTasks)
  .on("error", (error) => console.error(`Watcher error: ${error}`));
