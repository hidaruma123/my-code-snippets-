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

class PickerAreaLabel(QtWidgets.QLabel):
    def __init__(self, parent_tool):
        super(PickerAreaLabel, self).__init__()
        self.parent_tool = parent_tool
        self.rubber_band = QtWidgets.QRubberBand(QtWidgets.QRubberBand.Rectangle, self)
        self.selection_origin = QtCore.QPoint()

    def mousePressEvent(self, event):
        child = self.childAt(event.pos())
        if event.button() == QtCore.Qt.LeftButton and not child:
            self.selection_origin = event.pos()
            self.rubber_band.setGeometry(QtCore.QRect(self.selection_origin, QtCore.QSize()))
            self.rubber_band.show()
        super(PickerAreaLabel, self).mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if not self.selection_origin.isNull():
            self.rubber_band.setGeometry(QtCore.QRect(self.selection_origin, event.pos()).normalized())
        super(PickerAreaLabel, self).mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == QtCore.Qt.LeftButton and not self.selection_origin.isNull():
            self.rubber_band.hide()
            selection_rect = self.rubber_band.geometry()
            self.parent_tool.select_buttons_in_rect(selection_rect)
            self.selection_origin = QtCore.QPoint()
        super(PickerAreaLabel, self).mouseReleaseEvent(event)

    # ★★★ リサイズイベントを追加してL/Rボタンの位置を更新 ★★★
    def resizeEvent(self, event):
        super(PickerAreaLabel, self).resizeEvent(event)
        if hasattr(self.parent_tool, 'update_lr_button_positions'):
            self.parent_tool.update_lr_button_positions()

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
                new_pos = self.mapToParent(event.pos() - self.drag_start_position)
                self.move(new_pos)

    def mouseReleaseEvent(self, event):
        self.drag_start_position = None
        super(PickerButton, self).mouseReleaseEvent(event)

