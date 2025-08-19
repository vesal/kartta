class KeyValStore {
  constructor(dbName = 'keyval-store', storeName = 'keyval') {
    this.getStore = this.createStore(dbName, storeName);
  }

  createStore(dbName, storeName) {
    let dbp;
    const getDB = () => {
      if (dbp) return dbp;
      const request = indexedDB.open(dbName);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      dbp = this.promisifyRequest(request);
      dbp.then(db => {
        db.onclose = () => { dbp = undefined; };
      }, () => {});
      return dbp;
    };
    return (txMode, callback) =>
      getDB().then(db => callback(db.transaction(storeName, txMode).objectStore(storeName)));
  }

  promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.oncomplete = request.onsuccess = () => resolve(request.result);
      request.onabort = request.onerror = () => reject(request.error);
    });
  }

  get(key) {
    return this.getStore('readonly', store => this.promisifyRequest(store.get(key)));
  }

  set(key, value) {
    return this.getStore('readwrite', store => {
      store.put(value, key);
      return this.promisifyRequest(store.transaction);
    });
  }

  del(key) {
    return this.getStore('readwrite', store => {
      store.delete(key);
      return this.promisifyRequest(store.transaction);
    });
  }

  clear() {
    return this.getStore('readwrite', store => {
      store.clear();
      return this.promisifyRequest(store.transaction);
    });
  }

  keys() {
    return this.getStore('readonly', store => {
      if (store.getAllKeys) return this.promisifyRequest(store.getAllKeys());
      const items = [];
      return this.eachCursor(store, cursor => items.push(cursor.key)).then(() => items);
    });
  }

  values() {
    return this.getStore('readonly', store => {
      if (store.getAll) return this.promisifyRequest(store.getAll());
      const items = [];
      return this.eachCursor(store, cursor => items.push(cursor.value)).then(() => items);
    });
  }

  entries() {
    return this.getStore('readonly', store => {
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
    store.openCursor().onsuccess = function () {
      if (!this.result) return;
      callback(this.result);
      this.result.continue();
    };
    return this.promisifyRequest(store.transaction);
  }
}

// Usage:
// const idbKeyval = new KeyValStore('users-db', 'users');
// const settingsStore = new KeyValStore('settings-db', 'settings');

// userStore.set('foo', 123); userStore.get('foo').then(console.log);
