# -*- coding: utf-8 -*-

from __future__ import print_function

import maya.cmds as cmds
import maya.OpenMayaUI as omui

from PySide2 import QtWidgets, QtCore, QtGui
import json
import os

try:
    from shiboken2 import wrapInstance
except ImportError:
    from shiboken import wrapInstance

def get_maya_main_window():
    main_window_ptr = omui.MQtUtil.mainWindow()
    if main_window_ptr is not None:
        return wrapInstance(int(main_window_ptr), QtWidgets.QWidget)
    return None

# --- 参照コードベースの、安定したPickerButtonクラス ---
class PickerButton(QtWidgets.QPushButton):
    def __init__(self, controller, color, shape, size, parent=None):
        super(PickerButton, self).__init__(parent)
        self.controller = controller
        self.color_hex = color
        self.shape = shape
        self.size = size
        self.is_draggable = True  # 編集モードかどうかを制御

        # ボタンの基本的な設定
        self.setFixedSize(size, size)
        display_name = controller.split(':')[-1].replace('_ctrl', '').replace('_control', '').replace('_con', '')
        self.setText(display_name)
        self.setMouseTracking(True)
        self.drag_start_position = None
        self.update_style()

        # クリックイベントの接続
        self.clicked.connect(self.on_button_clicked)

    def update_style(self):
        """スタイルシートでボタンの見た目を設定"""
        border_radius = self.size // 2 if self.shape == "Circle" else 3
        
        # QColorオブジェクトを作成
        q_color = QtGui.QColor(self.color_hex)
        # ホバー時の色を計算（少し明るくする）
        hover_color = q_color.lighter(120).name()

        style = """
            QPushButton {{
                background-color: {color};
                border: 1px solid black;
                color: white;
                font-weight: bold;
                font-size: 9px;
                border-radius: {radius}px;
            }}
            QPushButton:hover {{
                border: 2px solid #00aaff;
                background-color: {hover_color};
            }}
        """.format(color=self.color_hex, hover_color=hover_color, radius=border_radius)
        self.setStyleSheet(style)

    def on_button_clicked(self):
        """実行モードの時だけコントローラーを選択"""
        if not self.is_draggable:  # is_draggableがFalseなら実行モード
            try:
                # Shiftキーが押されているか確認
                modifiers = QtWidgets.QApplication.keyboardModifiers()
                is_shift_pressed = modifiers == QtCore.Qt.ShiftModifier
                
                if cmds.objExists(self.controller):
                    cmds.select(self.controller, add=is_shift_pressed)
                    print("Selected: {}".format(self.controller))
                else:
                    print("Controller not found: {}".format(self.controller))
            except Exception as e:
                print("Selection error: {}".format(str(e)))

    # --- ドラッグ＆ドロップのためのイベントハンドラ ---
    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.LeftButton and self.is_draggable:
            self.drag_start_position = event.pos()
        super(PickerButton, self).mousePressEvent(event) # 親クラスのイベントも呼ぶ

    def mouseMoveEvent(self, event):
        if (event.buttons() == QtCore.Qt.LeftButton and 
            self.drag_start_position is not None and self.is_draggable):
            
            # ドラッグ距離が一定以上になったら移動開始
            if (event.pos() - self.drag_start_position).manhattanLength() >= QtWidgets.QApplication.startDragDistance():
                new_pos = self.mapToParent(event.pos() - self.drag_start_position)
                self.move(new_pos)

    def mouseReleaseEvent(self, event):
        self.drag_start_position = None
        super(PickerButton, self).mouseReleaseEvent(event)


