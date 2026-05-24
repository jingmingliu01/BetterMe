const DB_NAME = "betterme-db";
const DB_VERSION = 11;

const STORE_NAMES = [
  "aiCheckSessions",
  "aiCheckMessages",
  "checkpointDecisions",
  "aiCheckDecisionPoints",
  "aiCheckSummaries",
  "patternMemories",
  "behaviorEvents",
  "badCaseReviews",
  "evalCases",
  "evalRuns",
  "evalResults",
  "promptCandidates",
  "promptComparisons",
  "promptProgramSuggestions",
  "promptPromotions",
  "releaseDecisions",
  "cryptoKeys",
  "encryptedApiKeys"
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

const AI_HISTORY_STORES_TO_CLEAR_ON_SCHEMA_UNIFICATION: StoreName[] = [
  "aiCheckSessions",
  "aiCheckMessages",
  "checkpointDecisions",
  "aiCheckDecisionPoints",
  "aiCheckSummaries",
  "patternMemories",
  "behaviorEvents",
  "badCaseReviews",
  "evalCases",
  "evalRuns",
  "evalResults",
  "promptCandidates",
  "promptComparisons",
  "promptProgramSuggestions",
  "promptPromotions",
  "releaseDecisions"
];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openBetterMeDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (const storeName of STORE_NAMES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      }
      if (event.oldVersion > 0 && event.oldVersion < 8) {
        const tx = request.transaction;
        for (const storeName of AI_HISTORY_STORES_TO_CLEAR_ON_SCHEMA_UNIFICATION) {
          tx?.objectStore(storeName).clear();
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function runTx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  return openBetterMeDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = work(store);
        let result: T;

        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error);
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      })
  );
}

export async function putRecord<T extends { id: string }>(storeName: StoreName, record: T): Promise<void> {
  await runTx(storeName, "readwrite", (store) => store.put(record));
}

export async function getRecord<T>(storeName: StoreName, id: string): Promise<T | null> {
  const record = await runTx<T | undefined>(storeName, "readonly", (store) => store.get(id));
  return record ?? null;
}

export async function getAllRecords<T>(storeName: StoreName): Promise<T[]> {
  return runTx<T[]>(storeName, "readonly", (store) => store.getAll());
}

export async function deleteRecord(storeName: StoreName, id: string): Promise<void> {
  await runTx(storeName, "readwrite", (store) => store.delete(id));
}

export async function clearStore(storeName: StoreName): Promise<void> {
  await runTx(storeName, "readwrite", (store) => store.clear());
}

export async function clearAllIndexedDbStores(): Promise<void> {
  await Promise.all(STORE_NAMES.map((store) => clearStore(store)));
}
