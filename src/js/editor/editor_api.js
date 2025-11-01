// editor_api.js
import { ApiClient } from '/js/api_client.js';

export class EditorApi extends ApiClient {
    constructor() {
        super('editor');
    }

    // Node tree & content
    getNodeTree(id, environmentPath) {
        return this.post('getNodeTree', { id, environmentPath });
    }

    getNodeText(path) {
        return this.get('getNodeText', { path });
    }

    saveNodeText(path, content) {
        return this.post('saveNodeText', { path, content });
    }

    // File operations
    createNode(path, isFolder) {
        return this.post('createNode', { path, isFolder });
    }

    renameNode(oldPath, targetPath) {
        return this.post('renameNode', { oldPath, targetPath });
    }

    deleteNode(path) {
        return this.post('deleteNode', { path });
    }

    moveNode(oldPath, targetPath) {
        return this.post('moveNode', { oldPath, targetPath });
    }

    uploadNode(file, targetPath) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('targetPath', targetPath);
        return fetch(`${this.baseUrl}/uploadNode`, {
            method: 'POST',
            body: formData
        });
    }

    // Environment
    getSrcPath(environmentPath) {
        return this.get('getSrcPath', { environmentPath });
    }
}
