import maya.cmds as cmds
import json
import os

def load_curve_from_preset_final_maya2020(preset_name, file_path, name_override=None):
    """
    【最終修正・Maya 2020対応版】
    JSONファイルからプリセットを読み込み、カーブを再作成します。
    -pointフラグのデータ型問題を修正しました。
    """
    if not os.path.exists(file_path):
        cmds.error("指定されたファイルが見つかりません: {}".format(file_path))
        return None

    try:
        with open(file_path, 'r') as f:
            presets_data = json.load(f)
    except Exception as e:
        cmds.error("JSONファイルの読み込みまたは解析に失敗しました: {}".format(e))
        return None

    if preset_name not in presets_data:
        cmds.error("プリセット '{}' はファイル内に存在しません。".format(preset_name))
        return None

    curve_data = presets_data[preset_name]
    final_name = name_override if name_override else preset_name
    form_enum = curve_data['form']
    is_periodic = (form_enum == 1)

    # ======================================================================
    # ▼▼▼ 重要な修正点 ▼▼▼
    # cmds.curve の -point フラグは「タプルのリスト」を要求します。
    # JSONから読み込んだ「リストのリスト」をここで変換します。
    points_as_tuples = [tuple(p) for p in curve_data['points']]
    # ▲▲▲ 重要な修正点 ▲▲▲
    # ======================================================================

    new_curve_transform = None
    try:
        new_curve_transform = cmds.curve(
            name=final_name,
            point=points_as_tuples,  # 型変換したデータを渡す
            knot=curve_data['knots'],
            degree=curve_data['degree'],
            periodic=is_periodic
        )
    except Exception as e:
        cmds.error("cmds.curveの実行中にエラーが発生しました: {}".format(e))
        # エラー発生時にデバッグ情報を出力
        print("--- DEBUG INFO ---")
        print("Name: {}".format(final_name))
        print("Degree: {}".format(curve_data['degree']))
        print("Points (Count: {}): {}".format(len(points_as_tuples), points_as_tuples))
        print("Knots (Count: {}): {}".format(len(curve_data['knots']), curve_data['knots']))
        print("------------------")
        return None

    if form_enum == 2: # Closed
        cmds.closeCurve(new_curve_transform, 
                        constructionHistory=False, 
                        replaceOriginal=True,
                        preserveShape=False)

    print("プリセット '{}' からカーブ '{}' を作成しました。".format(preset_name, new_curve_transform))
    cmds.select(new_curve_transform, replace=True)
    return new_curve_transform

# --- 実行部分 ---
# 前回の【保存用】スクリプトで作成したJSONファイルを指定してください。
json_file_path = 'D:/maya_projects/facial_ctrl_presets_maya2020.json'

# 例: 'circle_ctrl' というプリセットから 'L_eye_CTRL' を作成
load_curve_from_preset_final_maya2020('circle_ctrl', json_file_path, name_override='L_eye_CTRL')