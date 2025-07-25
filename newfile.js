import maya.cmds as cmds
import json

def save_multi_shape_curve_presets_maya2020(file_path):
    """
    【複数シェイプ対応・Maya 2020版】
    選択したオブジェクトが持つ全てのカーブシェイプの形状情報をJSONに保存します。
    """
    selected_transforms = cmds.ls(selection=True, type='transform')
    if not selected_transforms:
        cmds.warning("保存するオブジェクトを選択してください。")
        return

    presets_data = {}

    for transform_node in selected_transforms:
        # トランスフォームノードの下にある、中間オブジェクトでない全てのカーブシェイプを取得
        all_shapes = cmds.listRelatives(transform_node, shapes=True, type='nurbsCurve', noIntermediate=True)
        
        if not all_shapes:
            print("オブジェクト '{}' に有効なカーブシェイプが見つかりません。スキップします。".format(transform_node))
            continue
        
        # このオブジェクトの全シェイプ情報を格納するリスト
        shapes_data_list = []

        print("オブジェクト '{}' から {} 個のシェイプを処理します...".format(transform_node, len(all_shapes)))

        for curve_shape in all_shapes:
            # 各シェイプの情報を取得
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
            
            # 取得したシェイプデータを辞書にまとめ、リストに追加
            single_shape_data = {
                'points': cvs,
                'degree': degree,
                'form': form_enum,
                'knots': knots
            }
            shapes_data_list.append(single_shape_data)
        
        # プリセット名（トランスフォーム名）をキーとして、シェイプデータのリストを保存
        presets_data[transform_node] = shapes_data_list
    
    # JSONファイルに書き出し
    try:
        with open(file_path, 'w') as f:
            json.dump(presets_data, f, indent=4)
        print("\n複数シェイプ対応プリセットが正常に保存されました: {}".format(file_path))
    except Exception as e:
        cmds.error("ファイルの保存に失敗しました: {}".format(e))


# --- 実行方法 ---
# 1. Mayaで保存したいコントローラーオブジェクト（複数シェイプでも可）を選択します。
# 2. Modify > Freeze Transformations を実行します。
# 3. 以下のスクリプトを実行します。
output_file_multi = 'D:/maya_projects/facial_ctrl_presets_multi_shape.json'
save_multi_shape_curve_presets_maya2020(output_file_multi)