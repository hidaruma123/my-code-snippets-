# ★★★ 修正版メソッド：選択中のコントローラーのObject Display Visibilityをトグル ★★★
def toggle_selected_visibility(self):
    selected_controllers = cmds.ls(selection=True, type='transform')
    if not selected_controllers:
        print("Warning: Please select at least one controller.")
        return
    
    toggled_count = 0
    for controller in selected_controllers:
        try:
            # Object Display > Visibilityの状態を取得
            # lodVisibilityアトリビュートを使用（Level of Detail Visibility）
            if cmds.attributeQuery('lodVisibility', node=controller, exists=True):
                current_vis = cmds.getAttr(controller + '.lodVisibility')
                if not cmds.getAttr(controller + '.lodVisibility', lock=True):
                    cmds.setAttr(controller + '.lodVisibility', not current_vis)
                    toggled_count += 1
            else:
                # lodVisibilityが存在しない場合は作成してから設定
                cmds.addAttr(controller, longName='lodVisibility', attributeType='bool', defaultValue=True)
                cmds.setAttr(controller + '.lodVisibility', False)
                toggled_count += 1
        except Exception as e:
            print("Error toggling visibility for {}: {}".format(controller, str(e)))
    
    if toggled_count > 0:
        print("Toggled object display visibility for {} controller(s).".format(toggled_count))

# ★★★ 修正版メソッド：選択中のコントローラーのObject Display Visibilityを全て表示 ★★★
def show_all_selected(self):
    selected_controllers = cmds.ls(selection=True, type='transform')
    if not selected_controllers:
        print("Warning: Please select at least one controller.")
        return
    
    shown_count = 0
    for controller in selected_controllers:
        try:
            # Object Display > Visibilityを有効にする
            if cmds.attributeQuery('lodVisibility', node=controller, exists=True):
                if not cmds.getAttr(controller + '.lodVisibility', lock=True):
                    cmds.setAttr(controller + '.lodVisibility', True)
                    shown_count += 1
            else:
                # lodVisibilityが存在しない場合は作成してから設定
                cmds.addAttr(controller, longName='lodVisibility', attributeType='bool', defaultValue=True)
                cmds.setAttr(controller + '.lodVisibility', True)
                shown_count += 1
        except Exception as e:
            print("Error showing {}: {}".format(controller, str(e)))
    
    if shown_count > 0:
        print("Made {} controller(s) visible (object display).".format(shown_count))
