# -*- coding: utf-8 -*-

# Python 2と3の互換性を保つためのインポート
from __future__ import print_function

import maya.cmds as cmds
import maya.OpenMayaUI as omui

from PySide2 import QtWidgets, QtCore, QtGui
import json
import os

# Maya 2020ではPySide2を使用
try:
    from shiboken2 import wrapInstance
except ImportError:
    from shiboken import wrapInstance


def get_maya_main_window():
    """Mayaのメインウィンドウオブジェクトを取得"""
    main_window_ptr = omui.MQtUtil.mainWindow()
    return wrapInstance(int(main_window_ptr), QtWidgets.QWidget)


class PickerButton(QtWidgets.QGraphicsItem):
    """ピッカーのキャンバス上に配置されるカスタムボタン"""

    def __init__(self, node_name, shape='circle', size=30, color=QtGui.QColor(255, 0, 0, 180), parent=None):
        super(PickerButton, self).__init__(parent)
        self.node_name = node_name
        self.shape = shape
        self.size = size
        self.color = color
        self.label = node_name.split(':')[-1].replace('_', '\n')

        self.setFlags(QtWidgets.QGraphicsItem.ItemIsMovable |
                      QtWidgets.QGraphicsItem.ItemIsSelectable |
                      QtWidgets.QGraphicsItem.ItemSendsGeometryChanges)
        self.setAcceptHoverEvents(True)

    def boundingRect(self):
        return QtCore.QRectF(-self.size / 2, -self.size / 2, self.size, self.size)

    def paint(self, painter, option, widget):
        pen = QtGui.QPen(QtCore.Qt.black, 1)
        if self.isSelected():
            pen = QtGui.QPen(QtGui.QColor(255, 255, 0), 2)

        painter.setPen(pen)
        painter.setBrush(self.color)
        rect = self.boundingRect()
        if self.shape == 'circle':
            painter.drawEllipse(rect)
        elif self.shape == 'square':
            painter.drawRect(rect)
        
        painter.setPen(QtCore.Qt.white)
        painter.drawText(rect, QtCore.Qt.AlignCenter, self.label)

    def mousePressEvent(self, event):
        view = self.scene().views()[0]
        if not view.parent().is_edit_mode():
            is_shift_pressed = event.modifiers() == QtCore.Qt.ShiftModifier
            try:
                if cmds.objExists(self.node_name):
                    cmds.select(self.node_name, add=is_shift_pressed)
            except Exception as e:
                print("Error selecting node {0}: {1}".format(self.node_name, e))
        else:
            super(PickerButton, self).mousePressEvent(event)
    
    def hoverEnterEvent(self, event):
        self.color.setAlpha(255)
        self.update()
        super(PickerButton, self).hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        self.color.setAlpha(180)
        self.update()
        super(PickerButton, self).hoverLeaveEvent(event)

    def to_dict(self):
        return {
            "node_name": self.node_name,
            "shape": self.shape,
            "position": [self.pos().x(), self.pos().y()],
            "size": self.size,
            "color": [self.color.red(), self.color.green(), self.color.blue(), self.color.alpha()]
        }

    @classmethod
    def from_dict(cls, data):
        btn = cls(
            node_name=data["node_name"],
            shape=data["shape"],
            size=data["size"],
            color=QtGui.QColor(*data["color"])
        )
        btn.setPos(QtCore.QPointF(*data["position"]))
        return btn


class PickerScene(QtWidgets.QGraphicsScene):
    def __init__(self, parent=None):
        super(PickerScene, self).__init__(parent)
        self.background_item = None

    def set_background_image(self, image_path):
        if self.background_item:
            self.removeItem(self.background_item)
            self.background_item = None

        pixmap = QtGui.QPixmap(image_path)
        if not pixmap.isNull():
            self.background_item = self.addPixmap(pixmap)
            self.background_item.setZValue(-1)
            self.setSceneRect(self.itemsBoundingRect())


