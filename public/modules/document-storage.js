const databaseName = 'docas-document-data';
const storeName = 'documents';
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB không khả dụng trên thiết bị này.'));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không thể mở kho dữ liệu tài liệu.'));
  });
  return databasePromise;
}

export async function saveDocumentData(documentId, data, onError = () => {}) {
  if (!documentId || !data?.data) return;
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readwrite')
        .objectStore(storeName)
        .put({ id: documentId, name: data.name, mimeType: data.mimeType, data: data.data });
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  } catch {
    onError('Không thể lưu nội dung tài liệu');
  }
}

export async function getDocumentData(documentId) {
  if (!documentId) return null;
  try {
    const database = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly')
        .objectStore(storeName)
        .get(documentId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function deleteDocumentData(documentIds) {
  if (!documentIds.length) return;
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      documentIds.forEach((documentId) => store.delete(documentId));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // localStorage data remains authoritative if IndexedDB is unavailable.
  }
}
