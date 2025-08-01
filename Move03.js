class PickerButton(QtWidgets.QPushButton):
    selection_request = QtCore.Signal(object)
    text_edit_request = QtCore.Signal(object)

    def __init__(self, controller, color, shape, width, height, custom_text="", parent=None):
        super(PickerButton, self).__init__(parent)
        self.controller = controller
        self.color_hex = color
        self.shape = shape
        self.width = width
        self.height = height
        self.custom_text = custom_text
        self.is_draggable = True
        self.is_selected = False

        self.setFixedSize(self.width, self.height)
        self.update_display_text()
        self.setMouseTracking(True)
        self.drag_start_position = None
        self.initial_positions = {}  # ★★★ 選択されたボタンの初期位置を保存 ★★★
        self.update_style()

    def update_display_text(self):
        if self.custom_text:
            display_text = self.custom_text
        else:
            display_text = self.controller.split(':')[-1].replace('_ctrl', '').replace('_control', '').replace('_con', '').replace('Con_', '')
        self.setText(display_text)

    def set_custom_text(self, text):
        self.custom_text = text
        self.update_display_text()

    def update_style(self):
        border_radius = self.width // 2 if self.shape == "Circle" else 3
        q_color = QtGui.QColor(self.color_hex)
        hover_color = q_color.lighter(120).name()
        border_style = "border: 2px solid #ffaa00;" if self.is_selected else "border: 1px solid black;"
        style = """
            QPushButton {{
                background-color: {color}; {border} color: white;
                font-weight: bold; font-size: 9px; border-radius: {radius}px;
            }}
            QPushButton:hover {{ background-color: {hover_color}; }}
        """.format(color=self.color_hex, hover_color=hover_color, radius=border_radius, border=border_style)
        self.setStyleSheet(style)

    def mousePressEvent(self, event):
        if self.is_draggable:
            if event.button() == QtCore.Qt.LeftButton:
                self.selection_request.emit(self)
                self.drag_start_position = event.pos()
                
                # ★★★ 複数選択時の初期位置を記録 ★★★
                if self.is_selected:
                    # 親ウィジェットから全てのPickerButtonを取得
                    parent = self.parent()
                    if parent:
                        self.initial_positions = {}
                        for child in parent.children():
                            if isinstance(child, PickerButton) and child.is_selected:
                                self.initial_positions[child] = child.pos()
                
            elif event.button() == QtCore.Qt.RightButton:
                self.text_edit_request.emit(self)
        else:
            if event.button() == QtCore.Qt.LeftButton:
                try:
                    modifiers = QtWidgets.QApplication.keyboardModifiers()
                    is_shift_pressed = modifiers == QtCore.Qt.ShiftModifier
                    if cmds.objExists(self.controller):
                        cmds.select(self.controller, add=is_shift_pressed)
                except Exception as e:
                    print("Selection error: {}".format(str(e)))
        super(PickerButton, self).mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if (event.buttons() == QtCore.Qt.LeftButton and self.drag_start_position is not None and self.is_draggable):
            if (event.pos() - self.drag_start_position).manhattanLength() >= QtWidgets.QApplication.startDragDistance():
                # ★★★ 複数選択対応の移動処理 ★★★
                if self.is_selected and self.initial_positions:
                    # ドラッグの差分を計算
                    delta = event.pos() - self.drag_start_position
                    
                    # 選択された全てのボタンを移動
                    for button, initial_pos in self.initial_positions.items():
                        new_pos = initial_pos + delta
                        button.move(new_pos)
                else:
                    # 単一選択の場合は従来通り
                    new_pos = self.mapToParent(event.pos() - self.drag_start_position)
                    self.move(new_pos)

    def mouseReleaseEvent(self, event):
        self.drag_start_position = None
        self.initial_positions = {}  # ★★★ 初期位置をクリア ★★★
        super(PickerButton, self).mouseReleaseEvent(event)
