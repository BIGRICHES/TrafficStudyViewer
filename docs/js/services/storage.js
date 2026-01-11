/**
 * IndexedDB storage service for persisting folder handle and settings
 */

import { DB_NAME, DB_VERSION, STORE_NAME } from '../config.js';

let db = null;

/**
 * Open the IndexedDB database
 */
async function openDatabase() {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME);
            }
        };
    });
}

/**
 * Get a value from IndexedDB
 * @param {string} key - The key to retrieve
 * @returns {Promise<any>} The stored value or undefined
 */
export async function get(key) {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Set a value in IndexedDB
 * @param {string} key - The key to store
 * @param {any} value - The value to store
 * @returns {Promise<void>}
 */
export async function set(key, value) {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Delete a value from IndexedDB
 * @param {string} key - The key to delete
 * @returns {Promise<void>}
 */
export async function remove(key) {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * Clear all stored data
 * @returns {Promise<void>}
 */
export async function clear() {
    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
