# -*- coding: utf-8 -*-

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
        self.label = node_name.split(':')[-1].replace('_', '\n') # ボタン内のラベル

        # アイテムを移動、選択可能にするフラグ
        self.setFlags(QtWidgets.QGraphicsItem.ItemIsMovable |
                      QtWidgets.QGraphicsItem.ItemIsSelectable |
                      QtWidgets.QGraphicsItem.ItemSendsGeometryChanges)
        self.setAcceptHoverEvents(True)

    def boundingRect(self):
        """アイテムの境界を定義"""
        return QtCore.QRectF(-self.size / 2, -self.size / 2, self.size, self.size)

    def paint(self, painter, option, widget):
        """ボタンの描画処理"""
        pen = QtGui.QPen(QtCore.Qt.black, 1)
        if self.isSelected():
            pen = QtGui.QPen(QtGui.QColor(255, 255, 0), 2) # 選択時は黄色い枠線

        painter.setPen(pen)
        painter.setBrush(self.color)

        rect = self.boundingRect()
        if self.shape == 'circle':
            painter.drawEllipse(rect)
        elif self.shape == 'square':
            painter.drawRect(rect)
        
        # ラベルを描画
        painter.setPen(QtCore.Qt.white)
        painter.drawText(rect, QtCore.Qt.AlignCenter, self.label)


    def mousePressEvent(self, event):
        """マウスクリック時のイベント"""
        # 親ウィジェット（メインウィンドウ）から編集モードか確認
        view = self.scene().views()[0]
        if not view.parent().is_edit_mode():
            # 実行モードの場合、Mayaのコントロールを選択
            # Shiftキーが押されている場合は追加選択、そうでなければ単一選択
            is_shift_pressed = event.modifiers() == QtCore.Qt.ShiftModifier
            try:
                if cmds.objExists(self.node_name):
                    cmds.select(self.node_name, add=is_shift_pressed)
            except Exception as e:
                print(f"Error selecting node {self.node_name}: {e}")
        else:
            # 編集モードの場合は通常の選択イベントを処理
            super(PickerButton, self).mousePressEvent(event)
    
    def hoverEnterEvent(self, event):
        """マウスホバー時のイベント"""
        # ホバー時に色を少し明るくする
        self.color.setAlpha(255)
        self.update()
        super(PickerButton, self).hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        """マウスが離れた時のイベント"""
        self.color.setAlpha(180)
        self.update()
        super(PickerButton, self).hoverLeaveEvent(event)

    def to_dict(self):
        """ボタンの情報を辞書に変換して保存用にする"""
        return {
            "node_name": self.node_name,
            "shape": self.shape,
            "position": [self.pos().x(), self.pos().y()],
            "size": self.size,
            "color": [self.color.red(), self.color.green(), self.color.blue(), self.color.alpha()]
        }

    @classmethod
    def from_dict(cls, data):
        """辞書からボタンを復元"""
        btn = cls(
            node_name=data["node_name"],
            shape=data["shape"],
            size=data["size"],
            color=QtGui.QColor(*data["color"])
        )
        btn.setPos(QtCore.QPointF(*data["position"]))
        return btn


class PickerScene(QtWidgets.QGraphicsScene):
    """ボタンを配置するカスタムシーン"""
    def __init__(self, parent=None):
        super(PickerScene, self).__init__(parent)
        self.background_item = None

    def set_background_image(self, image_path):
        """背景画像を設定"""
        if self.background_item:
            self.removeItem(self.background_item)
            self.background_item = None

        pixmap = QtGui.QPixmap(image_path)
        if not pixmap.isNull():
            self.background_item = self.addPixmap(pixmap)
            self.background_item.setZValue(-1) # 最背面に配置
            self.setSceneRect(self.itemsBoundingRect())


