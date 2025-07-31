# --- スクリプトへのパスを修正してください ---
# 例: Windows
script_path = "C:/maya/scripts/"
# 例: macOS
# script_path = "/Users/your_name/Documents/maya/scripts/"

import sys
# スクリプトパスがまだ登録されていなければ追加
if script_path not in sys.path:
    sys.path.append(script_path)

# モジュールを再読み込みして常に最新版を起動
import RigPickerTool
import importlib
importlib.reload(RigPickerTool)

# ツールを起動
RigPickerTool.launch()