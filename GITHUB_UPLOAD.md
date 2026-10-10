# GitHub 上传清单

此目录已配置独立 Git 仓库和 `.gitignore`。请从本项目目录执行 Git 命令。

## 上传到源码仓库

| 文件或目录 | 用途 |
| --- | --- |
| `src/` | 插件源码、界面、Figma manifest |
| `assets/` | 构建必需的 ICC 文件及第三方许可证，必须一起保留 |
| `test/` | 测试脚本及 `fixtures/` 测试输入 |
| `community/`（ZIP 除外） | 社区发布图片、文案、生成脚本和素材源文件 |
| `package.json`、`package-lock.json` | 依赖声明和锁定版本，两者都上传 |
| `build.mjs`、`package.ps1`、`tsconfig.json` | 构建、打包和 TypeScript 配置 |
| `README.md`、`GITHUB_UPLOAD.md`、`.gitignore` | 使用说明、上传说明和忽略规则 |

## 不上传到源码仓库

- `node_modules/`：安装生成，可通过 `npm ci` 恢复。
- `dist/`：构建生成，可通过 `npm run build` 恢复。
- `tmp/`：测试输出、临时截图、历史修改备份。
- 所有 ZIP：重复的分发包，适合作为 GitHub Release 附件。
- 缓存、日志、`.env` 本地配置及编辑器个人设置。
- `.git/`：本地 Git 元数据，不用手动上传。

这些文件仍保留在本地，仅通过忽略规则排除，没有删除。

## 安装与打包

```powershell
npm ci
npm run build
npm run typecheck
npm test
npm run package
```

构建后在 Figma 导入 `dist/manifest.json`。Release 中可上传 `印前助手_可直接导入.zip` 和 `community/Figma社区_中文发布素材.zip`；源码 ZIP 可选，GitHub 本身也提供源码下载。

## 首次推送

在 GitHub 建立空仓库后，从本目录执行以下命令，将占位地址替换成实际地址：

```powershell
git status --short
git add .
git diff --cached --stat
git commit -m "Initial commit"
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

项目原先会继承 `D:/` 的上层仓库，现已在本目录初始化独立仓库，不要在 D 盘根目录执行本项目的提交命令。

项目尚未设置自己的开源许可证。第三方许可证已保留；如要允许他人按开源协议使用项目源码，需另行选择并添加项目 `LICENSE`。
