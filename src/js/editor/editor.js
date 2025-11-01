import { EditorApi } from './editor_api.js';

const editorApi = new EditorApi();
let editor;
let models = {};
let selectedFilePath;
let environmentPath;
let srcPath;
let modelKey;

require.config({ paths: { 'vs': 'https://unpkg.com/monaco-editor@0.43.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor'), {
        value: '// Select a file from the sidebar',
        language: 'plaintext',
        theme: 'light',
        automaticLayout: true,
        minimap: {
            enabled: false
        }
    });

    parseFileTree();
});

function parseFileTree() {
    $('#fileTree').jstree({
        core: {
            data: async function (node, cb) {
                environmentPath = $('#environmentSelect').val();
                try {
                    const data = await editorApi.getNodeTree(node.id, environmentPath);
                    cb(data);
                } catch (err) {
                    console.error(err);
                    cb([]);
                }
            },
            check_callback: true
        },
        plugins: ['contextmenu', 'dnd', 'wholerow', 'types'],
        types: { folder: { icon: 'jstree-folder' }, file: { icon: 'jstree-file' } },
        contextmenu: {
            items: function(node) {
                const tree = $('#fileTree').jstree(true);
                return {
                    createFile: {
                        label: "New File",
                        action: function() {
                            const newNode = tree.create_node(node, { text: "new_file.txt", type: "file" });
                            tree.edit(newNode);
                        }
                    },
                    createFolder: {
                        label: "New Folder",
                        action: function() {
                            const newNode = tree.create_node(node, { text: "new_folder", type: "folder" });
                            tree.edit(newNode);
                        }
                    },
                    rename: {
                        label: "Rename",
                        action: function() {
                            tree.edit(node);
                        }
                    },
                    delete: {
                        label: "Delete",
                        action: function() {
                            if (confirm("Are you sure you want to delete this item?")) {
                                tree.delete_node(node);
                            }
                        }
                    }
                };
            }
        },
    });

    $('#fileTree').on('select_node.jstree', async (e, data) => {
        const filePath = data.node.original?.path;
        if (data.node.original?.type === 'folder') return;
        selectedFilePath = filePath;
        modelKey = `${environmentPath}_${selectedFilePath}`;

        if (models[modelKey]) {
            editor.setModel(models[modelKey]);
        } else {
            const content = await editorApi.getNodeText(selectedFilePath);
            const language = getLanguageFromFilePath(selectedFilePath);
            const model = monaco.editor.createModel(content, language);
            models[modelKey] = model;
            editor.setModel(model);

            if (!model._changeTracked) {
                model.onDidChangeContent(() => markEdited(selectedFilePath));
                model._changeTracked = true;
            }
        }
    });

    $('#fileTree').on('move_node.jstree', async (e, data) => {
        try {
            await editorApi.moveNode(data.node.original.path, buildNewPath(data));
            data.node.original.path = buildNewPath(data);
        } catch {
            alert('Failed to move file.');
            location.reload();
        }
    });

    $('#fileTree').on('rename_node.jstree', async (e, data) => {
        const oldPath = data.node.original.path;
        const newPath = buildNewPath(data);
        try {
            await editorApi.renameNode(oldPath, newPath);
            data.node.original.path = newPath;
        } catch {
            alert('Rename failed.');
            data.instance.refresh();
        }
    });

    $('#fileTree').on('create_node.jstree', async (e, data) => {
        const newPath = buildNewPath(data);
        try {
            await editorApi.createNode(newPath, data.node.icon === 'jstree-folder');
            data.node.original = { path: newPath };
        } catch {
            alert('Creation failed');
            data.instance.refresh();
        }
    });

    $('#fileTree').on('delete_node.jstree', async (e, data) => {
        const nodePath = data.node.original?.path;
        try {
            await editorApi.deleteNode(nodePath);
            delete models[nodePath];
        } catch {
            alert('Deletion failed');
            $('#fileTree').jstree(true).refresh();
        }
    });

    $('#fileTree').on('dragover', function (e) {
        e.preventDefault(); // Required to allow dropping
        e.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    $('#fileTree').on('drop', async (e) => {
        e.preventDefault();
        const nodeElm = e.target.closest('li.jstree-node');
        if (!nodeElm) return;
        for (const file of e.originalEvent.dataTransfer.files) {
            await editorApi.uploadNode(file, `${nodeElm.id}/${file.name}`);
            $('#fileTree').jstree(true).refresh();
        }
    });

    $('#environmentSelect').on('change', () => $('#fileTree').jstree(true).refresh());
}

function markEdited(path) {
    const tree = $('#fileTree').jstree(true);
    const node = tree.get_node(path);
    if (!node) return;

    const $el = $('#' + CSS.escape(node.id) + '_anchor');
    if (!$el.find('.unsaved-indicator').length) {
        $el.append('<span class="unsaved-indicator" title="There are unsaved changes to this file"> *</span>');
    }
}


function clearEdited(path) {
    const tree = $('#fileTree').jstree(true);
    const node = tree.get_node(path);
    if (!node) return;

    const $el = $('#' + CSS.escape(node.id) + '_anchor');
    $el.find('.unsaved-indicator').remove();
}



// Deselect jsTree node when clicking on the empty part of the sidebar
document.getElementById('sidebar').addEventListener('click', function (event) {
    const target = event.target;

    // Ignore clicks on fileTree nodes or within its child elements
    if (!target.closest('#fileTree .jstree-anchor')) {
        const tree = $('#fileTree').jstree(true);
        tree.deselect_all();
    }
});


function getLanguageFromFilePath(path) {
    if (path.endsWith('.js')) return 'javascript';
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.css')) return 'css';
    return 'plaintext';
}

document.getElementById('viewBtn').addEventListener('click', () => {
    const environmentPath = $('environmentPath').val();
    console.log('change event env path: ' + environmentPath);
    // fetch environment data
    $.getJSON('/editor/getSrcPath', { environmentPath }, function (data) {
        srcPath = data.srcPath;
        console.log('retrieved src path: ' + srcPath);
        
    }).fail(function () {
        alert("Failed to load environment data");
    });

    fetch("/preview/getPreview", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            html: editor.getValue(), // monaco content
            srcPath: srcPath
        })
    })
    .then(res => res.json())
    .then(({ previewId }) => {
        window.open(`/preview.html?id=${previewId}`, `_blank`)
    })
    .catch(err => console.error("Preview error", err));
});



document.getElementById('saveBtn').addEventListener('click', () => {
    if (!modelKey || !models[modelKey]) return;

    const model = models[modelKey];
    const content = model.getValue();

    fetch('/editor/saveNodeText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFilePath, content })
    }).then(res => {
        if (res.ok) {
            alert('File saved!');
            clearEdited(selectedFilePath);
        } else {
            alert('Failed to save file.');
        }
    });
});

document.getElementById('newFileBtn').addEventListener('click', () => {
    const tree = $('#fileTree').jstree(true);
    const selected = tree.get_selected(true)[0] || tree.get_node('#'); // fallback to root
    const parent = selected.original?.type === 'folder' ? selected : tree.get_node(selected.parent);

    const newNode = tree.create_node(parent, { text: 'new_file.txt', type: 'file' });
    if (newNode) tree.edit(newNode);
});

document.getElementById('newFolderBtn').addEventListener('click', () => {
    const tree = $('#fileTree').jstree(true);
    const selected = tree.get_selected(true)[0] || tree.get_node('#');
    const parent = selected.original?.type === 'folder' ? selected : tree.get_node(selected.parent);

    const newNode = tree.create_node(parent, { text: 'new_folder', type: 'folder' });
    if (newNode) tree.edit(newNode);
});