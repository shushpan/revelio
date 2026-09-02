export interface KeyValueStore {
  get<A>(store: "settings" | "vault", key: IDBValidKey): Promise<A | undefined>;
  put(store: "settings" | "vault", value: unknown, key: IDBValidKey): Promise<void>;
  delete(store: "settings" | "vault", key: IDBValidKey): Promise<void>;
}

const DATABASE_NAME = "revelio";
const DATABASE_VERSION = 1;
const STORE_NAMES = ["settings", "vault"] as const;

const unavailable = (): Error => new Error("Local storage is unavailable");

const openDatabase = (factory: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of STORE_NAMES) {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(unavailable());
  });

const runTransaction = <A>(
  db: IDBDatabase,
  store: "settings" | "vault",
  mode: IDBTransactionMode,
  operate: (objectStore: IDBObjectStore) => IDBRequest<A>,
): Promise<A | undefined> =>
  new Promise((resolve, reject) => {
    const transaction = db.transaction([store], mode);
    let result: A | undefined;
    const request = operate(transaction.objectStore(store));
    request.onsuccess = () => {
      result = request.result;
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(unavailable());
    transaction.onabort = () => reject(unavailable());
  });

export const makeIndexedDbKeyValueStore = (
  factory: IDBFactory = globalThis.indexedDB,
): KeyValueStore => {
  const dbPromise = openDatabase(factory);
  return {
    get: async <A>(store: "settings" | "vault", key: IDBValidKey) => {
      const db = await dbPromise;
      return runTransaction<A>(db, store, "readonly", (objectStore) => objectStore.get(key));
    },
    put: async (store, value, key) => {
      const db = await dbPromise;
      await runTransaction(db, store, "readwrite", (objectStore) => objectStore.put(value, key));
    },
    delete: async (store, key) => {
      const db = await dbPromise;
      await runTransaction(db, store, "readwrite", (objectStore) => objectStore.delete(key));
    },
  };
};
