# -*- coding: utf-8 -*-

import maya.cmds as cmds
import json
import os

class CurvePresetTool(object):
    """
    カーブプリセットの保存と読み込みを行うためのUI付きツールクラス。
    Maya 2020 (Python 2.7) 環境で動作します。
    """
    
    # クラス変数としてウィンドウ名とタイトルを定義
    WINDOW_NAME = "curvePresetToolWindow"
    WINDOW_TITLE = "Curve Preset Tool (Maya2020)"

    def __init__(self):
        """コンストラクタ: UI要素を保持する変数を初期化します。"""
        self.ui_elements = {}
        
        # ウィンドウが既に存在する場合は、一度閉じてから新しく作成する
        if cmds.window(self.WINDOW_NAME, exists=True):
            cmds.deleteUI(self.WINDOW_NAME)

    def create(self):
        """UIウィンドウと全ての要素を作成します。"""
        
        # ウィンドウの作成
        self.ui_elements["window"] = cmds.window(
            self.WINDOW_NAME, 
            title=self.WINDOW_TITLE, 
            widthHeight=(450, 480),
            sizeable=True
        )
        
        # メインレイアウトの作成
        main_layout = cmds.columnLayout(adjustableColumn=True)
        
        # --- 1. ファイルパス指定セクション ---
        cmds.separator(height=10, style='in')
        cmds.text(label="1. プリセットファイルの指定", align='left', font='boldLabelFont', height=20)
        
        self.ui_elements["file_path_field"] = cmds.textFieldButtonGrp(
            label="ファイルパス:",
            buttonLabel="...",
            columnWidth3=(80, 300, 50),
            buttonCommand=self.browse_file_path,
            changeCommand=self.update_preset_list  # パスが変更されたらリストを更新
        )
        cmds.separator(height=15, style='in')

        # --- 2. プリセット読み込みセクション ---
        cmds.text(label="2. プリセットの読み込み", align='left', font='boldLabelFont', height=20)
        
        cmds.rowLayout(numberOfColumns=2, columnWidth2=(220, 220))
        
        # 左側のレイアウト（プリセットリスト）
        cmds.columnLayout(adjustableColumn=True)
        cmds.text(label="利用可能なプリセット", height=20)
        self.ui_elements["preset_list"] = cmds.textScrollList(
            numberOfRows=10,
            allowMultiSelection=False,
            height=200
        )
        cmds.setParent('..') # columnLayoutを抜ける
        
        # 右側のレイアウト（読み込みオプション）
        cmds.columnLayout(adjustableColumn=True)
        self.ui_elements["name_override_field"] = cmds.textFieldGrp(
            label="作成する名前:",
            columnWidth2=(80, 120)
        )
        cmds.separator(height=20, style='none')
        cmds.button(
            label="選択プリセットを読み込み",
            height=50,
            command=self.on_load_button_pressed
        )
        cmds.setParent('..') # columnLayoutを抜ける
        cmds.setParent('..') # rowLayoutを抜ける
        
        cmds.separator(height=15, style='in')

        # --- 3. プリセット保存セクション ---
        cmds.text(label="3. 現在の選択をプリセットに保存", align='left', font='boldLabelFont', height=20)
        cmds.text(label="(保存したいカーブをビューポートで選択し、下のボタンを押してください)", align='left', font='obliqueLabelFont')
        cmds.separator(height=10, style='none')
        cmds.button(
            label="選択カーブをファイルに保存",
            height=40,
            command=self.on_save_button_pressed
        )
        cmds.separator(height=10, style='in')

        # ウィンドウの表示
        cmds.showWindow(self.ui_elements["window"])

    def browse_file_path(self, *args):
        """ファイルブラウザを開き、選択したパスをテキストフィールドに設定します。"""
        # Mayaのファイルダイアログを開く (mode=0は読み書き両用)
        file_path_list = cmds.fileDialog2(fileFilter="JSON Files (*.json)", dialogStyle=2, fileMode=0, caption="プリセットファイルを選択または新規作成")
        if file_path_list:
            file_path = file_path_list[0]
            cmds.textFieldButtonGrp(self.ui_elements["file_path_field"], edit=True, text=file_path)
            self.update_preset_list() # パスが確定したらリストを更新

    def update_preset_list(self, *args):
        """指定されたパスのJSONファイルを読み込み、プリセットリストを更新します。"""
        file_path = cmds.textFieldButtonGrp(self.ui_elements["file_path_field"], query=True, text=True)
        
        # リストを一度空にする
        cmds.textScrollList(self.ui_elements["preset_list"], edit=True, removeAll=True)

        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                # JSONのキー（プリセット名）をソートしてリストに追加
                for key in sorted(data.keys()):
                    cmds.textScrollList(self.ui_elements["preset_list"], edit=True, append=key)
            except Exception as e:
                cmds.warning("ファイルの読み込みに失敗しました: {}".format(e))
    
    def on_load_button_pressed(self, *args):
        """「読み込み」ボタンが押されたときの処理です。"""
        file_path = cmds.textFieldButtonGrp(self.ui_elements["file_path_field"], query=True, text=True)
        selected_items = cmds.textScrollList(self.ui_elements["preset_list"], query=True, selectItem=True)
        name_override = cmds.textFieldGrp(self.ui_elements["name_override_field"], query=True, text=True)

        if not file_path:
            cmds.warning("ファイルパスを指定してください。")
            return
        if not selected_items:
            cmds.warning("リストから読み込むプリセットを選択してください。")
            return
        if not name_override:
            # 名前が未入力の場合は、プリセット名をそのまま使用する
            name_override = selected_items[0]
        
        self.load_curve_from_preset(selected_items[0], file_path, name_override)

    def on_save_button_pressed(self, *args):
        """「保存」ボタンが押されたときの処理です。"""
        file_path = cmds.textFieldButtonGrp(self.ui_elements["file_path_field"], query=True, text=True)

        if not file_path:
            cmds.warning("保存先のファイルパスを指定してください。")
            return
        
        self.save_selected_curves(file_path)
        self.update_preset_list() # 保存後、リストを更新してすぐに使えるようにする

    # --------------------------------------------------------------------------
    # コアロジック (保存と読み込みの関数)
    # --------------------------------------------------------------------------

    def save_selected_curves(self, file_path):
        """選択中のカーブの形状をJSONファイルに保存します。"""
        selected_curves = cmds.ls(selection=True, type='transform')
        if not selected_curves:
            cmds.warning("保存するカーブを選択してください。")
            return

        presets_data = {}
        # 既存ファイルがある場合は、追記・上書きするためにまず読み込む
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    presets_data = json.load(f)
            except Exception:
                # ファイルが空、または壊れている場合は新規作成する
                pass

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
                'points': cvs, 'degree': degree, 'form': form_enum, 'knots': knots
            }
            print("プリセット '{}' の情報を取得しました。".format(preset_name))
        
        try:
            with open(file_path, 'w') as f:
                json.dump(presets_data, f, indent=4)
            cmds.confirmDialog(title="成功", message="プリセットがファイルに保存されました。\n{}".format(file_path), button=["OK"])
        except Exception as e:
            cmds.error("ファイルの保存に失敗しました: {}".format(e))

    def load_curve_from_preset(self, preset_name, file_path, name_override):
        """JSONファイルから指定されたプリセットを読み込み、カーブをシーンに再作成します。"""
        if not os.path.exists(file_path):
            cmds.error("指定されたファイルが見つかりません: {}".format(file_path))
            return None

        with open(file_path, 'r') as f:
            presets_data = json.load(f)

        if preset_name not in presets_data:
            cmds.error("プリセット '{}' はファイル内に存在しません。".format(preset_name))
            return None

        curve_data = presets_data[preset_name]
        is_periodic = (curve_data['form'] == 1)

        new_curve_transform = cmds.curve(
            name=name_override,
            point=curve_data['points'],
            knot=curve_data['knots'],
            degree=curve_data['degree'],
            periodic=is_periodic
        )

        if curve_data['form'] == 2: # Closed
            cmds.closeCurve(new_curve_transform, ch=False, rpo=True, ps=False)

        print("プリセット '{}' からカーブ '{}' を作成しました。".format(preset_name, new_curve_transform))
        cmds.select(new_curve_transform, replace=True)
        return new_curve_transform

# ------------------------------------------------------------------------------
# スクリプトの実行部分
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    tool_ui = CurvePresetTool()
    tool_ui.create()