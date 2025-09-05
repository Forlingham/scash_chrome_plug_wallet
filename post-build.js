// post-build.js
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const outDir = path.join(__dirname, 'out');

// --- Part 1: 重命名 _next 文件夹并更新引用 ---
function renameNextFolderAndFixPaths() {
  const oldDirName = '_next';
  const newDirName = 'next-assets';
  const oldDirPath = path.join(outDir, oldDirName);
  const newDirPath = path.join(outDir, newDirName);

  if (fs.existsSync(oldDirPath)) {
    fs.renameSync(oldDirPath, newDirPath);
    console.log(`✅ Renamed directory '${oldDirName}' to '${newDirName}'`);
  }

  function replaceInFiles(directory) {
    const files = fs.readdirSync(directory);
    files.forEach(file => {
      const filePath = path.join(directory, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        replaceInFiles(filePath);
      } else if (/\.(html|css|js)$/.test(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        const oldPathRegex = new RegExp(`/${oldDirName}/`, 'g');
        if (oldPathRegex.test(content)) {
          content = content.replace(oldPathRegex, `/${newDirName}/`);
          fs.writeFileSync(filePath, content, 'utf8');
        }
      }
    });
  }
  replaceInFiles(outDir);
  console.log('✅ Updated all references to next-assets.');
}

// --- Part 2: 提取并替换所有内联脚本 ---
function extractAndReplaceInlineScripts() {
  const scriptsDir = path.join(outDir, 'extracted-scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir);
  }
  let scriptCounter = 0;

  function processHtmlFile(filePath) {
    if (!filePath.endsWith('.html')) return;

    const htmlContent = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(htmlContent);

    // 找到所有不含 src 属性的 script 标签 (即内联脚本)
    const inlineScripts = $('script:not([src])');

    if (inlineScripts.length > 0) {
      inlineScripts.each((index, element) => {
        const scriptContent = $(element).html();
        if (!scriptContent) return;
        
        scriptCounter++;
        const scriptFileName = `inline-${scriptCounter}.js`;
        const scriptFilePath = path.join(scriptsDir, scriptFileName);

        fs.writeFileSync(scriptFilePath, scriptContent, 'utf8');

        // 将内联脚本替换为外部脚本引用
        $(element).replaceWith(`<script src="/extracted-scripts/${scriptFileName}"></script>`);
      });

      fs.writeFileSync(filePath, $.html(), 'utf8');
      console.log(`✅ Extracted ${inlineScripts.length} inline scripts from ${path.basename(filePath)}`);
    }
  }
  
  fs.readdirSync(outDir).forEach(file => {
    processHtmlFile(path.join(outDir, file));
  });
}


// --- 执行所有处理步骤 ---
console.log('--- Starting Post-Build Process ---');
renameNextFolderAndFixPaths();
extractAndReplaceInlineScripts();
console.log('--- Post-Build Process Complete ---');