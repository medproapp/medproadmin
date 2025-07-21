// Metadata Editor Component
class MetadataEditor {
    constructor() {
        this.container = null;
        this.metadata = {};
        this.onChange = null;
    }
    
    init(container, initialMetadata = {}, onChange = null) {
        this.container = container;
        this.metadata = JSON.parse(JSON.stringify(initialMetadata));
        this.onChange = onChange;
        this.render();
    }
    
    render() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="metadata-editor">
                <div class="metadata-toolbar mb-3">
                    <button type="button" class="btn btn-sm btn-outline-primary add-metadata-btn">
                        <i class="fas fa-plus"></i> Add Field
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary import-metadata-btn">
                        <i class="fas fa-upload"></i> Import JSON
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary export-metadata-btn">
                        <i class="fas fa-download"></i> Export JSON
                    </button>
                </div>
                
                <div class="metadata-fields">
                    ${this.renderFields()}
                </div>
                
                <div class="metadata-preview mt-3">
                    <h6>JSON Preview</h6>
                    <pre class="json-preview">${JSON.stringify(this.metadata, null, 2)}</pre>
                </div>
            </div>
        `;
        
        this.bindEvents();
    }
    
    renderFields() {
        const fields = Object.entries(this.metadata);
        
        if (fields.length === 0) {
            return '<p class="text-muted">No metadata fields. Click "Add Field" to start.</p>';
        }
        
        return fields.map(([key, value]) => this.renderField(key, value)).join('');
    }
    
    renderField(key, value, path = []) {
        const fullPath = [...path, key];
        const fieldId = fullPath.join('_');
        const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);
        const isArray = Array.isArray(value);
        
        let fieldHtml = `
            <div class="metadata-field mb-2" data-path="${fullPath.join('.')}">
                <div class="d-flex align-items-start">
                    <div class="flex-grow-1">
                        <div class="input-group">
                            <input type="text" 
                                   class="form-control form-control-sm field-key" 
                                   value="${this.escapeHtml(key)}"
                                   data-original-key="${this.escapeHtml(key)}"
                                   placeholder="Field name">
                            ${this.renderValueInput(value, fullPath)}
                            <button class="btn btn-sm btn-outline-danger remove-field-btn" type="button">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
        `;
        
        if (isObject) {
            fieldHtml += `
                <div class="nested-fields ms-4 mt-2">
                    <button class="btn btn-sm btn-link add-nested-field-btn" data-path="${fullPath.join('.')}">
                        <i class="fas fa-plus"></i> Add nested field
                    </button>
                    ${Object.entries(value).map(([k, v]) => this.renderField(k, v, fullPath)).join('')}
                </div>
            `;
        }
        
        if (isArray) {
            fieldHtml += `
                <div class="array-fields ms-4 mt-2">
                    <button class="btn btn-sm btn-link add-array-item-btn" data-path="${fullPath.join('.')}">
                        <i class="fas fa-plus"></i> Add item
                    </button>
                    ${value.map((item, index) => this.renderArrayItem(item, [...fullPath, index])).join('')}
                </div>
            `;
        }
        
        fieldHtml += '</div>';
        
        return fieldHtml;
    }
    
    renderArrayItem(value, path) {
        return `
            <div class="array-item mb-1" data-path="${path.join('.')}">
                <div class="input-group">
                    ${this.renderValueInput(value, path)}
                    <button class="btn btn-sm btn-outline-danger remove-array-item-btn" type="button">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    renderValueInput(value, path) {
        const inputId = `field_${path.join('_')}`;
        const type = this.getValueType(value);
        
        if (type === 'object' || type === 'array') {
            return `
                <select class="form-control form-control-sm field-type" data-path="${path.join('.')}">
                    <option value="object" ${type === 'object' ? 'selected' : ''}>Object</option>
                    <option value="array" ${type === 'array' ? 'selected' : ''}>Array</option>
                </select>
            `;
        }
        
        return `
            <input type="${type === 'number' ? 'number' : 'text'}" 
                   class="form-control form-control-sm field-value" 
                   value="${this.escapeHtml(value)}"
                   placeholder="Value">
            <select class="form-control form-control-sm field-type" style="max-width: 100px;">
                <option value="string" ${type === 'string' ? 'selected' : ''}>String</option>
                <option value="number" ${type === 'number' ? 'selected' : ''}>Number</option>
                <option value="boolean" ${type === 'boolean' ? 'selected' : ''}>Boolean</option>
                <option value="object">Object</option>
                <option value="array">Array</option>
            </select>
        `;
    }
    
    getValueType(value) {
        if (value === null || value === undefined) return 'string';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }
    
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
    
