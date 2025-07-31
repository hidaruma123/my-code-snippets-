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

class PickerButton(QtWidgets.QPushButton):
    selection_request = QtCore.Signal(object)

    def __init__(self, controller, color, shape, size, parent_tool, parent=None):
        super(PickerButton, self).__init__(parent)
        self.controller = controller
        self.color_hex = color
        self.shape = shape
        self.size = size
        self.parent_tool = parent_tool # ★★★ 親ウィンドウへの参照 ★★★
        self.is_draggable = True
        self.is_selected = False

        self.setFixedSize(size, size)
        display_name = controller.split(':')[-1].replace('_ctrl', '').replace('_control', '').replace('_con', '').replace('Con_', '')
        self.setText(display_name)
        self.setMouseTracking(True)
        self.drag_start_global_pos = None # ★★★ グローバル座標でドラッグ開始位置を保持 ★★★
        self.update_style()

    def update_style(self):
        border_radius = self.size // 2 if self.shape == "Circle" else 3
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
        if self.is_draggable and event.button() == QtCore.Qt.LeftButton:
            self.selection_request.emit(self)
            # ★★★ 選択されているボタンの上でドラッグを開始 ★★★
            if self.is_selected:
                self.drag_start_global_pos = event.globalPos()
                self.parent_tool.start_multi_drag() # 親ツールにドラッグ開始を通知
        
        elif not self.is_draggable and event.button() == QtCore.Qt.LeftButton:
            try:
                modifiers = QtWidgets.QApplication.keyboardModifiers()
                is_shift_pressed = modifiers == QtCore.Qt.ShiftModifier
                if cmds.objExists(self.controller):
                    cmds.select(self.controller, add=is_shift_pressed)
            except Exception as e: print("Selection error: {}".format(str(e)))
        
        # このイベントはQPushButtonのクリックシグナルを発行するために必要
        super(PickerButton, self).mousePressEvent(event)

    def mouseMoveEvent(self, event):
        # ★★★ ドラッグ中の処理 ★★★
        if self.drag_start_global_pos is not None and self.is_draggable:
            delta = event.globalPos() - self.drag_start_global_pos
            self.parent_tool.update_multi_drag(delta) # 親ツールに移動量を通知
        # 親のイベントも呼ぶ
        super(PickerButton, self).mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        # ★★★ ドラッグ終了処理 ★★★
        if self.drag_start_global_pos is not None:
            self.drag_start_global_pos = None
            self.parent_tool.end_multi_drag() # 親ツールにドラッグ終了を通知
        super(PickerButton, self).mouseReleaseEvent(event)

