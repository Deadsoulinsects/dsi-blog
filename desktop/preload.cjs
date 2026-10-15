const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('dsiDesktop', {
	chooseDirectory: () => ipcRenderer.invoke('dsi:choose-directory'),
	chooseMarkdown: (articleId) => ipcRenderer.invoke('dsi:choose-markdown', articleId),
	pathForFile: (file) => webUtils.getPathForFile(file),
	openSource: (id) => ipcRenderer.invoke('dsi:open-source', id),
	setCredential: (token) => ipcRenderer.invoke('dsi:set-credential', token),
	openExternal: (url) => ipcRenderer.invoke('dsi:open-external', url),
});