class RigPickerWindow(QtWidgets.QMainWindow):
    def __init__(self, parent=get_maya_main_window()):
        super(RigPickerWindow, self).__init__(parent)
        self.setWindowTitle("Rig Picker Tool")
        self.setGeometry(300, 300, 800, 600)

        self.edit_mode = True
        self.current_file_path = None

        self.create_widgets()
        self.create_layouts()
        self.create_connections()

        self.toggle_edit_mode(True)

    def is_edit_mode(self):
        return self.edit_mode

    def create_widgets(self):
        self.main_widget = QtWidgets.QWidget()
        self.setCentralWidget(self.main_widget)
        
        self.scene = PickerScene()
        self.view = QtWidgets.QGraphicsView(self.scene)
        self.view.setRenderHint(QtGui.QPainter.Antialiasing)

        # --- ツールバー ---
        self.toolbar = self.addToolBar("File")
        self.action_new = self.toolbar.addAction("New")
        self.action_open = self.toolbar.addAction("Open")
        self.action_save = self.toolbar.addAction("Save")
        self.action_save_as = self.toolbar.addAction("Save As")
        self.toolbar.addSeparator()

        # === ★★★ 変更点 ★★★ ===
        # 「Edit Mode」の切り替えをチェック可能なアクションとしてツールバーに追加
        self.action_edit_mode = QtWidgets.QAction("Edit Mode", self)
        self.action_edit_mode.setCheckable(True)
        self.action_edit_mode.setChecked(True)
        self.toolbar.addAction(self.action_edit_mode)
        # =======================

        # --- 編集パネル ---
        self.edit_panel = QtWidgets.QFrame()
        self.edit_panel.setFrameShape(QtWidgets.QFrame.StyledPanel)
        
        self.bg_image_button = QtWidgets.QPushButton("Set Background Image")
        self.add_button_group = QtWidgets.QGroupBox("Add Control Button")
        self.shape_combo = QtWidgets.QComboBox()
        self.shape_combo.addItems(["circle", "square"])
        
        self.color_button = QtWidgets.QPushButton("Color")
        self.current_color = QtGui.QColor(0, 150, 255, 180)
        self.update_color_button_stylesheet()
        
        self.size_slider = QtWidgets.QSlider(QtCore.Qt.Horizontal)
        self.size_slider.setRange(10, 100)
        self.size_slider.setValue(40)
        self.size_label = QtWidgets.QLabel("Size: {0}".format(self.size_slider.value()))
        
        self.add_button = QtWidgets.QPushButton("Add Selected Control")
        self.delete_button = QtWidgets.QPushButton("Delete Selected Button")

    def create_layouts(self):
        main_layout = QtWidgets.QHBoxLayout(self.main_widget)
        
        edit_layout = QtWidgets.QVBoxLayout(self.edit_panel)
        # === ★★★ 変更点 ★★★ ===
        # ここにあったチェックボックスの追加を削除
        edit_layout.addWidget(self.bg_image_button)
        # =======================
        edit_layout.addSpacing(20)

        add_button_layout = QtWidgets.QFormLayout(self.add_button_group)
        add_button_layout.addRow("Shape:", self.shape_combo)
        add_button_layout.addRow("Color:", self.color_button)
        size_layout = QtWidgets.QHBoxLayout()
        size_layout.addWidget(self.size_slider)
        size_layout.addWidget(self.size_label)
        add_button_layout.addRow(size_layout)
        add_button_layout.addRow(self.add_button)
        
        edit_layout.addWidget(self.add_button_group)
        edit_layout.addSpacing(20)
        edit_layout.addWidget(self.delete_button)
        edit_layout.addStretch()

        main_layout.addWidget(self.view, 3)
        main_layout.addWidget(self.edit_panel, 1)

    def create_connections(self):
        self.action_new.triggered.connect(self.new_picker)
        self.action_open.triggered.connect(self.open_picker)
        self.action_save.triggered.connect(self.save_picker)
        self.action_save_as.triggered.connect(self.save_picker_as)

        # === ★★★ 変更点 ★★★ ===
        # 接続先をツールバーのアクションに変更
        self.action_edit_mode.toggled.connect(self.toggle_edit_mode)
        # =======================
        
        self.bg_image_button.clicked.connect(self.set_background_image)
        self.color_button.clicked.connect(self.choose_color)
        self.size_slider.valueChanged.connect(lambda val: self.size_label.setText("Size: {0}".format(val)))
        self.add_button.clicked.connect(self.add_control_button)
        self.delete_button.clicked.connect(self.delete_selected_button)

    def update_color_button_stylesheet(self):
        self.color_button.setStyleSheet("background-color: {0};".format(self.current_color.name()))

    def toggle_edit_mode(self, checked):
        self.edit_mode = checked
        self.edit_panel.setVisible(checked)
        for item in self.scene.items():
            if isinstance(item, PickerButton):
                item.setFlag(QtWidgets.QGraphicsItem.ItemIsMovable, checked)

    def choose_color(self):
        color = QtWidgets.QColorDialog.getColor(self.current_color, self)
        if color.isValid():
            self.current_color = color
            self.current_color.setAlpha(180)
            self.update_color_button_stylesheet()
    
    def set_background_image(self):
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Select Background Image", "", "Image Files (*.png *.jpg *.jpeg *.bmp)")
        if file_path:
            self.scene.set_background_image(file_path)
            self.background_image_path = file_path

    def add_control_button(self):
        selected_nodes = cmds.ls(selection=True)
        if not selected_nodes:
            cmds.warning("Please select a control in Maya.")
            return

        for node_name in selected_nodes:
            btn = PickerButton(
                node_name=node_name,
                shape=self.shape_combo.currentText(),
                size=self.size_slider.value(),
                color=QtGui.QColor(self.current_color)
            )
            self.scene.addItem(btn)

    def delete_selected_button(self):
        for item in self.scene.selectedItems():
            self.scene.removeItem(item)

    def new_picker(self):
        self.scene.clear()
        self.current_file_path = None
        self.background_image_path = None
        self.setWindowTitle("Rig Picker Tool - New Picker")

    def open_picker(self):
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Open Picker File", "", "JSON Files (*.json)")
        if not file_path:
            return

        self.new_picker()
        with open(file_path, 'r') as f:
            data = json.load(f)

        if "backgroundImage" in data and data["backgroundImage"]:
            bg_path = data["backgroundImage"]
            if os.path.exists(bg_path):
                self.set_background_image(bg_path)
                self.background_image_path = bg_path
            else:
                print("Warning: Background image not found at: {0}".format(bg_path))

        for btn_data in data.get("buttons", []):
            btn = PickerButton.from_dict(btn_data)
            self.scene.addItem(btn)

        self.current_file_path = file_path
        self.setWindowTitle("Rig Picker Tool - {0}".format(os.path.basename(file_path)))

    def save_picker(self):
        if not self.current_file_path:
            self.save_picker_as()
        else:
            self._save_to_file(self.current_file_path)

    def save_picker_as(self):
        file_path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Save Picker File", "", "JSON Files (*.json)")
        if file_path:
            self.current_file_path = file_path
            self._save_to_file(self.current_file_path)
            self.setWindowTitle("Rig Picker Tool - {0}".format(os.path.basename(file_path)))

    def _save_to_file(self, file_path):
        data = {
            "backgroundImage": getattr(self, 'background_image_path', None),
            "buttons": []
        }
        for item in self.scene.items():
            if isinstance(item, PickerButton):
                data["buttons"].append(item.to_dict())

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=4)
        
        print("Picker saved to: {0}".format(file_path))


# --- ツール起動用関数 ---
picker_instance = None

def launch():
    global picker_instance
    if picker_instance:
        picker_instance.close()
        picker_instance.deleteLater()
    
    picker_instance = RigPickerWindow()
    picker_instance.show()
    return picker_instance