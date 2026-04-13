import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
    AppLogData,
    AppLogScope,
    ElectronAPI,
    PngSequenceExportProgress,
    PngSequenceExportRequest,
    PngSequenceExportState,
    WebmExportProgress,
    WebmExportRequest,
    WebmExportState
} from './types';

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) =>
        ipcRenderer.invoke('dialog:openFile', filters),
    openDirectoryDialog: () =>
        ipcRenderer.invoke('dialog:openDirectory'),
    saveWebmDialog: (defaultFileName?: string) =>
        ipcRenderer.invoke('dialog:saveWebm', defaultFileName),
    snapMainWindowContentAspect: (aspectRatio: number) =>
        ipcRenderer.invoke('window:snapMainWindowContentAspect', aspectRatio),
    getPathForDroppedFile: (file: File) => {
        try {
            const filePath = webUtils.getPathForFile(file);
            return filePath || null;
        } catch {
            return null;
        }
    },
    readBinaryFile: (filePath: string) =>
        ipcRenderer.invoke('file:readBinary', filePath),
    readTextFile: (filePath: string) =>
        ipcRenderer.invoke('file:readText', filePath),
    getFileInfo: (filePath: string) =>
        ipcRenderer.invoke('file:getInfo', filePath),
    findNearbyFile: (baseDirectoryPath: string, targetPath: string) =>
        ipcRenderer.invoke('file:findNearby', baseDirectoryPath, targetPath),
    saveTextFile: (
        content: string,
        defaultFileName?: string,
        filters?: { name: string; extensions: string[] }[],
    ) =>
        ipcRenderer.invoke('file:saveText', content, defaultFileName, filters),
    listBundledWgslFiles: () =>
        ipcRenderer.invoke('file:listBundledWgslFiles'),
    writeTextFileToPath: (filePath: string, content: string) =>
        ipcRenderer.invoke('file:writeTextToPath', filePath, content),
    savePngFile: (dataUrl: string, defaultFileName?: string) =>
        ipcRenderer.invoke('file:savePng', dataUrl, defaultFileName),
    savePngFileToPath: (dataUrl: string, directoryPath: string, fileName: string) =>
        ipcRenderer.invoke('file:savePngToPath', dataUrl, directoryPath, fileName),
    savePngRgbaFileToPath: (
        rgbaData: Uint8Array,
        width: number,
        height: number,
        directoryPath: string,
        fileName: string,
    ) => ipcRenderer.invoke('file:savePngRgbaToPath', rgbaData, width, height, directoryPath, fileName),
    saveWebmFileToPath: (bytes: Uint8Array, filePath: string) =>
        ipcRenderer.invoke('file:saveWebmToPath', bytes, filePath),
    beginWebmStreamSave: (filePath: string) =>
        ipcRenderer.invoke('file:beginWebmStreamSave', filePath),
    writeWebmStreamChunk: (saveId: string, bytes: Uint8Array, position: number) =>
        ipcRenderer.invoke('file:writeWebmStreamChunk', saveId, bytes, position),
    finishWebmStreamSave: (saveId: string) =>
        ipcRenderer.invoke('file:finishWebmStreamSave', saveId),
    cancelWebmStreamSave: (saveId: string) =>
        ipcRenderer.invoke('file:cancelWebmStreamSave', saveId),
    startPngSequenceExportWindow: (request: PngSequenceExportRequest) =>
        ipcRenderer.invoke('export:startPngSequenceWindow', request),
    takePngSequenceExportJob: (jobId: string) =>
        ipcRenderer.invoke('export:takePngSequenceJob', jobId),
    reportPngSequenceExportProgress: (progress: PngSequenceExportProgress) => {
        ipcRenderer.send('export:pngSequenceProgress', progress);
    },
    onPngSequenceExportState: (callback: (state: PngSequenceExportState) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: PngSequenceExportState) => {
            callback(state);
        };
        ipcRenderer.on('export:pngSequenceState', listener);
        return () => {
            ipcRenderer.removeListener('export:pngSequenceState', listener);
        };
    },
    onPngSequenceExportProgress: (callback: (progress: PngSequenceExportProgress) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: PngSequenceExportProgress) => {
            callback(progress);
        };
        ipcRenderer.on('export:pngSequenceProgress', listener);
        return () => {
            ipcRenderer.removeListener('export:pngSequenceProgress', listener);
        };
    },
    startWebmExportWindow: (request: WebmExportRequest) =>
        ipcRenderer.invoke('export:startWebmWindow', request),
    takeWebmExportJob: (jobId: string) =>
        ipcRenderer.invoke('export:takeWebmJob', jobId),
    finishWebmExportJob: (jobId: string) =>
        ipcRenderer.invoke('export:finishWebmJob', jobId),
    reportWebmExportProgress: (progress: WebmExportProgress) => {
        ipcRenderer.send('export:webmProgress', progress);
    },
    onWebmExportState: (callback: (state: WebmExportState) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: WebmExportState) => {
            callback(state);
        };
        ipcRenderer.on('export:webmState', listener);
        return () => {
            ipcRenderer.removeListener('export:webmState', listener);
        };
    },
    onWebmExportProgress: (callback: (progress: WebmExportProgress) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, progress: WebmExportProgress) => {
            callback(progress);
        };
        ipcRenderer.on('export:webmProgress', listener);
        return () => {
            ipcRenderer.removeListener('export:webmProgress', listener);
        };
    },
    logDebug: (scope: AppLogScope, message: string, data?: AppLogData) => {
        ipcRenderer.send('log:write', 'debug', scope, message, data);
    },
    logInfo: (scope: AppLogScope, message: string, data?: AppLogData) => {
        ipcRenderer.send('log:write', 'info', scope, message, data);
    },
    logWarn: (scope: AppLogScope, message: string, data?: AppLogData) => {
        ipcRenderer.send('log:write', 'warn', scope, message, data);
    },
    logError: (scope: AppLogScope, message: string, data?: AppLogData) => {
        ipcRenderer.send('log:write', 'error', scope, message, data);
    },
    getLogFileInfo: () =>
        ipcRenderer.invoke('log:getFileInfo'),
    openLogFolder: () =>
        ipcRenderer.invoke('log:openFolder'),
} as ElectronAPI);
