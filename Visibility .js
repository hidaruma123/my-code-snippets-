def create_widgets(self):
    # ... 既存のコード ...
    
    # 実行モード用のウィジェット
    self.runtime_actions_group = QtWidgets.QGroupBox("Actions")
    self.mirror_values_btn = QtWidgets.QPushButton("Mirror Selected Values")
    self.mirror_values_btn.setToolTip("Copy attribute values from selected controllers to their mirrored counterparts")
    self.reset_selected_btn = QtWidgets.QPushButton("Reset Selected")
    self.reset_selected_btn.setToolTip("Reset selected controllers to their default values")
    
    # ★★★ Visibility制御ボタンを追加 ★★★
    self.toggle_visibility_btn = QtWidgets.QPushButton("Toggle Visibility")
    self.toggle_visibility_btn.setToolTip("Toggle visibility of selected controllers")
    self.show_all_selected_btn = QtWidgets.QPushButton("Show All Selected")
    self.show_all_selected_btn.setToolTip("Make all selected controllers visible")

def create_layouts(self):
    # ... 既存のコード ...
    
    # 実行モードパネルのレイアウト
    runtime_layout = QtWidgets.QVBoxLayout(self.runtime_panel)
    runtime_actions_layout = QtWidgets.QVBoxLayout(self.runtime_actions_group)
    runtime_actions_layout.addWidget(self.mirror_values_btn)
    runtime_actions_layout.addWidget(self.reset_selected_btn)
    # ★★★ Visibilityボタンを追加 ★★★
    runtime_actions_layout.addWidget(self.toggle_visibility_btn)
    runtime_actions_layout.addWidget(self.show_all_selected_btn)
    runtime_layout.addWidget(self.runtime_actions_group)
    
    # ... 既存のGaze Modeグループなど ...

def create_connections(self):
    # ... 既存のコード ...
    
    # 実行モードのボタン接続
    self.mirror_values_btn.clicked.connect(self.mirror_selected_values)
    self.reset_selected_btn.clicked.connect(self.reset_selected_controllers)
    # ★★★ Visibilityボタンの接続 ★★★
    self.toggle_visibility_btn.clicked.connect(self.toggle_selected_visibility)
    self.show_all_selected_btn.clicked.connect(self.show_all_selected)

# ★★★ 新しいメソッド：選択中のコントローラーのVisibilityをトグル ★★★
def toggle_selected_visibility(self):
    selected_controllers = cmds.ls(selection=True, type='transform')
    if not selected_controllers:
        print("Warning: Please select at least one controller.")
        return
    
    toggled_count = 0
    for controller in selected_controllers:
        if cmds.attributeQuery('visibility', node=controller, exists=True):
            try:
                # 現在のvisibility値を取得してトグル
                current_vis = cmds.getAttr(controller + '.visibility')
                if not cmds.getAttr(controller + '.visibility', lock=True):
                    cmds.setAttr(controller + '.visibility', not current_vis)
                    toggled_count += 1
            except Exception as e:
                print("Error toggling visibility for {}: {}".format(controller, str(e)))
    
    if toggled_count > 0:
        print("Toggled visibility for {} controller(s).".format(toggled_count))

# ★★★ 新しいメソッド：選択中のコントローラーを全て表示 ★★★
def show_all_selected(self):
    selected_controllers = cmds.ls(selection=True, type='transform')
    if not selected_controllers:
        print("Warning: Please select at least one controller.")
        return
    
    shown_count = 0
    for controller in selected_controllers:
        if cmds.attributeQuery('visibility', node=controller, exists=True):
            try:
                if not cmds.getAttr(controller + '.visibility', lock=True):
                    cmds.setAttr(controller + '.visibility', True)
                    shown_count += 1
            except Exception as e:
                print("Error showing {}: {}".format(controller, str(e)))
    
    if shown_count > 0:
        print("Made {} controller(s) visible.".format(shown_count))