class RigPickerWindow(QtWidgets.QMainWindow):
    """ピッカーツールのメインウィンドウ"""
    
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
        """UIウィジェットの作成"""
        self.main_widget = QtWidgets.QWidget()
        self.setCentralWidget(self.main_widget)
        
        # --- メインのビューとシーン ---
        self.scene = PickerScene()
        self.view = QtWidgets.QGraphicsView(self.scene)
        self.view.setRenderHint(QtGui.QPainter.Antialiasing) # アンチエイリアスを有効に

        # --- ツールバー ---
        self.toolbar = self.addToolBar("File")
        self.action_new = self.toolbar.addAction("New")
        self.action_open = self.toolbar.addAction("Open")
        self.action_save = self.toolbar.addAction("Save")
        self.action_save_as = self.toolbar.addAction("Save As")
        self.toolbar.addSeparator()

        # --- 編集パネル ---
        self.edit_panel = QtWidgets.QFrame()
        self.edit_panel.setFrameShape(QtWidgets.QFrame.StyledPanel)
        
        self.edit_mode_checkbox = QtWidgets.QCheckBox("Edit Mode")
        self.edit_mode_checkbox.setChecked(True)
        
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
        self.size_label = QtWidgets.QLabel(f"Size: {self.size_slider.value()}")
        
        self.add_button = QtWidgets.QPushButton("Add Selected Control")
        self.delete_button = QtWidgets.QPushButton("Delete Selected Button")


    def create_layouts(self):
        """レイアウトの設定"""
        main_layout = QtWidgets.QHBoxLayout(self.main_widget)
        
        # --- 編集パネルのレイアウト ---
        edit_layout = QtWidgets.QVBoxLayout(self.edit_panel)
        edit_layout.addWidget(self.edit_mode_checkbox)
        edit_layout.addWidget(self.bg_image_button)
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

        main_layout.addWidget(self.view, 3) # ビューの幅を広く
        main_layout.addWidget(self.edit_panel, 1)

    def create_connections(self):
        """シグナルとスロットの接続"""
        self.action_new.triggered.connect(self.new_picker)
        self.action_open.triggered.connect(self.open_picker)
        self.action_save.triggered.connect(self.save_picker)
        self.action_save_as.triggered.connect(self.save_picker_as)

        self.edit_mode_checkbox.toggled.connect(self.toggle_edit_mode)
        self.bg_image_button.clicked.connect(self.set_background_image)
        
        self.color_button.clicked.connect(self.choose_color)
        self.size_slider.valueChanged.connect(lambda val: self.size_label.setText(f"Size: {val}"))
        self.add_button.clicked.connect(self.add_control_button)
        self.delete_button.clicked.connect(self.delete_selected_button)

    def update_color_button_stylesheet(self):
        """カラーボタンの背景色を更新"""
        self.color_button.setStyleSheet(f"background-color: {self.current_color.name()};")

    def toggle_edit_mode(self, checked):
        """編集モードと実行モードを切り替え"""
        self.edit_mode = checked
        self.edit_panel.setVisible(checked)
        # 編集モードではボタンを移動可能に、実行モードでは固定
        for item in self.scene.items():
            if isinstance(item, PickerButton):
                item.setFlag(QtWidgets.QGraphicsItem.ItemIsMovable, checked)

    def choose_color(self):
        """カラーピッカーダイアログを開く"""
        color = QtWidgets.QColorDialog.getColor(self.current_color, self)
        if color.isValid():
            self.current_color = color
            self.current_color.setAlpha(180) # 透明度を少し加える
            self.update_color_button_stylesheet()
    
    def set_background_image(self):
        """背景画像選択ダイアログを開く"""
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Select Background Image", "", "Image Files (*.png *.jpg *.jpeg *.bmp)")
        if file_path:
            self.scene.set_background_image(file_path)
            # 背景画像情報を保存用に保持
            self.background_image_path = file_path

    def add_control_button(self):
        """Mayaで選択されているコントロールをボタンとして追加"""
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
        """シーンで選択されているボタンを削除"""
        for item in self.scene.selectedItems():
            self.scene.removeItem(item)

    def new_picker(self):
        """新規作成"""
        self.scene.clear()
        self.current_file_path = None
        self.background_image_path = None
        self.setWindowTitle("Rig Picker Tool - New Picker")

    def open_picker(self):
        """ピッカー設定ファイルを読み込む"""
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Open Picker File", "", "JSON Files (*.json)")
        if not file_path:
            return

        self.new_picker()
        with open(file_path, 'r') as f:
            data = json.load(f)

        if "backgroundImage" in data and data["backgroundImage"]:
            self.set_background_image(data["backgroundImage"])
            self.background_image_path = data["backgroundImage"]

        for btn_data in data.get("buttons", []):
            btn = PickerButton.from_dict(btn_data)
            self.scene.addItem(btn)

        self.current_file_path = file_path
        self.setWindowTitle(f"Rig Picker Tool - {os.path.basename(file_path)}")

    def save_picker(self):
        """ピッカー設定を保存"""
        if not self.current_file_path:
            self.save_picker_as()
        else:
            self._save_to_file(self.current_file_path)

    def save_picker_as(self):
        """名前を付けて保存"""
        file_path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Save Picker File", "", "JSON Files (*.json)")
        if file_path:
            self.current_file_path = file_path
            self._save_to_file(self.current_file_path)
            self.setWindowTitle(f"Rig Picker Tool - {os.path.basename(file_path)}")

    def _save_to_file(self, file_path):
        """ファイルへの書き込み処理"""
        data = {
            "backgroundImage": getattr(self, 'background_image_path', None),
            "buttons": []
        }
        for item in self.scene.items():
            if isinstance(item, PickerButton):
                data["buttons"].append(item.to_dict())

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=4)
        
        print(f"Picker saved to: {file_path}")


# --- ツール起動用関数 ---
picker_instance = None

def launch():
    """グローバルインスタンスを管理しつつツールを起動"""
    global picker_instance
    if picker_instance:
        picker_instance.close()
        picker_instance.deleteLater()
    
    picker_instance = RigPickerWindow()
    picker_instance.show()
    return picker_instance

# スクリプトとして直接実行された場合のテスト用
if __name__ == "__main__":
    # この部分はMaya外でのテスト用のため、Maya内ではlaunch()を使用してください
    app = QtWidgets.QApplication.instance()
    if not app:
        app = QtWidgets.QApplication([])
    
    win = RigPickerWindow(parent=None)
    win.show()
    
    app.exec_()