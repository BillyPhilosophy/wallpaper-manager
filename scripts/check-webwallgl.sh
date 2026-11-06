#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
corepack pnpm why webwallgl
corepack pnpm list --filter @wallpaper-manager/web webwallgl --depth 0 | grep '3\.0\.0'
printf '%s\n' '网站 WebWallGL 版本为 3.0.0；请同时在 DSH 实际安装目录检查 package.json 与 lock 文件。'