class RigPickerTool(QtWidgets.QMainWindow):
    def __init__(self, parent=get_maya_main_window()):
        super(RigPickerTool, self).__init__(parent)
        self.picker_buttons = []
        self.current_color = "#009688"
        self.setWindowTitle("Rig Picker Tool")
        self.setGeometry(100, 100, 1000, 750)
        
        # ★★★ マルチドラッグ用の変数を追加 ★★★
        self.drag_initial_positions = {}

        self.create_widgets()
        self.create_layouts()
        self.create_connections()
        self.toggle_edit_mode(True)

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
        self.control_panel = QtWidgets.QFrame()
        self.control_panel.setFrameShape(QtWidgets.QFrame.StyledPanel)
        self.control_panel.setFixedWidth(250)
        self.picker_area = QtWidgets.QWidget()
        self.picker_area_layout = QtWidgets.QVBoxLayout(self.picker_area)
        self.picker_area_layout.setContentsMargins(0, 0, 0, 0)
        self.picker_area_bg_label = PickerAreaLabel(self)
        self.picker_area_bg_label.setAlignment(QtCore.Qt.AlignCenter)
        self.picker_area_bg_label.setStyleSheet("border: 2px dashed #555; color: #777;")
        self.picker_area_bg_label.setMinimumSize(600, 600)
        self.picker_area_bg_label.setText("Right-click to set background image\nDrag on empty area to select multiple")
        self.picker_area_layout.addWidget(self.picker_area_bg_label)
        self.background_pixmap = None
        self.controller_group = QtWidgets.QGroupBox("Controllers")
        controller_layout = QtWidgets.QVBoxLayout(self.controller_group)
        self.controller_list = QtWidgets.QListWidget()
        self.refresh_btn = QtWidgets.QPushButton("Refresh List")
        controller_layout.addWidget(self.controller_list)
        controller_layout.addWidget(self.refresh_btn)
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
        self.delete_button_btn = QtWidgets.QPushButton("Delete Selected Button(s)")

    def create_layouts(self):
        main_layout = QtWidgets.QHBoxLayout(self.main_widget)
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
        self.picker_area_bg_label.setContextMenuPolicy(QtCore.Qt.CustomContextMenu)
        self.picker_area_bg_label.customContextMenuRequested.connect(self.show_bg_context_menu)

    def toggle_edit_mode(self, checked):
        self.control_panel.setVisible(checked)
        for button in self.picker_buttons:
            button.is_draggable = checked
            button.setCursor(QtCore.Qt.ArrowCursor if checked else QtCore.Qt.PointingHandCursor)
        if not checked: self.deselect_all_buttons()

    def add_picker_button(self):
        selected_items = self.controller_list.selectedItems()
        if not selected_items:
            QtWidgets.QMessageBox.warning(self, "Warning", "Please select a controller from the list.")
            return
        controller = selected_items[0].text()
        button = PickerButton(
            controller, self.current_color, self.button_shape_combo.currentText(),
            self.button_size_spin.value(), self, self.picker_area_bg_label # ★★★ selfを渡す ★★★
        )
        button.selection_request.connect(self.handle_button_selection)
        button.move(10, 10)
        button.show()
        self.picker_buttons.append(button)

    # ★★★ マルチドラッグ用メソッド群 ★★★
    def start_multi_drag(self):
        self.drag_initial_positions = {btn: btn.pos() for btn in self.picker_buttons if btn.is_selected}
    
    def update_multi_drag(self, delta):
        for btn, initial_pos in self.drag_initial_positions.items():
            btn.move(initial_pos + delta)
    
    def end_multi_drag(self):
        self.drag_initial_positions.clear()
    # =================================

    def handle_button_selection(self, clicked_button):
        modifiers = QtWidgets.QApplication.keyboardModifiers()
        is_shift_pressed = modifiers == QtCore.Qt.ShiftModifier
        
        # ドラッグ開始前のクリックでは、通常の選択ロジックを維持
        is_drag_about_to_start = clicked_button.is_selected and len(self.drag_initial_positions) == 0

        if not is_shift_pressed and not is_drag_about_to_start:
            self.deselect_all_buttons()
        
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
            if not is_shift_pressed: self.deselect_all_buttons()
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
        if color.isValid(): self.current_color = color.name(); self.update_color_button_style()

    def save_picker(self):
        path, _ = QtWidgets.QFileDialog.getSaveFileName(self, "Save Picker", "", "JSON Files (*.json)")
        if not path: return
        data = {'buttons': [], 'background_image': getattr(self, 'background_image_path', None)}
        for btn in self.picker_buttons:
            data['buttons'].append({'controller': btn.controller, 'position': [btn.x(), btn.y()],
                                     'color': btn.color_hex, 'shape': btn.shape, 'size': btn.size})
        with open(path, 'w') as f: json.dump(data, f, indent=4)
        QtWidgets.QMessageBox.information(self, "Success", "Picker saved successfully.")

    def load_picker(self):
        path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "Load Picker", "", "JSON Files (*.json)")
        if not path: return
        with open(path, 'r') as f: data = json.load(f)
        self.clear_picker()
        bg_path = data.get('background_image')
        if bg_path and os.path.exists(bg_path): self.set_background_image(bg_path)
        for btn_data in data.get('buttons', []):
            btn = PickerButton(btn_data['controller'], btn_data['color'], btn_data['shape'],
                               btn_data['size'], self, self.picker_area_bg_label) # ★★★ selfを渡す ★★★
            btn.selection_request.connect(self.handle_button_selection)
            btn.move(btn_data['position'][0], btn_data['position'][1])
            btn.show()
            self.picker_buttons.append(btn)
        self.toggle_edit_mode(self.action_edit_mode.isChecked())
        QtWidgets.QMessageBox.information(self, "Success", "Picker loaded successfully.")

    def clear_picker(self):
        for btn in self.picker_buttons: btn.deleteLater()
        self.picker_buttons = []; self.drag_initial_positions.clear()
        self.clear_background_image()

    def show_bg_context_menu(self, pos):
        menu = QtWidgets.QMenu(); set_action, clear_action = menu.addAction("Set Background Image"), menu.addAction("Clear Background Image")
        action = menu.exec_(self.picker_area_bg_label.mapToGlobal(pos))
        if action == set_action: self.prompt_set_background_image()
        elif action == clear_action: self.clear_background_image()

    def prompt_set_background_image(self):
        path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "Select Image", "", "Image Files (*.png *.jpg *.jpeg)");
        if path: self.set_background_image(path)

    def set_background_image(self, path):
        self.background_image_path, self.background_pixmap = path, QtGui.QPixmap(path); self.update_background()

    def clear_background_image(self):
        self.background_pixmap, self.background_image_path = None, None
        self.picker_area_bg_label.setText("Right-click to set background image\nDrag on empty area to select multiple")
        self.picker_area_bg_label.setStyleSheet("border: 2px dashed #555; color: #777;")

    def update_background(self):
        if self.background_pixmap:
            scaled = self.background_pixmap.scaled(self.picker_area_bg_label.size(), QtCore.Qt.KeepAspectRatio, QtCore.Qt.SmoothTransformation)
            self.picker_area_bg_label.setPixmap(scaled); self.picker_area_bg_label.setText(""); self.picker_area_bg_label.setStyleSheet("border: none;")

    def resizeEvent(self, event):
        super(RigPickerTool, self).resizeEvent(event); self.update_background()

rig_picker_tool_instance = None
def launch():
    global rig_picker_tool_instance
    if rig_picker_tool_instance: rig_picker_tool_instance.close(); rig_picker_tool_instance.deleteLater()
    rig_picker_tool_instance = RigPickerTool()
    rig_picker_tool_instance.show()
    return rig_picker_tool_instance