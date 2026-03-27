/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { KeyValueStorageAsync } from '../public/types.js'

const DB_NAME = 'swiss-storage'
const STORE_NAME = 'kv'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request: IDBOpenDBRequest = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result)
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error)
  })
}

function idbGet(db: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
}

function idbSet(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function idbRemove(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function createInMemoryFallback(): KeyValueStorageAsync {
  console.warn('[swiss] IndexedDB not available, using in-memory fallback — data will not persist')
  const mem = new Map<string, string>()
  return {
    async get(key: string) { return mem.has(key) ? mem.get(key)! : null },
    async set(key: string, value: string) { mem.set(key, value) },
    async remove(key: string) { mem.delete(key) },
    async clear() { mem.clear() },
  }
}

export function createIndexedStorage(): KeyValueStorageAsync {
  if (typeof indexedDB === 'undefined') {
    return createInMemoryFallback()
  }

  // Lazily open the DB and cache the promise so all operations share one connection.
  let dbPromise: Promise<IDBDatabase> | null = null
  function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) dbPromise = openDB()
    return dbPromise
  }

  return {
    async get(key: string) {
      const db = await getDB()
      return idbGet(db, key)
    },
    async set(key: string, value: string) {
      const db = await getDB()
      return idbSet(db, key, value)
    },
    async remove(key: string) {
      const db = await getDB()
      return idbRemove(db, key)
    },
    async clear() {
      const db = await getDB()
      return idbClear(db)
    },
  }
}
