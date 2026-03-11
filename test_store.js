const { AccountStore } = require('./server/lib/accountStore')
const store = new AccountStore({ accountsFile: './data/accounts.json' })
console.log('get exists:', typeof store.get === 'function')
console.log('getAccount exists:', typeof store.getAccount === 'function')
