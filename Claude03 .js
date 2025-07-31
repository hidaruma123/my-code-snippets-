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
        self.current_color = "#4CAF50"
        self.init_ui()
        
    def init_ui(self):
        self.setWindowTitle("Rig Picker Creator Tool")
        self.setGeometry(100, 100, 800, 600)
        
        # Main widget
        main_widget = QtWidgets.QWidget()
        self.setCentralWidget(main_widget)
        
        # Layout
        main_layout = QtWidgets.QHBoxLayout(main_widget)
        
        # Left panel (controls)
        left_panel = self.create_control_panel()
        main_layout.addWidget(left_panel, 1)
        
        # Right panel (picker area)
        self.picker_area = self.create_picker_area()
        main_layout.addWidget(self.picker_area, 3)
        
    def create_control_panel(self):
        panel = QtWidgets.QWidget()
        layout = QtWidgets.QVBoxLayout(panel)
        
        # Character settings
        char_group = QtWidgets.QGroupBox("Character Settings")
        char_layout = QtWidgets.QVBoxLayout(char_group)
        
        self.char_name_edit = QtWidgets.QLineEdit()
        self.char_name_edit.setPlaceholderText("Enter character name")
        char_layout.addWidget(QtWidgets.QLabel("Character Name:"))
        char_layout.addWidget(self.char_name_edit)
        
        # Button creation settings
        button_group = QtWidgets.QGroupBox("Button Creation")
        button_layout = QtWidgets.QVBoxLayout(button_group)
        
        # Controller selection
        self.controller_list = QtWidgets.QListWidget()
        self.controller_list.setMaximumHeight(150)
        button_layout.addWidget(QtWidgets.QLabel("Select Controller:"))
        button_layout.addWidget(self.controller_list)
        
        refresh_btn = QtWidgets.QPushButton("Refresh Controller List")
        refresh_btn.clicked.connect(self.refresh_controller_list)
        button_layout.addWidget(refresh_btn)
        
        # Button style settings
        style_layout = QtWidgets.QFormLayout()
        
        self.button_color = QtWidgets.QPushButton("Choose Color")
        self.button_color.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;")
        self.button_color.clicked.connect(self.choose_button_color)
        
        self.button_shape = QtWidgets.QComboBox()
        self.button_shape.addItems(["Circle", "Rectangle", "Ellipse"])
        
        self.button_size = QtWidgets.QSpinBox()
        self.button_size.setRange(20, 100)
        self.button_size.setValue(40)
        
        style_layout.addRow("Button Color:", self.button_color)
        style_layout.addRow("Shape:", self.button_shape)
        style_layout.addRow("Size:", self.button_size)
        
        button_layout.addLayout(style_layout)
        
        # Add button
        add_button_btn = QtWidgets.QPushButton("Add Picker Button")
        add_button_btn.clicked.connect(self.add_picker_button)
        button_layout.addWidget(add_button_btn)
        
        # File operations
        file_group = QtWidgets.QGroupBox("File Operations")
        file_layout = QtWidgets.QVBoxLayout(file_group)
        
        save_btn = QtWidgets.QPushButton("Save Picker")
        save_btn.clicked.connect(self.save_picker)
        
        load_btn = QtWidgets.QPushButton("Load Picker")
        load_btn.clicked.connect(self.load_picker)
        
        generate_btn = QtWidgets.QPushButton("Generate Picker UI")
        generate_btn.clicked.connect(self.generate_picker_ui)
        
        file_layout.addWidget(save_btn)
        file_layout.addWidget(load_btn)
        file_layout.addWidget(generate_btn)
        
        # Add to layout
        layout.addWidget(char_group)
        layout.addWidget(button_group)
        layout.addWidget(file_group)
        layout.addStretch()
        
        return panel
        
    def create_picker_area(self):
        # Scrollable picker area
        scroll = QtWidgets.QScrollArea()
        scroll.setWidgetResizable(True)
        
        self.picker_widget = QtWidgets.QWidget()
        self.picker_widget.setMinimumSize(600, 800)
        self.picker_widget.setStyleSheet("background-color: #2b2b2b; border: 1px solid #555;")
        
        scroll.setWidget(self.picker_widget)
        return scroll
        
    def refresh_controller_list(self):
        """List controllers in the scene"""
        self.controller_list.clear()
        
        # Common controller naming patterns
        controller_patterns = ['*_ctrl', '*_control', '*_con', '*:*_ctrl', '*:*_control']
        controllers = []
        
        for pattern in controller_patterns:
            found = cmds.ls(pattern, type='transform')
            controllers.extend(found)
        
        # Remove duplicates and sort
        controllers = list(set(controllers))
        controllers.sort()
        
        for ctrl in controllers:
            self.controller_list.addItem(ctrl)
            
    def choose_button_color(self):
        """Choose button color"""
        try:
            # Create current color as QColor object
            current_qcolor = QtGui.QColor(self.current_color)
            
            # Show color dialog
            color = QtWidgets.QColorDialog.getColor(
                current_qcolor, 
                self, 
                "Choose Button Color"
            )
            
            # If color was selected (not cancelled)
            if color.isValid():
                self.current_color = color.name()
                # Update button background color
                self.button_color.setStyleSheet(
                    "background-color: {}; color: white; font-weight: bold;".format(self.current_color)
                )
                print("Selected color: {}".format(self.current_color))
                
        except Exception as e:
            print("Color selection error: {}".format(str(e)))
            # Use default color if error occurs
            self.current_color = "#4CAF50"
            self.button_color.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;")
            
    def add_picker_button(self):
        """Add picker button to area"""
        selected_items = self.controller_list.selectedItems()
        if not selected_items:
            QtWidgets.QMessageBox.warning(self, "Warning", "Please select a controller")
            return
            
        controller = selected_items[0].text()
        
        # Create button
        button = PickerButton(
            controller=controller,
            color=self.current_color,
            shape=self.button_shape.currentText(),
            size=self.button_size.value(),
            parent=self.picker_widget
        )
        
        # Place in center (can be moved later)
        button.move(300, len(self.picker_buttons) * 60 + 50)
        button.show()
        
        self.picker_buttons.append(button)
        
    def save_picker(self):
        """Save picker settings"""
        if not self.char_name_edit.text():
            QtWidgets.QMessageBox.warning(self, "Warning", "Please enter character name")
            return
            
        file_path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Save Picker", "{}_picker.json".format(self.char_name_edit.text()), "JSON Files (*.json)"
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
                
            try:
                with open(file_path, 'w') as f:
                    json.dump(picker_data, f, indent=2)
                QtWidgets.QMessageBox.information(self, "Success", "Picker saved: {}".format(file_path))
            except Exception as e:
                QtWidgets.QMessageBox.critical(self, "Error", "Failed to save: {}".format(str(e)))
            
    def load_picker(self):
        """Load picker settings"""
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Load Picker", "", "JSON Files (*.json)"
        )
        
        if file_path:
            try:
                with open(file_path, 'r') as f:
                    picker_data = json.load(f)
                    
                # Clear existing buttons
                for button in self.picker_buttons:
                    button.deleteLater()
                self.picker_buttons.clear()
                
                # Set character name
                self.char_name_edit.setText(picker_data.get('character_name', ''))
                
                # Restore buttons
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
                    
                QtWidgets.QMessageBox.information(self, "Success", "Picker loaded successfully")
                
            except Exception as e:
                QtWidgets.QMessageBox.critical(self, "Error", "Failed to load file: {}".format(str(e)))
                
    def generate_picker_ui(self):
        """Generate actual picker UI"""
        if not self.char_name_edit.text():
            QtWidgets.QMessageBox.warning(self, "Warning", "Please enter character name")
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
        # Shorten controller name for display
        display_name = controller.split(':')[-1].replace('_ctrl', '').replace('_control', '').replace('_con', '')
        self.setText(display_name)
        
        # Set style
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
        
        if shape == "Circle":
            style += "border-radius: {}px;".format(size // 2)
        elif shape == "Ellipse":
            style += "border-radius: {}px;".format(size // 4)
            
        self.setStyleSheet(style)
        
        # Make draggable
        self.setMouseTracking(True)
        self.drag_start_position = None
        
    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.LeftButton:
            self.drag_start_position = event.pos()
        super(PickerButton, self).mousePressEvent(event)
        
    def mouseMoveEvent(self, event):
        if (event.buttons() == QtCore.Qt.LeftButton and 
            self.drag_start_position is not None):
            
            # Check drag distance
            if ((event.pos() - self.drag_start_position).manhattanLength() >= 
                QtWidgets.QApplication.startDragDistance()):
                
                # Move button
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
        self.setWindowTitle("{} - Rig Picker".format(self.character_name))
        self.setGeometry(200, 200, 600, 800)
        
        # Main widget
        main_widget = QtWidgets.QWidget()
        self.setCentralWidget(main_widget)
        main_widget.setStyleSheet("background-color: #2b2b2b;")
        
        # Create buttons
        for controller, x, y, color, shape, size in self.buttons_data:
            button = QtWidgets.QPushButton(main_widget)
            display_name = controller.split(':')[-1].replace('_ctrl', '').replace('_control', '').replace('_con', '')
            button.setText(display_name)
            button.setFixedSize(size, size)
            button.move(x, y)
            
            # Set style
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
            
            if shape == "Circle":
                style += "border-radius: {}px;".format(size // 2)
            elif shape == "Ellipse":
                style += "border-radius: {}px;".format(size // 4)
                
            button.setStyleSheet(style)
            
            # Connect click event
            button.clicked.connect(lambda checked, ctrl=controller: self.select_controller(ctrl))
            
    def select_controller(self, controller):
        """Select controller"""
        try:
            if cmds.objExists(controller):
                cmds.select(controller, replace=True)
                print("Selected: {}".format(controller))
            else:
                print("Controller not found: {}".format(controller))
        except Exception as e:
            print("Selection error: {}".format(str(e)))

def show_rig_picker_creator():
    """Show rig picker creator tool"""
    global rig_picker_creator_window
    try:
        rig_picker_creator_window.close()
        rig_picker_creator_window.deleteLater()
    except:
        pass
    
    rig_picker_creator_window = RigPickerCreator()
    rig_picker_creator_window.show()
    return rig_picker_creator_window

# Usage
if __name__ == "__main__":
    show_rig_picker_creator()
