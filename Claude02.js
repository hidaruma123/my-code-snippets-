import maya.cmds as cmds
import maya.mel as mel
from PySide2 import QtWidgets, QtCore, QtGui
import json
import os

class RigPickerCreator(QtWidgets.QMainWindow):
    def __init__(self):
        super(RigPickerCreator, self).__init__()
        self.picker_buttons = []
        self.current_character = None
        self.picker_data = {}
        self.current_color = "#4CAF50"  # デフォルト色を初期化
        self.init_ui()
        
    def init_ui(self):
        self.setWindowTitle("リグピッカー作成ツール")
        self.setGeometry(100, 100, 800, 600)
        
        # メインウィジェット
        main_widget = QtWidgets.QWidget()
        self.setCentralWidget(main_widget)
        
        # レイアウト
        main_layout = QtWidgets.QHBoxLayout(main_widget)
        
        # 左側パネル（コントロール）
        left_panel = self.create_control_panel()
        main_layout.addWidget(left_panel, 1)
        
        # 右側パネル（ピッカーエリア）
        self.picker_area = self.create_picker_area()
        main_layout.addWidget(self.picker_area, 3)
        
    def create_control_panel(self):
        panel = QtWidgets.QWidget()
        layout = QtWidgets.QVBoxLayout(panel)
        
        # キャラクター設定
        char_group = QtWidgets.QGroupBox("キャラクター設定")
        char_layout = QtWidgets.QVBoxLayout(char_group)
        
        self.char_name_edit = QtWidgets.QLineEdit()
        self.char_name_edit.setPlaceholderText("キャラクター名を入力")
        char_layout.addWidget(QtWidgets.QLabel("キャラクター名:"))
        char_layout.addWidget(self.char_name_edit)
        
        # ボタン作成設定
        button_group = QtWidgets.QGroupBox("ボタン作成")
        button_layout = QtWidgets.QVBoxLayout(button_group)
        
        # コントローラー選択
        self.controller_list = QtWidgets.QListWidget()
        self.controller_list.setMaximumHeight(150)
        button_layout.addWidget(QtWidgets.QLabel("コントローラーを選択:"))
        button_layout.addWidget(self.controller_list)
        
        refresh_btn = QtWidgets.QPushButton("コントローラーリストを更新")
        refresh_btn.clicked.connect(self.refresh_controller_list)
        button_layout.addWidget(refresh_btn)
        
        # ボタンスタイル設定
        style_layout = QtWidgets.QFormLayout()
        
        self.button_color = QtWidgets.QPushButton("色を選択")
        self.button_color.setStyleSheet("background-color: #4CAF50")
        self.button_color.clicked.connect(self.choose_button_color)
        
        self.button_shape = QtWidgets.QComboBox()
        self.button_shape.addItems(["円形", "四角形", "楕円形"])
        
        self.button_size = QtWidgets.QSpinBox()
        self.button_size.setRange(20, 100)
        self.button_size.setValue(40)
        
        style_layout.addRow("ボタン色:", self.button_color)
        style_layout.addRow("形状:", self.button_shape)
        style_layout.addRow("サイズ:", self.button_size)
        
        button_layout.addLayout(style_layout)
        
        # ボタン追加
        add_button_btn = QtWidgets.QPushButton("ピッカーボタンを追加")
        add_button_btn.clicked.connect(self.add_picker_button)
        button_layout.addWidget(add_button_btn)
        
        # ファイル操作
        file_group = QtWidgets.QGroupBox("ファイル操作")
        file_layout = QtWidgets.QVBoxLayout(file_group)
        
        save_btn = QtWidgets.QPushButton("ピッカーを保存")
        save_btn.clicked.connect(self.save_picker)
        
        load_btn = QtWidgets.QPushButton("ピッカーを読み込み")
        load_btn.clicked.connect(self.load_picker)
        
        generate_btn = QtWidgets.QPushButton("ピッカーUIを生成")
        generate_btn.clicked.connect(self.generate_picker_ui)
        
        file_layout.addWidget(save_btn)
        file_layout.addWidget(load_btn)
        file_layout.addWidget(generate_btn)
        
        # レイアウトに追加
        layout.addWidget(char_group)
        layout.addWidget(button_group)
        layout.addWidget(file_group)
        layout.addStretch()
        
        return panel
        
    def create_picker_area(self):
        # スクロール可能なピッカーエリア
        scroll = QtWidgets.QScrollArea()
        scroll.setWidgetResizable(True)
        
        self.picker_widget = QtWidgets.QWidget()
        self.picker_widget.setMinimumSize(600, 800)
        self.picker_widget.setStyleSheet("background-color: #2b2b2b; border: 1px solid #555;")
        
        scroll.setWidget(self.picker_widget)
        return scroll
        
    def refresh_controller_list(self):
        """シーン内のコントローラーをリストアップ"""
        self.controller_list.clear()
        
        # 一般的なコントローラーの命名規則で検索
        controller_patterns = ['*_ctrl', '*_control', '*_con', '*:*_ctrl', '*:*_control']
        controllers = []
        
        for pattern in controller_patterns:
            found = cmds.ls(pattern, type='transform')
            controllers.extend(found)
        
        # 重複を除去してソート
        controllers = list(set(controllers))
        controllers.sort()
        
        for ctrl in controllers:
            self.controller_list.addItem(ctrl)
            
    def choose_button_color(self):
        """ボタンの色を選択"""
        try:
            # 現在の色をQColorオブジェクトとして作成
            current_qcolor = QtGui.QColor(self.current_color)
            
            # カラーダイアログを表示
            color = QtWidgets.QColorDialog.getColor(
                current_qcolor, 
                self, 
                "ボタンの色を選択"
            )
            
            # 色が選択された場合（キャンセルされていない場合）
            if color.isValid():
                self.current_color = color.name()
                # ボタンの背景色を更新
                self.button_color.setStyleSheet(
                    "background-color: {}; color: white; font-weight: bold;".format(self.current_color)
                )
                print("選択された色: {}".format(self.current_color))
                
        except Exception as e:
            print("色選択エラー: {}".format(str(e)))
            # エラーが発生した場合はデフォルト色を使用
            self.current_color = "#4CAF50"
            self.button_color.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;")
            
    def add_picker_button(self):
        """ピッカーボタンをエリアに追加"""
        selected_items = self.controller_list.selectedItems()
        if not selected_items:
            QtWidgets.QMessageBox.warning(self, "警告", "コントローラーを選択してください")
            return
            
        controller = selected_items[0].text()
        
        # ボタンを作成
        button = PickerButton(
            controller=controller,
            color=self.current_color,
            shape=self.button_shape.currentText(),
            size=self.button_size.value(),
            parent=self.picker_widget
        )
        
        # 中央に配置（後で移動可能）
        button.move(300, len(self.picker_buttons) * 60 + 50)
        button.show()
        
        self.picker_buttons.append(button)
        
    def save_picker(self):
        """ピッカー設定を保存"""
        if not self.char_name_edit.text():
            QtWidgets.QMessageBox.warning(self, "警告", "キャラクター名を入力してください")
            return
            
        file_path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "ピッカーを保存", "{}_picker.json".format(self.char_name_edit.text()), "JSON Files (*.json)"
        )
        
        if file_path:
            picker_data = {
                'character_name': self.char_name_edit.text(),
                'buttons': []
            }
            
            for button in self.picker_buttons:
                button_data = {
                    'controller': button.controller,
                    'position': [button.x(), button.y()],
                    'color': button.color,
                    'shape': button.shape,
                    'size': button.size
                }
                picker_data['buttons'].append(button_data)
                
            with open(file_path, 'w') as f:
                json.dump(picker_data, f, indent=2)
                
            QtWidgets.QMessageBox.information(self, "成功", "ピッカーを保存しました: {}".format(file_path))
            
    def load_picker(self):
        """ピッカー設定を読み込み"""
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "ピッカーを読み込み", "", "JSON Files (*.json)"
        )
        
        if file_path:
            try:
                with open(file_path, 'r') as f:
                    picker_data = json.load(f)
                    
                # 既存のボタンをクリア
                for button in self.picker_buttons:
                    button.deleteLater()
                self.picker_buttons.clear()
                
                # キャラクター名を設定
                self.char_name_edit.setText(picker_data.get('character_name', ''))
                
                # ボタンを復元
                for button_data in picker_data.get('buttons', []):
                    button = PickerButton(
                        controller=button_data['controller'],
                        color=button_data['color'],
                        shape=button_data['shape'],
                        size=button_data['size'],
                        parent=self.picker_widget
                    )
                    button.move(button_data['position'][0], button_data['position'][1])
                    button.show()
                    self.picker_buttons.append(button)
                    
                QtWidgets.QMessageBox.information(self, "成功", "ピッカーを読み込みました")
                
            except Exception as e:
                QtWidgets.QMessageBox.critical(self, "エラー", "ファイルの読み込みに失敗しました: {}".format(str(e)))
                
    def generate_picker_ui(self):
        """実際のピッカーUIを生成"""
        if not self.char_name_edit.text():
            QtWidgets.QMessageBox.warning(self, "警告", "キャラクター名を入力してください")
            return
            
        picker_ui = RigPickerUI(
            character_name=self.char_name_edit.text(),
            buttons_data=[(btn.controller, btn.x(), btn.y(), btn.color, btn.shape, btn.size) 
                         for btn in self.picker_buttons]
        )
        picker_ui.show()

