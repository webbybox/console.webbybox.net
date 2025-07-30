let editor;
let models = {}; // unsaved changes
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
            data: {
                url: '/editor/getNodeTree',
                dataType: 'json',
                data: function (node) {
                    environmentPath = $('#environmentSelect').val();
                    return {
                        id: node.id,
                        environmentPath: environmentPath
                    };
                }
            },
            check_callback: true,
        },
        plugins: ['contextmenu', 'dnd', 'wholerow', 'types'],
        types: {
            folder: {
                icon: 'jstree-folder'
            },
            file: {
                icon: 'jstree-file'
            }
        },
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


    $('#fileTree').on('select_node.jstree', function (e, data) {
        const filePath = data.node.original?.path;
        if (data.node.original?.type === 'folder') return;

        // Store selected path globally
        selectedFilePath = filePath;

        modelKey = `${environmentPath}_${selectedFilePath}`;

        if (models[modelKey]) {
            // Reuse the model if already exists
            editor.setModel(models[modelKey]);
        } else {
            // Load content for new file
            $.get(`/editor/getNodeText?path=${encodeURIComponent(selectedFilePath)}`, function (content) {
                const language = getLanguageFromFilePath(selectedFilePath);
                const model = monaco.editor.createModel(content, language);
                models[modelKey] = model;
                editor.setModel(model);

                // Attach change listener for current model
                if (!model._changeTracked) { // Prevent multiple listeners
                    model.onDidChangeContent(() => {
                        markEdited(selectedFilePath);
                    });
                    model._changeTracked = true;
                }
            });
        }
    });

    $('#fileTree').on('move_node.jstree', function (e, data) {
        const from = data.node.original.path;
        const newParent = data.parent === '#' ? '' : data.instance.get_node(data.parent).original.path;
        const fileName = data.node.text;
        const to = `${newParent}/${fileName}`.replace(/^\/+/, '');

        fetch('/editor/moveNode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath: from, targetPath: to })
        }).then(res => {
            if (!res.ok) {
                alert('Failed to move file.');
                location.reload(); // fallback
            } else {
                // Optionally refresh or store new path in node.original.path
                data.node.original.path = to;
            }
        });
    });

    $('#fileTree').on('rename_node.jstree', function (e, data) {
        console.log("Rename triggered:", data);
        const oldPath = data.node.original.path;
        const newName = data.text;

        const tree = data.instance; // get the jsTree instance
        const parentNode = tree.get_node(data.node.parent);
        const parentPath = parentNode.original?.path || '';
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;

        // Update internal path
        data.node.original.path = newPath;

        // Call backend to rename the file/folder
        fetch('/editor/renameNode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                oldPath: oldPath,
                targetPath: newPath
            })
        }).then(res => {
            if (!res.ok) {
                alert('Rename failed.');
                tree.refresh(); // revert the rename in the UI
            } else {
                selectedFilePath = newPath;
                console.log('Rename successful!');
            }
        });
    });

    $('#fileTree').on('create_node.jstree', function (e, data) {
        const tree = data.instance;
        const parentNode = tree.get_node(data.parent);
        const parentPath = parentNode.original?.path || '';
        const newName = data.node.text;
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;

        // Store path for future reference
        data.node.original = { path: newPath };

        fetch('/editor/createNode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: newPath,
                isFolder: data.node.icon === 'jstree-folder'
            })
        }).then(res => {
            if (!res.ok) {
                alert("Creation failed");
                tree.refresh();
            } else {
                console.log("Node created:", newPath);
            }
        });
    });

    $('#fileTree').on('delete_node.jstree', function (e, data) {
        const nodePath = data.node.original?.path;
        if (!nodePath) return;

        fetch('/editor/deleteNode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: nodePath })
        }).then(res => {
            if (!res.ok) {
                alert("Deletion failed");
                $('#fileTree').jstree(true).refresh(); // restore deleted node
            } else {
                console.log("Node deleted:", nodePath);
                delete models[nodePath]
            }
        });
    });

    $('#fileTree').on('dragover', function (e) {
        e.preventDefault(); // Required to allow dropping
        e.originalEvent.dataTransfer.dropEffect = 'copy';
    });

    $('#fileTree').on('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();

        // Get the node that was dropped ON
        const nodeElm = e.target.closest('li.jstree-node');
        if (!nodeElm) return;

        const files = e.originalEvent.dataTransfer.files;
        if (files.length === 0) return;

        // Upload each file
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('targetPath', nodeElm.id + '/' + file.name);

            fetch('/editor/uploadNode', {
                method: 'POST',
                body: formData
            })
            .then(result => {
                console.log(`Uploaded ${file.name}:`, result);
                $('#fileTree').jstree(true).refresh(); // Refresh the tree to show the new file
            })
            .catch(error => {
                console.error(error);
                alert(`Error uploading ${file.name}`);
            });
        }
    });

    $('#environmentSelect').on('change', function () {
        $('#fileTree').jstree(true).refresh();
    });
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