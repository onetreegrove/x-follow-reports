# CLAUDE.md

## 工作规则

- 找文件/搜内容：用 `rg --files`、`rg "pattern"`，比 `find`/`grep` 快很多。
- 看小文件或片段：用 `sed -n '1,160p' file`、`nl -ba file`。
- 看结构：用 `ls`，有安装 `tree` 时用 `tree`。
- 批量读取多个文件：用并行工具同时跑多个 `sed`/`rg`/`ls`，节省时间。
- 代码修改前：先读相关文件和周边模式，再用 `apply_patch` 改，不要随手重写文件。
- 大文件：通常先用 `rg` 定位符号/关键词，再只读附近行，避免把整个文件灌进上下文。
- 复杂批量重构：优先使用单个完整的 `python3 - <<'PY' ... PY` 脚本命令一次性完成，命令必须包含实际内容，避免分散操作或空工具调用。
- 语言规则：与用户交流和回答问题时，必须使用中文。

## 发布规范

- **版本发布流程**:
  1. 更新 `package.json` 和 `web/package.json` 中的 `version` 字段。
  2. 在 `CHANGELOG.md` 中 prepend 相应的变更日志。
  3. 提交变更：`git commit -m "chore: release v<version>"`。
  4. 创建并推送附注 Tag：`git tag -a v<version> -m "..." && git push origin main && git push origin v<version>`。
  5. **注意**: **不要**使用本地 CLI (`gh release create`) 手动创建 GitHub Release。仓库已配置了 GitHub Actions 自动化工作流 (`.github/workflows/release-web.yml`)，当检测到 `v*` Tag 推送时，会自动编译 Web 资源、打包并创建发布 GitHub Release 及附带部署产物 (`.tar.gz` 和 `.zip`)。

