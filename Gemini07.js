# --- スクリプトを保存したフォルダへのパスを修正してください ---
script_path = "C:/maya/scripts/"

import sys
if script_path not in sys.path:
    sys.path.append(script_path)

import RigPickerTool
# スクリプトを修正した場合に変更を反映させるためreloadを使用
reload(RigPickerTool)

# ツールを起動
RigPickerTool.launch()