# --- メインウィンドウクラス ---
class RigPickerTool(QtWidgets.QMainWindow):
    def __init__(self, parent=get_maya_main_window()):
        super(RigPickerTool, self).__init__(parent)

        self.picker_buttons = []
        self.current_color = "#009688" # デフォルトカラー

        self.setWindowTitle("Rig Picker Tool")
        self.setGeometry(100, 100, 1000, 750)

        self.create_widgets()
        self.create_layouts()
        self.create_connections()
        self.toggle_edit_mode(True) # 初期状態は編集モード

    def create_widgets(self):
        self.main_widget = QtWidgets.QWidget()
        self.setCentralWidget(self.main_widget)

        # --- ツールバー ---
        self.toolbar = self.addToolBar("Controls")
        self.action_save = self.toolbar.addAction("Save")
        self.action_load = self.toolbar.addAction("Load")
        self.toolbar.addSeparator()
        self.action_edit_mode = QtWidgets.QAction("Edit Mode", self)
        self.action_edit_mode.setCheckable(True)
        self.action_edit_mode.setChecked(True)
        self.toolbar.addAction(self.action_edit_mode)

        # --- 左側のコントロールパネル ---
        self.control_panel = QtWidgets.QFrame()
        self.control_panel.setFrameShape(QtWidgets.QFrame.StyledPanel)
        self.control_panel.setFixedWidth(250)

        # --- 右側のピッカーエリア（背景画像を設定できるようにカスタム） ---
        self.picker_area = QtWidgets.QWidget()
        self.picker_area_layout = QtWidgets.QVBoxLayout(self.picker_area)
        self.picker_area_layout.setContentsMargins(0, 0, 0, 0)
        self.picker_area_bg_label = QtWidgets.QLabel("Right-click to set background image")
        self.picker_area_bg_label.setAlignment(QtCore.Qt.AlignCenter)
        self.picker_area_bg_label.setStyleSheet("border: 2px dashed #555; color: #777;")
        self.picker_area_bg_label.setMinimumSize(600, 600)
        self.picker_area_layout.addWidget(self.picker_area_bg_label)
        self.background_pixmap = None

        # --- コントロールパネル内のウィジェット ---
        # Controller List
        self.controller_group = QtWidgets.QGroupBox("Controllers")
        controller_layout = QtWidgets.QVBoxLayout(self.controller_group)
        self.controller_list = QtWidgets.QListWidget()
        self.refresh_btn = QtWidgets.QPushButton("Refresh List")
        controller_layout.addWidget(self.controller_list)
        controller_layout.addWidget(self.refresh_btn)

        # Button Creation
        self.button_group = QtWidgets.QGroupBox("Button Properties")
        button_layout = QtWidgets.QFormLayout(self.button_group)
        self.button_color_btn = QtWidgets.QPushButton()
        self.update_color_button_style()
        self.button_shape_combo = QtWidgets.QComboBox()
        self.button_shape_combo.addItems(["Circle", "Rectangle"])
        self.button_size_spin = QtWidgets.QSpinBox()
        self.button_size_spin.setRange(20, 150)
        self.button_size_spin.setValue(40)
        button_layout.addRow("Color:", self.button_color_btn)
        button_layout.addRow("Shape:", self.button_shape_combo)
        button_layout.addRow("Size:", self.button_size_spin)

        self.add_button_btn = QtWidgets.QPushButton("Add Button")
        self.delete_button_btn = QtWidgets.QPushButton("Delete Selected Button")

    def create_layouts(self):
        main_layout = QtWidgets.QHBoxLayout(self.main_widget)
        
        # 左パネルのレイアウト
        panel_layout = QtWidgets.QVBoxLayout(self.control_panel)
        panel_layout.addWidget(self.controller_group)
        panel_layout.addWidget(self.button_group)
        panel_layout.addWidget(self.add_button_btn)
        panel_layout.addWidget(self.delete_button_btn)
        panel_layout.addStretch()

        main_layout.addWidget(self.control_panel)
        main_layout.addWidget(self.picker_area, 1)

    def create_connections(self):
        self.action_save.triggered.connect(self.save_picker)
        self.action_load.triggered.connect(self.load_picker)
        self.action_edit_mode.toggled.connect(self.toggle_edit_mode)

        self.refresh_btn.clicked.connect(self.refresh_controller_list)
        self.button_color_btn.clicked.connect(self.choose_button_color)
        self.add_button_btn.clicked.connect(self.add_picker_button)
        self.delete_button_btn.clicked.connect(self.delete_selected_button)

        # 右クリックで背景画像メニューを表示
        self.picker_area_bg_label.setContextMenuPolicy(QtCore.Qt.CustomContextMenu)
        self.picker_area_bg_label.customContextMenuRequested.connect(self.show_bg_context_menu)

    def toggle_edit_mode(self, checked):
        """編集モードと実行モードを切り替える"""
        self.control_panel.setVisible(checked)
        for button in self.picker_buttons:
            button.is_draggable = checked
            button.setCursor(QtCore.Qt.ArrowCursor if checked else QtCore.Qt.PointingHandCursor)

    def refresh_controller_list(self):
        self.controller_list.clear()
        controller_patterns = ['*_ctrl', '*_control', '*_con', '*:*_ctrl', '*:*_control', '*:*_con']
        controllers = []
        for pattern in controller_patterns:
            found = cmds.ls(pattern, type='transform')
            controllers.extend(found)
        controllers = sorted(list(set(controllers)))
        for ctrl in controllers:
            self.controller_list.addItem(ctrl)

    def update_color_button_style(self):
        self.button_color_btn.setStyleSheet("background-color: {};".format(self.current_color))

    def choose_button_color(self):
        color = QtWidgets.QColorDialog.getColor(QtGui.QColor(self.current_color), self)
        if color.isValid():
            self.current_color = color.name()
            self.update_color_button_style()

    def add_picker_button(self):
        selected_items = self.controller_list.selectedItems()
        if not selected_items:
            QtWidgets.QMessageBox.warning(self, "Warning", "Please select a controller from the list.")
            return
        
        controller = selected_items[0].text()

        button = PickerButton(
            controller=controller,
            color=self.current_color,
            shape=self.button_shape_combo.currentText(),
            size=self.button_size_spin.value(),
            parent=self.picker_area_bg_label # 背景ラベルの子として追加
        )
        
        button.move(10, 10) # 初期位置
        button.show()
        self.picker_buttons.append(button)

    def delete_selected_button(self):
        # この設計ではボタン自体に選択状態がないため、実装を変更
        QtWidgets.QMessageBox.information(self, "Info", "This feature is not yet implemented in this version.")

    def save_picker(self):
        file_path, _ = QtWidgets.QFileDialog.getSaveFileName(self, "Save Picker", "", "JSON Files (*.json)")
        if not file_path:
            return

        picker_data = {
            'buttons': [],
            'background_image': getattr(self, 'background_image_path', None)
        }
        for button in self.picker_buttons:
            button_data = {
                'controller': button.controller,
                'position': [button.x(), button.y()],
                'color': button.color_hex,
                'shape': button.shape,
                'size': button.size
            }
            picker_data['buttons'].append(button_data)

        try:
            with open(file_path, 'w') as f:
                json.dump(picker_data, f, indent=4)
            QtWidgets.QMessageBox.information(self, "Success", "Picker saved successfully.")
        except Exception as e:
            QtWidgets.QMessageBox.critical(self, "Error", "Failed to save: {}".format(str(e)))
    
    def load_picker(self):
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "Load Picker", "", "JSON Files (*.json)")
        if not file_path:
            return

        try:
            with open(file_path, 'r') as f:
                picker_data = json.load(f)

            self.clear_picker()

            # 背景画像を復元
            bg_path = picker_data.get('background_image')
            if bg_path and os.path.exists(bg_path):
                self.set_background_image(bg_path)

            # ボタンを復元
            for button_data in picker_data.get('buttons', []):
                button = PickerButton(
                    controller=button_data['controller'],
                    color=button_data['color'],
                    shape=button_data['shape'],
                    size=button_data['size'],
                    parent=self.picker_area_bg_label
                )
                button.move(button_data['position'][0], button_data['position'][1])
                button.show()
                self.picker_buttons.append(button)
            
            self.toggle_edit_mode(self.action_edit_mode.isChecked()) # 現在のモードを適用
            QtWidgets.QMessageBox.information(self, "Success", "Picker loaded successfully.")

        except Exception as e:
            QtWidgets.QMessageBox.critical(self, "Error", "Failed to load: {}".format(str(e)))
    
    def clear_picker(self):
        for button in self.picker_buttons:
            button.deleteLater()
        self.picker_buttons = []
        self.clear_background_image()

    # --- 背景画像関連のメソッド ---
    def show_bg_context_menu(self, position):
        menu = QtWidgets.QMenu()
        set_action = menu.addAction("Set Background Image")
        clear_action = menu.addAction("Clear Background Image")
        
        action = menu.exec_(self.picker_area_bg_label.mapToGlobal(position))
        
        if action == set_action:
            self.prompt_set_background_image()
        elif action == clear_action:
            self.clear_background_image()

    def prompt_set_background_image(self):
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "Select Image", "", "Image Files (*.png *.jpg *.jpeg)")
        if file_path:
            self.set_background_image(file_path)

    def set_background_image(self, file_path):
        self.background_image_path = file_path
        self.background_pixmap = QtGui.QPixmap(file_path)
        self.update_background()

    def clear_background_image(self):
        self.background_pixmap = None
        self.background_image_path = None
        self.picker_area_bg_label.setText("Right-click to set background image")
        self.picker_area_bg_label.setStyleSheet("border: 2px dashed #555; color: #777;")

    def update_background(self):
        if self.background_pixmap:
            scaled_pixmap = self.background_pixmap.scaled(self.picker_area_bg_label.size(), QtCore.Qt.KeepAspectRatio, QtCore.Qt.SmoothTransformation)
            self.picker_area_bg_label.setPixmap(scaled_pixmap)
            self.picker_area_bg_label.setText("") # テキストを消去
            self.picker_area_bg_label.setStyleSheet("border: none;")

    def resizeEvent(self, event):
        """ウィンドウサイズ変更時に背景画像を再スケーリング"""
        super(RigPickerTool, self).resizeEvent(event)
        self.update_background()


# --- ツール起動用関数 ---
rig_picker_tool_instance = None

def launch():
    global rig_picker_tool_instance
    if rig_picker_tool_instance:
        rig_picker_tool_instance.close()
        rig_picker_tool_instance.deleteLater()
    
    rig_picker_tool_instance = RigPickerTool()
    rig_picker_tool_instance.show()
    return rig_picker_tool_instance