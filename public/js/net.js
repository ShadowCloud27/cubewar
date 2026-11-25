export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.queue = [];
    this.isOpen = false;
    this.url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return this;
  }

  emitLocal(type, payload) {
    for (const fn of this.handlers.get(type) || []) fn(payload);
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }
      const timeout = setTimeout(() => reject(new Error('timeout')), 9000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.isOpen = true;
        for (const msg of this.queue.splice(0)) this.send(msg.t, msg.payload);
        resolve();
      };

      this.ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!msg || !msg.t) return;
        for (const fn of this.handlers.get(msg.t) || []) fn(msg);
      };

      this.ws.onclose = () => {
        this.isOpen = false;
        this.emitLocal('closed', {});
      };

      this.ws.onerror = () => {
        if (!this.isOpen) {
          clearTimeout(timeout);
          reject(new Error('socket error'));
        }
      };
    });
  }

  send(t, payload = {}) {
    const msg = { ...payload, t };
    if (!this.isOpen) {
      this.queue.push({ t, payload });
      if (this.queue.length > 20) this.queue.shift();
      return;
    }
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      /* yoksay */
    }
  }

  // Enable selecting game mode from client
  selectMode(mode) {
    this.send('selectMode', { mode });
  }
}
