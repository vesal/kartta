class KeyValStore {
  constructor(dbName = 'keyval-store', storeNames = ['keyval'], version = 1) {
    this.dbName = dbName;
    this.storeNames = storeNames;
    this.version = version;
    this.dbp = this.openDB();
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        for (const name of this.storeNames) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getStore(storeName) {
    return (txMode, callback) =>
      this.dbp.then(db => callback(db.transaction(storeName, txMode).objectStore(storeName)));
  }

  promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.oncomplete = request.onsuccess = () => resolve(request.result);
      request.onabort = request.onerror = () => reject(request.error);
    });
  }

  get(storeName, key) {
    return this.getStore(storeName)('readonly', store => this.promisifyRequest(store.get(key)));
  }

  set(storeName, key, value) {
    return this.getStore(storeName)('readwrite', store => {
      store.put(value, key);
      return this.promisifyRequest(store.transaction);
    });
  }

  del(storeName, key) {
    return this.getStore(storeName)('readwrite', store => {
      store.delete(key);
      return this.promisifyRequest(store.transaction);
    });
  }

  clear(storeName) {
    return this.getStore(storeName)('readwrite', store => {
      store.clear();
      return this.promisifyRequest(store.transaction);
    });
  }

  keys(storeName) {
    return this.getStore(storeName)('readonly', store => {
      if (store.getAllKeys) return this.promisifyRequest(store.getAllKeys());
      const items = [];
      return this.eachCursor(store, cursor => items.push(cursor.key)).then(() => items);
    });
  }

  values(storeName) {
    return this.getStore(storeName)('readonly', store => {
      if (store.getAll) return this.promisifyRequest(store.getAll());
      const items = [];
      return this.eachCursor(store, cursor => items.push(cursor.value)).then(() => items);
    });
  }

  entries(storeName) {
    return this.getStore(storeName)('readonly', store => {
      if (store.getAll && store.getAllKeys) {
        return Promise.all([
          this.promisifyRequest(store.getAllKeys()),
          this.promisifyRequest(store.getAll())
        ]).then(([keys, values]) => keys.map((k, i) => [k, values[i]]));
      }
      const items = [];
      return this.eachCursor(store, cursor => items.push([cursor.key, cursor.value])).then(() => items);
    });
  }

  eachCursor(store, callback) {
    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = function () {
        const cursor = this.result;
        if (!cursor) return resolve();
        callback(cursor);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  getStoreAccessor(storeName) {
    return {
      get: (key) => this.get(storeName, key),
      set: (key, value) => this.set(storeName, key, value),
      del: (key) => this.del(storeName, key),
      clear: () => this.clear(storeName),
      keys: () => this.keys(storeName),
      values: () => this.values(storeName),
      entries: () => this.entries(storeName),
    };
  }
}

// Usage:
// const db = new MultiStoreDB('my-db', ['users', 'settings']);
// const users = db.getStoreAccessor('users');
// users.set('foo', 123).then(() => users.get('foo').then(console.log));