    bindEvents() {
        // Add field button
        this.container.querySelector('.add-metadata-btn')?.addEventListener('click', () => {
            this.addField();
        });
        
        // Import JSON button
        this.container.querySelector('.import-metadata-btn')?.addEventListener('click', () => {
            this.importJSON();
        });
        
        // Export JSON button
        this.container.querySelector('.export-metadata-btn')?.addEventListener('click', () => {
            this.exportJSON();
        });
        
        // Field interactions
        this.container.addEventListener('input', (e) => {
            if (e.target.classList.contains('field-key')) {
                this.updateFieldKey(e.target);
            } else if (e.target.classList.contains('field-value')) {
                this.updateFieldValue(e.target);
            }
        });
        
        this.container.addEventListener('change', (e) => {
            if (e.target.classList.contains('field-type')) {
                this.changeFieldType(e.target);
            }
        });
        
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('.remove-field-btn')) {
                this.removeField(e.target.closest('.metadata-field'));
            } else if (e.target.closest('.add-nested-field-btn')) {
                this.addNestedField(e.target.closest('.add-nested-field-btn').dataset.path);
            } else if (e.target.closest('.add-array-item-btn')) {
                this.addArrayItem(e.target.closest('.add-array-item-btn').dataset.path);
            } else if (e.target.closest('.remove-array-item-btn')) {
                this.removeArrayItem(e.target.closest('.array-item'));
            }
        });
    }
    
    addField() {
        let newKey = 'newField';
        let counter = 1;
        
        while (this.metadata.hasOwnProperty(newKey)) {
            newKey = `newField${counter}`;
            counter++;
        }
        
        this.metadata[newKey] = '';
        this.render();
        this.notifyChange();
    }
    
    updateFieldKey(input) {
        const field = input.closest('.metadata-field');
        const path = field.dataset.path.split('.');
        const oldKey = input.dataset.originalKey;
        const newKey = input.value;
        
        if (oldKey !== newKey && newKey) {
            const parent = this.getParentObject(path.slice(0, -1));
            if (parent && !parent.hasOwnProperty(newKey)) {
                parent[newKey] = parent[oldKey];
                delete parent[oldKey];
                input.dataset.originalKey = newKey;
                field.dataset.path = [...path.slice(0, -1), newKey].join('.');
                this.updatePreview();
                this.notifyChange();
            }
        }
    }
    
    updateFieldValue(input) {
        const field = input.closest('.metadata-field');
        const path = field.dataset.path.split('.');
        const typeSelect = field.querySelector('.field-type');
        const type = typeSelect ? typeSelect.value : 'string';
        
        let value = input.value;
        if (type === 'number') {
            value = parseFloat(value) || 0;
        } else if (type === 'boolean') {
            value = value.toLowerCase() === 'true';
        }
        
        this.setValueAtPath(path, value);
        this.updatePreview();
        this.notifyChange();
    }
    
    changeFieldType(select) {
        const field = select.closest('.metadata-field');
        const path = field.dataset.path.split('.');
        const newType = select.value;
        
        let newValue;
        switch (newType) {
            case 'object':
                newValue = {};
                break;
            case 'array':
                newValue = [];
                break;
            case 'number':
                newValue = 0;
                break;
            case 'boolean':
                newValue = false;
                break;
            default:
                newValue = '';
        }
        
        this.setValueAtPath(path, newValue);
        this.render();
        this.notifyChange();
    }
    
    removeField(field) {
        const path = field.dataset.path.split('.');
        const parent = this.getParentObject(path.slice(0, -1));
        const key = path[path.length - 1];
        
        if (parent) {
            delete parent[key];
            this.render();
            this.notifyChange();
        }
    }
    
    addNestedField(parentPath) {
        const path = parentPath.split('.');
        const parent = this.getValueAtPath(path);
        
        if (parent && typeof parent === 'object') {
            let newKey = 'field';
            let counter = 1;
            
            while (parent.hasOwnProperty(newKey)) {
                newKey = `field${counter}`;
                counter++;
            }
            
            parent[newKey] = '';
            this.render();
            this.notifyChange();
        }
    }
    
    addArrayItem(parentPath) {
        const path = parentPath.split('.');
        const array = this.getValueAtPath(path);
        
        if (Array.isArray(array)) {
            array.push('');
            this.render();
            this.notifyChange();
        }
    }
    
    removeArrayItem(item) {
        const path = item.dataset.path.split('.');
        const index = parseInt(path[path.length - 1]);
        const array = this.getValueAtPath(path.slice(0, -1));
        
        if (Array.isArray(array)) {
            array.splice(index, 1);
            this.render();
            this.notifyChange();
        }
    }
    
    getValueAtPath(path) {
        return path.reduce((obj, key) => obj?.[key], this.metadata);
    }
    
    setValueAtPath(path, value) {
        const keys = [...path];
        const lastKey = keys.pop();
        const parent = keys.reduce((obj, key) => obj?.[key], this.metadata);
        
        if (parent && typeof parent === 'object') {
            parent[lastKey] = value;
        }
    }
    
    getParentObject(path) {
        if (path.length === 0) return this.metadata;
        return this.getValueAtPath(path);
    }
    
    updatePreview() {
        const preview = this.container.querySelector('.json-preview');
        if (preview) {
            preview.textContent = JSON.stringify(this.metadata, null, 2);
        }
    }
    
    notifyChange() {
        if (this.onChange) {
            this.onChange(this.metadata);
        }
    }
    
    importJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        this.metadata = data;
                        this.render();
                        this.notifyChange();
                        adminUtils.showToast('JSON imported successfully', 'success');
                    } catch (error) {
                        adminUtils.showToast('Invalid JSON file', 'error');
                    }
                };
                reader.readAsText(file);
            }
        });
        
        input.click();
    }
    
    exportJSON() {
        const dataStr = JSON.stringify(this.metadata, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'metadata.json';
        link.click();
        
        URL.revokeObjectURL(url);
    }
    
    getMetadata() {
        return this.metadata;
    }
    
    setMetadata(metadata) {
        this.metadata = JSON.parse(JSON.stringify(metadata || {}));
        this.render();
    }
}

// Create global instance
window.metadataEditor = new MetadataEditor();