def create_widgets(self):
    # ... 既存のコード ...
    
    # 実行モード用のウィジェット
    self.runtime_actions_group = QtWidgets.QGroupBox("Actions")
    self.mirror_values_btn = QtWidgets.QPushButton("Mirror Selected Values")
    self.mirror_values_btn.setToolTip("Copy attribute values from selected controllers to their mirrored counterparts")
    self.reset_selected_btn = QtWidgets.QPushButton("Reset Selected")
    self.reset_selected_btn.setToolTip("Reset selected controllers to their default values")
    
    # ★★★ Gaze Mode表示用のグループを追加 ★★★
    self.gaze_mode_group = QtWidgets.QGroupBox("Gaze Mode")
    self.gaze_mode_label = QtWidgets.QLabel("Checking...")
    self.gaze_mode_label.setAlignment(QtCore.Qt.AlignCenter)
    self.gaze_mode_label.setStyleSheet("QLabel { font-weight: bold; font-size: 12px; padding: 5px; }")

def create_layouts(self):
    # ... 既存のコード ...
    
    # 実行モードパネルのレイアウト
    runtime_layout = QtWidgets.QVBoxLayout(self.runtime_panel)
    runtime_actions_layout = QtWidgets.QVBoxLayout(self.runtime_actions_group)
    runtime_actions_layout.addWidget(self.mirror_values_btn)
    runtime_actions_layout.addWidget(self.reset_selected_btn)
    runtime_layout.addWidget(self.runtime_actions_group)
    
    # ★★★ Gaze Modeグループを追加 ★★★
    gaze_mode_layout = QtWidgets.QVBoxLayout(self.gaze_mode_group)
    gaze_mode_layout.addWidget(self.gaze_mode_label)
    runtime_layout.addWidget(self.gaze_mode_group)
    
    runtime_layout.addStretch()

# ★★★ 新しいメソッド：Gazeモードをチェック ★★★
def check_gaze_mode(self):
    if cmds.objExists("decMatrix_Gaze"):
        self.gaze_mode_label.setText("World")
        self.gaze_mode_label.setStyleSheet("QLabel { font-weight: bold; font-size: 12px; padding: 5px; color: #4CAF50; }")
    else:
        self.gaze_mode_label.setText("Local")
        self.gaze_mode_label.setStyleSheet("QLabel { font-weight: bold; font-size: 12px; padding: 5px; color: #2196F3; }")

# ★★★ 既存のcheck_selection_changeメソッドを修正 ★★★
def check_selection_change(self):
    # 実行モードの時のみ動作
    if self.action_edit_mode.isChecked():
        return
    
    # ★★★ Gazeモードもチェック ★★★
    self.check_gaze_mode()
    
    current_selection = cmds.ls(selection=True, type='transform')
    
    # 選択が変更されていない場合は何もしない
    if current_selection == self.last_selection:
        return
    
    self.last_selection = current_selection
    
    # 全てのボタンのハイライトをクリア
    for button in self.picker_buttons:
        button.is_selected = False
        button.update_style()
    
    # 選択されたコントローラーに対応するボタンをハイライト
    for controller in current_selection:
        for button in self.picker_buttons:
            if button.controller == controller:
                button.is_selected = True
                button.update_style()
                break

# ★★★ toggle_edit_modeメソッドを修正 ★★★
def toggle_edit_mode(self, checked):
    self.control_panel.setVisible(checked)
    self.runtime_panel.setVisible(not checked)
    
    for button in self.picker_buttons:
        button.is_draggable = checked
        button.setCursor(QtCore.Qt.ArrowCursor if checked else QtCore.Qt.PointingHandCursor)
    
    if not checked:
        # 実行モードに切り替えた時、現在の選択をチェック
        self.deselect_all_buttons()
        self.check_selection_change()
        # ★★★ Gazeモードも初期チェック ★★★
        self.check_gaze_mode()
    else:
        # 編集モードに切り替えた時、選択をクリア
        self.deselect_all_buttons()