class RigPickerTool(QtWidgets.QMainWindow):
    def __init__(self, parent=get_maya_main_window()):
        super(RigPickerTool, self).__init__(parent)
        self.picker_buttons = []
        self.current_color = "#009688"
        self.setWindowTitle("Rig Picker Tool")
        self.setGeometry(100, 100, 1000, 750)
        
        self.fixed_background_size = QtCore.QSize(800, 600)
        
        # 選択変更を監視するためのタイマーを追加
        self.selection_timer = QtCore.QTimer()
        self.selection_timer.timeout.connect(self.check_selection_change)
        self.last_selection = []
        
        self.create_widgets()
        self.create_layouts()
        self.create_connections()
        self.toggle_edit_mode(True)
        self.on_shape_changed()
        
        # タイマーを開始（500ms間隔）
        self.selection_timer.start(500)

    def create_widgets(self):
        self.main_widget = QtWidgets.QWidget()
        self.setCentralWidget(self.main_widget)
        self.toolbar = self.addToolBar("Controls")
        self.action_save = self.toolbar.addAction("Save")
        self.action_load = self.toolbar.addAction("Load")
        self.toolbar.addSeparator()
        self.action_edit_mode = QtWidgets.QAction("Edit Mode", self)
        self.action_edit_mode.setCheckable(True)
        self.action_edit_mode.setChecked(True)
        self.toolbar.addAction(self.action_edit_mode)
        
        # 編集モード用のコントロールパネル
        self.control_panel = QtWidgets.QFrame()
        self.control_panel.setFrameShape(QtWidgets.QFrame.StyledPanel)
        self.control_panel.setFixedWidth(250)
        
        # 実行モード用のコントロールパネル
        self.runtime_panel = QtWidgets.QFrame()
        self.runtime_panel.setFrameShape(QtWidgets.QFrame.StyledPanel)
        self.runtime_panel.setFixedWidth(250)
        
        self.scroll_area = QtWidgets.QScrollArea()
        self.scroll_area.setWidgetResizable(False)
        self.scroll_area.setHorizontalScrollBarPolicy(QtCore.Qt.ScrollBarAsNeeded)
        self.scroll_area.setVerticalScrollBarPolicy(QtCore.Qt.ScrollBarAsNeeded)
        
        self.picker_area_bg_label = PickerAreaLabel(self)
        self.picker_area_bg_label.setAlignment(QtCore.Qt.AlignCenter)
        self.picker_area_bg_label.setStyleSheet("border: 2px dashed #555; color: #777;")
        self.picker_area_bg_label.setFixedSize(self.fixed_background_size)
        self.picker_area_bg_label.setText("Right-click to set background image\nDrag on empty area to select multiple")
        
        self.scroll_area.setWidget(self.picker_area_bg_label)
        
        # ★★★ L/Rセレクトボタンを追加 ★★★
        self.select_l_btn = QtWidgets.QPushButton("L")
        self.select_l_btn.setFixedSize(30, 30)
        self.select_l_btn.setToolTip("Select all Con_L_ controllers")
        self.select_l_btn.setStyleSheet("""
            QPushButton {
                background-color: #2196F3;
                color: white;
                font-weight: bold;
                font-size: 14px;
                border-radius: 15px;
            }
            QPushButton:hover {
                background-color: #1976D2;
            }
        """)
        
        self.select_r_btn = QtWidgets.QPushButton("R")
        self.select_r_btn.setFixedSize(30, 30)
        self.select_r_btn.setToolTip("Select all Con_R_ controllers")
        self.select_r_btn.setStyleSheet("""
            QPushButton {
                background-color: #F44336;
                color: white;
                font-weight: bold;
                font-size: 14px;
                border-radius: 15px;
            }
            QPushButton:hover {
                background-color: #D32F2F;
            }
        """)
        
        # ボタンをpicker_area_bg_labelの親として設定
        self.select_l_btn.setParent(self.picker_area_bg_label)
        self.select_r_btn.setParent(self.picker_area_bg_label)
        
        # 初期位置を設定
        self.update_lr_button_positions()
        
        self.background_pixmap = None
        self.controller_group = QtWidgets.QGroupBox("Controllers")
        controller_layout = QtWidgets.QVBoxLayout(self.controller_group)
        self.controller_list = QtWidgets.QListWidget()
        self.refresh_btn = QtWidgets.QPushButton("Refresh List")
        controller_layout.addWidget(self.controller_list)
        controller_layout.addWidget(self.refresh_btn)
        
        self.button_group = QtWidgets.QGroupBox("Button Properties")
        self.button_properties_layout = QtWidgets.QFormLayout(self.button_group)
        self.button_color_btn = QtWidgets.QPushButton()
        self.update_color_button_style()
        self.button_shape_combo = QtWidgets.QComboBox()
        self.button_shape_combo.addItems(["Circle", "Rectangle"])
        
        self.width_spin = QtWidgets.QSpinBox()
        self.width_spin.setRange(10, 300)
        self.width_spin.setValue(40)
        self.height_spin = QtWidgets.QSpinBox()
        self.height_spin.setRange(10, 300)
        self.height_spin.setValue(40)

        self.custom_text_edit = QtWidgets.QLineEdit()
        self.custom_text_edit.setPlaceholderText("Leave empty for auto-generated text")

        self.button_properties_layout.addRow("Color:", self.button_color_btn)
        self.button_properties_layout.addRow("Shape:", self.button_shape_combo)
        self.width_label = QtWidgets.QLabel("Size:")
        self.button_properties_layout.addRow(self.width_label, self.width_spin)
        self.height_label = QtWidgets.QLabel("Height:")
        self.button_properties_layout.addRow(self.height_label, self.height_spin)
        self.button_properties_layout.addRow("Custom Text:", self.custom_text_edit)

        self.add_button_btn = QtWidgets.QPushButton("Add Button")
        self.delete_button_btn = QtWidgets.QPushButton("Delete Selected Button(s)")
        self.mirror_button_btn = QtWidgets.QPushButton("Mirror Selected Button")
        
        # 実行モード用のウィジェット
        self.runtime_actions_group = QtWidgets.QGroupBox("Actions")
        self.mirror_values_btn = QtWidgets.QPushButton("Mirror Selected Values")
        self.mirror_values_btn.setToolTip("Copy attribute values from selected controllers to their mirrored counterparts")
        self.reset_selected_btn = QtWidgets.QPushButton("Reset Selected")
        self.reset_selected_btn.setToolTip("Reset selected controllers to their default values")

    # ★★★ L/Rボタンの位置を更新するメソッド ★★★
    def update_lr_button_positions(self):
        if hasattr(self, 'select_l_btn') and hasattr(self, 'select_r_btn'):
            # Lボタンを左上に配置
            self.select_l_btn.move(10, 10)
            # Rボタンを右上に配置
            self.select_r_btn.move(self.picker_area_bg_label.width() - 40, 10)
            # ボタンを最前面に表示
            self.select_l_btn.raise_()
            self.select_r_btn.raise_()

    # ★★★ Lボタンクリック時の処理 ★★★
    def select_l_controllers(self):
        l_controllers = []
        for button in self.picker_buttons:
            if button.controller.startswith("Con_L_"):
                l_controllers.append(button.controller)
        
        if l_controllers:
            cmds.select(l_controllers)
            print("Selected {} Con_L_ controllers".format(len(l_controllers)))
        else:
            cmds.select(clear=True)
            print("No Con_L_ controllers found")

    # ★★★ Rボタンクリック時の処理 ★★★
    def select_r_controllers(self):
        r_controllers = []
        for button in self.picker_buttons:
            if button.controller.startswith("Con_R_"):
                r_controllers.append(button.controller)
        
        if r_controllers:
            cmds.select(r_controllers)
            print("Selected {} Con_R_ controllers".format(len(r_controllers)))
        else:
            cmds.select(clear=True)
            print("No Con_R_ controllers found")

    def create_layouts(self):
        main_layout = QtWidgets.QHBoxLayout(self.main_widget)
        
        # 編集モードパネルのレイアウト
        panel_layout = QtWidgets.QVBoxLayout(self.control_panel)
        panel_layout.addWidget(self.controller_group)
        panel_layout.addWidget(self.button_group)
        panel_layout.addWidget(self.add_button_btn)
        panel_layout.addWidget(self.delete_button_btn)
        panel_layout.addWidget(self.mirror_button_btn)
        panel_layout.addStretch()
        
        # 実行モードパネルのレイアウト
        runtime_layout = QtWidgets.QVBoxLayout(self.runtime_panel)
        runtime_actions_layout = QtWidgets.QVBoxLayout(self.runtime_actions_group)
        runtime_actions_layout.addWidget(self.mirror_values_btn)
        runtime_actions_layout.addWidget(self.reset_selected_btn)
        runtime_layout.addWidget(self.runtime_actions_group)
        runtime_layout.addStretch()
        
        main_layout.addWidget(self.control_panel)
        main_layout.addWidget(self.runtime_panel)
        main_layout.addWidget(self.scroll_area, 1)

    def create_connections(self):
        self.action_save.triggered.connect(self.save_picker)
        self.action_load.triggered.connect(self.load_picker)
        self.action_edit_mode.toggled.connect(self.toggle_edit_mode)
        self.refresh_btn.clicked.connect(self.refresh_controller_list)
        self.button_color_btn.clicked.connect(self.choose_button_color)
        self.add_button_btn.clicked.connect(self.add_picker_button)
        self.delete_button_btn.clicked.connect(self.delete_selected_button)
        self.picker_area_bg_label.setContextMenuPolicy(QtCore.Qt.CustomContextMenu)
        self.picker_area_bg_label.customContextMenuRequested.connect(self.show_bg_context_menu)
        self.button_shape_combo.currentIndexChanged.connect(self.on_shape_changed)
        self.mirror_button_btn.clicked.connect(self.mirror_selected_button)
        
        # 実行モードのボタン接続
        self.mirror_values_btn.clicked.connect(self.mirror_selected_values)
        self.reset_selected_btn.clicked.connect(self.reset_selected_controllers)
        
        # ★★★ L/Rボタンの接続 ★★★
        self.select_l_btn.clicked.connect(self.select_l_controllers)
        self.select_r_btn.clicked.connect(self.select_r_controllers)

    # 選択の変更をチェック
    def check_selection_change(self):
        # 実行モードの時のみ動作
        if self.action_edit_mode.isChecked():
            return
        
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

    # ウィンドウを閉じる時にタイマーを停止
    def closeEvent(self, event):
        self.selection_timer.stop()
        super(RigPickerTool, self).closeEvent(event)

    def on_shape_changed(self):
        shape = self.button_shape_combo.currentText()
        is_rectangle = (shape == "Rectangle")

        self.height_label.setVisible(is_rectangle)
        self.height_spin.setVisible(is_rectangle)
        
        if is_rectangle:
            self.width_label.setText("Width:")
        else:
            self.width_label.setText("Size:")

    def toggle_edit_mode(self, checked):
        self.control_panel.setVisible(checked)
        self.runtime_panel.setVisible(not checked)
        
        # ★★★ L/Rボタンの表示/非表示を切り替え ★★★
        self.select_l_btn.setVisible(not checked)
        self.select_r_btn.setVisible(not checked)
        
        for button in self.picker_buttons:
            button.is_draggable = checked
            button.setCursor(QtCore.Qt.ArrowCursor if checked else QtCore.Qt.PointingHandCursor)
        
        if not checked:
            # 実行モードに切り替えた時、現在の選択をチェック
            self.deselect_all_buttons()
            self.check_selection_change()
        else:
            # 編集モードに切り替えた時、選択をクリア
            self.deselect_all_buttons()

    # 実行モード用のメソッド: 選択されたコントローラーの値をミラー（ダイアログなし）
    def mirror_selected_values(self):
        selected_controllers = cmds.ls(selection=True, type='transform')
        if not selected_controllers:
            print("Warning: Please select at least one controller.")
            return
        
        mirrored_count = 0
        failed_controllers = []
        
        for controller in selected_controllers:
            # プリフィックスに基づいて左右逆側のコントローラーを生成
            if controller.startswith("Con_L_"):
                mirrored_controller = controller.replace("Con_L_", "Con_R_", 1)
            elif controller.startswith("Con_R_"):
                mirrored_controller = controller.replace("Con_R_", "Con_L_", 1)
            else:
                continue  # 対象外のコントローラーはスキップ
            
            # ミラーコントローラーが存在するか確認
            if not cmds.objExists(mirrored_controller):
                failed_controllers.append(controller)
                continue
            
            # 属性値をコピー
            try:
                # Transform属性
                for attr in ['translateX', 'translateY', 'translateZ', 'rotateX', 'rotateY', 'rotateZ', 'scaleX', 'scaleY', 'scaleZ']:
                    if cmds.attributeQuery(attr, node=controller, exists=True) and not cmds.getAttr(controller + '.' + attr, lock=True):
                        value = cmds.getAttr(controller + '.' + attr)
                        
                        # X軸の値は反転（translate と rotate のみ）
                        if attr in ['translateX', 'rotateY', 'rotateZ']:
                            value = -value
                            
                        if cmds.attributeQuery(attr, node=mirrored_controller, exists=True) and not cmds.getAttr(mirrored_controller + '.' + attr, lock=True):
                            cmds.setAttr(mirrored_controller + '.' + attr, value)
                
                # カスタム属性もコピー
                user_attrs = cmds.listAttr(controller, userDefined=True) or []
                for attr in user_attrs:
                    if cmds.attributeQuery(attr, node=mirrored_controller, exists=True):
                        value = cmds.getAttr(controller + '.' + attr)
                        if not cmds.getAttr(mirrored_controller + '.' + attr, lock=True):
                            try:
                                cmds.setAttr(mirrored_controller + '.' + attr, value)
                            except:
                                pass  # 型が合わない場合などはスキップ
                
                mirrored_count += 1
                
            except Exception as e:
                failed_controllers.append(controller)
                print("Error mirroring {}: {}".format(controller, str(e)))
        
        # コンソールに結果を出力
        if mirrored_count > 0:
            print("Successfully mirrored {} controller(s).".format(mirrored_count))
        if failed_controllers:
            print("Failed to mirror: {}".format(", ".join(failed_controllers)))

    # 選択されたコントローラーをリセット（ダイアログなし）
    def reset_selected_controllers(self):
        selected_controllers = cmds.ls(selection=True, type='transform')
        if not selected_controllers:
            print("Warning: Please select at least one controller.")
            return
        
        reset_count = 0
        for controller in selected_controllers:
            # Transform属性をリセット
            for attr in ['translateX', 'translateY', 'translateZ', 'rotateX', 'rotateY', 'rotateZ']:
                if cmds.attributeQuery(attr, node=controller, exists=True) and not cmds.getAttr(controller + '.' + attr, lock=True):
                    cmds.setAttr(controller + '.' + attr, 0)
            
            for attr in ['scaleX', 'scaleY', 'scaleZ']:
                if cmds.attributeQuery(attr, node=controller, exists=True) and not cmds.getAttr(controller + '.' + attr, lock=True):
                    cmds.setAttr(controller + '.' + attr, 1)
            
            reset_count += 1
        
        # コンソールに結果を出力
        print("Reset {} controller(s).".format(reset_count))

    def add_picker_button(self):
        selected_items = self.controller_list.selectedItems()
        if not selected_items:
            QtWidgets.QMessageBox.warning(self, "Warning", "Please select a controller from the list.")
            return
        
        controller = selected_items[0].text()
        shape = self.button_shape_combo.currentText()
        
        width = self.width_spin.value()
        if shape == "Circle":
            height = width
        else:
            height = self.height_spin.value()

        custom_text = self.custom_text_edit.text().strip()

        button = PickerButton(
            controller, self.current_color, shape,
            width, height, custom_text, self.picker_area_bg_label
        )
        button.selection_request.connect(self.handle_button_selection)
        button.text_edit_request.connect(self.edit_button_text)
        button.move(10, 10)
        button.show()
        self.picker_buttons.append(button)

    def edit_button_text(self, button):
        current_text = button.custom_text
        text, ok = QtWidgets.QInputDialog.getText(
            self, 'Edit Button Text', 
            'Enter custom text for this button:\n(Leave empty for auto-generated text)',
            QtWidgets.QLineEdit.Normal, current_text
        )
        if ok:
            button.set_custom_text(text.strip())

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

    def handle_button_selection(self, clicked_button):
        modifiers = QtWidgets.QApplication.keyboardModifiers()
        is_shift_pressed = modifiers == QtCore.Qt.ShiftModifier
        if not is_shift_pressed:
            for btn in self.picker_buttons:
                if btn != clicked_button and btn.is_selected:
                    btn.is_selected = False
                    btn.update_style()
        clicked_button.is_selected = not clicked_button.is_selected
        clicked_button.update_style()
        
    def delete_selected_button(self):
        buttons_to_delete = [btn for btn in self.picker_buttons if btn.is_selected]
        if not buttons_to_delete:
            QtWidgets.QMessageBox.warning(self, "Info", "No buttons are selected to delete.")
            return
        reply = QtWidgets.QMessageBox.question(self, 'Confirm Deletion', 
            "Are you sure you want to delete {} button(s)?".format(len(buttons_to_delete)),
            QtWidgets.QMessageBox.Yes | QtWidgets.QMessageBox.No, QtWidgets.QMessageBox.No)
        if reply == QtWidgets.QMessageBox.Yes:
            for button in reversed(self.picker_buttons):
                if button.is_selected:
                    self.picker_buttons.remove(button)
                    button.deleteLater()
            print("{} button(s) deleted.".format(len(buttons_to_delete)))

    def deselect_all_buttons(self):
        for btn in self.picker_buttons:
            if btn.is_selected:
                btn.is_selected = False
                btn.update_style()

    def select_buttons_in_rect(self, selection_rect):
        modifiers = QtWidgets.QApplication.keyboardModifiers()
        is_shift_pressed = modifiers == QtCore.Qt.ShiftModifier
        if self.action_edit_mode.isChecked():
            if not is_shift_pressed:
                self.deselect_all_buttons()
            for button in self.picker_buttons:
                if selection_rect.intersects(button.geometry()):
                    button.is_selected = True
                    button.update_style()
        else:
            controllers_in_rect = [btn.controller for btn in self.picker_buttons if selection_rect.intersects(btn.geometry())]
            if controllers_in_rect:
                try: cmds.select(controllers_in_rect, add=is_shift_pressed)
                except Exception as e: print("Error during selection: {}".format(e))
            elif not is_shift_pressed: cmds.select(clear=True)

    def refresh_controller_list(self):
        self.controller_list.clear()
        patterns = ['*_ctrl', '*_control', '*_con', 'Con_*', '*:*_ctrl', '*:*_control', '*:*_con', '*:Con_*']
        controllers = sorted(list(set(c for p in patterns for c in cmds.ls(p, type='transform'))))
        self.controller_list.addItems(controllers)

    def update_color_button_style(self):
        self.button_color_btn.setStyleSheet("background-color: {};".format(self.current_color))

    def choose_button_color(self):
        color = QtWidgets.QColorDialog.getColor(QtGui.QColor(self.current_color), self)
        if color.isValid():
            self.current_color = color.name()
            self.update_color_button_style()

    def save_picker(self):
        path, _ = QtWidgets.QFileDialog.getSaveFileName(self, "Save Picker", "", "JSON Files (*.json)")
        if not path: return
        data = {
            'buttons': [], 
            'background_image': getattr(self, 'background_image_path', None),
            'background_size': [self.fixed_background_size.width(), self.fixed_background_size.height()]
        }
        for btn in self.picker_buttons:
            data['buttons'].append({
                'controller': btn.controller, 
                'position': [btn.x(), btn.y()],
                'color': btn.color_hex, 
                'shape': btn.shape, 
                'width': btn.width, 
                'height': btn.height,
                'custom_text': btn.custom_text
            })
        with open(path, 'w') as f: json.dump(data, f, indent=4)
        QtWidgets.QMessageBox.information(self, "Success", "Picker saved successfully.")

    def load_picker(self):
        path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "Load Picker", "", "JSON Files (*.json)")
        if not path: return
        with open(path, 'r') as f: data = json.load(f)
        self.clear_picker()
        
        bg_size = data.get('background_size', [800, 600])
        self.fixed_background_size = QtCore.QSize(bg_size[0], bg_size[1])
        self.picker_area_bg_label.setFixedSize(self.fixed_background_size)
        
        bg_path = data.get('background_image')
        if bg_path and os.path.exists(bg_path): 
            self.set_background_image(bg_path)
            
        for btn_data in data.get('buttons', []):
            size = btn_data.get('size', 40)
            width = btn_data.get('width', size)
            height = btn_data.get('height', size)
            custom_text = btn_data.get('custom_text', '')
            
            btn = PickerButton(btn_data['controller'], btn_data['color'], btn_data['shape'],
                               width, height, custom_text, self.picker_area_bg_label)
            btn.selection_request.connect(self.handle_button_selection)
            btn.text_edit_request.connect(self.edit_button_text)
            btn.move(btn_data['position'][0], btn_data['position'][1])
            btn.show()
            self.picker_buttons.append(btn)
        self.toggle_edit_mode(self.action_edit_mode.isChecked())
        QtWidgets.QMessageBox.information(self, "Success", "Picker loaded successfully.")

    def clear_picker(self):
        for btn in self.picker_buttons: btn.deleteLater()
        self.picker_buttons = []
        self.clear_background_image()

    def show_bg_context_menu(self, pos):
        menu = QtWidgets.QMenu()
        set_action, clear_action = menu.addAction("Set Background Image"), menu.addAction("Clear Background Image")
        action = menu.exec_(self.picker_area_bg_label.mapToGlobal(pos))
        if action == set_action: self.prompt_set_background_image()
        elif action == clear_action: self.clear_background_image()

    def prompt_set_background_image(self):
        path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "Select Image", "", "Image Files (*.png *.jpg *.jpeg)")
        if path: self.set_background_image(path)

    def set_background_image(self, path):
        self.background_image_path = path
        self.background_pixmap = QtGui.QPixmap(path)
        if not self.background_pixmap.isNull():
            self.fixed_background_size = self.background_pixmap.size()
            self.picker_area_bg_label.setFixedSize(self.fixed_background_size)
        self.update_background()
        # ★★★ 背景画像サイズ変更時にL/Rボタンの位置を更新 ★★★
        self.update_lr_button_positions()

    def clear_background_image(self):
        self.background_pixmap = None
        self.background_image_path = None
        self.fixed_background_size = QtCore.QSize(800, 600)
        self.picker_area_bg_label.setFixedSize(self.fixed_background_size)
        self.picker_area_bg_label.setText("Right-click to set background image\nDrag on empty area to select multiple")
        self.picker_area_bg_label.setStyleSheet("border: 2px dashed #555; color: #777;")
        # ★★★ 背景クリア時にL/Rボタンの位置を更新 ★★★
        self.update_lr_button_positions()

    def update_background(self):
        if self.background_pixmap:
            self.picker_area_bg_label.setPixmap(self.background_pixmap)
            self.picker_area_bg_label.setText("")
            self.picker_area_bg_label.setStyleSheet("border: none;")

rig_picker_tool_instance = None
def launch():
    global rig_picker_tool_instance
    if rig_picker_tool_instance: rig_picker_tool_instance.close(); rig_picker_tool_instance.deleteLater()
    rig_picker_tool_instance = RigPickerTool()
    rig_picker_tool_instance.show()
    return rig_picker_tool_instance
