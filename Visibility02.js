# ★★★ 修正版：選択中のコントローラーのVisibilityをトグル（Object Display使用） ★★★
def toggle_selected_visibility(self):
    selected_controllers = cmds.ls(selection=True, type='transform')
    if not selected_controllers:
        print("Warning: Please select at least one controller.")
        return
    
    toggled_count = 0
    for controller in selected_controllers:
        try:
            # 現在のdisplayType属性を確認
            if not cmds.attributeQuery('displayType', node=controller, exists=True):
                # displayType属性がない場合は追加
                cmds.addAttr(controller, longName='displayType', attributeType='enum', 
                           enumName='Normal:Template:Reference', keyable=False)
            
            # 現在の値を取得
            current_display = cmds.getAttr(controller + '.displayType')
            
            if current_display == 0:  # Normal表示の場合
                # Template（グレーアウト表示）に変更
                cmds.setAttr(controller + '.displayType', 1)
            else:  # Template or Reference表示の場合
                # Normal表示に戻す
                cmds.setAttr(controller + '.displayType', 0)
            
            toggled_count += 1
            
        except Exception as e:
            print("Error toggling display for {}: {}".format(controller, str(e)))
    
    if toggled_count > 0:
        print("Toggled display type for {} controller(s).".format(toggled_count))

# ★★★ 修正版：選択中のコントローラーを全て表示（Object Display使用） ★★★
def show_all_selected(self):
    selected_controllers = cmds.ls(selection=True, type='transform')
    if not selected_controllers:
        print("Warning: Please select at least one controller.")
        return
    
    shown_count = 0
    for controller in selected_controllers:
        try:
            # displayType属性を確認
            if cmds.attributeQuery('displayType', node=controller, exists=True):
                # Normal表示（0）に設定
                cmds.setAttr(controller + '.displayType', 0)
            else:
                # 属性がない場合は追加してNormalに設定
                cmds.addAttr(controller, longName='displayType', attributeType='enum', 
                           enumName='Normal:Template:Reference', keyable=False)
                cmds.setAttr(controller + '.displayType', 0)
            
            shown_count += 1
            
        except Exception as e:
            print("Error showing {}: {}".format(controller, str(e)))
    
    if shown_count > 0:
        print("Set {} controller(s) to normal display.".format(shown_count))
