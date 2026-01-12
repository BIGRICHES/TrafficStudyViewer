/**
 * File System Access API wrapper for reading files from user-selected folder
 */

import * as storage from './storage.js';

const FOLDER_HANDLE_KEY = 'folderHandle';

let currentFolderHandle = null;

/**
 * Check if the File System Access API is supported
 * @returns {boolean}
 */
export function isSupported() {
    return 'showDirectoryPicker' in window;
}

/**
 * Request user to select a data folder
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
export async function requestFolderAccess() {
    try {
        const handle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });

        // Store the handle for later
        await storage.set(FOLDER_HANDLE_KEY, handle);
        currentFolderHandle = handle;

        return handle;
    } catch (error) {
        if (error.name === 'AbortError') {
            // User cancelled the picker
            return null;
        }
        throw error;
    }
}

/**
 * Check if we have a stored folder handle
 * @returns {Promise<boolean>}
 */
export async function hasStoredHandle() {
    try {
        const handle = await storage.get(FOLDER_HANDLE_KEY);
        return handle !== undefined;
    } catch {
        return false;
    }
}

/**
 * Try to restore access from stored handle
 * @param {boolean} requestPermission - If true, request permission (requires user gesture)
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function restoreAccess(requestPermission = false) {
    try {
        const handle = await storage.get(FOLDER_HANDLE_KEY);
        if (!handle) return null;

        // Check current permission (readwrite for pending studies feature)
        const permission = await handle.queryPermission({ mode: 'readwrite' });

        if (permission === 'granted') {
            currentFolderHandle = handle;
            return handle;
        }

        if (requestPermission) {
            // Request permission (must be triggered by user gesture)
            const result = await handle.requestPermission({ mode: 'readwrite' });
            if (result === 'granted') {
                currentFolderHandle = handle;
                return handle;
            }
        }

        return null;
    } catch (error) {
        console.error('Failed to restore access:', error);
        return null;
    }
}

/**
 * Get the current folder handle
 * @returns {FileSystemDirectoryHandle|null}
 */
export function getCurrentHandle() {
    return currentFolderHandle;
}

/**
 * Get a file handle from a path relative to the data folder
 * @param {string} relativePath - Path relative to data folder (e.g., 'clean/1_clean.csv')
 * @returns {Promise<FileSystemFileHandle>}
 */
async function getFileHandle(relativePath) {
    if (!currentFolderHandle) {
        throw new Error('No folder access. Please select a folder first.');
    }

    const parts = relativePath.split('/').filter(p => p.length > 0);
    let current = currentFolderHandle;

    // Navigate through directories
    for (let i = 0; i < parts.length - 1; i++) {
        try {
            current = await current.getDirectoryHandle(parts[i]);
        } catch (error) {
            throw new Error(`Directory not found: ${parts.slice(0, i + 1).join('/')}`);
        }
    }

    // Get the file
    const fileName = parts[parts.length - 1];
    try {
        return await current.getFileHandle(fileName);
    } catch (error) {
        throw new Error(`File not found: ${relativePath}`);
    }
}

/**
 * Read a file as text
 * @param {string} relativePath - Path relative to data folder
 * @returns {Promise<string>}
 */
export async function readFile(relativePath) {
    const fileHandle = await getFileHandle(relativePath);
    const file = await fileHandle.getFile();
    return await file.text();
}

/**
 * Check if a file exists
 * @param {string} relativePath - Path relative to data folder
 * @returns {Promise<boolean>}
 */
export async function fileExists(relativePath) {
    try {
        await getFileHandle(relativePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * List files in a directory
 * @param {string} relativePath - Path relative to data folder (e.g., 'clean')
 * @returns {Promise<string[]>} Array of file names
 */
export async function listFiles(relativePath) {
    if (!currentFolderHandle) {
        throw new Error('No folder access. Please select a folder first.');
    }

    let targetDir = currentFolderHandle;

    // Navigate to subdirectory if path provided
    if (relativePath) {
        const parts = relativePath.split('/').filter(p => p.length > 0);
        for (const part of parts) {
            try {
                targetDir = await targetDir.getDirectoryHandle(part);
            } catch {
                throw new Error(`Directory not found: ${relativePath}`);
            }
        }
    }

    // List files
    const files = [];
    for await (const entry of targetDir.values()) {
        if (entry.kind === 'file') {
            files.push(entry.name);
        }
    }

    return files;
}

/**
 * Validate that the selected folder has the expected structure
 * @returns {Promise<{valid: boolean, message: string}>}
 */
export async function validateFolder() {
    if (!currentFolderHandle) {
        return { valid: false, message: 'No folder selected' };
    }

    // Check for study_index.csv
    const hasIndex = await fileExists('study_index.csv');
    if (!hasIndex) {
        return {
            valid: false,
            message: 'study_index.csv not found. Please select the correct data folder.'
        };
    }

    // Check for clean directory
    try {
        await currentFolderHandle.getDirectoryHandle('clean');
    } catch {
        return {
            valid: false,
            message: 'clean/ directory not found. Please select the correct data folder.'
        };
    }

    return { valid: true, message: 'Folder structure is valid' };
}

/**
 * Clear stored folder handle
 */
export async function clearStoredHandle() {
    await storage.remove(FOLDER_HANDLE_KEY);
    currentFolderHandle = null;
}

/**
 * Get a file handle from the root of the data folder
 * @param {string} fileName - Name of the file (e.g., 'montgomery_logo.png')
 * @returns {Promise<FileSystemFileHandle|null>}
 */
export async function getFileInFolder(fileName) {
    if (!currentFolderHandle) {
        return null;
    }

    try {
        return await currentFolderHandle.getFileHandle(fileName);
    } catch {
        return null;
    }
}

/**
 * Write content to a file (creates if doesn't exist)
 * @param {string} fileName - Name of the file in root folder
 * @param {string} content - Content to write
 * @returns {Promise<void>}
 */
export async function writeFile(fileName, content) {
    if (!currentFolderHandle) {
        throw new Error('No folder access. Please select a folder first.');
    }

    // Get or create the file handle
    const fileHandle = await currentFolderHandle.getFileHandle(fileName, { create: true });

    // Create a writable stream and write content
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}

/**
 * Read a file from root folder, return null if doesn't exist
 * @param {string} fileName - Name of the file
 * @returns {Promise<string|null>}
 */
export async function readFileIfExists(fileName) {
    if (!currentFolderHandle) {
        return null;
    }

    try {
        const fileHandle = await currentFolderHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        return await file.text();
    } catch {
        return null;
    }
}
