# -*- coding: utf-8 -*-
import maya.cmds as cmds
import json

def save_curve_presets_final_solution(file_path):
    """
    【最終修正・Maya 2020対応版】
    選択カーブの形状をJSONに保存します。
    オブジェクト名がリストとして取得された場合でも、強制的に文字列に変換して
    エラーを回避するロジックを追加しました。
    """
    selected_objects = cmds.ls(selection=True, long=True) # long=Trueで固有の名前を取得
    if not selected_objects:
        cmds.warning("保存するカーブを選択してください。")
        return

    presets_data = {}

    for obj_path in selected_objects:
        # このオブジェクトがNURBSカーブのトランスフォームノードか確認
        shapes = cmds.listRelatives(obj_path, shapes=True, type='nurbsCurve', noIntermediate=True, fullPath=True)
        if not shapes:
            continue # カーブでなければスキップ
        
        curve_shape = shapes[0]
        
        # --- エラー対策: オブジェクト名を確実に文字列として取得 ---
        # パイプ'|'で区切られたパスの最後の部分を名前として使用
        preset_name = obj_path.split('|')[-1]
        
        # cvs, degree, formを取得
        cvs_flat = cmds.getAttr('{}.controlPoints[*]'.format(curve_shape))
        cvs = [cvs_flat[i:i+3] for i in range(0, len(cvs_flat), 3)]
        degree = cmds.getAttr('{}.degree'.format(curve_shape))
        form_enum = cmds.getAttr('{}.form'.format(curve_shape))

        # curveInfoノード経由でノット情報を取得
        info_node = None
        knots = []
        try:
            info_node = cmds.createNode('curveInfo')
            cmds.connectAttr('{}.worldSpace[0]'.format(curve_shape), '{}.inputCurve'.format(info_node), force=True)
            knots = cmds.getAttr('{}.knots[*]'.format(info_node))
        finally:
            if info_node and cmds.objExists(info_node):
                cmds.delete(info_node)
        
        # ★★★ ここが問題の箇所でした ★★★
        # preset_nameが文字列であることを保証して辞書にキーとして設定
        presets_data[str(preset_name)] = {
            'points': cvs,
            'degree': degree,
            'form': form_enum,
            'knots': knots
        }
        
        # print文をUnicode形式(u"")で統一
        print(u"プリセット '{}' の情報を取得しました。".format(preset_name))

    # JSONファイルに書き出し
    try:
        with open(file_path, 'w') as f:
            json.dump(presets_data, f, indent=4)
        print(u"\nプリセットが正常に保存されました: {}".format(file_path))
    except Exception as e:
        cmds.error(u"ファイルの保存に失敗しました: {}".format(e))

# --- 実行部分 ---
output_file = 'D:/maya_projects/facial_ctrl_presets_final.json'
save_curve_presets_final_solution(output_file)