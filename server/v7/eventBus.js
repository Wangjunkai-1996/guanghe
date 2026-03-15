const EventEmitter = require('events')

class V7EventBus extends EventEmitter {
  emitBatch(batchId, event, data) {
    const payload = {
      batchId,
      event,
      data,
      emittedAt: new Date().toISOString()
    }

    this.emit('event', payload)
    if (batchId) {
      this.emit(`batch:${batchId}`, payload)
    }
  }

  subscribeBatch(batchId, listener) {
    const key = `batch:${batchId}`
    this.on(key, listener)
    return () => this.off(key, listener)
  }
}

module.exports = { V7EventBus }
