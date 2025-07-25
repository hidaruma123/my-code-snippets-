import maya.cmds as cmds
import json
import os

def load_multi_shape_curve_from_preset_maya2020(preset_name, file_path, name_override=None):
    """
    【複数シェイプ対応・Maya 2020版】
    JSONファイルからプリセットを読み込み、複数シェイプを持つカーブオブジェクトを再作成します。
    """
    if not os.path.exists(file_path):
        cmds.error("指定されたファイルが見つかりません: {}".format(file_path))
        return None

    with open(file_path, 'r') as f:
        presets_data = json.load(f)

    if preset_name not in presets_data:
        cmds.error("プリセット '{}' はファイル内に存在しません。".format(preset_name))
        return None

    # シェイプデータのリストを取得
    shapes_data_list = presets_data[preset_name]
    if not shapes_data_list:
        cmds.warning("プリセット '{}' にはシェイプデータが含まれていません。".format(preset_name))
        return None

    final_name = name_override if name_override else preset_name
    
    # 1. 最初のシェイプで、ベースとなるオブジェクト（トランスフォーム＋シェイプ）を作成
    first_shape_data = shapes_data_list[0]
    points_as_tuples = [tuple(p) for p in first_shape_data['points']]
    
    main_transform = cmds.curve(
        name=final_name,
        point=points_as_tuples,
        knot=first_shape_data['knots'],
        degree=first_shape_data['degree'],
        periodic=(first_shape_data['form'] == 1)
    )
    if first_shape_data['form'] == 2:
        cmds.closeCurve(main_transform, ch=False, ro=True, ps=False)

    # 2. 二つ目以降のシェイプがあれば、それらを最初のオブジェクトに追加していく
    if len(shapes_data_list) > 1:
        for i in range(1, len(shapes_data_list)):
            shape_data = shapes_data_list[i]
            points_as_tuples = [tuple(p) for p in shape_data['points']]
            
            # 一時的なカーブオブジェクトを作成
            temp_transform = cmds.curve(
                point=points_as_tuples,
                knot=shape_data['knots'],
                degree=shape_data['degree'],
                periodic=(shape_data['form'] == 1)
            )
            if shape_data['form'] == 2:
                cmds.closeCurve(temp_transform, ch=False, ro=True, ps=False)
            
            # 一時オブジェクトからシェイプノードを取得
            temp_shape = cmds.listRelatives(temp_transform, shapes=True)[0]
            
            # シェイプノードをメインのトランスフォームにペアレント化 (shape=Trueが重要)
            cmds.parent(temp_shape, main_transform, relative=True, shape=True)
            
            # 不要になった一時的なトランスフォームを削除
            cmds.delete(temp_transform)

    print("プリセット '{}' から複数シェイプを持つカーブ '{}' を作成しました。".format(preset_name, main_transform))
    cmds.select(main_transform, replace=True)
    return main_transform


# --- 実行方法 ---
json_file_multi = 'D:/maya_projects/facial_ctrl_presets_multi_shape.json'

# 例: 'L_eye_multi_CTRL' というプリセットから 'L_eye_CTRL' という名前でオブジェクトを作成
load_multi_shape_curve_from_preset_maya2020('L_eye_multi_CTRL', json_file_multi, name_override='L_eye_CTRL')