class PickerButton(QtWidgets.QPushButton):
    def __init__(self, controller, color, shape, size, parent=None):
        super(PickerButton, self).__init__(parent)
        self.controller = controller
        self.color = color
        self.shape = shape
        self.size = size
        
        self.setFixedSize(size, size)
        # コントローラー名を短縮して表示
        display_name = controller.split(':')[-1].replace('_ctrl', '').replace('_control', '').replace('_con', '')
        self.setText(display_name)
        
        # スタイルを設定
        style = """
            QPushButton {{
                background-color: {color};
                border: 2px solid #333;
                color: white;
                font-weight: bold;
                font-size: 10px;
            }}
            QPushButton:hover {{
                border: 2px solid #fff;
            }}
        """.format(color=color)
        
        if shape == "円形":
            style += "border-radius: {}px;".format(size // 2)
        elif shape == "楕円形":
            style += "border-radius: {}px;".format(size // 4)
            
        self.setStyleSheet(style)
        
        # ドラッグ可能にする
        self.setMouseTracking(True)
        self.drag_start_position = None
        
    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.LeftButton:
            self.drag_start_position = event.pos()
        super(PickerButton, self).mousePressEvent(event)
        
    def mouseMoveEvent(self, event):
        if (event.buttons() == QtCore.Qt.LeftButton and 
            self.drag_start_position is not None):
            
            # ドラッグ距離をチェック
            if ((event.pos() - self.drag_start_position).manhattanLength() >= 
                QtWidgets.QApplication.startDragDistance()):
                
                # ボタンを移動
                new_pos = self.mapToParent(event.pos() - self.drag_start_position)
                self.move(new_pos)
                
    def mouseReleaseEvent(self, event):
        self.drag_start_position = None
        super(PickerButton, self).mouseReleaseEvent(event)

class RigPickerUI(QtWidgets.QMainWindow):
    def __init__(self, character_name, buttons_data):
        super(RigPickerUI, self).__init__()
        self.character_name = character_name
        self.buttons_data = buttons_data
        self.init_ui()
        
    def init_ui(self):
        self.setWindowTitle("{} - リグピッカー".format(self.character_name))
        self.setGeometry(200, 200, 600, 800)
        
        # メインウィジェット
        main_widget = QtWidgets.QWidget()
        self.setCentralWidget(main_widget)
        main_widget.setStyleSheet("background-color: #2b2b2b;")
        
        # ボタンを作成
        for controller, x, y, color, shape, size in self.buttons_data:
            button = QtWidgets.QPushButton(main_widget)
            display_name = controller.split(':')[-1].replace('_ctrl', '').replace('_control', '').replace('_con', '')
            button.setText(display_name)
            button.setFixedSize(size, size)
            button.move(x, y)
            
            # スタイルを設定
            style = """
                QPushButton {{
                    background-color: {color};
                    border: 2px solid #333;
                    color: white;
                    font-weight: bold;
                    font-size: 10px;
                }}
                QPushButton:hover {{
                    border: 2px solid #fff;
                }}
                QPushButton:pressed {{
                    background-color: #ff6b6b;
                }}
            """.format(color=color)
            
            if shape == "円形":
                style += "border-radius: {}px;".format(size // 2)
            elif shape == "楕円形":
                style += "border-radius: {}px;".format(size // 4)
                
            button.setStyleSheet(style)
            
            # クリックイベントを接続
            button.clicked.connect(lambda checked, ctrl=controller: self.select_controller(ctrl))
            
    def select_controller(self, controller):
        """コントローラーを選択"""
        try:
            if cmds.objExists(controller):
                cmds.select(controller, replace=True)
                print("選択されました: {}".format(controller))
            else:
                print("コントローラーが見つかりません: {}".format(controller))
        except Exception as e:
            print("選択エラー: {}".format(str(e)))

def show_rig_picker_creator():
    """リグピッカー作成ツールを表示"""
    global rig_picker_creator_window
    try:
        rig_picker_creator_window.close()
        rig_picker_creator_window.deleteLater()
    except:
        pass
    
    rig_picker_creator_window = RigPickerCreator()
    rig_picker_creator_window.show()
    return rig_picker_creator_window

# 使用方法
if __name__ == "__main__":
    show_rig_picker_creator()
