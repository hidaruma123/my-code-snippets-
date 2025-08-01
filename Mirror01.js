# ★★★ 複数選択対応のミラー機能メソッド ★★★
def mirror_selected_button(self):
    selected_buttons = [btn for btn in self.picker_buttons if btn.is_selected]
    if len(selected_buttons) == 0:
        QtWidgets.QMessageBox.warning(self, "Warning", "Please select at least one button to mirror.")
        return
    
    # ミラー可能なボタンとそのミラー先コントローラーをチェック
    mirrorable_buttons = []
    for button in selected_buttons:
        original_controller = button.controller
        
        # プリフィックスに基づいて左右逆側のコントローラーを生成
        if original_controller.startswith("Con_L_"):
            mirrored_controller = original_controller.replace("Con_L_", "Con_R_", 1)
        elif original_controller.startswith("Con_R_"):
            mirrored_controller = original_controller.replace("Con_R_", "Con_L_", 1)
        else:
            continue  # 対象外のコントローラーはスキップ
        
        # ミラーコントローラーが存在するか確認
        if cmds.objExists(mirrored_controller):
            mirrorable_buttons.append((button, mirrored_controller))
    
    if len(mirrorable_buttons) == 0:
        QtWidgets.QMessageBox.warning(self, "Warning", 
            "No valid controllers found for mirroring.\n"
            "Controllers must start with 'Con_L_' or 'Con_R_' and their mirrored counterparts must exist in the scene.")
        return
    
    # 確認ダイアログ
    skipped_count = len(selected_buttons) - len(mirrorable_buttons)
    message = "Mirror {} button(s)?".format(len(mirrorable_buttons))
    if skipped_count > 0:
        message += "\n({} button(s) will be skipped due to invalid naming or missing controllers)".format(skipped_count)
    
    reply = QtWidgets.QMessageBox.question(self, 'Confirm Mirror', message,
        QtWidgets.QMessageBox.Yes | QtWidgets.QMessageBox.No, QtWidgets.QMessageBox.Yes)
    
    if reply != QtWidgets.QMessageBox.Yes:
        return
    
    # 全ての選択を解除
    for btn in self.picker_buttons:
        if btn.is_selected:
            btn.is_selected = False
            btn.update_style()
    
    # ミラーボタンを作成
    created_buttons = []
    for original_button, mirrored_controller in mirrorable_buttons:
        # カスタムテキストのミラー（L/Rを反転）
        mirrored_custom_text = original_button.custom_text
        if mirrored_custom_text:
            mirrored_custom_text = mirrored_custom_text.replace("L", "TEMP").replace("R", "L").replace("TEMP", "R")
            mirrored_custom_text = mirrored_custom_text.replace("l", "temp").replace("r", "l").replace("temp", "r")
        
        # 新しいボタンを作成
        mirrored_button = PickerButton(
            mirrored_controller, original_button.color_hex, original_button.shape,
            original_button.width, original_button.height, mirrored_custom_text, self.picker_area_bg_label
        )
        mirrored_button.selection_request.connect(self.handle_button_selection)
        mirrored_button.text_edit_request.connect(self.edit_button_text)
        
        # ミラー位置を計算（背景の幅を基準にxを反転）
        background_width = self.fixed_background_size.width()
        mirrored_x = background_width - original_button.x() - original_button.width
        mirrored_y = original_button.y()
        mirrored_button.move(mirrored_x, mirrored_y)
        
        mirrored_button.show()
        self.picker_buttons.append(mirrored_button)
        created_buttons.append(mirrored_button)
    
    # 新しく作成されたボタンを選択状態にする
    for button in created_buttons:
        button.is_selected = True
        button.update_style()
    
    # 結果メッセージ
    success_message = "Successfully created {} mirrored button(s).".format(len(created_buttons))
    if skipped_count > 0:
        success_message += "\n{} button(s) were skipped.".format(skipped_count)
    
    QtWidgets.QMessageBox.information(self, "Mirror Complete", success_message)
