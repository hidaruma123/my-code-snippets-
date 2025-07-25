import maya.cmds as cmds
import json

def save_curve_presets_maya2020(file_path):
    """
    【Maya 2020 (Python 2.7) 対応版】
    選択したカーブの形状をJSONに保存します。
    一時的な 'curveInfo' ノードを利用して、ノット情報を確実かつ安全に取得します。
    文字列結合は .format() メソッドを使用しています。
    """
    selected_curves = cmds.ls(selection=True, type='transform')
    if not selected_curves:
        cmds.warning("保存するカーブを選択してください。")
        return

    presets_data = {}

    for curve_transform in selected_curves:
        shapes = cmds.listRelatives(curve_transform, shapes=True, type='nurbsCurve', noIntermediate=True)
        if not shapes:
            print("'{}' に有効なNURBSカーブシェイプが見つかりません。スキップします。".format(curve_transform))
            continue
        
        curve_shape = shapes[0]
        preset_name = curve_transform

        cvs_flat = cmds.getAttr('{}.controlPoints[*]'.format(curve_shape))
        cvs = [cvs_flat[i:i+3] for i in range(0, len(cvs_flat), 3)]
        degree = cmds.getAttr('{}.degree'.format(curve_shape))
        form_enum = cmds.getAttr('{}.form'.format(curve_shape))

        info_node = None
        knots = []
        try:
            info_node = cmds.createNode('curveInfo')
            cmds.connectAttr('{}.worldSpace[0]'.format(curve_shape), '{}.inputCurve'.format(info_node), force=True)
            knots = cmds.getAttr('{}.knots[*]'.format(info_node))
        finally:
            if info_node and cmds.objExists(info_node):
                cmds.delete(info_node)

        presets_data[preset_name] = {
            'points': cvs,
            'degree': degree,
            'form': form_enum,
            'knots': knots
        }
        
        print("プリセット '{}' の情報を取得しました。".format(preset_name))

    try:
        with open(file_path, 'w') as f:
            json.dump(presets_data, f, indent=4)
        print("\nプリセットが正常に保存されました: {}".format(file_path))
    except Exception as e:
        cmds.error("ファイルの保存に失敗しました: {}".format(e))

# --- 実行部分 ---
# Mayaで保存したいカーブを選択し、Freeze Transformを実行してからスクリプトを実行してください。
output_file = 'D:/maya_projects/facial_ctrl_presets_maya2020.json'
save_curve_presets_maya2020(output_file)