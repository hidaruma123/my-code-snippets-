import maya.cmds as cmds
import json
import os

def load_curve_from_preset_maya2020(preset_name, file_path, name_override=None):
    """
    【Maya 2020 (Python 2.7) 対応版】
    JSONファイルから指定されたプリセットを読み込み、カーブを再作成します。
    """
    if not os.path.exists(file_path):
        cmds.error("指定されたファイルが見つかりません: {}".format(file_path))
        return None

    with open(file_path, 'r') as f:
        presets_data = json.load(f)

    if preset_name not in presets_data:
        cmds.error("プリセット '{}' はファイル内に存在しません。".format(preset_name))
        return None

    curve_data = presets_data[preset_name]
    final_name = name_override if name_override else preset_name
    form_enum = curve_data['form']
    is_periodic = (form_enum == 1)

    new_curve_transform = cmds.curve(
        name=final_name,
        point=curve_data['points'],
        knot=curve_data['knots'],
        degree=curve_data['degree'],
        periodic=is_periodic
    )

    if form_enum == 2: # Closed
        cmds.closeCurve(new_curve_transform, 
                        constructionHistory=False, 
                        replaceOriginal=True,
                        preserveShape=False)

    print("プリセット '{}' からカーブ '{}' を作成しました。".format(preset_name, new_curve_transform))
    cmds.select(new_curve_transform, replace=True)
    return new_curve_transform

# --- 実行部分 ---
json_file_path = 'D:/maya_projects/facial_ctrl_presets_maya2020.json'

# 例: 'circle_ctrl' というプリセットから 'L_eye_CTRL' を作成
load_curve_from_preset_maya2020('circle_ctrl', json_file_path, name_override='L_eye_CTRL')